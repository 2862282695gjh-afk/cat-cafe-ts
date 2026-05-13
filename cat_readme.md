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
│   │       │   ├── projects.ts     # REST: 项目 CRUD + bind-doc + by-path
│   │       │   ├── wiki.ts         # REST: Wiki 知识库检索（搜索/章节/全文）
│   │       │   ├── tasks.ts        # REST: 任务看板 CRUD（创建/开始/完成/查询）
│   │       │   └── agents.ts       # REST: Agent 列表/状态
│   │       └── store/
│   │           ├── interface.ts    # Store 接口定义
│   │           ├── json-file.ts    # JSON 文件持久化（线程 + 消息）
│   │           ├── project-store.ts# 项目元数据存储
│   │           ├── project-doc-store.ts # 项目文档（LLM Wiki，三文件分离）
│   │           ├── file-memory.ts  # Agent 长期记忆
│   │           ├── session-store.ts# CLI sessionId 持久化
│   │           ├── wiki-store.ts   # Wiki 知识库（文档检索 + 关键词搜索 + 30s 缓存）
│   │           └── task-board-store.ts # 任务看板（per-thread JSON 文件持久化）
│   ├── ui/                         # React 前端
│   │   └── src/
│   │       ├── App.tsx             # 主应用（ThemeRouter + Thread 切换）
│   │       ├── index.css           # 全局样式（含赤猫拉面馆主题 CSS）
│   │       ├── types.ts            # 前端类型定义
│   │       ├── main.tsx            # Vite 入口
│   │       ├── api/client.ts       # REST API 客户端
│   │       ├── components/
│   │       │   ├── ChatView.tsx    # 聊天主视图（流式事件 + 任务看板 + Wiki 面板 + 状态缓存）
│   │       │   ├── MessageBubble.tsx # 消息气泡（Markdown 渲染）
│   │       │   ├── InputBox.tsx    # 输入框（@mention 自动补全）
│   │       │   ├── AgentPanel.tsx  # 右侧 Agent 状态面板（含项目信息 + 任务看板 tab）
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

### WikiStore（知识库检索）
- 路径：`packages/server/src/store/wiki-store.ts`
- 职责：Agent 可主动查询的文档检索系统，数据源为 cat_readme.md + project-doc
- 关键特性：关键词匹配评分（无需 embedding）、30s 缓存、按相关度排序 top 10
- 关键接口：`search(query)`, `getSection(projectId, title)`, `getFullDoc(projectId)`

### TaskBoardStore（任务看板）
- 路径：`packages/server/src/store/task-board-store.ts`
- 职责：per-thread 任务看板，Agent 通过 API 创建/分配/完成跨猫协作任务
- 关键特性：JSON 文件持久化（`data/tasks/{threadId}.json`）、状态流转（pending → in_progress → done）
- 关键接口：`createTask()`, `startTask()`, `completeTask()`, `getBoard()`

### 自动项目绑定（cat_readme.md 检测）
- 路径：`packages/server/src/ws/handler.ts`（Agent 完成回复后触发）
- 职责：Agent 每次完成回复后，自动扫描工作目录检测 cat_readme.md，自动绑定 thread 到 project
- 检测策略：已绑定项目 → 更新 catReadmePath；未绑定 → 扫描已有项目 → 从 agent 日志提取路径候选 → 自动创建项目
- 关键 API：`POST /api/bind-doc`（萨布专用手动绑定 + 自动创建项目）

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
| PATCH | `/api/projects/by-path?path=xxx` | 根据路径更新项目（供 agent 调用） |
| POST | `/api/bind-doc` | 萨布专用：更新 catReadmePath + 绑定 thread 到 project |
| PATCH | `/api/threads/:id` | 更新线程属性（如 projectId） |
| GET | `/api/wiki/search?q=keyword[&project=projectId]` | 搜索文档（关键词匹配，返回 top 10） |
| GET | `/api/wiki/projects` | 列出有文档的项目 |
| GET | `/api/wiki/project/:id` | 获取项目文档全文 |
| GET | `/api/wiki/section?project=projectId&title=sectionTitle` | 获取特定章节 |
| POST | `/api/tasks` | 创建任务（含 threadId、标题、创建者、分配者） |
| GET | `/api/tasks?threadId=xxx` | 获取看板（按 thread） |
| PATCH | `/api/tasks/:id/start` | 开始任务（status → in_progress） |
| PATCH | `/api/tasks/:id/complete` | 完成任务（status → done） |
| WS | `/socket.io` | 实时事件（流式输出、Agent 状态变更、project-updated、task-board） |

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
Project { id, name, path, description, catReadmePath? }
Session { agentId, sessionId, threadId }
BoardTask { id, threadId, title, description?, createdBy, createdByName, assignee?, assigneeName?, status, createdAt, completedAt? }
```

## 配置
- 环境变量：无特殊要求（Claude CLI 凭证由 `~/.claude` 管理）
- Agent 配置：`packages/server/src/pool.ts` — agentConfigs 对象
- 模型配置：每个 agent 的 `model` 字段，传给 `claude --model`
- 主题配置：`packages/ui/src/themes/ramen.ts`

## 已知问题 & TODO
- FitTrack 组件已从代码库移除（属 Thread-Project 绑定的外部项目），BACKLOG.md 中仍保留历史记录
- E2E 测试待进行（Code Review 已通过，53 测试全部 passed）
- 前端 8 文件 + cat_readme.md 未提交：任务看板 UI（AgentPanel tab）、项目绑定器下拉（ChatView）、萨布 @mention 自动补全（InputBox）、boardTasks 类型/socket 事件（types/useSocket）、style 微调
- 所有 Agent 已添加 Discovery Phase prompt（需求澄清流程），收到模糊需求时先追问再动手
