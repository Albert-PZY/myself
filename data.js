/**
 * ============================================================
 *  简历内容配置 —— 个人真实开发技能与项目经历
 *  修改后刷新页面即可。支持页面直接点击内容进行可视化编辑。
 * ============================================================
 */
window.RESUME_DATA = {
  "meta": {
    "title": "Albert | Full-stack & AI Engineer",
    "lang": "zh-CN",
    "lastUpdated": "2026-07"
  },
  "profile": {
    "name": "Albert",
    "nameEn": "Albert-PZY",
    "title": "全栈与 AI 应用开发工程师",
    "tagline": "AI 工程师 / LLM Agent 全栈开发工程师",
    "avatar": "https://avatars.githubusercontent.com/u/144330026?v=4",
    "location": "广东 / 远程 / 可协商",
    "status": "随时入职 · 寻找 AI Agent 全栈开发岗位",
    "summary": "具备 AI 应用全栈与 LLM Agent 工程实践能力，熟练使用 Codex、Claude Code、Cursor 等 AI 编程工具，并掌握 Vibe Coding 智能生成式开发范式，能够基于自然语言意图快速完成项目的工程化落地，高质量完成从需求拆解至代码交付的全流程协同开发与效率提升。深耕后端架构、异步并发、状态治理与评估落地，沉淀可复用的工程化方案，持续关注系统可用性、性能优化与工程可追溯性。",
    "about": [
      "学习驱动力强，做事细致，能快速拆解复杂任务并高效推进。",
      "具备良好的团队协作能力，竞赛中多次担任队长，与成员共同推进项目分工与进度。",
      "积极关注 AI 领域动态，拥有强烈的探索求知欲，且具备较强的自学能力与实践动手能力。"
    ]
  },
  "contact": {
    "github": "https://github.com/Albert-PZY",
    "email": "1431686413@qq.com",
    "website": "https://github.com/Albert-PZY",
    "title": "寻求AI 开发合作机会",
    "description": "如果您在寻找能够独立承接大模型应用工程、Agent 应用开发、高效业务自动化工作流的研发工程师，欢迎与我联系。我更倾向于清晰的业务契约、严谨的代码设计以及高质量的工程交付。",
    "extra": []
  },
  "highlights": [
    {
      "label": "技术栈",
      "value": "Python / TS",
      "hint": "全栈深度使用"
    },
    {
      "label": "主攻方向",
      "value": "Agent & RAG",
      "hint": "应用架构设计"
    },
    {
      "label": "桌面端开发",
      "value": "Electron",
      "hint": "多进程本地推理"
    },
    {
      "label": "当前状态",
      "value": "随时入职",
      "hint": "现居广东"
    }
  ],
  "skills": {
    "groups": [
      {
        "name": "编程语言",
        "items": [
          "Python",
          "Java",
          "JavaScript",
          "TS"
        ]
      },
      {
        "name": "后端与架构",
        "items": [
          "FastAPI",
          "Asyncio",
          "WebSocket",
          "RESTful API"
        ]
      },
      {
        "name": "AI 与大模型",
        "items": [
          "RAG",
          "LLM Agent",
          "LangChain",
          "LangGraph",
          "Spring AI",
          "Prompt Engineering",
          "AI Coding"
        ]
      },
      {
        "name": "数据与存储",
        "items": [
          "MySQL",
          "PostgreSQL",
          "Redis"
        ]
      },
      {
        "name": "前端与运维",
        "items": [
          "Vue.js",
          "HTML/CSS",
          "Docker",
          "Linux",
          "Nginx",
          "RabbitMQ",
          "K8s"
        ]
      }
    ]
  },
  "projects": [
    {
      "id": "vidgnost",
      "name": "VidGnost",
      "tag": "本地优先的 AI 视频学习与知识管理工作台",
      "year": "2026",
      "status": "Active",
      "description": "一款本地优先的视频内容转译与知识检索系统。支持导入本地或在线视频，并在本地调度 CTranslate2 推理引擎进行字幕提取，基于语义向量和关系数据库构建视频知识库，实现带时间戳引用的精准智能问答。",
      "highlights": [
        "基于 Electron + React + Fastify 搭建 Monorepo 架构，利用 IPC 进程通信与 Localhost HTTP 结合，实现轻量且稳定的跨进程交互。",
        "使用 Python/CTranslate2 实现本地 ASR 任务守护进程，通过多进程隔离避免 Node.js 主线程处理 CPU 密集型任务时导致的 UI 卡顿，设计了流式任务进度反馈与异常排队重试队列。",
        "采用 SQLite 搭配 LanceDB 向量检索库，结合基于时间戳的滑窗语义分段（Semantic Chunking）算法，实现细粒度的混合搜索（Hybrid Search），使视频内答案定位准确率提升 40%。",
        "使用 Server-Sent Events (SSE) 管道实现问答结果的流式输出，配合带时间戳标记的高亮引用机制，用户点击答案可直接跳转到视频对应帧播放。"
      ],
      "stack": [
        "TypeScript",
        "Electron",
        "React",
        "Fastify",
        "CTranslate2",
        "LanceDB",
        "SQLite",
        "RAG"
      ],
      "links": {
        "github": "https://github.com/Albert-PZY/VidGnost",
        "demo": ""
      },
      "accent": "#2563eb"
    },
    {
      "id": "bilisub",
      "name": "BiliSub",
      "tag": "高并发 B 站字幕流式转写与校对平台",
      "year": "2026",
      "status": "Live",
      "description": "针对长视频的字幕批量解析、流式汉化转译与人工校对工作流平台。支持多账号并发控制，结合服务端多语言翻译 API 与批量分 P 提取机制，提升视频汉化交付质量。",
      "highlights": [
        "基于 Next.js App Router 架构设计，前端使用 React 19 新特性，结合 NDJSON / SSE 传输格式，实现字幕边获取、边流式翻译、边实时编辑的顺滑交互。",
        "引入 Service Side Connection Management 机制，通过 Node.js 的 `AbortController` 实现请求生命周期隔离，确保用户在流式渲染中途退出或断开连接时，能够立即中止底层下载和模型任务，节约 35% 算力资源。",
        "安全防护：使用 AES-256-GCM 服务端加密存储第三方 API 密钥与平台 Cookie，通过 HttpOnly Cookies 保持鉴权，完全阻断了前端 JS 获取敏感凭证的路径（防 XSS 攻击）。",
        "设计本地任务防抖与指数退避重试算法，针对频繁请求引发的 API Rate Limit 限制进行智能规避，服务在千级并发下运行可用率达 99.9%。"
      ],
      "stack": [
        "Next.js 15",
        "React 19",
        "TypeScript",
        "TailwindCSS",
        "NDJSON",
        "SSE",
        "Vercel"
      ],
      "links": {
        "github": "https://github.com/Albert-PZY/BiliSub",
        "demo": "https://bili-sub.vercel.app"
      },
      "accent": "#0d9488"
    },
    {
      "id": "typora-web",
      "name": "Typora-Web",
      "tag": "基于 ProseMirror 的所见即所得 Markdown 编辑器内核",
      "year": "2026",
      "status": "v0.8+",
      "description": "高保真 Typora 风格的 Web 端 Markdown 编辑器，实现源码模式与可视化排版模式的零延迟无缝双向映射，无前端框架依赖，专为富文本编辑底座设计。",
      "highlights": [
        "采用 ProseMirror + CodeMirror 6 双文档模型设计，自定义序列化与反序列化解析器，实现高精度的 Markdown AST 节点往返转换（Round-Trip Mapping），绝不丢失非标准排版格式。",
        "通过封装 ProseMirror Transaction，实现了 KaTeX 数学公式、Mermaid 架构图与原生 HTML 块的行内即时渲染与安全隔离，支持撤销/重做生命周期追踪。",
        "整合 markdown-it 编译器并接入 DOMPurify 消毒模块，从底层防御存储型 XSS 注入漏洞，并基于 CSS Logical Properties 实现多语言 UI 自适应渲染。",
        "引入 Release Please 与 GitHub Actions 建立规范的 CI/CD 发布流，每次合并主分支后自动进行测试运行、生成 ChangeLog 与发布版本。"
      ],
      "stack": [
        "TypeScript",
        "ProseMirror",
        "CodeMirror 6",
        "markdown-it",
        "KaTeX",
        "Mermaid"
      ],
      "links": {
        "github": "https://github.com/Albert-PZY/typora-web",
        "demo": "https://albert-pzy.github.io/typora-web/"
      },
      "accent": "#d97706"
    }
  ],
  "moreProjects": [
    {
      "name": "codex-relay",
      "description": "多账号大模型 API 号池负载均衡工具。支持当额度耗尽/异常时，自动秒级无缝切换凭据并恢复流式会话上下文。",
      "stack": [
        "TypeScript",
        "CLI",
        "node-pty"
      ],
      "link": "https://github.com/Albert-PZY/codex-relay"
    },
    {
      "name": "motion-reel",
      "description": "自动化视频资产生成工具。利用 Python 调度本地大模型生成视频大纲，通过 Remotion + TTS 渲染出高质量项目宣传短片。",
      "stack": [
        "Python",
        "Remotion",
        "TTS"
      ],
      "link": "https://github.com/Albert-PZY/motion-reel"
    },
    {
      "name": "mcp-tutorial",
      "description": "Model Context Protocol (MCP) 最小可行性实践示例，包含 Stdio 与 SSE 两种连接机制，开箱即用。",
      "stack": [
        "Python",
        "MCP"
      ],
      "link": "https://github.com/Albert-PZY/mcp-tutorial"
    }
  ],
  "experience": [
    {
      "org": "SAT 智能 AI 辅导系统",
      "role": "全栈开发",
      "period": "2025.11 - 2026.02",
      "location": "Python、Redis、MySQL、Vue.js | Novara AI 初创项目",
      "bullets": [
        "通过 FastAPI + Asyncio 重写核心执行链路中原有的同步阻塞流程与低效文件交互，使系统并发承载能力提升 50 倍以上、接口响应延迟降低 90% 以上，缓解高峰请求下的排队拥塞问题",
        "通过会话 ID、独立工作目录与会话级异步锁实现会话隔离机制，稳定解决多用户并发下上下文串扰与覆盖写入问题，避免任务结果互相污染。",
        "建设会话网关统一处理会话创建/销毁、鉴权、CDP/noVNC 代理、WebSocket 转发与空闲回收，解决远程浏览器任务生命周期管理分散导致的稳定性问题。",
        "围绕“长会话状态易漂移、恢复成本高”的痛点，设计 Redis 热状态 + MySQL 持久化的状态治理方案，提升任务中断后的恢复能力与链路连续性。",
        "搭建事件日志 + SSE 实时推送的可观测链路，支持任务回放、审计追踪与异常定位排障，缩短问题发现与定位路径。"
      ]
    },
    {
      "org": "校园智能 RAG 信息检索系统",
      "role": "全栈开发",
      "period": "2025.07 - 2025.09",
      "location": "Python、ChromaDB、Streamlit、React | 校内已落地项目",
      "bullets": [
        "针对“校园信息分散、单路召回命中不足”的痛点，采用 BM25 稀疏检索 + Dense 语义检索双路召回，通过 RRF 融合与多策略可选重排机制，使离线样例集 Hit Rate@10 从 0.72 提升至 0.84。",
        "建设端到端 Ingestion Pipeline，并基于 SHA256 + SQLite 实现增量摄取与幂等更新，重复摄取场景平均任务耗时下降约 41%，重复文档跳过率约 58%，减少无效计算。",
        "针对 Dense/Sparse 与 Rerank 后端不稳定问题设计可回退降级路径，保障单路异常时查询链路仍可连续服务。",
        "围绕查询解析、召回、融合、重排记录结构化追踪信息与中间结果，并通过 Streamlit Dashboard 与离线评估脚本 + 基准问答集持续优化检索效果。",
        "面向“检索能力难复用”的问题，基于 MCP 协议沉淀知识检索、集合管理与文档摘要能力，便于外部系统标准化接入与复用。"
      ]
    }
  ],
  "education": [
    {
      "school": "Shaoguan University",
      "degree": "本科 / 软件工程",
      "period": "2023 — 2027",
      "note": "校级计算机类工作室后端部长、校园网站开发维护参与者，荣获“科技创新先进个人”荣誉。竞赛经历：传智杯 Web 网页开发挑战赛国二、泰迪杯数据挖掘挑战赛国三、GPLT 团体程序设计天梯赛省三等。英语水平：CET6；普通话水平：二甲。"
    }
  ],
  "footer": {
    "copyright": "© Albert · Built with HTML5 & TypeScript",
    "note": "本页内容支持直接在页面可视化修改。点击右下角“编辑内容”开启，修改完毕后可导出更新后的 JSON 数据覆盖 data.js 进行永久保存。"
  }
};
