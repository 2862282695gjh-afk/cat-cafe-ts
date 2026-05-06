# Session 管理

## 概念

每只猫咪通过 Claude CLI 的 `--resume {sessionId}` 机制维持对话上下文。Session Chain 系统在 CLI 自身的压缩能力之上，提供了一层额外的上下文生命周期管理。

## 三层记忆

| 层 | 机制 | 跨 session | 存储 |
|---|------|-----------|------|
| 短期 | CLI `--resume` session | 重启可恢复 | `data/sessions.json` |
| 长期 | FileMemoryStore | 持久化 | `data/memories/{agentId}.json` |
| 项目级 | ProjectDocStore | 持久化 | `data/threads/{threadId}-project.md` |

## Session Chain

参考 cat-cafe-tutorials 的 Session Chain 设计。核心思路：**不让濒死猫写遗书，让满血的新猫查旧记录。**

### 数据模型

1 个 Thread = N 个 Session per cat，有序链接：

```
Thread: "实现登录功能"
├── Session 1 (tamako, 0%→87%, sealed)  — 需求分析，分配任务
├── Session 2 (tamako, 0%→92%, sealed)  — 文藏汇报，佐佐木汇报
└── Session 3 (tamako, 0%→进行中)       — 小花 review 结果
```

存储在 `data/chains/{threadId}/{agentId}.json`：

```json
[
  {
    "sessionId": "abc123...",
    "generation": 1,
    "status": "sealed",
    "sealedAt": 1746000000000,
    "fillRatio": 0.87,
    "digest": "1. 主要请求与意图：用户要求实现登录功能..."
  },
  {
    "sessionId": "def456...",
    "generation": 2,
    "status": "active",
    "fillRatio": 0.3
  }
]
```

### 工作流程

```
用户发消息 → handler 收到 invoke
     ↓
事前检查：预估 token = 上次 token + 新消息 token
     ↓
预估 >= 85%？
  ├── 否 → 正常发给当前 session
  └── 是 → 触发封印流程：
           1. 封印（Seal）：标记旧 session 为 sealed
           2. 尸检（Digest）：spawn 临时 sub-agent 读完整 transcript → 生成结构化摘要
           3. 重生（Bootstrap）：杀旧进程，开新 session，注入摘要+长期记忆+规则
           4. 把用户消息发给新 session
```

### Sub-agent 尸检

封印时 spawn 一个**完全独立的临时 CLI 进程**（不属于任何 session chain），用来：
1. 读取旧 session 的完整 JSONL transcript（`~/.claude/projects/` 下）
2. 生成结构化 9 段式摘要（digest）

9 段摘要结构：
1. 主要请求与意图
2. 关键技术概念
3. 文件与代码（文件名+为什么重要+代码片段）
4. 错误与修复
5. 问题解决
6. 所有用户消息
7. 待处理任务
8. 当前工作（封印前在做什么）
9. 下一步

### 重生注入内容

新 session 启动时自动注入：

```
=== Session Chain 重生 ===
你是第 N 代 session。上一代 session 的摘要如下。

## 长期记忆
{用户画像、重要事实、对话历史摘要}

## 上一代 Session 摘要（第 N-1 代）
{sub-agent 生成的 9 段式 digest}

## 规则
当你不确定"之前做了什么、为什么那样做"时，不要猜。
基于你手头的摘要和记忆继续工作。
=== Session Chain 重生结束 ===
```

## 与 Claude CLI 压缩的对比

### 触发时机

| | Claude CLI Auto-Compact | Cat-noodle Session Chain |
|---|---|---|
| 触发方式 | 事后：回复生成中/后检测 token | **事前**：发送消息前预估 token |
| 触发阈值 | ~95%（CLI 内部决定） | **85%**（可配置） |
| 谁先触发 | 后 | **先**（25% 窗口缓冲） |

### 压缩方式

| | Claude CLI Auto-Compact | Cat-noodle Session Chain |
|---|---|---|
| 在哪做 | **旧 session 内**，替换消息历史 | **开新 session**，旧 session 完整保留 |
| 谁做摘要 | CLI 自己（可能已经快满了） | **独立的 sub-agent**（满血状态） |
| 摘要质量 | 结构化 9 段，但基于残缺记忆 | **结构化 9 段，基于完整 transcript** |
| 信息损失 | 压缩是复印件的复印件，指数衰减 | **零损失**（transcript 永久保留） |
| 可追溯性 | 被压缩掉的内容永远消失 | **chain 记录可追溯**，随时重读 transcript |

### 上下文恢复

| | Claude CLI Auto-Compact | Cat-noodle Session Chain |
|---|---|---|
| 恢复内容 | 摘要 + 保留的最近消息 | 摘要 + 长期记忆 + 项目文档 + 规则 |
| Session ID | 不变 | **变更**（新 session） |
| 进程 | 不变 | **杀旧启新** |

### 核心区别

Claude CLI 的压缩是在同一个 session 内做"器官移植"——换掉旧上下文，保留 session 连续性。问题是每次压缩都有信息损失，多次压缩后早期上下文只剩残影。

Cat-noodle 的 Session Chain 是"转世重生"——旧 session 完整封印保留，新 session 通过 sub-agent 尸检获取精确摘要。信息损失来自摘要本身，但原始 transcript 永远可以回溯。

## 关键文件

| 文件 | 职责 |
|------|------|
| `packages/server/src/session-manager.ts` | Session Chain 核心：事前检查、封印、尸检、重生 |
| `packages/server/src/store/session-store.ts` | session ID 存储 + chain 记录持久化 |
| `packages/provider-claude/src/claude-process.ts` | CLI 进程管理：switchSession、resetSession |
| `packages/server/src/ws/handler.ts` | 事前拦截逻辑 |
| `packages/server/src/store/file-memory.ts` | 长期记忆存储 |

## 配置

阈值在 `session-manager.ts` 构造函数中：

```typescript
constructor(memoryStore: FileMemoryStore, threshold = 0.85) {
```

- `0.85` = token 占用率达 85% 时触发封印
- 需要低于 CLI 的 auto-compact 阈值（~95%），确保 cat-noodle 先动手
- 建议范围：0.80 ~ 0.90，太低浪费上下文，太高可能来不及封印
