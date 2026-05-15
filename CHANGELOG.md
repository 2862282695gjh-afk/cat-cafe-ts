# Changelog

## [2025-05-14] Session Search

### Added
- **Session Search API**：新增 4 个 REST 端点，让 agent 在上下文封印后能主动搜索历史 session
  - `GET /api/sessions/chain` — 查看 session chain 历史（代数、状态、占用率）
  - `GET /api/sessions/search` — 关键词搜索历史 session 转录（支持 snippet 高亮）
  - `GET /api/sessions/:sessionId/events` — 读取指定 session 的完整事件列表
  - `GET /api/sessions/:sessionId/digest` — 获取指定 session 的摘要
- **Bootstrap 搜索指引**：新 session 启动时注入 curl 指令，告知 agent 可搜索旧 session
  - 将"不要猜"规则升级为具体的 4 步搜索指引
- **JSONL 解析公共 API**：从 `SessionManager` 提取 `readSessionTranscript`、`parseSessionJsonl`、`extractText`、`searchChainSessions` 等函数到 `session-store.ts`

### Changed
- `SessionManager` 私有方法提取为 `session-store.ts` 公共函数，避免逻辑重复
- `bootstrap()` 方法注入搜索 curl 指令替代原来的"不要猜"提示

### Architecture
- 采用与 Wiki / Task Board 相同的 **REST API + curl 指令注入** 模式
- 搜索逻辑：遍历 chain 中所有 sealed session 的 JSONL 转录，做 case-insensitive 关键词匹配
- 返回每个命中的 session 的 generation、sessionId 和最多 10 条匹配消息片段
