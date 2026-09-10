/* =========================================================
   Albert Resume — neo-brutal render + in-place editing
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "albert-resume-data-v1";
  const RESET_KEY = `${STORAGE_KEY}-reset`;
  const THEME_KEY = "albert-resume-theme";
  const PERSIST_DELAY = 180;
  const LOCAL_WRITE_LINEAGE_TTL = 10000;
  const EDIT_CONTROL_SELECTOR = [
    ".tag-del-btn",
    ".list-del-btn",
    ".edit-item-controls",
    ".btn-tag-add",
    ".btn-list-add",
    ".edit-add-container",
  ].join(",");
  const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
  const MULTILINE_PATH_RE = /^(?:profile\.summary|profile\.about\.\d+|contact\.description|projects\.\d+\.description|projects\.\d+\.highlights\.\d+|experience\.\d+\.bullets\.\d+|moreProjects\.\d+\.description|education\.\d+\.note)$/;
  const BLOCKED_PATH_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  /**
   * Edit tools only for local preview (file:// / localhost).
   * GitHub Pages and other public hosts always serve data.js as-is.
   */
  const EDIT_ENABLED = (function isLocalEditHost() {
    try {
      const { protocol, hostname } = window.location;
      if (protocol === "file:") return true;
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
        return true;
      }
      // optional LAN preview: 192.168.x / 10.x / 172.16-31.x
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)) return true;
      return false;
    } catch (_) {
      return false;
    }
  })();

  let startupNotice = "";
  let data;
  let isEditingMode = false;
  let persistTimer = 0;
  let persistPending = false;
  let storageWarningShown = false;
  let composingNode = null;
  const undoStack = [];
  const redoStack = [];
  const HISTORY_LIMIT = 30;
  let storedDataSnapshot = null;
  let pendingExternalReset = false;
  let resetCleanupPending = false;
  let lastLocalWriteBase = null;
  let lastLocalWriteData = null;
  let lastLocalWriteAt = 0;
  let pendingExternalData = null;
  let pendingExternalRender = false;
  const dirtyEditablePaths = new Set();
  const pendingEditableSyncPaths = new Set();
  const MISSING_VALUE = Symbol("missing");
  data = loadData();
  storedDataSnapshot = deepClone(data);
  function isPlainObject(value) {
    if (!value || typeof value !== "object") return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function deepClone(obj) {
    if (obj === undefined || obj === null || typeof obj !== "object") return obj;
    try {
      if (typeof structuredClone === "function") return structuredClone(obj);
    } catch (_) {}
    return JSON.parse(JSON.stringify(obj));
  }

  function defaultData() {
    return deepClone(window.RESUME_DATA || {});
  }
  function valuesEqual(left, right) {
    if (Object.is(left, right)) return true;
    if (left === MISSING_VALUE || right === MISSING_VALUE) return false;
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      return left.every((value, index) => valuesEqual(value, right[index]));
    }
    if (isPlainObject(left) || isPlainObject(right)) {
      if (!isPlainObject(left) || !isPlainObject(right)) return false;
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      return [...keys].every((key) => {
        const leftValue = Object.prototype.hasOwnProperty.call(left, key) ? left[key] : MISSING_VALUE;
        const rightValue = Object.prototype.hasOwnProperty.call(right, key) ? right[key] : MISSING_VALUE;
        return valuesEqual(leftValue, rightValue);
      });
    }
    return false;
  }
  function cloneValue(value) {
    return value === MISSING_VALUE ? MISSING_VALUE : deepClone(value);
  }
  function mergeSnapshots(base, local, remote) {
    if (valuesEqual(local, base)) return cloneValue(remote);
    if (valuesEqual(remote, base)) return cloneValue(local);
    if (valuesEqual(local, remote)) return cloneValue(local);
    if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
      if (base.length !== local.length || base.length !== remote.length) return cloneValue(local);
      return local.map((value, index) => mergeSnapshots(base[index], value, remote[index]));
    }
    if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
      const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
      const result = {};
      keys.forEach((key) => {
        if (BLOCKED_PATH_KEYS.has(key)) return;
        const baseValue = Object.prototype.hasOwnProperty.call(base, key) ? base[key] : MISSING_VALUE;
        const localValue = Object.prototype.hasOwnProperty.call(local, key) ? local[key] : MISSING_VALUE;
        const remoteValue = Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : MISSING_VALUE;
        const merged = mergeSnapshots(baseValue, localValue, remoteValue);
        if (merged !== MISSING_VALUE) result[key] = merged;
      });
      return result;
    }
    return cloneValue(local);
  }
  function hasRevertedLocalChange(base, local, remote) {
    if (valuesEqual(local, base)) return false;
    if (valuesEqual(remote, base)) return true;
    if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
      const length = Math.min(base.length, local.length, remote.length);
      for (let index = 0; index < length; index += 1) {
        if (hasRevertedLocalChange(base[index], local[index], remote[index])) return true;
      }
      return false;
    }
    if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
      const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
      return [...keys].some((key) => {
        if (BLOCKED_PATH_KEYS.has(key)) return false;
        const baseValue = Object.prototype.hasOwnProperty.call(base, key) ? base[key] : MISSING_VALUE;
        const localValue = Object.prototype.hasOwnProperty.call(local, key) ? local[key] : MISSING_VALUE;
        const remoteValue = Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : MISSING_VALUE;
        return hasRevertedLocalChange(baseValue, localValue, remoteValue);
      });
    }
    return false;
  }
  function mergeRemoteSnapshot(base, local, remote) {
    const lineageIsFresh = lastLocalWriteBase && lastLocalWriteData && Date.now() - lastLocalWriteAt <= LOCAL_WRITE_LINEAGE_TTL;
    if (lineageIsFresh && hasRevertedLocalChange(lastLocalWriteBase, lastLocalWriteData, remote)) {
      const reconciledWrite = mergeSnapshots(lastLocalWriteBase, lastLocalWriteData, remote);
      return mergeSnapshots(lastLocalWriteData, local, reconciledWrite);
    }
    return mergeSnapshots(base, local, remote);
  }

  function replaceJsonInPlace(target, source) {
    if (Array.isArray(target) && Array.isArray(source)) {
      source.forEach((value, index) => {
        const current = target[index];
        if ((Array.isArray(current) && Array.isArray(value)) || (isPlainObject(current) && isPlainObject(value))) {
          replaceJsonInPlace(current, value);
        } else {
          target[index] = deepClone(value);
        }
      });
      target.length = source.length;
      return target;
    }

    if (isPlainObject(target) && isPlainObject(source)) {
      Object.keys(target).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(source, key)) delete target[key];
      });
      Object.keys(source).forEach((key) => {
        if (BLOCKED_PATH_KEYS.has(key)) return;
        const current = target[key];
        const value = source[key];
        if ((Array.isArray(current) && Array.isArray(value)) || (isPlainObject(current) && isPlainObject(value))) {
          replaceJsonInPlace(current, value);
        } else {
          target[key] = deepClone(value);
        }
      });
      return target;
    }

    return deepClone(source);
  }

  function adoptData(next) {
    const normalized = normalizeDataShape(next);
    if (isPlainObject(data) && isPlainObject(normalized)) {
      replaceJsonInPlace(data, normalized);
    } else {
      data = normalized;
    }
    return data;
  }

  function parseStoredData(raw) {
    if (raw == null || raw === "") return normalizeDataShape(defaultData());
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) throw new TypeError("本地数据格式无效");
    return normalizeDataShape(mergeDeep(defaultData(), parsed));
  }
  function readStoredData() {
    let localStorageReadable = false;
    let localRaw = null;
    let sawInvalidData = false;
    try {
      localRaw = window.localStorage.getItem(STORAGE_KEY);
      localStorageReadable = true;
    } catch (_) {}

    if (localStorageReadable && localRaw != null && localRaw !== "") {
      const parsed = parseStoredDataSafely(localRaw);
      if (parsed) return parsed;
      sawInvalidData = true;
    }

    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw != null && raw !== "") {
        const parsed = parseStoredDataSafely(raw);
        if (parsed) return parsed;
        sawInvalidData = true;
      }
    } catch (_) {}

    if (sawInvalidData) throw new TypeError("本地数据格式无效");
    return parseStoredData(null);
  }
  function parseStoredDataSafely(raw) {
    try {
      return parseStoredData(raw);
    } catch (_) {
      return null;
    }
  }
  function latestStoredData() {
    try {
      return readStoredData();
    } catch (_) {
      return null;
    }
  }

  function readStored(key) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) return value;
    } catch (_) {}
    try {
      return window.sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function writeStored(key, value) {
    try {
      window.localStorage.setItem(key, value);
      try {
        window.sessionStorage.removeItem(key);
      } catch (_) {}
      return true;
    } catch (_) {}
    try {
      window.sessionStorage.setItem(key, value);
      try {
        window.localStorage.removeItem(key);
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeStored(key) {
    let accessible = false;
    let failed = false;
    try {
      window.localStorage.removeItem(key);
      if (window.localStorage.getItem(key) === null) accessible = true;
      else failed = true;
    } catch (_) {}
    try {
      window.sessionStorage.removeItem(key);
      if (window.sessionStorage.getItem(key) === null) accessible = true;
      else failed = true;
    } catch (_) {}
    return accessible && !failed;
  }

  function broadcastReset() {
    try {
      window.localStorage.setItem(RESET_KEY, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      return true;
    } catch (_) {
      return false;
    }
  }

  function reportStorageFailure() {
    if (storageWarningShown) return;
    storageWarningShown = true;
    toast("本地保存不可用，请及时导出 JSON");
  }

  function loadData() {
    const defaults = normalizeDataShape(defaultData());
    // 公开部署始终使用 data.js，不读取访问者本地数据。
    if (!EDIT_ENABLED) return defaults;
    try {
      return readStoredData();
    } catch (_) {
      removeStored(STORAGE_KEY);
      startupNotice = "本地数据无法读取，已使用默认内容";
      return defaults;
    }
  }

  // 仅合并类型匹配的 JSON 值，避免损坏的本地快照覆盖必要对象。
  function mergeDeep(base, over) {
    if (!isPlainObject(base) || !isPlainObject(over)) return base;

    for (const key of Object.keys(over)) {
      if (BLOCKED_PATH_KEYS.has(key)) continue;
      const incoming = over[key];
      const current = base[key];

      if (Array.isArray(incoming)) {
        if (Array.isArray(current) || !(key in base)) {
          base[key] = mergeValue(current, incoming);
        }
        continue;
      }

      if (isPlainObject(incoming)) {
        if (isPlainObject(current)) mergeDeep(current, incoming);
        else if (!(key in base)) base[key] = mergeValue(undefined, incoming);
        continue;
      }

      if (incoming !== null && (current === undefined || typeof incoming === typeof current)) {
        base[key] = incoming;
      }
    }
    return base;
  }

  function mergeValue(current, incoming) {
    if (Array.isArray(incoming)) {
      const template = Array.isArray(current) ? current : [];
      return incoming.map((item, index) => mergeValue(template[index], item));
    }
    if (isPlainObject(incoming)) {
      const target = isPlainObject(current) ? deepClone(current) : {};
      return mergeDeep(target, incoming);
    }
    if (incoming !== null && (current === undefined || typeof incoming === typeof current)) {
      return incoming;
    }
    return current;
  }

  function stringArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  }

  function objectArray(value) {
    return Array.isArray(value) ? value.filter(isPlainObject) : [];
  }

  function normalizeDataShape(candidate) {
    const next = isPlainObject(candidate) ? candidate : defaultData();
    next.profile = isPlainObject(next.profile) ? next.profile : {};
    next.profile.about = stringArray(next.profile.about);

    next.contact = isPlainObject(next.contact) ? next.contact : {};
    next.contact.extra = objectArray(next.contact.extra);

    next.highlights = objectArray(next.highlights);
    next.skills = isPlainObject(next.skills) ? next.skills : {};
    next.skills.groups = objectArray(next.skills.groups);
    next.skills.groups.forEach((group) => {
      group.items = stringArray(group.items);
    });

    next.projects = objectArray(next.projects);
    next.projects.forEach((project) => {
      project.highlights = stringArray(project.highlights);
      project.stack = stringArray(project.stack);
      project.links = isPlainObject(project.links) ? project.links : {};
    });

    next.moreProjects = objectArray(next.moreProjects);
    next.moreProjects.forEach((project) => {
      project.stack = stringArray(project.stack);
    });

    next.experience = objectArray(next.experience);
    next.experience.forEach((entry) => {
      entry.bullets = stringArray(entry.bullets);
    });
    next.education = objectArray(next.education);
    return next;
  }

  function structureSignature(value) {
    if (Array.isArray(value)) return value.map(structureSignature);
    if (!isPlainObject(value)) return typeof value;
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = structureSignature(value[key]);
        return result;
      }, {});
  }
  function applyExternalReset() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = 0;
    }
    const storageCleared = removeStored(STORAGE_KEY);
    resetCleanupPending = !storageCleared;
    if (!storageCleared) reportStorageFailure();
    adoptData(normalizeDataShape(defaultData()));
    persistPending = false;
    pendingExternalReset = false;
    pendingExternalData = null;
    pendingExternalRender = true;
    storedDataSnapshot = deepClone(data);
    lastLocalWriteBase = null;
    lastLocalWriteData = null;
    lastLocalWriteAt = 0;
    clearAllEditablePathDirty();
    clearEditableDrafts();
    pendingEditableSyncPaths.clear();
    clearStructureHistory();
    return storageCleared;
  }
  function reconcilePendingExternalData() {
    if (pendingExternalReset) {
      return applyExternalReset() ? "reset" : "reset-failed";
    }
    const currentStored = latestStoredData();
    const remote =
      currentStored && storedDataSnapshot && !valuesEqual(currentStored, storedDataSnapshot)
        ? currentStored
        : pendingExternalData;
    if (!remote || !storedDataSnapshot || valuesEqual(remote, storedDataSnapshot)) {
      if (remote && valuesEqual(remote, storedDataSnapshot)) pendingExternalData = null;
      return false;
    }
    const beforeStructure = JSON.stringify(structureSignature(data));
    const remoteStructure = JSON.stringify(structureSignature(remote));
    if (hasEditableDrafts() && beforeStructure !== remoteStructure) {
      pendingExternalData = remote;
      pendingExternalRender = true;
      return "deferred";
    }
    adoptData(mergeRemoteSnapshot(storedDataSnapshot, data, remote));
    pendingExternalData = null;
    if (isEditingMode && beforeStructure !== JSON.stringify(structureSignature(data))) {
      pendingExternalRender = true;
    }
    return true;
  }

  function writeCurrentData() {
    const maxAttempts = 3;
    let writeBase = deepClone(storedDataSnapshot || defaultData());
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const latest = latestStoredData();
      if (latest && !valuesEqual(latest, writeBase)) {
        const beforeStructure = JSON.stringify(structureSignature(data));
        const latestStructure = JSON.stringify(structureSignature(latest));
        if (hasEditableDrafts() && beforeStructure !== latestStructure) {
          pendingExternalData = latest;
          pendingExternalRender = true;
          return "deferred";
        }
        adoptData(mergeRemoteSnapshot(writeBase, data, latest));
        writeBase = deepClone(latest);
        if (isEditingMode && beforeStructure !== JSON.stringify(structureSignature(data))) {
          pendingExternalRender = true;
        }
      }

      let serialized;
      try {
        serialized = JSON.stringify(data);
      } catch (_) {
        return false;
      }
      const writtenBase = deepClone(writeBase);
      const writtenData = deepClone(data);
      if (!writeStored(STORAGE_KEY, serialized)) return false;
      lastLocalWriteBase = writtenBase;
      lastLocalWriteData = writtenData;
      lastLocalWriteAt = Date.now();

      const confirmed = latestStoredData();
      if (!confirmed) return false;
      if (valuesEqual(confirmed, data)) return true;

      const beforeStructure = JSON.stringify(structureSignature(data));
      const confirmedStructure = JSON.stringify(structureSignature(confirmed));
      if (hasEditableDrafts() && beforeStructure !== confirmedStructure) {
        pendingExternalData = confirmed;
        pendingExternalRender = true;
        return "deferred";
      }
      adoptData(mergeRemoteSnapshot(writtenBase, data, confirmed));
      writeBase = deepClone(confirmed);
      if (isEditingMode && beforeStructure !== JSON.stringify(structureSignature(data))) {
        pendingExternalRender = true;
      }
    }
    return false;
  }

  function flushPersist() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = 0;
    }
    if (!EDIT_ENABLED) return true;

    if (resetCleanupPending && !pendingExternalReset) {
      const storageCleared = removeStored(STORAGE_KEY);
      resetCleanupPending = !storageCleared;
      if (!storageCleared) {
        reportStorageFailure();
        return false;
      }
      storageWarningShown = false;
      pendingExternalData = null;
    }

    const hadLocalChanges = persistPending;
    const externalResult = reconcilePendingExternalData();
    if (externalResult === "deferred") return true;
    if (externalResult === "reset" || externalResult === "reset-failed") {
      renderAll({ preserveScroll: true });
      return externalResult === "reset";
    }
    const hadExternalChanges = externalResult === true;
    if (!hadLocalChanges && !hadExternalChanges) {
      if (pendingExternalRender && !isEditingMode) applyReconciledDataToDocument();
      return true;
    }

    const latest = latestStoredData();
    const needsWrite = hadLocalChanges || !latest || !valuesEqual(data, latest);
    if (needsWrite) {
      const writeResult = writeCurrentData();
      if (writeResult === "deferred") return false;
      if (!writeResult) {
        reportStorageFailure();
        return false;
      }
      persistPending = false;
      storageWarningShown = false;
      storedDataSnapshot = deepClone(data);
      pendingExternalData = null;
      clearAllEditablePathDirty();
    } else {
      storedDataSnapshot = deepClone(data);
      pendingExternalData = null;
    }

    if (hadExternalChanges || pendingExternalRender) {
      applyReconciledDataToDocument();
    }
    return true;
  }

  function persist(next, options = {}) {
    data = next;
    if (!EDIT_ENABLED) return true;

    persistPending = true;
    if (persistTimer) clearTimeout(persistTimer);
    if (options.immediate) return flushPersist();
    persistTimer = window.setTimeout(flushPersist, PERSIST_DELAY);
    return true;
  }

  function initTheme() {
    const saved = readStored(THEME_KEY);
    // bold default: dark acid
    setTheme(saved === "light" ? "light" : "dark");
  }

  function setTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    if (!writeStored(THEME_KEY, next)) reportStorageFailure();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === "dark" ? "#16171a" : "#ffffff";
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    setTheme(cur === "dark" ? "light" : "dark");
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 2000);
  }

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "style" && typeof v === "object") {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith("--")) node.style.setProperty(sk, sv);
          else node.style[sk] = sv;
        }
      } else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (v !== undefined && v !== null) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  function setByPath(obj, path, value) {
    if (!obj || typeof obj !== "object" || typeof path !== "string" || !path) return false;
    const parts = path.split(".");
    if (parts.some((part) => BLOCKED_PATH_KEYS.has(part))) return false;

    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!cur || typeof cur !== "object") return false;
      const isIdx = /^\d+$/.test(parts[i + 1]);
      if (cur[part] == null || typeof cur[part] !== "object") cur[part] = isIdx ? [] : {};
      cur = cur[part];
    }
    if (!cur || typeof cur !== "object") return false;
    cur[parts[parts.length - 1]] = value;
    return true;
  }

  function getByPath(obj, path) {
    if (!obj || typeof path !== "string" || !path) return undefined;
    if (path.split(".").some((part) => BLOCKED_PATH_KEYS.has(part))) return undefined;
    return path.split(".").reduce((current, key) => (current == null ? current : current[key]), obj);
  }

  function arrayAtPath(path) {
    const value = getByPath(data, path);
    return Array.isArray(value) ? value : null;
  }

  function removeArrayItem(path, index) {
    const array = arrayAtPath(path);
    if (!array || !Number.isInteger(index) || index < 0 || index >= array.length) return false;
    array.splice(index, 1);
    return true;
  }

  function appendArrayItem(path, value) {
    const array = arrayAtPath(path);
    if (!array) return false;
    array.push(value);
    return true;
  }

  function isMultilinePath(path) {
    return MULTILINE_PATH_RE.test(path || "");
  }

  function isUrlPath(path) {
    return /(?:^|[.])(?:avatar|github|website|demo|link|href)$/.test(path || "");
  }
  function isEmailPath(path) {
    return path === "contact.email";
  }
  function normalizeEmail(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (raw.length > 254 || /[\u0000-\u001f\u007f\s<>]/.test(raw) || !/^[^@]+@[^@]+$/.test(raw)) return null;
    return raw;
  }
  function readEditableValue(target) {
    const path = target?.getAttribute?.("data-edit-path") || "";
    const previous = getByPath(data, path);
    let value = normalizeEditableText(textOfEditable(target), path);
    const placeholder = target?.getAttribute?.("data-edit-placeholder");
    if (!target?.dataset.editTouched && placeholder && value === normalizeEditableText(placeholder, path) && (previous == null || previous === "")) {
      value = "";
    }
    return { path, previous, value };
  }
  function normalizeEditableValue(path, value) {
    if (isUrlPath(path)) {
      const normalized = normalizeUrl(value);
      return normalized === null ? { value: null, error: "链接地址无效或协议不安全" } : { value: normalized, error: "" };
    }
    if (isEmailPath(path)) {
      const normalized = normalizeEmail(value);
      return normalized === null ? { value: null, error: "邮箱地址无效" } : { value: normalized, error: "" };
    }
    return { value, error: "" };
  }

  function isExternalHref(value) {
    return /^(?:https?:)?\/\//i.test(String(value || ""));
  }

  function normalizeUrl(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    for (const char of raw) {
      const code = char.charCodeAt(0);
      if (code <= 31 || code === 127) return null;
    }
    if (/^(?:javascript|data|vbscript):/i.test(raw)) return null;
    let candidate = raw;
    if (raw.startsWith("//")) {
      candidate = `https:${raw}`;
    } else if (raw.startsWith("#") || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
      return raw;
    } else if (/^https?:/i.test(raw)) {
      if (!/^https?:\/\/[^\s]+$/i.test(raw)) return null;
    } else if (/^mailto:/i.test(raw)) {
      if (!/^mailto:[^\s]+$/i.test(raw) || raw.length === 7) return null;
    } else if (/^tel:/i.test(raw)) {
      if (!/^tel:[^\s]+$/i.test(raw) || raw.length === 4) return null;
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      return null;
    } else if (raw.includes(".") && !/\s/.test(raw)) {
      candidate = `https://${raw}`;
    } else {
      return null;
    }

    try {
      const parsed = new URL(candidate, window.location.href);
      const protocol = parsed.protocol.toLowerCase();
      if (!SAFE_URL_PROTOCOLS.has(protocol)) return null;
      if ((protocol === "http:" || protocol === "https:") && !parsed.hostname) return null;
    } catch (_) {
      return null;
    }
    return candidate;
  }

  function safeHref(value) {
    const normalized = normalizeUrl(value);
    return normalized === null || normalized === "" ? "#" : normalized;
  }

  function textOfEditable(node) {
    let output = "";

    const blockTags = new Set([
      "ADDRESS",
      "ARTICLE",
      "DIV",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "LI",
      "P",
      "PRE",
      "SECTION",
    ]);

    function visit(current, isRoot = false) {
      if (current.nodeType === 3) {
        output += current.nodeValue || "";
        return;
      }
      if (current.nodeType !== 1) return;
      if (current.matches?.(EDIT_CONTROL_SELECTOR) || current.getAttribute("contenteditable") === "false") return;
      if (current.tagName === "BR") {
        output += "\n";
        return;
      }

      const isBlock = blockTags.has(current.tagName);
      if (isBlock && !isRoot && output && !output.endsWith("\n")) output += "\n";
      current.childNodes.forEach((child) => visit(child));
      if (isBlock && !isRoot && output && !output.endsWith("\n")) output += "\n";
    }

    if (node) visit(node, true);
    return output;
  }

  function normalizeLine(value) {
    let output = "";
    let pendingSpace = false;
    for (const char of String(value || "")) {
      const code = char.charCodeAt(0);
      if (code === 32 || code === 9) {
        pendingSpace = true;
        continue;
      }
      if (pendingSpace && output) output += " ";
      output += char;
      pendingSpace = false;
    }
    return output.trim();
  }

  function collapseWhitespace(value) {
    return String(value || "")
      .replaceAll(String.fromCharCode(160), " ")
      .split("")
      .reduce((output, char) => {
        const code = char.charCodeAt(0);
        if (code === 32 || (code >= 9 && code <= 13)) return output.endsWith(" ") ? output : output + " ";
        return output + char;
      }, "")
      .trim();
  }

  function normalizeEditableText(value, path) {
    const text = String(value ?? "").replaceAll(String.fromCharCode(160), " ").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    if (!isMultilinePath(path)) return collapseWhitespace(text);
    let normalized = text.split("\n").map(normalizeLine).join("\n").trim();
    while (normalized.includes("\n\n\n")) normalized = normalized.replaceAll("\n\n\n", "\n\n");
    return normalized;
  }


  function setEditableText(node, value) {
    if (!node) return;
    const raw = String(value ?? "");
    const placeholder = node.getAttribute("data-edit-placeholder");
    const display = raw === "" && placeholder ? placeholder : raw;
    const controls = [...node.querySelectorAll(EDIT_CONTROL_SELECTOR)];
    if (!controls.length) {
      if (node.textContent !== display) node.textContent = display;
      return;
    }

    const hasControl = (child) => controls.some((control) => child === control || child.contains?.(control));
    [...node.childNodes].forEach((child) => {
      if (!hasControl(child)) child.remove();
    });
    node.insertBefore(node.ownerDocument.createTextNode(display), controls[0]);
  }

  function editableFromTarget(target) {
    const node = target?.closest?.("[data-edit-path]");
    if (!node || !isEditingMode || !node.isConnected) return null;
    if (node.matches("a, img") || node.getAttribute("contenteditable") !== "true") return null;
    if (target.closest?.(`${EDIT_CONTROL_SELECTOR},button`)) return null;
    return node;
  }

  function editableTextNodes(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode(textNode) {
        const parent = textNode.parentElement;
        if (parent?.closest?.(EDIT_CONTROL_SELECTOR) || parent?.closest?.('[contenteditable="false"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function selectEditableContents(node) {
    const selection = window.getSelection?.();
    if (!selection || !node) return;
    const textNodes = editableTextNodes(node);
    const range = document.createRange();
    if (textNodes.length) {
      range.setStart(textNodes[0], 0);
      const last = textNodes[textNodes.length - 1];
      range.setEnd(last, last.nodeValue?.length || 0);
    } else {
      range.selectNodeContents(node);
      range.collapse(true);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function applyLinkAttributes(anchor, value) {
    if (!anchor) return;
    const normalized = normalizeUrl(value);
    const href = normalized === null || normalized === "" ? "#" : normalized;
    anchor.setAttribute("href", href);
    if (isExternalHref(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noreferrer");
    } else {
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
    }
  }

  function updateGithubCta() {
    const gh = $("#githubCta");
    if (!gh) return;
    gh.setAttribute("data-edit-path", "contact.github");
    gh.onclick = isEditingMode
      ? (event) => {
          event.preventDefault();
          editLink(gh);
        }
      : null;
    applyLinkAttributes(gh, data.contact?.github);
  }


  function syncEditablePath(path, value) {
    document.querySelectorAll(`[data-edit-path="${path}"]`).forEach((node) => {
      if (node.matches("a")) applyLinkAttributes(node, value);
      else if (!node.matches("img")) setEditableText(node, value);
    });
  }
  function applyReconciledDataToDocument() {
    if (isEditingMode) {
      if (pendingExternalRender) {
        if (hasEditableDrafts()) return;
        pendingExternalRender = false;
        pendingEditableSyncPaths.clear();
        clearStructureHistory();
        renderAll({ preserveScroll: true });
        return;
      }
      document.querySelectorAll("[data-edit-path]").forEach((node) => {
        const path = node.getAttribute("data-edit-path");
        if (dirtyEditablePaths.has(path) || isEditableDirty(node)) return;
        if (document.activeElement === node) {
          pendingEditableSyncPaths.add(path);
          return;
        }
        const value = getByPath(data, path);
        if (node.matches("a")) applyLinkAttributes(node, value);
        else if (node.matches("img")) updateAvatarElement();
        else setEditableText(node, value ?? "");
      });
      updateAvatarElement();
      updateGithubCta();
      document.title = data.meta?.title || `${data.profile?.name || "Albert"} · Resume`;
      const heroDisplay = $("#heroDisplay");
      if (heroDisplay) heroDisplay.setAttribute("data-text", data.profile?.name || "");
      return;
    }
    pendingExternalRender = false;
    pendingEditableSyncPaths.clear();
    clearStructureHistory();
    renderAll({ preserveScroll: true });
  }
  function markEditablePathDirty(path) {
    if (path) dirtyEditablePaths.add(path);
  }
  function clearAllEditablePathDirty() {
    dirtyEditablePaths.clear();
  }
  function hasEditableDrafts() {
    return Boolean(
      composingNode?.isConnected || document.querySelector('[data-edit-path][data-edit-touched="1"]')
    );
  }
  function clearEditableDrafts() {
    document.querySelectorAll("[data-edit-path]").forEach((node) => {
      delete node.dataset.editTouched;
    });
  }
  function updateAvatarElement() {
    const avatar = $("#avatarImg");
    if (!avatar) return;
    const value = data.profile?.avatar;
    const normalized = normalizeUrl(value);
    if (normalized) avatar.setAttribute("src", normalized);
    else avatar.removeAttribute("src");
    avatar.alt = data.profile?.name || "Albert";
  }

  function editLink(anchor) {
    if (!isEditingMode || !anchor) return;
    const path = anchor.getAttribute("data-edit-path");
    if (!path) return;
    const current = String(getByPath(data, path) ?? "");
    const entered = window.prompt("编辑链接地址:", current);
    if (entered === null) return;
    const normalized = normalizeUrl(entered);
    if (normalized === null) {
      toast("链接地址无效或协议不安全");
      return;
    }

    let saved = true;
    if (normalized !== current) {
      if (!setByPath(data, path, normalized)) {
        toast("链接保存失败，请重试");
        return;
      }
      markEditablePathDirty(path);
      clearStructureHistory();
      saved = persist(data, { immediate: true });
    }
    syncEditablePath(path, getByPath(data, path));
    if (saved) toast("链接已保存");
  }

  function editAvatar() {
    if (!isEditingMode) return;
    const path = "profile.avatar";
    const current = String(getByPath(data, path) ?? "");
    const entered = window.prompt("头像地址:", current);
    if (entered === null) return;
    const normalized = normalizeUrl(entered);
    const avatarAllowed =
      normalized !== null &&
      (normalized === "" ||
        /^(?:https?:)?\/\//i.test(normalized) ||
        normalized.startsWith("/") ||
        normalized.startsWith("./") ||
        normalized.startsWith("../"));
    if (!avatarAllowed) {
      toast("头像地址无效");
      return;
    }

    let saved = true;
    if (normalized !== current) {
      if (!setByPath(data, path, normalized)) {
        toast("头像地址保存失败，请重试");
        return;
      }
      markEditablePathDirty(path);
      clearStructureHistory();
      saved = persist(data, { immediate: true });
    }
    updateAvatarElement();
    if (saved) toast("头像地址已保存");
  }


  function bindEditableElements() {
    document.querySelectorAll("[data-edit-path]").forEach((node) => {
      const path = node.getAttribute("data-edit-path");
      const value = getByPath(data, path);

      if (node.matches("a")) {
        applyLinkAttributes(node, value);
        node.removeAttribute("contenteditable");
        node.classList.remove("editable-active");
        node.onclick = isEditingMode ? (event) => {
          event.preventDefault();
          editLink(node);
        } : null;
        return;
      }
      if (node.matches("img")) {
        node.removeAttribute("contenteditable");
        node.classList.remove("editable-active");
        return;
      }
      setEditableText(node, value ?? "");
      if (isEditingMode) {
        node.setAttribute("contenteditable", "true");
        node.setAttribute("role", "textbox");
        node.setAttribute("aria-multiline", String(isMultilinePath(path)));
        node.setAttribute("spellcheck", String(isMultilinePath(path)));
        node.classList.add("editable-active");
      } else {
        node.removeAttribute("contenteditable");
        node.removeAttribute("role");
        node.removeAttribute("aria-multiline");
        node.removeAttribute("spellcheck");
        node.classList.remove("editable-active");
        delete node.dataset.editTouched;
      }
    });

    document.querySelectorAll(".tag-del-btn, .list-del-btn").forEach((control) => {
      control.setAttribute("role", "button");
      control.setAttribute("tabindex", "0");
      control.setAttribute("aria-label", "删除");
      control.setAttribute("title", "删除");
      control.onkeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        control.click();
      };
    });

    const avatar = $("#avatarImg");
    updateAvatarElement();
    if (avatar) {
      if (isEditingMode) {
        avatar.setAttribute("tabindex", "0");
        avatar.setAttribute("role", "button");
        avatar.setAttribute("aria-label", "编辑头像地址");
        avatar.onclick = editAvatar;
        avatar.onkeydown = (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          editAvatar();
        };
      } else {
        avatar.removeAttribute("tabindex");
        avatar.removeAttribute("role");
        avatar.removeAttribute("aria-label");
        avatar.onclick = null;
        avatar.onkeydown = null;
      }
    }

    updateGithubCta();
    document.title = data.meta?.title || `${data.profile?.name || "Albert"} · Resume`;

    const heroDisplay = $("#heroDisplay");
    if (heroDisplay) heroDisplay.setAttribute("data-text", data.profile?.name || "");
  }
  function isEditableDirty(node) {
    return Boolean(node?.dataset.editTouched);
  }

  function prepareEditableNode(target) {
    const current = readEditableValue(target);
    const normalized = normalizeEditableValue(current.path, current.value);
    return { ...current, value: normalized.value, error: normalized.error };
  }

  function reportEditableError(target, message) {
    if (message) toast(message);
    target?.focus?.({ preventScroll: true });
  }

  function saveEditableNode(target, options = {}) {
    if (!target?.hasAttribute?.("data-edit-path") || !target.isConnected || target.matches("a, img")) return false;
    const prepared = prepareEditableNode(target);
    if (prepared.error) {
      if (!options.allowDraft) reportEditableError(target, prepared.error);
      return false;
    }

    const previousValue = prepared.previous == null ? "" : String(prepared.previous);
    const changed = previousValue !== prepared.value;
    if (changed) {
      if (!setByPath(data, prepared.path, prepared.value)) return false;
      markEditablePathDirty(prepared.path);
      clearStructureHistory();
    }
    delete target.dataset.editTouched;

    if (changed && prepared.path === "profile.name") {
      document.querySelectorAll('[data-edit-path="profile.name"]').forEach((node) => {
        if (node !== target) setEditableText(node, prepared.value);
        if (node.hasAttribute("data-text")) node.setAttribute("data-text", prepared.value);
      });
      updateAvatarElement();
    }
    if (changed && prepared.path === "contact.github") updateGithubCta();
    if (document.activeElement !== target) setEditableText(target, prepared.value);
    return changed;
  }

  function commitEditableNode(target, options = {}) {
    const immediate = options.immediate === true;
    if (!target?.isConnected || !isEditableDirty(target)) return immediate ? flushPersist() : true;
    const prepared = prepareEditableNode(target);
    if (prepared.error) {
      reportEditableError(target, prepared.error);
      return false;
    }
    const changed = saveEditableNode(target, { allowDraft: true });
    if (changed) return persist(data, { immediate });
    return immediate ? flushPersist() : true;
  }

  /** 提交所有实时字段，不依赖可能中断输入法的 blur。 */
  function commitPendingEdits(options = {}) {
    const immediate = options.immediate !== false;
    const allowInvalidDrafts = options.allowInvalidDrafts === true;
    const nodes = [...document.querySelectorAll('[data-edit-path][contenteditable="true"]')].filter(
      (node) => node.isConnected && node !== composingNode && isEditableDirty(node)
    );
    const invalid = nodes.find((node) => prepareEditableNode(node).error);
    if (invalid && !allowInvalidDrafts) {
      reportEditableError(invalid, prepareEditableNode(invalid).error);
      return false;
    }

    let changed = false;
    nodes.forEach((node) => {
      if (prepareEditableNode(node).error) return;
      if (saveEditableNode(node, { allowDraft: true })) changed = true;
    });
    if (changed) return persist(data, { immediate });
    return immediate ? flushPersist() : true;
  }

  document.addEventListener("focusin", (event) => {
    const node = editableFromTarget(event.target);
    if (!node || !node.hasAttribute("data-edit-placeholder")) return;
    const path = node.getAttribute("data-edit-path");
    if (!getByPath(data, path) && node.textContent.trim() === node.getAttribute("data-edit-placeholder")) {
      selectEditableContents(node);
    }
  });

  document.addEventListener("focusout", (event) => {
    const node = editableFromTarget(event.target);
    if (!node || composingNode === node) return;
    const path = node.getAttribute("data-edit-path");
    if (isEditableDirty(node) && !commitEditableNode(node)) return;
    if (!pendingEditableSyncPaths.delete(path)) return;

    const value = getByPath(data, path);
    if (node.matches("a")) applyLinkAttributes(node, value);
    else if (node.matches("img")) updateAvatarElement();
    else setEditableText(node, value ?? "");
  });

  document.addEventListener("input", (event) => {
    const node = editableFromTarget(event.target);
    if (!node) return;
    node.dataset.editTouched = "1";
    if (event.isComposing || composingNode === node) return;
    if (saveEditableNode(node, { allowDraft: true })) persist(data);
  });

  document.addEventListener("compositionstart", (event) => {
    const node = editableFromTarget(event.target);
    if (node) {
      composingNode = node;
      node.dataset.editTouched = "1";
    }
  });

  document.addEventListener("compositionend", (event) => {
    const node = editableFromTarget(event.target) || composingNode;
    if (!composingNode || composingNode === node) composingNode = null;
    if (pendingExternalReset) {
      const resetApplied = flushPersist();
      toast(resetApplied ? "其他标签页已重置，已恢复默认内容" : "已恢复默认内容，但本地清理失败");
      return;
    }
    if (node && node.isConnected && isEditableDirty(node)) commitEditableNode(node);
  });

  document.addEventListener("beforeinput", (event) => {
    const node = editableFromTarget(event.target);
    if (!node) return;
    if (String(event.inputType || "").startsWith("format")) event.preventDefault();
    if ((event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") && !isMultilinePath(node.getAttribute("data-edit-path"))) {
      event.preventDefault();
      if (commitEditableNode(node, { immediate: true })) node.blur();
    }
  });

  function selectionIntersectsEditorControl(node, selection) {
    if (!selection || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    return [...node.querySelectorAll(EDIT_CONTROL_SELECTOR)].some((control) => {
      try {
        return range.intersectsNode(control);
      } catch (_) {
        return false;
      }
    });
  }

  function insertPlainText(node, text) {
    node.focus({ preventScroll: true });
    let selection = window.getSelection?.();
    let inside = Boolean(
      selection &&
        selection.rangeCount &&
        node.contains(selection.anchorNode) &&
        node.contains(selection.focusNode) &&
        !selectionIntersectsEditorControl(node, selection)
    );
    if (!inside) {
      selectEditableContents(node);
      selection = window.getSelection?.();
      inside = Boolean(selection && selection.rangeCount && node.contains(selection.anchorNode));
    }
    if (inside && document.execCommand) {
      try {
        if (document.execCommand("insertText", false, text)) return;
      } catch (_) {}
    }
    const range = inside ? selection.getRangeAt(0) : document.createRange();
    if (!inside) {
      range.selectNodeContents(node);
      range.collapse(true);
    }
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  document.addEventListener("paste", (event) => {
    const node = editableFromTarget(event.target);
    if (!node) return;
    const plain = event.clipboardData?.getData("text/plain");
    if (plain == null) return;
    event.preventDefault();
    const path = node.getAttribute("data-edit-path");
    const text = isMultilinePath(path) ? plain.replaceAll("\r\n", "\n").replaceAll("\r", "\n") : collapseWhitespace(plain);
    insertPlainText(node, text);
    node.dataset.editTouched = "1";
    if (saveEditableNode(node, { allowDraft: true })) persist(data);
  });


  function flushBeforeLeave() {
    if (!EDIT_ENABLED) return;
    commitPendingEdits({ immediate: false });
    flushPersist();
  }

  window.addEventListener("pagehide", flushBeforeLeave);
  window.addEventListener("beforeunload", flushBeforeLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeforeLeave();
  });

  function clearStructureHistory() {
    undoStack.length = 0;
    redoStack.length = 0;
  }

  function pushHistory(stack, snapshot) {
    stack.push(deepClone(snapshot));
    if (stack.length > HISTORY_LIMIT) stack.shift();
  }

  function restoreStructureHistory(source, destination, message) {
    if (composingNode?.isConnected) return false;
    if (pendingExternalRender) {
      toast("其他标签页正在修改结构，请先退出并重新进入编辑模式");
      return false;
    }
    if (!commitPendingEdits({ immediate: false })) return false;
    if (!source.length) return false;
    pushHistory(destination, data);
    adoptData(source.pop());
    const persisted = persist(data, { immediate: true });
    renderAll();
    if (!persisted) {
      reportStorageFailure();
      toast(`${message}，但保存失败`);
      return true;
    }
    toast(message);
    return true;
  }

  function mutateAndRender(mutator, options = {}) {
    if (!isEditingMode || typeof mutator !== "function") return false;
    if (pendingExternalRender) {
      toast("其他标签页正在修改结构，请先退出并重新进入编辑模式");
      return false;
    }
    if (composingNode?.isConnected) {
      toast("请先完成输入法内容");
      return false;
    }
    if (!commitPendingEdits({ immediate: false })) return false;
    const previous = deepClone(data);
    let result;
    try {
      result = mutator();
    } catch (_) {
      adoptData(previous);
      toast("编辑失败，请重试");
      return false;
    }
    if (result === false) return false;
    pushHistory(undoStack, previous);
    redoStack.length = 0;
    const persisted = persist(data, { immediate: true });
    renderAll({ preserveScroll: options.preserveScroll !== false, focusPath: options.focusPath });
    if (!persisted) {
      reportStorageFailure();
      return false;
    }
    return true;
  }

  function renderArrayControls(index, _arrayRef, arrayPath) {
    if (!isEditingMode) return null;
    return el("div", { class: "edit-item-controls", contenteditable: "false" }, [
      el(
        "button",
        {
          class: "btn-edit-ctrl btn-edit-del",
          type: "button",
          title: "删除",
          contenteditable: "false",
          onClick: () => {
            if (mutateAndRender(() => removeArrayItem(arrayPath, index))) toast("已删除");
          },
        },
        "×"
      ),
    ]);
  }

  function renderAddButton(_arrayRef, factory, focusPathFactory, arrayPath) {
    if (!isEditingMode) return null;
    return el("div", { class: "edit-add-container", contenteditable: "false" }, [
      el(
        "button",
        {
          class: "btn btn--sm btn--ghost btn-edit-add",
          type: "button",
          contenteditable: "false",
          onClick: () => {
            const current = arrayAtPath(arrayPath);
            if (!current) return;
            const index = current.length;
            const focusPath = typeof focusPathFactory === "function" ? focusPathFactory(index) : undefined;
            if (mutateAndRender(() => appendArrayItem(arrayPath, factory()), { focusPath })) {
              toast("已添加，直接改文字即可");
            }
          },
        },
        "+ 添加项"
      ),
    ]);
  }

  function renderHighlights() {
    const root = $("#highlights");
    if (!root) return;
    root.innerHTML = "";
    (Array.isArray(data.highlights) ? data.highlights : []).forEach((highlight, i) => {
      const item = isPlainObject(highlight) ? highlight : {};
      root.appendChild(
        el("div", { class: "stat edit-relative reveal" }, [
          el("strong", { "data-edit-path": `highlights.${i}.value`, text: item.value || "" }),
          el("span", { "data-edit-path": `highlights.${i}.label`, text: item.label || "" }),
          el("span", {
            class: "stat-hint",
            "data-edit-path": `highlights.${i}.hint`,
            text: item.hint || "",
          }),
          renderArrayControls(i, data.highlights, "highlights"),
        ])
      );
    });
    const add = renderAddButton(
      data.highlights,
      () => ({ label: "新标签", value: "—", hint: "说明" }),
      (index) => `highlights.${index}.value`,
      "highlights"
    );
    if (add) root.appendChild(add);
  }

  function renderAbout() {
    const root = $("#aboutCopy");
    if (!root) return;
    root.innerHTML = "";
    const about = Array.isArray(data.profile?.about) ? data.profile.about : (data.profile.about = []);
    about.forEach((paragraph, i) => {
      root.appendChild(
        el("div", { class: "about-para-wrap edit-relative reveal" }, [
          el("p", { "data-edit-path": `profile.about.${i}`, text: paragraph || "" }),
          renderArrayControls(i, about, "profile.about"),
        ])
      );
    });
    const add = renderAddButton(
      about,
      () => "新的一段介绍。",
      (index) => `profile.about.${index}`,
      "profile.about"
    );
    if (add) root.appendChild(add);
  }

  function renderSkills() {
    const root = $("#skillGroups");
    if (!root) return;
    root.innerHTML = "";

    (Array.isArray(data.skills?.groups) ? data.skills.groups : []).forEach((g, gIdx) => {
      const items = Array.isArray(g.items) ? g.items : (g.items = []);
      const tags = el("div", { class: "tags" });
      items.forEach((t, tIdx) => {
        const tag = el("span", {
          class: "tag edit-relative",
          "data-edit-path": `skills.groups.${gIdx}.items.${tIdx}`,
          text: t,
        });
        if (isEditingMode) {
          tag.appendChild(
            el(
              "span",
              {
                class: "tag-del-btn",
                contenteditable: "false",
                onClick: (event) => {
                  event.stopPropagation();
                  if (mutateAndRender(() => removeArrayItem(`skills.groups.${gIdx}.items`, tIdx))) toast("已删除");
                },
              },
              "×"
            )
          );
        }
        tags.appendChild(tag);
      });

      if (isEditingMode) {
        tags.appendChild(
          el("button", {
            class: "btn-tag-add",
            type: "button",
            contenteditable: "false",
            text: "+",
            onClick: () => {
              const path = `skills.groups.${gIdx}.items`;
              const index = arrayAtPath(path)?.length;
              if (!Number.isInteger(index)) return;
              if (mutateAndRender(() => appendArrayItem(path, "新技能"), { focusPath: `${path}.${index}` })) {
                toast("已添加，直接改文字即可");
              }
            },
          })
        );
      }

      root.appendChild(
        el("div", { class: "skill-group edit-relative reveal" }, [
          el("h3", { "data-edit-path": `skills.groups.${gIdx}.name`, text: g.name }),
          tags,
          renderArrayControls(gIdx, data.skills.groups, "skills.groups"),
        ])
      );
    });

    const add = renderAddButton(
      data.skills.groups,
      () => ({ name: "新技能组", items: ["技能 A", "技能 B"] }),
      (index) => `skills.groups.${index}.name`,
      "skills.groups"
    );
    if (add) root.appendChild(add);
  }

  function renderProjects() {
    const root = $("#projectGrid");
    if (!root) return;
    root.innerHTML = "";

    (Array.isArray(data.projects) ? data.projects : []).forEach((p, i) => {
      const highlights = Array.isArray(p.highlights) ? p.highlights : (p.highlights = []);
      const stack = Array.isArray(p.stack) ? p.stack : (p.stack = []);
      const points = el("ul", { class: "project-points" });
      highlights.forEach((h, hIdx) => {
        const li = el("li", {
          "data-edit-path": `projects.${i}.highlights.${hIdx}`,
          text: h,
        });
        if (isEditingMode) {
          li.appendChild(
            el("span", {
              class: "list-del-btn",
              contenteditable: "false",
              text: "×",
              onClick: () => {
                if (mutateAndRender(() => removeArrayItem(`projects.${i}.highlights`, hIdx))) toast("已删除");
              },
            })
          );
        }
        points.appendChild(li);
      });

      if (isEditingMode) {
        points.appendChild(
          el("button", {
            class: "btn btn--sm btn--ghost btn-list-add",
            type: "button",
            contenteditable: "false",
            text: "+ 添加亮点",
            onClick: () => {
              const path = `projects.${i}.highlights`;
              const index = arrayAtPath(path)?.length;
              if (!Number.isInteger(index)) return;
              if (mutateAndRender(() => appendArrayItem(path, "新的项目亮点"), { focusPath: `${path}.${index}` })) {
                toast("已添加，直接改文字即可");
              }
            },
          })
        );
      }

      const tags = el("div", { class: "tags" });
      stack.forEach((t, tIdx) => {
        const tag = el("span", {
          class: "tag edit-relative",
          "data-edit-path": `projects.${i}.stack.${tIdx}`,
          text: t,
        });
        if (isEditingMode) {
          tag.appendChild(
            el("span", {
              class: "tag-del-btn",
              contenteditable: "false",
              text: "×",
              onClick: () => {
                if (mutateAndRender(() => removeArrayItem(`projects.${i}.stack`, tIdx))) toast("已删除");
              },
            })
          );
        }
        tags.appendChild(tag);
      });

      if (isEditingMode) {
        tags.appendChild(
          el("button", {
            class: "btn-tag-add",
            type: "button",
            contenteditable: "false",
            text: "+",
            onClick: () => {
              const path = `projects.${i}.stack`;
              const index = arrayAtPath(path)?.length;
              if (!Number.isInteger(index)) return;
              if (mutateAndRender(() => appendArrayItem(path, "Tech"), { focusPath: `${path}.${index}` })) {
                toast("已添加，直接改文字即可");
              }
            },
          })
        );
      }

      const links = el("div", { class: "project-links" });
      if (isPlainObject(p.links) && p.links.github !== undefined) {
        links.appendChild(
          el("a", {
            class: "link-chip",
            href: safeHref(p.links.github),
            target: isExternalHref(p.links.github) ? "_blank" : undefined,
            rel: isExternalHref(p.links.github) ? "noreferrer" : undefined,
            "data-edit-path": `projects.${i}.links.github`,
            text: "GitHub →",
          })
        );
      }
      if (isPlainObject(p.links) && Object.prototype.hasOwnProperty.call(p.links, "demo") && (p.links.demo || isEditingMode)) {
        links.appendChild(
          el("a", {
            class: "link-chip",
            href: safeHref(p.links.demo),
            target: isExternalHref(p.links.demo) ? "_blank" : undefined,
            rel: isExternalHref(p.links.demo) ? "noreferrer" : undefined,
            "data-edit-path": `projects.${i}.links.demo`,
            text: "Live →",
          })
        );
      }

      const num = String(i + 1).padStart(2, "0");
      root.appendChild(
        el("article", { class: "project-card edit-relative reveal" }, [
          el("div", { class: "project-index", text: num }),
          el("div", { class: "project-body" }, [
            el("div", { class: "project-top" }, [
              el("div", {}, [
                el("h3", { "data-edit-path": `projects.${i}.name`, text: p.name }),
                el("div", {
                  class: "project-tag",
                  "data-edit-path": `projects.${i}.tag`,
                  text: p.tag || "",
                }),
              ]),
              el("div", { class: "pill-row" }, [
                el("span", {
                  class: "pill live",
                  "data-edit-path": `projects.${i}.status`,
                  text: p.status || "Work",
                }),
                el("span", {
                  class: "pill",
                  "data-edit-path": `projects.${i}.year`,
                  text: p.year || "",
                }),
              ]),
            ]),
            el("p", {
              class: "project-desc",
              "data-edit-path": `projects.${i}.description`,
              text: p.description,
            }),
            points,
            tags,
            links,
          ]),
          renderArrayControls(i, data.projects, "projects"),
        ])
      );
    });

    const add = renderAddButton(
      data.projects,
      () => ({
        name: "新项目",
        tag: "一句话定位",
        year: "2026",
        status: "Active",
        description: "项目简介。",
        highlights: ["亮点一"],
        stack: ["TypeScript"],
        links: { github: "https://github.com", demo: "" },
      }),
      (index) => `projects.${index}.name`,
      "projects"
    );
    if (add) root.appendChild(add);
  }

  function renderMore() {
    const root = $("#moreGrid");
    if (!root) return;
    root.innerHTML = "";

    (Array.isArray(data.moreProjects) ? data.moreProjects : []).forEach((p, i) => {
      const stack = Array.isArray(p.stack) ? p.stack : (p.stack = []);
      const tags = el("div", { class: "tags" });
      stack.forEach((t, tIdx) => {
        const tag = el("span", {
          class: "tag edit-relative",
          "data-edit-path": `moreProjects.${i}.stack.${tIdx}`,
          text: t,
        });
        if (isEditingMode) {
          tag.appendChild(
            el("span", {
              class: "tag-del-btn",
              contenteditable: "false",
              text: "×",
              onClick: () => {
                if (mutateAndRender(() => removeArrayItem(`moreProjects.${i}.stack`, tIdx))) toast("已删除");
              },
            })
          );
        }
        tags.appendChild(tag);
      });

      if (isEditingMode) {
        tags.appendChild(
          el("button", {
            class: "btn-tag-add",
            type: "button",
            contenteditable: "false",
            text: "+",
            onClick: () => {
              const path = `moreProjects.${i}.stack`;
              const index = arrayAtPath(path)?.length;
              if (!Number.isInteger(index)) return;
              if (mutateAndRender(() => appendArrayItem(path, "TS"), { focusPath: `${path}.${index}` })) {
                toast("已添加，直接改文字即可");
              }
            },
          })
        );
      }

      root.appendChild(
        el("div", { class: "more-card edit-relative reveal" }, [
          el("h4", { "data-edit-path": `moreProjects.${i}.name`, text: p.name }),
          el("p", {
            "data-edit-path": `moreProjects.${i}.description`,
            text: p.description,
          }),
          tags,
          p.link !== undefined
            ? el("a", {
                class: "link-chip",
                style: { marginTop: "0.75rem" },
                href: safeHref(p.link),
                target: isExternalHref(p.link) ? "_blank" : undefined,
                rel: isExternalHref(p.link) ? "noreferrer" : undefined,
                "data-edit-path": `moreProjects.${i}.link`,
                text: "Link →",
              })
            : null,
          renderArrayControls(i, data.moreProjects, "moreProjects"),
        ])
      );
    });

    const add = renderAddButton(
      data.moreProjects,
      () => ({
        name: "新项目",
        description: "一句话。",
        stack: ["TS"],
        link: "https://github.com",
      }),
      (index) => `moreProjects.${index}.name`,
      "moreProjects"
    );
    if (add) root.appendChild(add);
  }

  function renderExperience() {
    const root = $("#timeline");
    if (!root) return;
    root.innerHTML = "";

    (Array.isArray(data.experience) ? data.experience : []).forEach((entry, i) => {
      const bullets = Array.isArray(entry.bullets) ? entry.bullets : (entry.bullets = []);
      const ul = el("ul");
      bullets.forEach((bullet, bulletIdx) => {
        const li = el("li", {
          "data-edit-path": `experience.${i}.bullets.${bulletIdx}`,
          text: bullet,
        });
        if (isEditingMode) {
          li.appendChild(
            el("span", {
              class: "list-del-btn",
              contenteditable: "false",
              text: "×",
              onClick: () => {
                if (mutateAndRender(() => removeArrayItem(`experience.${i}.bullets`, bulletIdx))) toast("已删除");
              },
            })
          );
        }
        ul.appendChild(li);
      });

      if (isEditingMode) {
        ul.appendChild(
          el("button", {
            class: "btn btn--sm btn--ghost btn-list-add",
            type: "button",
            contenteditable: "false",
            text: "+ 添加",
            onClick: () => {
              const path = `experience.${i}.bullets`;
              const index = arrayAtPath(path)?.length;
              if (!Number.isInteger(index)) return;
              if (mutateAndRender(() => appendArrayItem(path, "新的经历描述"), { focusPath: `${path}.${index}` })) {
                toast("已添加，直接改文字即可");
              }
            },
          })
        );
      }

      root.appendChild(
        el("div", { class: "tl-item edit-relative reveal" }, [
          el("div", { class: "tl-dot" }),
          el("div", { class: "tl-card" }, [
            el("div", { class: "tl-top" }, [
              el("h3", { "data-edit-path": `experience.${i}.org`, text: entry.org }),
              el("div", {
                class: "tl-meta",
                "data-edit-path": `experience.${i}.period`,
                text: entry.period,
              }),
            ]),
            el(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                },
              },
              [
                el("p", {
                  class: "tl-role",
                  "data-edit-path": `experience.${i}.role`,
                  text: entry.role,
                }),
                el("span", {
                  class: "tl-meta",
                  "data-edit-path": `experience.${i}.location`,
                  text: entry.location || "",
                }),
              ]
            ),
            ul,
          ]),
          renderArrayControls(i, data.experience, "experience"),
        ])
      );
    });

    const add = renderAddButton(
      data.experience,
      () => ({
        org: "组织名称",
        role: "角色",
        period: "2025 — 2026",
        location: "远程",
        bullets: ["工作内容"],
      }),
      (index) => `experience.${index}.org`,
      "experience",
    );
    if (add) root.appendChild(add);
  }

  function renderEducation() {
    const root = $("#eduGrid");
    if (!root) return;
    root.innerHTML = "";

    (Array.isArray(data.education) ? data.education : []).forEach((entry, i) => {
      root.appendChild(
        el("article", { class: "edu-card edit-relative reveal" }, [
          el("h3", { "data-edit-path": `education.${i}.school`, text: entry.school }),
          el("p", {
            class: "degree",
            "data-edit-path": `education.${i}.degree`,
            text: entry.degree,
          }),
          el("div", {
            class: "period",
            "data-edit-path": `education.${i}.period`,
            text: entry.period,
          }),
          entry.note || isEditingMode
            ? el("p", {
                class: "note",
                "data-edit-path": `education.${i}.note`,
                text: entry.note || "",
              })
            : null,
          renderArrayControls(i, data.education, "education"),
        ])
      );
    });

    const add = renderAddButton(
      data.education,
      () => ({ school: "学校", degree: "学历 / 专业", period: "2022 — 2026", note: "" }),
      (index) => `education.${index}.school`,
      "education"
    );
    if (add) root.appendChild(add);
  }

  function renderContact() {
    const root = $("#contactLinks");
    if (!root) return;
    root.innerHTML = "";

    const contact = isPlainObject(data.contact) ? data.contact : (data.contact = {});
    const extra = Array.isArray(contact.extra) ? contact.extra : (contact.extra = []);
    const items = [
      {
        label: "Email",
        value: contact.email || "",
        href: contact.email ? `mailto:${contact.email}` : "#",
        path: "contact.email",
      },
      {
        label: "GitHub",
        value: contact.github || "",
        href: contact.github || "#",
        path: "contact.github",
      },
      {
        label: "Website",
        value: contact.website || "",
        href: contact.website || "#",
        path: "contact.website",
      },
      ...extra.map((entry, index) => ({
        label: entry.label || "联系方式",
        value: entry.href || "",
        href: entry.href || "#",
        path: `contact.extra.${index}.href`,
        labelPath: `contact.extra.${index}.label`,
        extraIdx: index,
      })),
    ];

    items.forEach((item) => {
      if (!item.value && !isEditingMode) return;
      const safe = safeHref(item.href);
      const wrap = el(
        isEditingMode ? "div" : "a",
        {
          class: "contact-link edit-relative",
          ...(isEditingMode
            ? {}
            : {
                href: safe,
                target: isExternalHref(safe) ? "_blank" : undefined,
                rel: isExternalHref(safe) ? "noreferrer" : undefined,
              }),
        },
        [
          el("div", {}, [
            el("strong", {
              text: item.label,
              "data-edit-path": item.labelPath,
            }),
            el("span", {
              "data-edit-path": item.path,
              "data-edit-placeholder": item.value ? undefined : "请填写",
              text: item.value || "请填写",
            }),
          ]),
          el("span", { text: "↗", "aria-hidden": "true" }),
        ]
      );

      if (isEditingMode && item.extraIdx !== undefined) {
        wrap.appendChild(
          el("button", {
            class: "btn-edit-ctrl btn-edit-del",
            type: "button",
            contenteditable: "false",
            text: "×",
            onClick: () => {
              if (mutateAndRender(() => removeArrayItem("contact.extra", item.extraIdx))) toast("已删除");
            },
          })
        );
      }
      root.appendChild(wrap);
    });

    if (isEditingMode) {
      root.appendChild(
        el("button", {
          class: "btn btn--sm btn--ghost",
          type: "button",
          contenteditable: "false",
          text: "+ 联系方式",
          onClick: () => {
            const label = window.prompt("标签（如 WeChat / LinkedIn）:");
            const cleanLabel = normalizeEditableText(label || "");
            if (!cleanLabel) return;
            const index = arrayAtPath("contact.extra")?.length;
            if (!Number.isInteger(index)) return;
            if (
              mutateAndRender(
                () => appendArrayItem("contact.extra", { label: cleanLabel, href: "" }),
                { focusPath: `contact.extra.${index}.href` }
              )
            ) {
              toast("已添加，直接改文字即可");
            }
          },
        })
      );
    }
  }


  function preserveScroll(run) {
    const x = window.scrollX;
    const y = window.scrollY;
    const html = document.documentElement;

    // pin to section under viewport (DOM rebuild can change heights above)
    const mid = Math.min(window.innerHeight * 0.35, 200);
    let anchorId = null;
    let anchorTop = 0;
    document.querySelectorAll("section[id]").forEach((sec) => {
      const r = sec.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid * 0.4) {
        anchorId = sec.id;
        anchorTop = r.top;
      }
    });

    run();

    // instant restore only — don't leave scroll-behavior stuck on "auto"
    const restore = () => {
      html.style.scrollBehavior = "auto";
      if (anchorId) {
        const el = document.getElementById(anchorId);
        if (el) {
          const delta = el.getBoundingClientRect().top - anchorTop;
          window.scrollBy(0, delta);
          html.style.scrollBehavior = "";
          return;
        }
      }
      window.scrollTo(x, y);
      html.style.scrollBehavior = "";
    };

    restore();
    requestAnimationFrame(restore);
  }

  function chromeOffset() {
    const bar = document.getElementById("nav");
    // sticky topbar height + small breathing room under it
    return (bar ? bar.offsetHeight : 68) + 12;
  }

  function scrollToId(id, behavior = "smooth") {
    if (!id || id === "top") {
      window.scrollTo({ top: 0, behavior });
      return;
    }
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - chromeOffset();
    window.scrollTo({ top: Math.max(0, top), behavior });
  }

  function initSmoothAnchors() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest?.('a[href^="#"]');
      if (!a) return;
      if (isEditingMode && e.target.closest?.('[contenteditable="true"]')) {
        e.preventDefault();
        return;
      }
      // skip edit-mode link editors / external-looking hashes only
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const id = href.slice(1);
      if (!id) return;
      // only handle in-page targets that exist (or top)
      if (id !== "top" && !document.getElementById(id)) return;

      e.preventDefault();
      scrollToId(id, "smooth");
      if (history.pushState) {
        history.pushState(null, "", href);
      } else {
        location.hash = href;
      }
    });
  }

  function focusEditablePath(path) {
    if (!path || !isEditingMode) return;
    const node = [...document.querySelectorAll("[data-edit-path]")].find((candidate) => candidate.getAttribute("data-edit-path") === path);
    if (!node || node.getAttribute("contenteditable") !== "true") return;
    node.focus({ preventScroll: true });
    selectEditableContents(node);
  }

  function renderAll(options = {}) {
    // 默认保留滚动位置；启动时可传 false。
    const shouldPreserve = options.preserveScroll !== false;
    const focusPath = options.focusPath;
    const run = () => {
      pendingEditableSyncPaths.clear();
      pendingExternalRender = false;
      renderHighlights();
      renderAbout();
      renderSkills();
      renderProjects();
      renderMore();
      renderExperience();
      renderEducation();
      renderContact();
      bindEditableElements();
      // 重建时让视口内内容直接显示，避免 opacity 闪烁造成跳动。
      document.querySelectorAll(".reveal").forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.top < window.innerHeight + 80) n.classList.add("is-in");
      });
      observeReveal();
      if (focusPath) window.requestAnimationFrame(() => focusEditablePath(focusPath));
    };
    if (shouldPreserve) preserveScroll(run);
    else run();
  }

  let revealObs;
  function observeReveal() {
    if (revealObs) revealObs.disconnect();
    revealObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-in");
            revealObs.unobserve(en.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -20px 0px" }
    );
    document.querySelectorAll(".reveal").forEach((n) => {
      if (!n.classList.contains("is-in")) revealObs.observe(n);
    });
  }

  function initChrome() {
    const nav = $("#nav");
    const bar = $("#progressBar");
    const links = [...document.querySelectorAll(".topbar__nav a")];
    const sections = links
      .map((a) => document.querySelector(a.getAttribute("href")))
      .filter(Boolean);

    const onScroll = () => {
      nav?.classList.toggle("is-scrolled", window.scrollY > 6);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar && max > 0) bar.style.width = `${Math.min(100, (window.scrollY / max) * 100)}%`;

      const y = window.scrollY + 110;
      let active = links[0];
      sections.forEach((sec, i) => {
        if (sec.offsetTop <= y) active = links[i];
      });
      links.forEach((l) => l.classList.toggle("is-active", l === active));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    initSmoothAnchors();

    $("#topBtn")?.addEventListener("click", () => scrollToId("top", "smooth"));
    $("#printBtn")?.addEventListener("click", () => window.print());
    $("#themeToggle")?.addEventListener("click", toggleTheme);
  }

  function toggleEditing(active) {
    if (!EDIT_ENABLED) return;
    active = Boolean(active);
    if (active === isEditingMode) return;
    if (!active && composingNode?.isConnected) {
      toast("请先完成输入法内容");
      return;
    }
    if (!active && isEditingMode) {
      if (!commitPendingEdits({ immediate: true })) return;
    }
    clearStructureHistory();
    // fixed banner no longer pushes layout; still preserve scroll across DOM rebuild
    preserveScroll(() => {
      isEditingMode = active;
      const banner = $("#editBanner");
      const fab = $("#editOpen");
      document.body.classList.toggle("is-editing", active);
      if (banner) {
        banner.hidden = !active;
        banner.setAttribute("aria-hidden", String(!active));
      }
      if (fab) {
        fab.classList.toggle("is-on", active);
        fab.setAttribute("aria-pressed", String(active));
        const s = fab.querySelector("span");
        if (s) s.textContent = active ? "退出" : "编辑";
      }
      renderAll({ preserveScroll: false }); // outer preserveScroll already holds position
      toast(active ? "编辑模式 ON" : "编辑模式 OFF");
    });
  }

  function exportJson() {
    if (composingNode?.isConnected) {
      toast("请先完成输入法内容");
      return;
    }
    if (isEditingMode && !commitPendingEdits({ immediate: false })) return;
    const persisted = flushPersist();
    let serialized;
    try {
      serialized = JSON.stringify(data, null, 2);
    } catch (_) {
      toast("导出失败，请检查简历内容");
      return;
    }
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "resume-data.json" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(persisted ? "已导出 JSON" : "已导出 JSON，本地保存仍不可用");
  }

  function resetData() {
    if (!window.confirm("重置为 data.js 默认内容？本地修改会清除。")) return;
    if (composingNode?.isConnected) {
      toast("请先完成输入法内容");
      return;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = 0;
    }

    const resetBroadcasted = broadcastReset();
    const storageCleared = removeStored(STORAGE_KEY);
    resetCleanupPending = !storageCleared;
    adoptData(normalizeDataShape(defaultData()));
    persistPending = false;
    pendingExternalReset = false;
    pendingExternalData = null;
    pendingExternalRender = false;
    storedDataSnapshot = deepClone(data);
    lastLocalWriteBase = null;
    lastLocalWriteData = null;
    lastLocalWriteAt = 0;
    clearAllEditablePathDirty();
    clearEditableDrafts();
    pendingEditableSyncPaths.clear();
    clearStructureHistory();
    renderAll();

    if (storageCleared) storageWarningShown = false;
    else reportStorageFailure();
    if (!storageCleared) {
      toast("已重置，但本地清理失败，请及时导出 JSON");
    } else if (!resetBroadcasted) {
      toast("已重置，但其他标签页可能未同步");
    } else {
      toast("已重置，已恢复默认内容");
    }
  }

  function stripEditorChrome() {
    document.body.classList.add("is-public");
    document.body.classList.remove("is-editing");
    const fab = $("#editOpen");
    if (fab) fab.remove();
    const banner = $("#editBanner");
    if (banner) banner.remove();
  }

  function initEditor() {
    if (!EDIT_ENABLED) {
      stripEditorChrome();
      return;
    }

    document.body.classList.add("is-local-edit");
    const editButton = $("#editOpen");
    editButton?.setAttribute("aria-pressed", "false");
    $("#editOpen")?.addEventListener("click", () => toggleEditing(!isEditingMode));
    $("#exitEditBtn")?.addEventListener("click", () => toggleEditing(false));
    $("#exportBtn")?.addEventListener("click", exportJson);
    $("#resetBtn")?.addEventListener("click", resetData);

    window.addEventListener("storage", (event) => {
      if (event.key === RESET_KEY) {
        if (event.newValue == null) return;
        pendingExternalReset = true;
        pendingExternalData = null;
        if (composingNode?.isConnected) {
          toast("其他标签页已重置，将在输入完成后同步");
          return;
        }
        const resetApplied = flushPersist();
        toast(resetApplied ? "其他标签页已重置，已恢复默认内容" : "已恢复默认内容，但本地清理失败");
        return;
      }
      if (event.key !== STORAGE_KEY || pendingExternalReset) return;
      if (event.newValue == null && valuesEqual(storedDataSnapshot, normalizeDataShape(defaultData()))) return;

      const remote = parseStoredDataSafely(event.newValue);
      if (!remote) {
        toast("其他标签页的数据格式无效，已忽略");
        return;
      }
      pendingExternalData = remote;
      if (isEditingMode) {
        if (!commitPendingEdits({ immediate: false, allowInvalidDrafts: true })) {
          toast("其他标签页同步失败，当前草稿仍保留");
          return;
        }
        const localStructure = JSON.stringify(structureSignature(data));
        const remoteStructure = JSON.stringify(structureSignature(remote));
        if (hasEditableDrafts() && localStructure !== remoteStructure) {
          pendingExternalRender = true;
          toast("其他标签页结构已更新，完成当前草稿后同步");
          return;
        }
        if (!flushPersist()) {
          toast("其他标签页同步失败，当前修改仍保留");
          return;
        }
        toast("已合并其他标签页修改");
        return;
      }
      if (!flushPersist()) {
        toast("其他标签页同步失败");
        return;
      }
      toast("已同步其他标签页修改");
    });

    document.addEventListener("click", (event) => {
      if (!isEditingMode) return;
      const anchor = event.target.closest?.("a");
      if (!anchor || anchor.hasAttribute("data-edit-path")) return;
      if (isExternalHref(anchor.getAttribute("href"))) {
        event.preventDefault();
        toast("编辑模式下已禁用外链跳转");
      }
    });

    document.addEventListener("keydown", (event) => {
      const composing = event.isComposing || event.keyCode === 229 || (composingNode && composingNode.isConnected);
      if (composing) return;

      const editable = editableFromTarget(event.target);
      const commandKey = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (isEditingMode && !editable && commandKey && !event.altKey) {
        const wantsUndo = key === "z" && !event.shiftKey;
        const wantsRedo = key === "y" || (key === "z" && event.shiftKey);
        if (wantsUndo || wantsRedo) {
          event.preventDefault();
          if (wantsUndo) restoreStructureHistory(undoStack, redoStack, "已撤销结构操作");
          else restoreStructureHistory(redoStack, undoStack, "已重做结构操作");
          return;
        }
      }
      if (editable && event.key === "Enter" && (event.ctrlKey || event.metaKey || !isMultilinePath(editable.getAttribute("data-edit-path")))) {
        event.preventDefault();
        if (commitEditableNode(editable, { immediate: true })) editable.blur();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && isEditingMode) {
        event.preventDefault();
        if (commitPendingEdits({ immediate: true })) toast("已保存");
        return;
      }

      if (event.key === "Escape" && isEditingMode) {
        event.preventDefault();
        toggleEditing(false);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e" && !editable) {
        event.preventDefault();
        toggleEditing(!isEditingMode);
      }
    });
  }
  function initCyberFX() {
    initLocalClock();
    initHudTelemetry();

    // glitch bursts
    const display = $("#heroDisplay");
    if (display) {
      const burst = () => {
        if (isEditingMode) return;
        display.classList.add("is-glitching");
        display.setAttribute("data-text", display.textContent.trim());
        setTimeout(() => display.classList.remove("is-glitching"), 480);
      };
      setTimeout(burst, 900);
      setInterval(burst, 5500);
      display.addEventListener("mouseenter", burst);
    }

    initParticles();
  }

  /**
   * Device-local clock: one timeout aligned to the next second boundary.
   * Avoids fixed setInterval drift / wasted mid-second work.
   * Uses Intl → respects user locale + timezone automatically.
   */
  function initLocalClock() {
    const clockEl = $("#hudClock");
    const dateEl = $("#hudDate");
    const tzEl = $("#hudTz");
    if (!clockEl && !dateEl && !tzEl) return;

    let timer = 0;

    const timeFmt = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const dateFmt = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "2-digit",
    });

    function formatOffset(date) {
      // getTimezoneOffset: minutes behind UTC (e.g. UTC+8 → -480)
      const mins = -date.getTimezoneOffset();
      const sign = mins >= 0 ? "+" : "-";
      const abs = Math.abs(mins);
      const hh = String(Math.floor(abs / 60)).padStart(2, "0");
      const mm = String(abs % 60).padStart(2, "0");
      return `UTC${sign}${hh}:${mm}`;
    }

    function tick() {
      const now = new Date();
      if (clockEl) clockEl.textContent = timeFmt.format(now);
      if (dateEl) dateEl.textContent = dateFmt.format(now).toUpperCase();
      if (tzEl) tzEl.textContent = formatOffset(now);

      // fire again exactly at next whole second (+2ms safety)
      const delay = 1000 - (now.getTime() % 1000) + 2;
      timer = window.setTimeout(tick, delay);
    }

    tick();
    window.addEventListener("beforeunload", () => clearTimeout(timer));
  }

  function initHudTelemetry() {
    const scrollEl = $("#hudScroll");
    const signalEl = $("#hudSignal");
    if (!scrollEl && !signalEl) return;

    const bars = ["▯▯▯▯▯", "▮▯▯▯▯", "▮▮▯▯▯", "▮▮▮▯▯", "▮▮▮▮▯", "▮▮▮▮▮"];

    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 0;
      if (scrollEl) scrollEl.textContent = `SCR ${pct}%`;
      if (signalEl) {
        const idx = Math.min(5, Math.floor(pct / 20));
        signalEl.textContent = `SIG ${bars[idx]}`;
      }
    };

    // rAF throttle — at most once per frame while scrolling
    let locked = false;
    window.addEventListener(
      "scroll",
      () => {
        if (locked) return;
        locked = true;
        requestAnimationFrame(() => {
          update();
          locked = false;
        });
      },
      { passive: true }
    );
    update();
  }

  /**
   * Lightweight particle field:
   * - fewer dots, capped DPR, ~30fps
   * - chain links only to next 2 neighbors (O(n), not O(n²))
   * - pauses when tab hidden
   */
  function initParticles() {
    const canvas = $("#particleCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let last = 0;
    const dots = [];
    const COUNT = Math.min(28, Math.floor(window.innerWidth / 50));
    const FPS_MS = 1000 / 30;
    let W = 0;
    let H = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      dots.length = 0;
      const n = Math.min(28, Math.floor(W / 50));
      for (let i = 0; i < n; i++) {
        dots.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 1.2 + Math.random() * 1.6,
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          a: 0.28 + Math.random() * 0.35,
        });
      }
    }

    function frame(ts) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (ts - last < FPS_MS) return;
      last = ts;

      const rgb = "180, 255, 0";
      ctx.clearRect(0, 0, W, H);

      // points
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > W) d.vx *= -1;
        if (d.y < 0 || d.y > H) d.vy *= -1;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb},${d.a})`;
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // sparse links: only i → i+1, i+2  (linear cost)
      ctx.lineWidth = 1;
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i];
        for (let k = 1; k <= 2; k++) {
          const b = dots[(i + k) % dots.length];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > 16000) continue; // ~126px
          const alpha = 0.14 * (1 - dist2 / 16000);
          ctx.strokeStyle = `rgba(${rgb},${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    function start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        seed();
      }, 150);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });

    resize();
    seed();
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function boot() {
    initTheme();
    renderAll({ preserveScroll: false });
    initChrome();
    initEditor();
    initCyberFX();
    if (startupNotice) {
      toast(startupNotice);
      startupNotice = "";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
