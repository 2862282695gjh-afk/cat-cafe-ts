# Cat Cafe TS

多 Agent 协作聊天系统，灵感来自动漫《赤猫拉面馆》（ラーメン赤貓）。四个 AI Agent 扮演拉面馆店员，通过 @mention 路由和 A2A（Agent-to-Agent）通信协作完成用户任务。

## 架构概览

```
packages/
├── core/           # 核心类型定义、AgentPool（fan-out 广播）
├── provider-claude/# Claude CLI 持久进程管理（stdin/stdout stream-json）
├── server/         # Fastify HTTP + Socket.IO 服务端
├── ui/             # React + Vite + TailwindCSS 前端
├── cli/            # 命令行入口（开发用）
└── assistant/      # Java Spring Boot 助手模块（独立）
```

## Agent 角色

| Agent ID | 名字 | 角色 | 说明 |
|----------|------|------|------|
| `tamako` | 社珠子 | PM / 店长 | 默认接收所有用户消息，分析需求并委派任务 |
| `sasaki` | 佐佐木 | 前端开发 | React/Vue/TypeScript，被 @佐佐木 呼叫 |
| `bunzo`  | 文藏   | 后端开发 | Java/Kotlin/Go，被 @文藏 呼叫 |
| `kohana` | 小花   | QA 测试 | 测试/Code review，被 @小花 呼叫 |

## 消息路由

- **默认**：用户消息发给社珠子（1 次 API 调用，不会 429）
- **@mention**：`@佐佐木 帮我写个按钮` → 直接发给佐佐木
- **A2A**：社珠子回复中 `@文藏 请设计 API` → 自动触发文藏的回复（串行，最大深度 5）

路由实现：`packages/server/src/router.ts`

## 快速开始

### 前置要求

- Node.js >= 20
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) 已安装并登录

### 启动

```bash
# 安装依赖
npm install

# 启动服务端（端口 3001）
npx tsx packages/server/src/index.ts

# 启动前端（端口 5173，自动代理 /api 和 /socket.io 到 3001）
cd packages/ui && npm run dev
```

打开 http://localhost:5173 即可使用。

## 数据持久化

| 文件 | 内容 |
|------|------|
| `data/threads/index.json` | 线程列表元数据 |
| `data/threads/{id}.json` | 每个线程的消息记录 |
| `data/sessions.json` | CLI session 持久化（重启后 --resume 恢复上下文） |
| `data/memories/{agentId}.json` | Agent 长期记忆 |

所有数据目录已加入 `.gitignore`。

## 模型配置

在 `packages/server/src/pool.ts` 中配置每个 Agent 的模型：

```typescript
tamako: {
  id: "tamako",
  model: "glm-5-turbo",  // 传给 claude --model
  ...
}
```

模型名称对应 Claude CLI 配置（`~/.claude/settings.json` 中的环境变量映射）。

## 主题系统

前端支持可切换主题，当前内置：

- **暗夜猫咪**（默认）— 灰色暗色风格
- **赤猫拉面馆** — 暖色木纹风格，带角色头像

主题定义在 `packages/ui/src/themes/`，通过 CSS 变量 + React Context 实现。

### 添加新主题

```typescript
// packages/ui/src/themes/my-theme.ts
import type { Theme } from "./index";

export const myTheme: Theme = {
  id: "my-theme",
  name: "我的主题",
  icon: "🎨",
  colors: { /* ... */ },
  agents: { /* 覆盖每个 agent 的名字/头像/颜色 */ },
  // ...
};
```

然后在 `App.tsx` 的 `THEMES` 数组中加入即可。

## 关键实现细节

### CLI 进程管理

`ClaudeProcess`（`packages/provider-claude/src/claude-process.ts`）维护一个持久的 `claude` 子进程：

- 通过 `stdin` 发送 JSON 消息、`stdout` 接收流式事件
- `--resume sessionId` 复用上下文
- 内置重试（429 限速自动退避）
- `detached: false` 防止孤儿进程

### 线程切换状态保持

ChatView 使用 per-thread 缓存（`stateCacheRef`）：

- 切走时保存 `isStreaming`、`streamingText`、`currentLogs` 等状态
- 切回来时恢复，思考/流式内容不丢失
- Socket 不离开房间，后台事件持续接收
- 后端事件携带 `threadId`，前端过滤只处理当前线程

### 上下文压缩

`SessionManager`（`packages/server/src/session-manager.ts`）检测 token 使用量，超过阈值时：
1. 启动 sub-agent 读取旧 session JSONL
2. 生成压缩摘要
3. 杀掉旧进程，注入摘要到新 session

### @mention 自动补全

InputBox 组件支持 `@` 触发的下拉选择：
- 支持中文名和英文 ID
- Tab/Enter 确认选择
- 发送时由后端 router 解析并路由

## 开发常用命令

```bash
# 类型检查
npx tsc --noEmit -p packages/server/tsconfig.json
npx tsc --noEmit -p packages/ui/tsconfig.json

# 构建
npm run build

# 启动服务端
npx tsx packages/server/src/index.ts
```

## 项目结构详解

```
packages/server/src/
├── index.ts            # 启动入口
├── app.ts              # Fastify 应用配置
├── pool.ts             # Agent 注册 + 状态追踪
├── router.ts           # @mention 路由 + A2A 通信
├── session-manager.ts  # 上下文压缩
├── memory-extractor.ts # 长期记忆提取
├── ws/
│   └── handler.ts      # Socket.IO 事件处理
├── routes/
│   ├── threads.ts      # REST API: 线程 CRUD
│   └── agents.ts       # REST API: Agent 列表/状态
└── store/
    ├── interface.ts    # Store 接口定义
    ├── json-file.ts    # JSON 文件持久化（线程+消息）
    ├── file-memory.ts  # Agent 长期记忆
    └── session-store.ts # CLI sessionId 持久化

packages/ui/src/
├── App.tsx             # 主应用（ThemeProvider 包裹）
├── themes/             # 主题系统
│   ├── index.tsx       # ThemeProvider + useTheme
│   ├── default.ts      # 默认暗色主题
│   └── ramen.ts        # 赤猫拉面馆主题
├── components/
│   ├── ChatView.tsx    # 聊天主视图（流式事件处理）
│   ├── MessageBubble.tsx # 消息气泡（Markdown 渲染）
│   ├── InputBox.tsx    # 输入框（@mention 补全）
│   ├── AgentPanel.tsx  # 右侧 Agent 状态面板
│   ├── ThreadList.tsx  # 左侧对话列表
│   └── MarkdownRenderer.tsx # Markdown 渲染器
├── hooks/
│   ├── useSocket.ts    # Socket.IO 连接管理
│   └── useAgents.ts    # Agent 状态管理
├── api/client.ts       # REST API 客户端
└── types.ts            # 类型定义
```
