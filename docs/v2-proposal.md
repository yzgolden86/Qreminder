# Renewlet v2 改造方案（renewlet-next）

> **状态：archived（历史决策记录）**
>
> 这份文档是 v2 改造**开工前**的方案草案，用于记录技术选型、字段映射、阶段计划等决策。**实际实施已完成大部分内容并落地到当前仓库**（`packages/server-ts/` + `runtimes/` + `tools/pb-importer/`），所以下文的部分表述（如 "v1 冻结" / "fork 到新仓库" / "wrangler.toml database_id 仍是占位值"）已经不再准确。具体实施进度看第 12 节。
>
> 部署看：[CF_GH_ACTIONS_DEPLOY.md](CF_GH_ACTIONS_DEPLOY.md)（GH Actions 主推）/ [WORKER_DEPLOY.md](WORKER_DEPLOY.md)（本地 wrangler CLI）/ [NODE_DOCKER_DEPLOY.md](NODE_DOCKER_DEPLOY.md)（Node + Docker 自托管）。
>
> 兼容性：v2 是破坏性变更；v1 已从仓库中移除（Workflow C, 2026-05-18），新部署请直接用 v2 路径。

## 1. 改造目标

1. **多一种部署方式**：在保留 Docker 自托管能力的同时，新增 Cloudflare Workers + D1 + R2 一键部署形态，照顾「无 VPS」用户。
2. **强化提醒能力**：把单值 `reminderDays` 升级为档位数组 `reminderOffsets`，支持 180 / 90 / 30 / 15 / 7 / 3 / 1 / 0 等多档；同一用户同一日合并发送。
3. **重构首页布局**：参考用户提供截图，把 `/dashboard` 与 `/subscriptions` 合并为单页（图表区 + 临期提醒条 + 筛选 + 卡片网格）。

## 2. 技术栈（已锁定）

| 维度 | 选择 | 备注 |
| --- | --- | --- |
| 语言 | TypeScript（strict） | |
| HTTP 框架 | Hono | Web 标准 API，Node / Workers / Bun 同源 |
| 校验 | Zod | 前后端共享 schema |
| ORM | Drizzle | 同 schema 编译到 better-sqlite3 / D1 |
| 鉴权 | Better Auth | 邮箱密码 + session cookie，多用户 |
| Node DB | better-sqlite3 | |
| Workers DB | Cloudflare D1 | |
| Node 存储 | 本地文件系统 | 路径 `/data/assets` |
| Workers 存储 | Cloudflare R2 | |
| Node 邮件 | nodemailer SMTP | 兼容现有 SMTP 配置 |
| Workers 邮件 | Resend HTTP API | 用户自带 API Key |
| Node 调度 | node-cron | 分钟级 |
| Workers 调度 | Cron Triggers `* * * * *` | 分钟级 |
| 前端托管 | Node 内置静态 / Workers Assets | Workers 模式无需 Pages |
| 包管理 | pnpm workspace | |

未列入但仍要做的：i18n（中/英）保留，Tailwind 4 + shadcn/Radix 保留，Recharts 保留。

## 3. 仓库结构

新仓库 `renewlet-next`：

```
renewlet-next/
├── packages/
│   ├── shared/                # Zod schema、领域类型、纯函数工具（前后端共享）
│   ├── client/                # 前端（Vite + React 19）
│   └── server/
│       ├── src/
│       │   ├── domain/        # 计费、汇率、提醒匹配
│       │   ├── notifications/ # 6 个渠道 + 内容拼装
│       │   ├── routes/        # Hono 路由
│       │   ├── db/            # Drizzle schema + 仓储
│       │   ├── auth/          # Better Auth 配置
│       │   └── adapters/      # storage / mailer / scheduler 接口
│       └── package.json
├── runtimes/
│   ├── node/                  # Node 入口、依赖注入、Dockerfile
│   └── worker/                # Workers 入口、wrangler.toml
├── tools/
│   └── pb-importer/           # PocketBase → 新 schema 迁移 CLI
├── e2e/                       # Playwright 双部署冒烟
└── docs/
```

约束：`packages/server` 禁止 `import "node:*"` 与 `import "cloudflare:*"`；所有平台能力走 `adapters/`。

## 4. 数据模型

### 4.1 字段变化总览

| 表 | 改动 |
| --- | --- |
| `users` | 用 Better Auth 标准表 + 自定义 `role`、`banned`、`banReason` |
| `settings` | 新增 `signupEnabled:boolean`、`signupAllowlist:string[]`（支持通配，如 `*@example.com`） |
| `subscriptions` | `reminderDays:int` → `reminderOffsets:int[]`（JSON 列） |
| `custom_configs` | 不变 |
| `notification_jobs` | 主键粒度从 `(user, scheduledLocalDate, scheduledLocalTime, timeZone)` 调整为 `(user, scheduledLocalDate, timeZone)`；结果 JSON 列出当日命中的所有订阅与各自档位 |
| `assets` | Node：`storagePath`；Workers：`r2Key`；公共元数据 `kind/mime/size/originalName` |

