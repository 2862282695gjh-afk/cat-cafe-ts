# 项目：参考多邻国，实现 FitTrack 的桌面小部件

> 多邻国 (Duolingo) 风格的 FitTrack 桌面小部件，展示今日训练计划与饮食推荐卡片，集成到赤猫拉面馆前端面板中。

## 代码结构

```
packages/ui/src/
├── components/FitTrackWidgets/        # 前端组件（佐佐木）
│   ├── FitTrackWidgetPanel.tsx        # 面板主容器（头部/刷新/错误重试）
│   ├── TrainingPlanCard.tsx           # 训练计划卡片（useReducer 状态管理）
│   ├── NutritionAdviceCard.tsx        # 饮食建议卡片
│   ├── types.ts                       # 类型定义 + 常量（GOAL_LABELS, CATEGORY_COLORS）
│   ├── defaults.ts                    # 默认值配置
│   ├── index.ts                       # Barrel 导出
│   ├── training/                      # 训练相关子组件
│   │   ├── StreakBadge.tsx            # 连胜徽章
│   │   ├── XPBadge.tsx                # 经验值徽章
│   │   ├── ProgressBar.tsx            # 进度条
│   │   ├── ExerciseItem.tsx           # 练习项（勾选/取消动画）
│   │   ├── ExerciseList.tsx           # 练习列表
│   │   └── CompleteBanner.tsx         # 完成庆祝横幅（粒子效果）
│   ├── nutrition/                     # 饮食相关子组件
│   │   ├── ProteinSection.tsx         # 蛋白质推荐区
│   │   ├── ProteinSourceItem.tsx      # 蛋白质来源项
│   │   ├── MealCard.tsx               # 餐食卡片（可展开）
│   │   ├── SupplementSection.tsx      # 补充剂建议
│   │   └── HydrationSection.tsx       # 饮水提示
│   ├── shared/                        # 共享子组件
│   │   └── SkeletonScreen.tsx         # 骨架屏加载状态
│   └── styles/                        # CSS 模块（6 文件）
│       ├── tokens.css                 # Design tokens（CSS 自定义属性）
│       ├── panel.css                  # 面板容器/头部/刷新按钮
│       ├── training.css               # 训练卡片/徽章/进度条/动画
│       ├── nutrition.css              # 饮食卡片/蛋白质/餐食
│       ├── skeleton.css               # 骨架屏样式
│       └── shared.css                 # 卡片基础/按钮/keyframes/响应式
├── hooks/
│   └── useFitTrack.ts                 # FitTrack 数据获取 hook（ETag 缓存）
├── api/
│   └── client.ts                      # REST API 客户端（含 FitTrack 方法）
└── App.tsx                            # 集成入口（🐾 FitTrack 面板切换）

packages/server/src/
├── routes/fittrack.ts                 # API 路由（文藏）
├── store/fittrack.ts                  # JSON 文件持久化（文藏）
└── app.ts                             # 路由注册

data/
└── fittrack.json                      # 种子数据
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/fittrack` | 全量数据（训练计划 + 饮食推荐） |
| GET | `/api/fittrack/training` | 获取当前训练计划 |
| PUT | `/api/fittrack/training` | 更新训练计划 |
| PATCH | `/api/fittrack/training/exercises/:id/complete` | 标记动作完成/取消 |
| GET | `/api/fittrack/nutrition` | 获取饮食推荐 |
| PUT | `/api/fittrack/nutrition` | 更新饮食推荐 |

## Agent 职责区

### 佐佐木 (sasaki) — 前端

- [x] FitTrackWidgetPanel 面板容器
- [x] TrainingPlanCard 训练计划卡片
- [x] NutritionAdviceCard 饮食推荐卡片
- [x] 多邻国风格 CSS（3D 按钮、进度条、深色主题）
- [x] useFitTrack hook + API client 对接
- [x] 交互状态覆盖（loading / error / 空数据 / 完成态）
- [x] 第一轮全面优化：组件拆分(12子组件)、CSS token化(6模块)、useReducer、无障碍、视觉增强 (commit e780d06)
- [x] 第二轮精细化优化：Bug修复(Nutrition显示)、inline style清理、刷新/重试按钮、取消勾选动画 (commit a8aefaa)

### 文藏 (bunzo) — 后端

- [x] FitTrackStore JSON 持久化
- [x] REST API 端点（含 Fastify schema 校验）
- [x] 训练计划 CRUD + 动作完成 PATCH
- [x] 饮食推荐 CRUD

### 小花 (kohana) — 测试

- [ ] Code Review
- [ ] 端到端测试（数据流 + 交互）

## 变更记录

| Commit | 说明 | 作者 |
|--------|------|------|
| `a8aefaa` | fix: FitTrack widget 二次优化 — Bug修复/inline style清理/交互增强 | 佐佐木 |
| `e780d06` | refactor: FitTrack widget 全面优化 — 组件拆分/CSS token化/无障碍/性能/视觉增强 | 佐佐木 |
| `242eb3b` | feat: 实现多邻国风格 FitTrack 桌面小部件 UI | 佐佐木 |
| `67e289b` | feat: 为 FitTrack 添加多邻国风格过渡动画系统 | 佐佐木 |
| `7315fd7` | refactor: FitTrackWidgetPanel 改为外部数据驱动 | 佐佐木 |
| `ed2819f` | fix: 修复桌面小部件交互状态与数据绑定缺陷 | 佐佐木 |
| `2c0d5bb` | feat: 实现 FitTrack API 端点 | 文藏 |
| `924985a` | feat: 对接文藏 FitTrack API，实现真实数据绑定 | 佐佐木 |
| `78b85c9` | feat: 添加 FitTrack 种子数据，支持 widget 端到端测试 | 佐佐木 |

## 任务跟踪

### 佐佐木 (sasaki)

- [x] FitTrack widget 第一轮全面优化 (commit e780d06)
- [x] FitTrack widget 第二轮精细化优化 (commit a8aefaa)
- [ ] 等待 @小花 code review

### 文藏 (bunzo)

> 全部完成，无待办

### 小花 (kohana)

- [ ] Code Review 组件代码
- [ ] E2E 测试：打开面板 → 查看训练计划 → 勾选动作 → 验证 PATCH 同步 → 查看饮食推荐展开收起
