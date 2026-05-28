# Qreminder

[简体中文](README.md) | [English](README.en.md)

Qreminder 是一个自托管的订阅管理工具。把 SaaS、AI 工具、云服务和开发工具的价格、续费日、预算和提醒放到一起；适合个人、独立团队和家庭实验室。

<p align="center">
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-0f172a?style=flat-square">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Hono%20%2B%20Drizzle-3178c6?style=flat-square">
  <img alt="Tailwind 4" src="https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat-square">
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-111827?style=flat-square">
</p>

<p align="center">
  <img src="docs/screenshots/qreminder-light.png" width="48%" alt="Light mode" />
  <img src="docs/screenshots/qreminder-dark.png" width="48%" alt="Dark mode" />
</p>

## 这是什么

如果你同时订了很多工具，Qreminder 帮你把它们记清楚：

- **谁什么时候扣费**——多档提醒（如 `[7, 3, 1]` 天），按日聚合避免邮件轰炸
- **每月大概花多少**——不同周期统一折算成月度成本，再按分类、付款方式拆解
- **哪些快到期**——续费日历 + 试用到期高亮 + 仪表盘续费排行
- **通知发去哪了**——通知中心独立页，可下钻到「这条订阅，哪个收件人，发送状态」

数据自托管：你的订阅信息只存在你部署的实例里，不上报任何第三方。

## 功能

| 类别 | 能力 |
| --- | --- |
| **订阅记录** | 名称、Logo、价格、币种、扣费周期（周/月/季/半年/年/自定义天数）、状态（试用/订阅中/暂停/取消）、分类、付款方式（含「免费」）、网站、标签、备注 |
| **多档提醒** | 每条订阅独立 `reminderOffsets`，同日命中合并为一条通知 |
| **通知渠道** | Telegram、邮件、企业微信机器人、Webhook、Bark、NotifyX、Server酱 Turbo——7 种渠道可同时启用 |
| **通知策略** | 每订阅独立渠道 > 标签默认 > 分类默认 > 用户默认；支持自定义通知模板变量 |
| **通知中心** | 独立页汇总「即将发送」与「历史任务」，按状态筛选，单条任务可下钻每个收件人结果 |
| **支出分析** | 周期折算月度成本、分类占比、付款方式占比、扣费周期分布、续费/月度 Top 5 |
| **年度财报** | 全年总花费、支付次数、同比变化、月度趋势、分类与渠道明细 |
| **支付历史** | 记录每次实际付款，快速续费自动推算下次到期日，实际支出 vs 预计账单对比 |
| **预算控制** | 全局/分类/标签/支付方式维度预算，月度/年度周期，80%/100% 超额提醒 |
| **多币种** | 可选 Frankfurter 或 FloatRates 汇率源；远端不可用时回退备用汇率 |
| **日历订阅** | iCal 链接，可同步到 iOS 日历、Google Calendar、Outlook |
| **数据安全** | JSON/CSV 导出、JSON 导入（预览+确认）、ZIP 完整备份/恢复、WebDAV 云备份 |
| **PWA** | 添加到手机桌面，独立窗口体验，离线友好页，安装提示。安装步骤见 [docs/PWA_INSTALL.md](./docs/PWA_INSTALL.md) |
| **AI 助手** | 文本智能识别订阅信息、月度消费总结（需自带 OpenAI 兼容 API Key） |
| **团队空间** | 家庭/团队工作空间，owner/admin/editor/viewer 四级权限 |
| **审计日志** | 管理员可查看所有关键操作记录 |
| **系统诊断** | 管理员诊断页：运行环境、Cron 状态、通知失败记录 |
| **多用户** | Better Auth 邮箱密码登录；管理员可在「设置 → 注册管理」临时打开注册，勾选常用邮箱域名或手动添加白名单 |
| **管理员** | 侧边栏「用户管理」直接增删账号、重置密码、封禁 |
| **双语界面** | 简体中文 / English 任意切换 |
| **多主题** | Emerald / Ocean / Sunset / Lavender / Rose 五套预设主题，配 Light/Dark 模式，自定义主题色支持 |

## 通知配置

支持 Telegram、邮件、企业微信机器人、Webhook、Bark、NotifyX、Server酱 Turbo 七种通知渠道。详细配置步骤见 [docs/NOTIFICATION_CHANNELS.md](./docs/NOTIFICATION_CHANNELS.md)。

通知策略支持按订阅、标签、分类设置独立渠道，主渠道失败可自动切换备用渠道。

## 应用结构

| 路由 | 用途 |
| --- | --- |
| `/` | 仪表盘：月度支出、活跃订阅数、即将续费、试用到期统计；预算使用率；下方是带筛选与排序的订阅网格/列表 |
| `/calendar` | 续费日历：按月查看续费事件，hover 查看金额 |
| `/cards` | 卡片管理：按付款方式分组聚合订阅 |
| `/notifications` | 通知中心：即将发送 + 历史任务（带钻取） |
| `/annual-report` | 年度财报：年度总花费、支付次数、同比变化、分类占比 |
| `/workspaces` | 工作空间管理：创建、切换、邀请成员、调整角色 |
| `/settings` | 系统设置：账号、外观、汇率、通知渠道、iCal 日历订阅、数据备份/导入/WebDAV、AI 配置 |
| `/admin/users` | 用户管理（admin only） |
| `/admin/diagnostics` | 系统诊断（admin only）：运行环境、Cron 状态、通知失败记录 |
| `/login` `/register` `/forgot-password` `/reset-password` | 认证流程 |