### 4.2 reminderOffsets 语义

- 单订阅独立配置，类型 `number[]`，单调递减、去重、范围 `[0, 365]`
- 默认值 `[7, 3, 1]`
- 表单提供常用 chips：`180 / 90 / 30 / 15 / 7 / 3 / 1 / 0`，并允许用户输入自定义档位
- 旧数据迁移：`reminderDays = 3` → `reminderOffsets = [3]`

### 4.3 通知调度语义

- 调度入口：每分钟触发一次（Workers / Node 一致）
- 对每个用户：
  1. 计算用户当地日期 / 时间
  2. 是否落在通知窗口 `[T - windowMinutes, T]`，否则跳过
  3. 扫描该用户全部订阅，命中条件：
     - `daysUntil(nextBillingDate) ∈ reminderOffsets`，或
     - `daysUntil(trialEndDate) ∈ reminderOffsets`
  4. 命中订阅合并为单条消息：

     ```
     今日续费提醒
     • 域名 DNS 托管 — 30 天后扣费 ¥8
     • iCloud+ 家庭版 — 7 天后扣费 ¥68
     • 微信读书无限卡 — 今天扣费 ¥25
     ```

  5. 将合并消息发往用户启用的所有渠道
- `notification_jobs` 主键 `(user, scheduledLocalDate, timeZone)`：保证同一日只一行
- 重试策略保持原样：行级重试，已成功渠道不重发

## 5. 多用户准入

- 默认 **邀请制**，仅管理员可手动创建用户
- 管理员可在「设置 → 注册」打开 `signupEnabled`
- 开启注册时：
  - 必须邮箱验证码
  - 必须命中白名单：`settings.signupAllowlist`（管理员配） ∪ `SIGNUP_ALLOWLIST` 环境变量
  - 通配规则：`*@example.com`、`alice@*.com`、`*` 全开
- 注册接口对未命中白名单返回统一 `403`，错误码 `SIGNUP_NOT_ALLOWED`

## 6. 首页布局（Mock A）

`/` 路由变为单页一站式视图，`/subscriptions` 重定向到 `/`。

```
┌────────────┬───────────────────────────────────────────────────────┐
│  Sidebar   │  订阅管理      [全局搜索]              [🔔]         │
│            ├───────────────────────────────────────────────────────┤
│ 仪表盘     │  ▎订阅概览图表                       [显示图表▾] [+]   │
│ ▶ 订阅管理 │  ┌────┬────┬──────┬──────┐                            │
│ 日历       │  │近7  │近7  │月均  │年均  │                          │
│ 统计       │  │笔数 │花费 │      │      │                          │
│ 设置       │  ├─────┴─────┴──────┴──────┤                          │
│            │  │ 分类环图  扣费时间分布  距续费T5  当月金额T5 │      │
│            │  └──────────────────────────────────────────┘         │
│            │  ▎临期提醒（最近 5）                                    │
│            │  [今天-A] [明天-B] [3天-C] [6天-D] [9天-E]              │
│            ├───────────────────────────────────────────────────────┤
│            │  [筛选条] [排序▾] [视图切换] [批量▾] [+ 添加]           │
│            │  ┌────┬────┬────┬────┐                                │
│            │  │卡片│卡片│卡片│卡片│                                │
│            │  └────┴────┴────┴────┘                                │
└────────────┴───────────────────────────────────────────────────────┘
```

保留路由：`/calendar`、`/statistics`、`/settings`、`/admin/users`、`/login` 等。

新组件：
- `OverviewStatsRow`：4 个数字卡（近 7 笔数 / 近 7 花费 / 月均 / 年均）
- `BillingTimingBars`：扣费时间分布柱图（已逾期 / 今天 / 1-7 / 8-30 / 31+ / 未设置）
- `TopUntilRenewalChart`：距续费 Top 5 横条
- `TopMonthlyAmountChart`：当月金额 Top 5 横条
- `UpcomingReminderStrip`：临期提醒横条（最近 5 条）

复用：分类花费环图（自 `pages/dashboard.tsx` 提取）、订阅卡片（[subscription-card.tsx](packages/client/src/components/subscription-card.tsx)）。

## 7. 部署形态

### 7.1 Docker（Node 模式）

- 单镜像 `renewlet-next:latest`
- 内部进程：Hono server + node-cron 调度器 + nodemailer
- 挂载 `/data`：放 SQLite + 本地资源
- `docker compose up -d` 体验对齐当前 Go 版

