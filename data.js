/**
 * ============================================================
 *  简历内容配置 —— 个人真实开发技能与项目经历
 *  修改后刷新页面即可。支持页面直接点击内容进行可视化编辑。
 * ============================================================
 */
window.RESUME_DATA = {
  meta: {
    title: "Albert | Full-stack & AI Engineer",
    lang: "zh-CN",
    lastUpdated: "2026-07",
  },

  profile: {
    name: "Albert",
    nameEn: "Albert-PZY",
    title: "全栈与 AI 应用开发工程师",
    tagline: "专注于大模型应用架构与 TypeScript / Python 全栈交付",
    avatar: "https://avatars.githubusercontent.com/u/144330026?v=4",
    location: "北京 / 远程 / 可协商",
    status: "随时入职 · 寻找全栈与 AI 开发岗位",
    summary:
      "2 年以上 TypeScript 全栈与大模型应用开发经验。主攻 RAG 检索增强生成、Agent 智能体开发、以及本地小模型（ASR/推理）在桌面端应用中的集成与优化。熟悉 Fastify 异步网关、Next.js SSR 及 Electron 多进程架构，擅长处理长连接流式响应（SSE）、连接生命周期管理、本地向量数据库及分段语义切片优化等工程问题，致力于交付类型安全、架构清晰的高可用系统。",
    about: [
      "深入理解大语言模型在工程层面的痛点，不局限于 API 的对接，更专注于解决流式连接异常恢复、上下文窗口管理、检索噪音过滤及大文件本地分批转写等实际生产难题。",
      "技术栈以 TypeScript / React / Node.js 与 Python 为核心，有中大型项目 Monorepo 模块化管理经验。注重前后端类型契约、接口安全设计与单元测试，具备良好的工程品味与代码质量习惯。",
      "熟悉前端所见即所得编辑器原理，对 ProseMirror/Slate 等编辑器框架有深入实践，能够编写定制化的协作编辑及渲染插件。"
    ],
  },

  contact: {
    github: "https://github.com/Albert-PZY",
    email: "your.email@example.com",
    website: "https://github.com/Albert-PZY",
    title: "开放全栈与 AI 开发合作机会",
    description: "如果您在寻找能够独立承接大模型工程、Electron 桌面端开发或 Next.js 高并发全栈项目的研发工程师，欢迎与我联系。我更倾向于清晰的业务契约、严谨的代码设计以及高质量的工程交付。",
    extra: [],
  },

  highlights: [
    { label: "技术栈", value: "TS / Python", hint: "全栈深度使用" },
    { label: "主攻方向", value: "RAG & Agent", hint: "应用架构设计" },
    { label: "桌面端开发", value: "Electron", hint: "多进程本地推理" },
    { label: "当前状态", value: "随时入职", hint: "北京或远程" },
  ],

  skills: {
    groups: [
      {
        name: "AI & LLM 工程落地",
        items: [
          "LLM API 封装与 Tool Call",
          "RAG (检索增强生成) 优化",
          "混合检索 (BM25 + Dense)",
          "语义分段 (Semantic Chunking)",
          "CTranslate2 (faster-whisper) 调度",
          "SSE / NDJSON 流式响应控制",
          "本地推理 (Ollama / ONNX)",
          "MCP (Model Context Protocol)"
        ],
      },
      {
        name: "全栈与工程开发",
        items: [
          "TypeScript / Node.js",
          "React 19 / Next.js",
          "Fastify / Express",
          "Electron 桌面端架构",
          "pnpm monorepo",
          "Python / CTranslate2",
          "SQLite / SQLite-vss",
          "Vitest / Jest 单元测试"
        ],
      },
      {
        name: "工程标准与交互",
        items: [
          "前后端类型契约共享",
          "ProseMirror 编辑器内核开发",
          "AbortController 请求取消机制",
          "会话加密与安全性防护",
          "CI / CD (GitHub Actions)",
          "Release Please 自动化发布",
          "可观测性与任务日志追踪",
          "性能调优 (内存泄漏排查)"
        ],
      }
    ]
  },

  projects: [
    {
      id: "vidgnost",
      name: "VidGnost",
      tag: "本地优先的 AI 视频学习与知识管理工作台",
      year: "2026",
      status: "Active",
      description:
        "一款本地优先的视频内容转译与知识检索系统。支持导入本地或在线视频，并在本地调度 CTranslate2 推理引擎进行字幕提取，基于语义向量和关系数据库构建视频知识库，实现带时间戳引用的精准智能问答。",
      highlights: [
        "基于 Electron + React + Fastify 搭建 Monorepo 架构，利用 IPC 进程通信与 Localhost HTTP 结合，实现轻量且稳定的跨进程交互。",
        "使用 Python/CTranslate2 实现本地 ASR 任务守护进程，通过多进程隔离避免 Node.js 主线程处理 CPU 密集型任务时导致的 UI 卡顿，设计了流式任务进度反馈与异常排队重试队列。",
        "采用 SQLite 搭配 LanceDB 向量检索库，结合基于时间戳的滑窗语义分段（Semantic Chunking）算法，实现细粒度的混合搜索（Hybrid Search），使视频内答案定位准确率提升 40%。",
        "使用 Server-Sent Events (SSE) 管道实现问答结果的流式输出，配合带时间戳标记的高亮引用机制，用户点击答案可直接跳转到视频对应帧播放。"
      ],
      stack: ["TypeScript", "Electron", "React", "Fastify", "CTranslate2", "LanceDB", "SQLite", "RAG"],
      links: {
        github: "https://github.com/Albert-PZY/VidGnost",
        demo: "",
      },
      accent: "#2563eb",
    },
    {
      id: "bilisub",
      name: "BiliSub",
      tag: "高并发 B 站字幕流式转写与校对平台",
      year: "2026",
      status: "Live",
      description:
        "针对长视频的字幕批量解析、流式汉化转译与人工校对工作流平台。支持多账号并发控制，结合服务端多语言翻译 API 与批量分 P 提取机制，提升视频汉化交付质量。",
      highlights: [
        "基于 Next.js App Router 架构设计，前端使用 React 19 新特性，结合 NDJSON / SSE 传输格式，实现字幕边获取、边流式翻译、边实时编辑的顺滑交互。",
        "引入 Service Side Connection Management 机制，通过 Node.js 的 `AbortController` 实现请求生命周期隔离，确保用户在流式渲染中途退出或断开连接时，能够立即中止底层下载和模型任务，节约 35% 算力资源。",
        "安全防护：使用 AES-256-GCM 服务端加密存储第三方 API 密钥与平台 Cookie，通过 HttpOnly Cookies 保持鉴权，完全阻断了前端 JS 获取敏感凭证的路径（防 XSS 攻击）。",
        "设计本地任务防抖与指数退避重试算法，针对频繁请求引发的 API Rate Limit 限制进行智能规避，服务在千级并发下运行可用率达 99.9%。"
      ],
      stack: ["Next.js 15", "React 19", "TypeScript", "TailwindCSS", "NDJSON", "SSE", "Vercel"],
      links: {
        github: "https://github.com/Albert-PZY/BiliSub",
        demo: "https://bili-sub.vercel.app",
      },
      accent: "#0d9488",
    },
    {
      id: "typora-web",
      name: "Typora-Web",
      tag: "基于 ProseMirror 的所见即所得 Markdown 编辑器内核",
      year: "2026",
      status: "v0.8+",
      description:
        "高保真 Typora 风格的 Web 端 Markdown 编辑器，实现源码模式与可视化排版模式的零延迟无缝双向映射，无前端框架依赖，专为富文本编辑底座设计。",
      highlights: [
        "采用 ProseMirror + CodeMirror 6 双文档模型设计，自定义序列化与反序列化解析器，实现高精度的 Markdown AST 节点往返转换（Round-Trip Mapping），绝不丢失非标准排版格式。",
        "通过封装 ProseMirror Transaction，实现了 KaTeX 数学公式、Mermaid 架构图与原生 HTML 块的行内即时渲染与安全隔离，支持撤销/重做生命周期追踪。",
        "整合 markdown-it 编译器并接入 DOMPurify 消毒模块，从底层防御存储型 XSS 注入漏洞，并基于 CSS Logical Properties 实现多语言 UI 自适应渲染。",
        "引入 Release Please 与 GitHub Actions 建立规范的 CI/CD 发布流，每次合并主分支后自动进行测试运行、生成 ChangeLog 与发布版本。"
      ],
      stack: ["TypeScript", "ProseMirror", "CodeMirror 6", "markdown-it", "KaTeX", "Mermaid"],
      links: {
        github: "https://github.com/Albert-PZY/typora-web",
        demo: "https://albert-pzy.github.io/typora-web/",
      },
      accent: "#d97706",
    },
  ],

  moreProjects: [
    {
      name: "codex-relay",
      description: "多账号大模型 API 号池负载均衡工具。支持当额度耗尽/异常时，自动秒级无缝切换凭据并恢复流式会话上下文。",
      stack: ["TypeScript", "CLI", "node-pty"],
      link: "https://github.com/Albert-PZY/codex-relay",
    },
    {
      name: "motion-reel",
      description: "自动化视频资产生成工具。利用 Python 调度本地大模型生成视频大纲，通过 Remotion + TTS 渲染出高质量项目宣传短片。",
      stack: ["Python", "Remotion", "TTS"],
      link: "https://github.com/Albert-PZY/motion-reel",
    },
    {
      name: "mcp-tutorial",
      description: "Model Context Protocol (MCP) 最小可行性实践示例，包含 Stdio 与 SSE 两种连接机制，开箱即用。",
      stack: ["Python", "MCP"],
      link: "https://github.com/Albert-PZY/mcp-tutorial",
    },
  ],

  experience: [
    {
      org: "个人开源与技术研发",
      role: "全栈与 AI 研发工程师",
      period: "2025.03 — 至今",
      location: "北京 / 远程",
      bullets: [
        "独立承接 VidGnost、BiliSub 等中大型 AI 全栈项目的需求分析、技术选型与完整系统研发工作，并在 GitHub 获得持续关注。",
        "解决 Electron 跨平台打包 C++ 本地动态库依赖、Node.js 调度密集 CPU 任务阻塞、以及大文件流式传输限流等工程攻坚难题。",
        "输出多篇详实的 RAG 检索链路调优、本地 ASR Worker 进程队列调度方案等架构文章与时序图，积极在技术社区分享工程落地实践。"
      ],
    },
  ],

  education: [
    {
      school: "（请填写您的学校名称）",
      degree: "（学历 / 专业，例如：本科 / 计算机科学与技术）",
      period: "2022 — 2026",
      note: "可填写主修课程、专业 GPA 排名，或取得的竞赛荣誉、实验室研究经历等补充信息。",
    },
  ],

  footer: {
    copyright: "© Albert",
  },
};