## 技术形态

| 包 | 说明 |
| --- | --- |
| [packages/client](./packages/client/) | Vite + React 19 + Tailwind 4 + shadcn/Radix SPA。统一 design system：5 级 elevation、surface/lift utility、Apple-style motion easing，中英双语 |
| [packages/server-ts](./packages/server-ts/) | TypeScript + Hono + Drizzle + Better Auth 后端，一份代码经两种 runtime 部署 |
| [runtimes/worker](./runtimes/worker/) | Cloudflare Workers + D1 + R2 + Cron Triggers + Workers Assets——免 VPS |
| [runtimes/node](./runtimes/node/) | Node + better-sqlite3 + nodemailer + node-cron——跑在自己的 VPS |
| [packages/shared](./packages/shared/) | 前后端共享的 zod schema 与领域工具 |
| [tools/pb-importer](./tools/pb-importer/) | 把旧版 Go + PocketBase 数据导入新 schema 的 CLI |

## Cloudflare Workers 部署（推荐）

只需要一个 Cloudflare 账号。整个应用跑在 Cloudflare 免费档（D1 + R2 + Workers + Cron Triggers + Workers Assets）。

### 路径 A：fork + GitHub Actions（无需本地命令行）

适合不想买 VPS、也不想本地装命令行的用户。fork 这个仓库后，全程在 GitHub 网页里完成部署。

1. 仓库 **Settings → Environments** 建一个 `cloudflare` environment，按 [docs/CF_GH_ACTIONS_DEPLOY.md §1](./docs/CF_GH_ACTIONS_DEPLOY.md#1-配置-github-secrets--variables) 配置必填 secret
2. **Actions** → 手动运行 **Cloudflare Bootstrap**（创建 D1 + R2，自动 commit `database_id` 回 `wrangler.toml`），随后 **Wrangler Deploy** 自动跑起来部署 worker

完整步骤、首次 admin 登录、绑域名和故障排查见 [docs/CF_GH_ACTIONS_DEPLOY.md](./docs/CF_GH_ACTIONS_DEPLOY.md)。

### 路径 B：本地 wrangler CLI

```bash
pnpm install -g wrangler@latest
wrangler login
```

然后照 [docs/WORKER_DEPLOY.md](./docs/WORKER_DEPLOY.md) 的清单依次：建 D1 + R2 → 填 secrets → 应用 D1 migrations → 构建前端 → `wrangler deploy` → 登录默认 admin。

## 首次登录（两种部署路径都一样）

部署完成后系统会检测数据库是否为空，如果为空就自动创建默认 admin 账号。用以下凭据登录，系统会**强制**你立即修改邮箱和密码：

```
邮箱：  admin@qreminder.local
密码：  Qreminder@2026
```

改完密码后默认凭据立即失效。后续如果想给其他人开放注册，进 **设置 → 注册管理** 打开开关并配置邮箱白名单即可，无需重启服务或重新部署。

## Node 自托管部署（Docker）

如果你有自己的 VPS，整个应用打成一个 Docker 镜像：v2 TS 后端 + 前端 SPA + SQLite + 内置 cron 调度器全在一个容器里。

```bash
mkdir -p qreminder && cd qreminder
curl -fsSL https://raw.githubusercontent.com/yzgolden86/Qreminder/main/runtimes/node/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/yzgolden86/Qreminder/main/runtimes/node/.env.example -o .env

# 编辑 .env：至少填好 BETTER_AUTH_SECRET 和 APP_URL
docker compose pull
docker compose up -d
```

镜像默认从 `ghcr.io/yzgolden86/qreminder:latest` 拉。完整步骤、首次 admin 登录、反向代理 + 自定义域名、备份与故障排查见 [docs/NODE_DOCKER_DEPLOY.md](./docs/NODE_DOCKER_DEPLOY.md)。

不想用 Docker，可以直接源码起：

```bash
git clone https://github.com/yzgolden86/Qreminder.git
cd Qreminder
pnpm install --frozen-lockfile
pnpm --filter @qreminder/client build
pnpm --filter @qreminder/runtime-node start
```

## 本地开发

```bash
pnpm install

# v2 TS 后端（Node runtime，监听 :3000）
pnpm --filter @qreminder/runtime-node dev

# 前端 SPA（http://localhost:5173，/api 代理到 :3000）
pnpm --filter @qreminder/client dev
```

提交前常用的检查：

```bash
pnpm -r typecheck
pnpm --filter @qreminder/client test
pnpm --filter @qreminder/client build
```

## 数据迁移（v1 → v2）

如果你在跑 v1 Go + PocketBase 版本，可以用 [tools/pb-importer](./tools/pb-importer/) 把旧数据导入 v2：

```bash
pnpm --filter @qreminder/pb-importer build
node tools/pb-importer/dist/cli.js \
  --pb /path/to/pb_data \
  --target sqlite:///data/qreminder.db \
  --fs /data/assets
```

工具不会删除源数据，迁移失败可重跑。

## 参与贡献

欢迎提交 issue、改进文档、补充测试或发起 pull request。提交变更前请运行相关的检查命令，并让文档、测试和实现保持同步。

如果你准备贡献较大的功能，建议先开 issue 说明目标、使用场景和大致方案，方便在实现前对齐方向。

## 友情链接

- [LINUX DO](https://linux.do/)：Qreminder 认可并感谢 LINUX DO 社区对开源项目交流的支持。

## 许可证

Qreminder 基于 [MIT License](LICENSE) 开源。Copyright © 2024-2026 yzgolden86。