### 7.2 Cloudflare（Workers 模式）

- 单 Worker，绑定：D1 + R2 + Resend API Key（secret）
- 静态资源走 Workers Assets
- Cron Triggers `* * * * *`
- 部署：`wrangler deploy`，首次需要 `wrangler d1 create` 与 `wrangler r2 bucket create`

### 7.3 能力差异

| 能力 | Docker | Workers |
| --- | --- | --- |
| 多用户 | ✅ | ✅ |
| 邮件 | SMTP | Resend HTTP |
| 文件上传 | 本地 FS | R2 |
| Logo 大小限制 | 2MB | 2MB（R2 限制内） |
| Admin UI | 无（PocketBase Admin 不再存在） | 无 |
| 数据迁移 | pb-importer CLI | pb-importer CLI |

## 8. 数据迁移工具（pb-importer）

CLI 用法：

```bash
npx renewlet-import --pb ./pb_data --target d1://renewlet --r2 my-bucket
npx renewlet-import --pb ./pb_data --target sqlite:///data/renewlet.db --fs /data/assets
```

工作流：
1. 读取 PocketBase SQLite + `pb_data/storage`
2. 映射用户、订阅（reminderDays → [reminderDays]）、设置、自定义配置、通知历史
3. 把 logo 二进制重新落到目标存储
4. 输出迁移报告（新旧 ID 映射、跳过项、错误项）
5. 不删除源数据，便于回滚

## 9. 阶段计划（约 8.5 周）

| # | 内容 | 估时 |
| --- | --- | --- |
| 0 | 仓库脚手架 + Hono hello + Drizzle schema + Node/Workers 双跑 echo | 1 周 |
| 1 | Better Auth 接入 + 邀请/开放注册 + 白名单 | 1 周 |
| 2 | 订阅 / 设置 / 自定义配置 CRUD + 共享 Zod 校验 | 1.5 周 |
| 3 | 6 渠道实现 + 邮件双适配 + reminderOffsets 匹配 + 当日合并 | 1.5 周 |
| 4 | 调度双适配 + 重试 + 历史 | 0.5 周 |
| 5 | 文件存储双适配 + favicon 搜索 | 0.5 周 |
| 6 | Mock A 单页 + 4 新图表 + reminderOffsets UI | 1.5 周 |
| 7 | PocketBase 导入工具 | 0.5 周 |
| 8 | 双 CI（Docker + wrangler） + 双语 README | 0.5 周 |
| 9 | E2E 双部署冒烟 + 缓冲 | 0.5 周 |

## 10. 风险与未决项

| 风险 | 缓解 |
| --- | --- |
| Better Auth 在 Workers 上的成熟度 | 阶段 0 必须先做 PoC（session 存储路径：DB / KV）；失败回退 Lucia |
| D1 写吞吐（50 写/秒/库） | 调度器按用户分批；通知历史按周期归档 |
| Resend 免费额度（3000 封/月） | 引导用户自带 API Key；超额时降级到「仅 Telegram / Webhook」 |
| Workers CPU 时长（30s 上限） | 每分钟调度按用户分批；单用户内异步并发渠道 |
| PocketBase 文件迁移 | pb-importer 离线运行，源数据只读，输出报告 |
| 现有用户口碑 | v1 仓库归档但保留；README 显眼链接 v2；提供迁移指引 |

未决项（实施时再收敛）：
- Resend domain 验证 / 默认发件人地址
- D1 备份策略（Cloudflare 提供 `wrangler d1 export`，需要文档化）
- Better Auth 的 OAuth provider 是否第一版就接（建议先不接，邮件密码够用）
- 国际化键名是否需要重构（建议保留）

## 11. 决策日志

| 日期 | 决策 | 原因 |
| --- | --- | --- |
| 2026-05-17 | 选 B：TS 重写后端，Node + Workers 双跑 | 用户希望「多一种部署方式」，单代码库可维护 |
| 2026-05-17 | reminderOffsets 改数组 | 用户要求多档提醒（180/30/7/3/1） |
| 2026-05-17 | Mock A 合并 dashboard + subscriptions | 用户选定 |
| 2026-05-17 | Better Auth + 多用户 | 兼顾家庭/团队场景 |
| 2026-05-17 | 双适配存储与邮件 | 满足两种部署的能力一致性 |
| 2026-05-17 | 写 PocketBase 迁移工具 | 保护老用户数据 |
| 2026-05-17 | 当日合并发通知 | 避免一日多条轰炸 |
| 2026-05-17 | 邀请 + 可选开放注册 + 白名单 | 自托管常见诉求 |
| 2026-05-17 | 同日命中合并、Workers 仍分钟级、Workers Assets、D1 | 见第 7、8 节 |
| 2026-05-17 | fork 到新仓库 renewlet-next | v1 冻结，避免 main 直接 break |
| 2026-05-17 | 4 个新图表全保留 | 用户选定 |

