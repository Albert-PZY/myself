/* =========================================================
   Albert Resume — neo-brutal render + in-place editing
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "albert-resume-data-v1";
  const THEME_KEY = "albert-resume-theme";

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

  let data = loadData();
  let isEditingMode = false;

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function loadData() {
    // Public deploy: never merge visitor localStorage over the published resume.
    if (!EDIT_ENABLED) return deepClone(window.RESUME_DATA);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return mergeDeep(deepClone(window.RESUME_DATA), JSON.parse(raw));
    } catch (_) {}
    return deepClone(window.RESUME_DATA);
  }

  function mergeDeep(base, over) {
    if (!over || typeof over !== "object") return base;
    for (const k of Object.keys(over)) {
      if (
        over[k] &&
        typeof over[k] === "object" &&
        !Array.isArray(over[k]) &&
        base[k] &&
        typeof base[k] === "object" &&
        !Array.isArray(base[k])
      ) {
        mergeDeep(base[k], over[k]);
      } else {
        base[k] = over[k];
      }
    }
    return base;
  }

  function persist(next) {
    data = next;
    if (!EDIT_ENABLED) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    // bold default: dark acid
    setTheme(saved || "dark");
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#16171a" : "#ffffff";
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
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const isIdx = /^\d+$/.test(parts[i + 1]);
      if (cur[part] == null) cur[part] = isIdx ? [] : {};
      cur = cur[part];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function getByPath(obj, path) {
    return path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);
  }

  function textOfEditable(node) {
    if (node.querySelector(".tag-del-btn, .list-del-btn")) {
      return [...node.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join("")
        .trim();
    }
    return node.textContent.trim();
  }

  function bindEditableElements() {
    document.querySelectorAll("[data-edit-path]").forEach((node) => {
      const path = node.getAttribute("data-edit-path");
      const val = getByPath(data, path);
      if (val !== undefined && val !== null) {
        if (!node.querySelector(".tag-del-btn, .list-del-btn")) {
          node.textContent = val;
        } else {
          const del = node.querySelector(".tag-del-btn, .list-del-btn");
          [...node.childNodes].forEach((n) => {
            if (n.nodeType === Node.TEXT_NODE) n.remove();
          });
          node.insertBefore(document.createTextNode(String(val)), del || null);
        }
      }

      if (isEditingMode) {
        node.setAttribute("contenteditable", "true");
        node.classList.add("editable-active");
      } else {
        node.removeAttribute("contenteditable");
        node.classList.remove("editable-active");
      }
    });

    document.querySelectorAll("a").forEach((a) => {
      if (isEditingMode && a.getAttribute("href")?.startsWith("http")) {
        a.onclick = (e) => {
          e.preventDefault();
          const path = a.getAttribute("data-edit-path");
          if (!path) return;
          const newUrl = prompt("编辑链接地址:", a.href);
          if (newUrl !== null) {
            setByPath(data, path, newUrl.trim());
            persist(data);
            a.href = newUrl.trim();
            toast("链接已保存");
          }
        };
      } else {
        a.onclick = null;
      }
    });

    const avatar = $("#avatarImg");
    if (avatar && data.profile?.avatar) {
      avatar.src = data.profile.avatar;
      avatar.alt = data.profile.name || "Albert";
    }
    const gh = $("#githubCta");
    if (gh && data.contact?.github) gh.href = data.contact.github;
    document.title = data.meta?.title || `${data.profile?.name || "Albert"} · Resume`;

    const heroDisplay = $("#heroDisplay");
    if (heroDisplay && data.profile?.name) {
      heroDisplay.setAttribute("data-text", data.profile.name);
    }
  }

  function saveEditableNode(target) {
    if (!target?.hasAttribute?.("data-edit-path")) return false;
    const path = target.getAttribute("data-edit-path");
    const value = textOfEditable(target);
    setByPath(data, path, value);
    if (path === "profile.name") {
      document.querySelectorAll('[data-edit-path="profile.name"]').forEach((n) => {
        if (n !== target) n.textContent = value;
        if (n.hasAttribute("data-text")) n.setAttribute("data-text", value);
      });
    }
    return true;
  }

  /** Flush focused + all contenteditable fields before leaving edit mode */
  function commitPendingEdits() {
    const active = document.activeElement;
    if (active && active !== document.body) {
      if (active.hasAttribute?.("data-edit-path")) saveEditableNode(active);
      // force blur so any pending IME composition ends
      if (typeof active.blur === "function") active.blur();
    }
    document.querySelectorAll("[data-edit-path][contenteditable='true']").forEach((node) => {
      saveEditableNode(node);
    });
    persist(data);
  }

  document.addEventListener("focusout", (e) => {
    const target = e.target;
    if (!target?.hasAttribute?.("data-edit-path")) return;
    if (saveEditableNode(target)) persist(data);
  });

  function renderArrayControls(index, arrayRef) {
    if (!isEditingMode) return null;
    return el("div", { class: "edit-item-controls" }, [
      el(
        "button",
        {
          class: "btn-edit-ctrl btn-edit-del",
          type: "button",
          title: "删除",
          onClick: () => {
            arrayRef.splice(index, 1);
            persist(data);
            renderAll({ preserveScroll: true });
            toast("已删除");
          },
        },
        "×"
      ),
    ]);
  }

  function renderAddButton(arrayRef, factory) {
    if (!isEditingMode) return null;
    return el("div", { class: "edit-add-container" }, [
      el(
        "button",
        {
          class: "btn btn--sm btn--ghost btn-edit-add",
          type: "button",
          onClick: () => {
            arrayRef.push(factory());
            persist(data);
            renderAll();
            toast("已添加，直接改文字即可");
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
    (data.highlights || []).forEach((h, i) => {
      root.appendChild(
        el("div", { class: "stat edit-relative reveal" }, [
          el("strong", { "data-edit-path": `highlights.${i}.value`, text: h.value }),
          el("span", { "data-edit-path": `highlights.${i}.label`, text: h.label }),
          el("span", {
            class: "stat-hint",
            "data-edit-path": `highlights.${i}.hint`,
            text: h.hint || "",
          }),
          renderArrayControls(i, data.highlights),
        ])
      );
    });
    const add = renderAddButton(data.highlights, () => ({
      label: "新标签",
      value: "—",
      hint: "说明",
    }));
    if (add) root.appendChild(add);
  }

  function renderAbout() {
    const root = $("#aboutCopy");
    if (!root) return;
    root.innerHTML = "";
    (data.profile.about || []).forEach((p, i) => {
      root.appendChild(
        el("div", { class: "about-para-wrap edit-relative reveal" }, [
          el("p", { "data-edit-path": `profile.about.${i}`, text: p }),
          renderArrayControls(i, data.profile.about),
        ])
      );
    });
    const add = renderAddButton(data.profile.about, () => "新的一段介绍。");
    if (add) root.appendChild(add);
  }

  function renderSkills() {
    const root = $("#skillGroups");
    if (!root) return;
    root.innerHTML = "";

    (data.skills?.groups || []).forEach((g, gIdx) => {
      const tags = el("div", { class: "tags" });
      (g.items || []).forEach((t, tIdx) => {
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
                onClick: (e) => {
                  e.stopPropagation();
                  g.items.splice(tIdx, 1);
                  persist(data);
                  renderAll();
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
            text: "+",
            onClick: () => {
              g.items.push("新技能");
              persist(data);
              renderAll();
            },
          })
        );
      }

      root.appendChild(
        el("div", { class: "skill-group edit-relative reveal" }, [
          el("h3", { "data-edit-path": `skills.groups.${gIdx}.name`, text: g.name }),
          tags,
          renderArrayControls(gIdx, data.skills.groups),
        ])
      );
    });

    const add = renderAddButton(data.skills.groups, () => ({
      name: "新技能组",
      items: ["技能 A", "技能 B"],
    }));
    if (add) root.appendChild(add);
  }

  function renderProjects() {
    const root = $("#projectGrid");
    if (!root) return;
    root.innerHTML = "";

    (data.projects || []).forEach((p, i) => {
      const points = el("ul", { class: "project-points" });
      (p.highlights || []).forEach((h, hIdx) => {
        const li = el("li", {
          "data-edit-path": `projects.${i}.highlights.${hIdx}`,
          text: h,
        });
        if (isEditingMode) {
          li.appendChild(
            el("span", {
              class: "list-del-btn",
              text: "×",
              onClick: () => {
                p.highlights.splice(hIdx, 1);
                persist(data);
                renderAll();
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
            text: "+ 添加亮点",
            onClick: () => {
              p.highlights.push("新的项目亮点");
              persist(data);
              renderAll();
            },
          })
        );
      }

      const tags = el("div", { class: "tags" });
      (p.stack || []).forEach((t, tIdx) => {
        const tag = el("span", {
          class: "tag edit-relative",
          "data-edit-path": `projects.${i}.stack.${tIdx}`,
          text: t,
        });
        if (isEditingMode) {
          tag.appendChild(
            el("span", {
              class: "tag-del-btn",
              text: "×",
              onClick: () => {
                p.stack.splice(tIdx, 1);
                persist(data);
                renderAll();
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
            text: "+",
            onClick: () => {
              p.stack.push("Tech");
              persist(data);
              renderAll();
            },
          })
        );
      }

      const links = el("div", { class: "project-links" });
      if (p.links?.github !== undefined) {
        links.appendChild(
          el("a", {
            class: "link-chip",
            href: p.links.github || "#",
            target: "_blank",
            rel: "noreferrer",
            "data-edit-path": `projects.${i}.links.github`,
            text: "GitHub →",
          })
        );
      }
      if (p.links?.demo || isEditingMode) {
        if (p.links?.demo || (p.links && "demo" in p.links)) {
          links.appendChild(
            el("a", {
              class: "link-chip",
              href: p.links.demo || "#",
              target: p.links.demo ? "_blank" : undefined,
              rel: "noreferrer",
              "data-edit-path": `projects.${i}.links.demo`,
              text: "Live →",
            })
          );
        }
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
          renderArrayControls(i, data.projects),
        ])
      );
    });

    const add = renderAddButton(data.projects, () => ({
      name: "新项目",
      tag: "一句话定位",
      year: "2026",
      status: "Active",
      description: "项目简介。",
      highlights: ["亮点一"],
      stack: ["TypeScript"],
      links: { github: "https://github.com", demo: "" },
    }));
    if (add) root.appendChild(add);
  }

  function renderMore() {
    const root = $("#moreGrid");
    if (!root) return;
    root.innerHTML = "";

    (data.moreProjects || []).forEach((p, i) => {
      const tags = el("div", { class: "tags" });
      (p.stack || []).forEach((t, tIdx) => {
        const tag = el("span", {
          class: "tag edit-relative",
          "data-edit-path": `moreProjects.${i}.stack.${tIdx}`,
          text: t,
        });
        if (isEditingMode) {
          tag.appendChild(
            el("span", {
              class: "tag-del-btn",
              text: "×",
              onClick: () => {
                p.stack.splice(tIdx, 1);
                persist(data);
                renderAll();
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
            text: "+",
            onClick: () => {
              p.stack.push("TS");
              persist(data);
              renderAll();
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
                href: p.link || "#",
                target: "_blank",
                rel: "noreferrer",
                "data-edit-path": `moreProjects.${i}.link`,
                text: "Link →",
              })
            : null,
          renderArrayControls(i, data.moreProjects),
        ])
      );
    });

    const add = renderAddButton(data.moreProjects, () => ({
      name: "新项目",
      description: "一句话。",
      stack: ["TS"],
      link: "https://github.com",
    }));
    if (add) root.appendChild(add);
  }

  function renderExperience() {
    const root = $("#timeline");
    if (!root) return;
    root.innerHTML = "";

    (data.experience || []).forEach((e, i) => {
      const ul = el("ul");
      (e.bullets || []).forEach((b, bIdx) => {
        const li = el("li", {
          "data-edit-path": `experience.${i}.bullets.${bIdx}`,
          text: b,
        });
        if (isEditingMode) {
          li.appendChild(
            el("span", {
              class: "list-del-btn",
              text: "×",
              onClick: () => {
                e.bullets.splice(bIdx, 1);
                persist(data);
                renderAll();
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
            text: "+ 添加",
            onClick: () => {
              e.bullets.push("新的经历描述");
              persist(data);
              renderAll();
            },
          })
        );
      }

      root.appendChild(
        el("div", { class: "tl-item edit-relative reveal" }, [
          el("div", { class: "tl-dot" }),
          el("div", { class: "tl-card" }, [
            el("div", { class: "tl-top" }, [
              el("h3", { "data-edit-path": `experience.${i}.org`, text: e.org }),
              el("div", {
                class: "tl-meta",
                "data-edit-path": `experience.${i}.period`,
                text: e.period,
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
                  text: e.role,
                }),
                el("span", {
                  class: "tl-meta",
                  "data-edit-path": `experience.${i}.location`,
                  text: e.location || "",
                }),
              ]
            ),
            ul,
          ]),
          renderArrayControls(i, data.experience),
        ])
      );
    });

    const add = renderAddButton(data.experience, () => ({
      org: "组织名称",
      role: "角色",
      period: "2025 — 2026",
      location: "远程",
      bullets: ["工作内容"],
    }));
    if (add) root.appendChild(add);
  }

  function renderEducation() {
    const root = $("#eduGrid");
    if (!root) return;
    root.innerHTML = "";

    (data.education || []).forEach((e, i) => {
      root.appendChild(
        el("article", { class: "edu-card edit-relative reveal" }, [
          el("h3", { "data-edit-path": `education.${i}.school`, text: e.school }),
          el("p", {
            class: "degree",
            "data-edit-path": `education.${i}.degree`,
            text: e.degree,
          }),
          el("div", {
            class: "period",
            "data-edit-path": `education.${i}.period`,
            text: e.period,
          }),
          e.note || isEditingMode
            ? el("p", {
                class: "note",
                "data-edit-path": `education.${i}.note`,
                text: e.note || "",
              })
            : null,
          renderArrayControls(i, data.education),
        ])
      );
    });

    const add = renderAddButton(data.education, () => ({
      school: "学校",
      degree: "学历 / 专业",
      period: "2022 — 2026",
      note: "",
    }));
    if (add) root.appendChild(add);
  }

  function renderContact() {
    const root = $("#contactLinks");
    if (!root) return;
    root.innerHTML = "";

    const items = [
      {
        label: "Email",
        value: data.contact.email,
        href: data.contact.email ? `mailto:${data.contact.email}` : "#",
        path: "contact.email",
      },
      {
        label: "GitHub",
        value: data.contact.github,
        href: data.contact.github || "#",
        path: "contact.github",
      },
      {
        label: "Website",
        value: data.contact.website,
        href: data.contact.website || "#",
        path: "contact.website",
      },
      ...(data.contact.extra || []).map((x, idx) => ({
        label: x.label,
        value: x.href,
        href: x.href,
        path: `contact.extra.${idx}.href`,
        extraIdx: idx,
      })),
    ];

    items.forEach((it) => {
      if (!it.value && !isEditingMode) return;
      const wrap = el(
        isEditingMode ? "div" : "a",
        {
          class: "contact-link edit-relative",
          ...(isEditingMode
            ? {}
            : {
                href: it.href,
                target: it.href?.startsWith("http") ? "_blank" : undefined,
                rel: it.href?.startsWith("http") ? "noreferrer" : undefined,
              }),
        },
        [
          el("div", {}, [
            el("strong", { text: it.label }),
            el("span", {
              "data-edit-path": it.path,
              text: it.value || "请填写",
            }),
          ]),
          el("span", { text: "↗", "aria-hidden": "true" }),
        ]
      );

      if (isEditingMode && it.extraIdx !== undefined) {
        wrap.appendChild(
          el("button", {
            class: "btn-edit-ctrl btn-edit-del",
            type: "button",
            text: "×",
            onClick: () => {
              data.contact.extra.splice(it.extraIdx, 1);
              persist(data);
              renderAll();
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
          text: "+ 联系方式",
          onClick: () => {
            if (!data.contact.extra) data.contact.extra = [];
            const label = prompt("标签（如 WeChat / LinkedIn）:");
            if (label) {
              data.contact.extra.push({ label, href: "https://" });
              persist(data);
              renderAll();
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

  function renderAll(options = {}) {
    // default: keep scroll (edit toggles / list edits); boot can pass false
    const shouldPreserve = options.preserveScroll !== false;
    const run = () => {
      renderHighlights();
      renderAbout();
      renderSkills();
      renderProjects();
      renderMore();
      renderExperience();
      renderEducation();
      renderContact();
      bindEditableElements();
      // re-render 时：视口内/上方内容直接显示，避免 opacity 闪一下像“跳了”
      document.querySelectorAll(".reveal").forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.top < window.innerHeight + 80) n.classList.add("is-in");
      });
      observeReveal();
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
    // Esc / 快捷键退出时不会先 blur，必须在 renderAll 前落盘
    if (!active && isEditingMode) {
      commitPendingEdits();
    }

    // fixed banner no longer pushes layout; still preserve scroll across DOM rebuild
    preserveScroll(() => {
      isEditingMode = active;
      const banner = $("#editBanner");
      const fab = $("#editOpen");
      document.body.classList.toggle("is-editing", active);
      if (banner) banner.hidden = !active;
      if (fab) {
        fab.classList.toggle("is-on", active);
        const s = fab.querySelector("span");
        if (s) s.textContent = active ? "退出" : "编辑";
      }
      renderAll({ preserveScroll: false }); // outer preserveScroll already holds position
      toast(active ? "编辑模式 ON" : "编辑模式 OFF");
    });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "resume-data.json" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("已导出 JSON");
  }

  function resetData() {
    if (!confirm("重置为 data.js 默认内容？本地修改会清除。")) return;
    localStorage.removeItem(STORAGE_KEY);
    data = deepClone(window.RESUME_DATA);
    renderAll();
    toast("已重置");
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
    $("#editOpen")?.addEventListener("click", () => toggleEditing(!isEditingMode));
    $("#exitEditBtn")?.addEventListener("click", () => toggleEditing(false));
    $("#exportBtn")?.addEventListener("click", exportJson);
    $("#resetBtn")?.addEventListener("click", resetData);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isEditingMode) {
        e.preventDefault();
        toggleEditing(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
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
        display.setAttribute("data-text", display.textContent.trim() || "Albert");
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
