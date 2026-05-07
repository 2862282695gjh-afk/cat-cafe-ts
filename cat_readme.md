# Cat Noodle TS

> Cat Noodle Project Doc — 由萨布生成

## 概述
多 Agent 对等协作框架，灵感来自动漫《赤猫拉面馆》。Agent 之间通过 @mention 自由路由、A2A 直连通信、独立任务队列并行协作。

## 技术栈
- 语言：TypeScript
- 后端框架：Fastify 5 + Socket.IO 4
- 前端框架：React 19 + Vite 6 + TailwindCSS 4
- 构建：npm workspaces + tsc
- 测试：Vitest
- CLI 提供者：Claude CLI（持久子进程）
- 持久化：JSON 文件存储（无数据库）

## 目录结构
```
cat-noodle-ts/
├── package.json                    # Monorepo 根配置
├── BACKLOG.md                      # 任务看板（按 Agent 分区）
├── README.md                       # 项目主文档
├── packages/
│   ├── core/                       # 核心类型 + AgentPool
│   │   └── src/
│   │       ├── types.ts            # Agent/消息/事件类型定义
│   │       ├── agent-pool.ts       # AgentPool — fan-out 广播引擎
│   │       └── async-queue.ts      # 异步任务队列（per-agent 串行）
│   ├── provider-claude/            # Claude CLI 进程管理
│   │   └── src/
│   │       ├── api-provider.ts     # LLM API 抽象层
│   │       ├── claude-process.ts   # 持久 CLI 子进程（stdin/stdout stream-json）
│   │       └── index.ts
│   ├── server/                     # HTTP + WebSocket 服务端
│   │   └── src/
│   │       ├── index.ts            # 启动入口（端口 3001）
│   │       ├── app.ts              # Fastify 应用配置 + 依赖注入
│   │       ├── pool.ts             # Agent 注册 + 系统提示词 + 模型配置
│   │       ├── router.ts           # @mention 路由 + A2A 通信分发
│   │       ├── session-manager.ts  # 上下文压缩（token 超限时自动摘要）
│   │       ├── memory-extractor.ts # Agent 长期记忆提取
│   │       ├── ws/handler.ts       # Socket.IO 事件处理（流式转发）
│   │       ├── routes/
│   │       │   ├── threads.ts      # REST: 对话线程 CRUD
│   │       │   ├── projects.ts     # REST: 项目 CRUD
│   │       │   └── agents.ts       # REST: Agent 列表/状态
│   │       └── store/
│   │           ├── interface.ts    # Store 接口定义
│   │           ├── json-file.ts    # JSON 文件持久化（线程 + 消息）
│   │           ├── project-store.ts# 项目元数据存储
│   │           ├── project-doc-store.ts # 项目文档（LLM Wiki，三文件分离）
│   │           ├── file-memory.ts  # Agent 长期记忆
│   │           └── session-store.ts# CLI sessionId 持久化
│   ├── ui/                         # React 前端
│   │   └── src/
│   │       ├── App.tsx             # 主应用（ThemeRouter + Thread 切换）
│   │       ├── index.css           # 全局样式（含赤猫拉面馆主题 CSS）
│   │       ├── types.ts            # 前端类型定义
│   │       ├── main.tsx            # Vite 入口
│   │       ├── api/client.ts       # REST API 客户端
│   │       ├── components/
│   │       │   ├── ChatView.tsx    # 聊天主视图（流式事件处理 + 状态缓存）
│   │       │   ├── MessageBubble.tsx # 消息气泡（Markdown 渲染）
│   │       │   ├── InputBox.tsx    # 输入框（@mention 自动补全）
│   │       │   ├── AgentPanel.tsx  # 右侧 Agent 状态面板
│   │       │   ├── ThreadList.tsx  # 左侧对话列表
│   │       │   └── MarkdownRenderer.tsx # Markdown 渲染器
│   │       ├── hooks/
│   │       │   ├── useSocket.ts    # Socket.IO 连接管理
│   │       │   └── useAgents.ts    # Agent 状态管理
│   │       └── themes/
│   │           ├── index.tsx       # ThemeProvider + useTheme
│   │           ├── default.ts      # 默认暗色主题（暗夜猫咪）
│   │           └── ramen.ts        # 赤猫拉面馆暖色木纹主题
│   ├── cli/                        # 命令行入口（开发用）
│   └── assistant/                  # Java Spring Boot 助手模块（独立）
```

## 核心模块

### AgentPool（广播引擎）
- 路径：`packages/core/src/agent-pool.ts`
- 职责：维护 Agent 注册表，支持 fan-out 广播和定向发送
- 关键接口：`register(id, agent)`, `broadcast(message)`, `get(id)`

### ClaudeProcess（CLI 进程管理）
- 路径：`packages/provider-claude/src/claude-process.ts`
- 职责：维护持久 `claude` 子进程，通过 stdin/stdout stream-json 通信
- 关键特性：`--resume sessionId` 复用上下文、429 自动退避、detached 防孤儿进程

### Router（消息路由）
- 路径：`packages/server/src/router.ts`
- 职责：@mention 解析 + A2A 消息分发 + 深度限制控制
- 关键逻辑：per-pair 深度限制 5 轮，全局 A2A 链最大 30 轮

### SessionManager（上下文压缩）
- 路径：`packages/server/src/session-manager.ts`
- 职责：检测 token 使用量，超限时自动生成摘要并重启 session

### ProjectDocStore（项目文档）
- 路径：`packages/server/src/store/project-doc-store.ts`
- 职责：每个 Thread 维护项目文档（index.md + log.md + 最近变更），跨 session 持久化上下文
- 关键接口：`getDoc(threadId)`, `updateDoc(threadId, section, content)`

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/threads` | 获取所有对话线程 |
| POST | `/api/threads` | 创建新对话线程 |
| GET | `/api/threads/:id` | 获取线程详情 |
| DELETE | `/api/threads/:id` | 删除线程 |
| GET | `/api/threads/:id/messages` | 获取线程消息 |
| POST | `/api/threads/:id/messages` | 发送消息（触发广播/路由） |
| GET | `/api/projects` | 获取项目列表 |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/agents` | 获取 Agent 列表及状态 |
| WS | `/socket.io` | 实时事件（流式输出、Agent 状态变更） |

## Agent 角色配置

| Agent ID | 名字 | 角色 | planMode | 模型 |
|----------|------|------|----------|------|
| `sasaki` | 佐佐木 | 前端开发 | false | glm-5-turbo |
| `bunzo` | 文藏 | 后端开发 | false | glm-5-turbo |
| `kohana` | 小花 | QA 测试 | false | glm-5-turbo |
| `sabu` | 萨布 | 文档专家 | false | glm-5-turbo |

## 数据模型

```
Thread { id, title, projectId, createdAt }
Message { id, threadId, role, content, agentId?, timestamp }
AgentState { id, status, currentTask, queueLength }
Project { id, name, path, description }
Session { agentId, sessionId, threadId }
```

## 配置
- 环境变量：无特殊要求（Claude CLI 凭证由 `~/.claude` 管理）
- Agent 配置：`packages/server/src/pool.ts` — agentConfigs 对象
- 模型配置：每个 agent 的 `model` 字段，传给 `claude --model`
- 主题配置：`packages/ui/src/themes/ramen.ts`

## 已知问题 & TODO
- FitTrack 组件已从代码库移除（属 Thread-Project 绑定的外部项目），BACKLOG.md 中仍保留历史记录
- 小花的 Code Review 和 E2E 测试未完成（BACKLOG.md 跟踪）
- 当前有 11 个文件未提交的修改（UI 主题精细化 + pool.ts 调整）