## 12. 实施进度更新（2026-05-18）

> v2 实际选择不 fork 新仓库，而是直接在当前仓库内增量迁移（`packages/server-ts/`、`runtimes/`、`tools/pb-importer/` 与 `packages/server/` Go 后端共存）。前端已**完全**切到 v2 TS 后端；v1 Go + PocketBase 仍可独立部署但已进入维护模式（详见 [DOCKER_DEPLOY.md](./DOCKER_DEPLOY.md)）。

已完成：

| 阶段 | 内容 | 落点 |
| --- | --- | --- |
| D | reminderDays → reminderOffsets 全链路改造 | 前端 + Go 后端共同支持，server-ts 唯一真源 |
| A | Drizzle schema（9 张表）+ migrations 生成 | [packages/server-ts/src/db/schema.ts](../packages/server-ts/src/db/schema.ts)、[drizzle/](../packages/server-ts/drizzle/) |
| C | Better Auth + email allowlist hook | [packages/server-ts/src/auth.ts](../packages/server-ts/src/auth.ts) |
| B | Storage / Mailer / Scheduler 双适配 | [runtimes/node](../runtimes/node/)、[runtimes/worker](../runtimes/worker/) |
| E | subscriptions / settings / custom-configs / assets / admin-users 路由 | [packages/server-ts/src/routes/](../packages/server-ts/src/routes/) |
| F | runNotificationCron + node-cron + Worker scheduled() | [packages/server-ts/src/cron/notification-cron.ts](../packages/server-ts/src/cron/notification-cron.ts) |
| G | pb-importer（PocketBase → SQLite） | [tools/pb-importer](../tools/pb-importer/) |
| H1 | 前端 auth-client 切到 better-auth/react | [packages/client/src/lib/auth-client.ts](../packages/client/src/lib/auth-client.ts) |
| H2 | 前端 hooks 全部切到 `/api/*`，移除 PocketBase SDK 依赖 | [packages/client/src/hooks/](../packages/client/src/hooks/)、[lib/upload-image.ts](../packages/client/src/lib/upload-image.ts) |
| H3 | dashboard + subscriptions 合并为 Mock A 单页 | [packages/client/src/pages/dashboard.tsx](../packages/client/src/pages/dashboard.tsx) |
| 邮件 | Better Auth `sendResetPassword` 接 mailer adapter（Node nodemailer / Workers Resend） | [auth.ts](../packages/server-ts/src/auth.ts) |
| Admin 写 | POST/DELETE/newPassword 用户管理路由 | [admin-users.ts](../packages/server-ts/src/routes/admin-users.ts) |
| CI | `wrangler-deploy.yml` 双部署补齐 + `cf-bootstrap.yml` 一次性资源创建 | [.github/workflows/](../.github/workflows/) |
| Docs | 三套部署文档分轨：[CF_GH_ACTIONS_DEPLOY.md](./CF_GH_ACTIONS_DEPLOY.md)（GH Actions 主推）、[WORKER_DEPLOY.md](./WORKER_DEPLOY.md)（本地 wrangler CLI）、[DOCKER_DEPLOY.md](./DOCKER_DEPLOY.md)（v1 维护模式） | docs/ |

未完成 / 已知缺口：

- 端到端浏览器烟测：仍未跑过完整一次（需要先有迁移过来的真实数据 + 已注册 admin），见 [E2E_SMOKE_STATUS.md](./E2E_SMOKE_STATUS.md)。
- v1 Go 后端的 `/api/app/admin/users` 与 v2 server-ts 同路径但实际只在各自部署里激活；前端代码默认走 v2，不再依赖任何 v1 路径。
- Node 自托管 runtime 没有专门的 Docker 镜像和 compose 模板（v1 那条 `Dockerfile` + `docker-compose.yml` 仍指向 Go binary）。
- Workers 的 `wrangler.toml` `database_id` 字段在 GH Actions 路径下由 [.github/workflows/cf-bootstrap.yml](../.github/workflows/cf-bootstrap.yml) 自动写入；本地 wrangler CLI 路径仍需要手动按 [WORKER_DEPLOY.md §1](./WORKER_DEPLOY.md#1-创建-d1--r2-资源) 替换。

校验状态：

- 全 monorepo 7 包 typecheck 通过：`shared / client / server-ts / runtime-node / runtime-worker / pb-importer`
- 前端 vitest 209 passed / 50 files
- Go 后端测试因本机 Go 1.22 vs go.mod 要求 1.26.2 暂跳过（CI runner 上有 1.26 toolchain 不影响）
