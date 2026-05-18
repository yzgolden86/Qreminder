# Qreminder

[简体中文](README.md) | [English](README.en.md)

Qreminder 是一个自托管的订阅管理工具。它把 SaaS、AI 工具、云服务和开发工具的价格、续费日、预算和提醒放到一起，适合个人、独立团队和家庭实验室使用。

<p align="center">
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-0f172a?style=flat-square">
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Hono%20%2B%20Drizzle-3178c6?style=flat-square">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat-square">
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-111827?style=flat-square">
</p>

<p align="center">
  <img src="./docs/screenshots/renewlet-dashboard-zh.png" alt="Qreminder 中文仪表盘，展示 20 条开发者订阅、月度支出、近期续费和支出分布" width="100%">
</p>

<p align="center">
  <sub>截图使用 20 条面向开发者的真实服务公开定价演示数据（价格快照：2026-05-17），实际价格可能随官方页面、地区、税费和计费周期调整。</sub>
</p>

<p align="center"><strong>订阅网格</strong></p>

<p align="center">
  <img src="./docs/screenshots/renewlet-subscriptions-zh.png" alt="Qreminder 中文订阅网格，包含筛选、标签、续费状态和服务 Logo" width="100%">
</p>

<p align="center"><strong>统计分析</strong></p>

<p align="center">
  <img src="./docs/screenshots/renewlet-statistics-zh.png" alt="Qreminder 中文统计视图，展示分类支出、付款方式和预算图表" width="100%">
</p>

<p align="center"><strong>续费日历</strong></p>

<p align="center">
  <img src="./docs/screenshots/renewlet-calendar-zh.png" alt="Qreminder 中文续费日历，展示开发者订阅的月度续费事件和预计支出" width="100%">
</p>

<p align="center"><strong>通知方式</strong></p>

<p align="center">
  <img src="./docs/screenshots/renewlet-notifications-zh.png" alt="Qreminder 中文通知设置，展示通知方式列表和邮件通知配置面板" width="100%">
</p>

## 项目简介

如果你同时订了很多工具，Qreminder 可以帮你把它们记清楚：谁什么时候扣费、每月大概花多少、哪些快到期、通知要发到哪里。你可以记录价格、币种、扣费周期、续费日期、付款方式、标签、网站和备注，再用仪表盘、日历和统计页看整体支出。

技术形态：

- `packages/client`：Vite + React 19 单页应用，使用 Tailwind 4 + shadcn/Radix，仪表盘与订阅列表已合并为单页（Mock A），中英文双语。
- `packages/server-ts`：TypeScript + Hono + Drizzle + Better Auth 后端，同一份代码经由两个运行时部署：
  - [runtimes/worker](./runtimes/worker/)：Cloudflare Workers + D1 + R2 + Cron Triggers + Workers Assets，无需 VPS。
  - [runtimes/node](./runtimes/node/)：Node + better-sqlite3 + nodemailer + node-cron（实验中，可在自有 VPS 跑）。
- `packages/shared`：前后端共享的 zod schema 与领域工具。
- `tools/pb-importer`：把旧的 Go + PocketBase 数据导入新 schema 的迁移 CLI。
- `packages/server`：上一代 Go + PocketBase 后端，已进入维护模式（详见末尾的"传统 Docker 部署（v1）"一节）。

部署主推 Cloudflare Workers，并提供两条路径：fork 仓库后用 GitHub Actions 全程网页操作（推荐），或本地装 wrangler CLI 自己跑命令。

## 功能特性

- 记录订阅：保存名称、Logo、价格、币种、扣费周期、状态、分类、付款方式、网站、标签和备注。
- 多档提醒：每条订阅独立配置 `reminderOffsets`，支持 `[7, 3, 1]` 这类多档（最大 365 天，单调递减）；同日命中的订阅合并为一封邮件，避免轰炸。
- 多渠道通知：Workers 上走 Resend HTTP API；Node 自托管模式走 SMTP / Telegram / Notifyx / Webhook / 企业微信机器人 / Bark 等渠道。
- 看支出：把不同周期折算成月度成本，展示预算使用、分类占比、付款方式占比、停用订阅节省。
- 多币种：可选 Frankfurter 或 FloatRates 汇率源；远端不可用时使用备用汇率。
- 多用户：基于 Better Auth 的邮箱密码登录；管理员可在「设置 → 注册」临时打开注册并配置邮箱白名单（支持 `*@example.com` 通配）。
- 双语界面：应用内简体中文 / English 任意切换。

## Cloudflare Workers 部署（推荐）

只需要一个 Cloudflare 账号 + 一个 Resend 账号，整个应用跑在 Cloudflare 免费档（D1 + R2 + Workers + Cron Triggers + Workers Assets）。

### 路径 A：fork + GitHub Actions（不需要本地装 wrangler）

适合不想买 VPS、也不想本地装命令行的用户。fork 这个仓库后，全程在 GitHub 网页里点鼠标完成部署。

整体两步：

1. 仓库 Settings → Environments 建一个 `cloudflare` environment，按 [docs/CF_GH_ACTIONS_DEPLOY.md §1](./docs/CF_GH_ACTIONS_DEPLOY.md#1-配置-github-secrets--variables) 配 6 个必填 secret（Cloudflare API token / account id / Better Auth secret / app url / Resend api key + 发件人）。
2. Actions → 手动 Run **Cloudflare Bootstrap**（创建 D1 + R2，自动 commit `database_id` 回 `wrangler.toml`），等它完成后 **Wrangler Deploy** 会自动跑起来部署 worker。

完整步骤、第一个 admin 注册、绑域名和故障排查见 [docs/CF_GH_ACTIONS_DEPLOY.md](./docs/CF_GH_ACTIONS_DEPLOY.md)。

### 路径 B：本地 wrangler CLI

如果你已经装了 wrangler、习惯命令行，或者要在本地调试 workflow 之前先跑一遍：

```bash
pnpm install -g wrangler@latest
wrangler login
```

然后照 [docs/WORKER_DEPLOY.md](./docs/WORKER_DEPLOY.md) 的清单依次：创建 D1 + R2 → 填 secrets → 应用 D1 migrations → 构建前端 → `wrangler deploy` → 注册第一个 admin。整体大约 15 分钟（不含 Resend 域名验证传播时间）。

## Node 自托管部署（Docker）

如果你有自己的 VPS，整个应用打成一个 Docker 镜像跑：v2 TS 后端 + 前端 SPA + SQLite + 内置 cron 调度器全在一个容器里。

```bash
mkdir -p qreminder && cd qreminder
curl -fsSL https://raw.githubusercontent.com/yzgolden86/Qreminder/main/runtimes/node/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/yzgolden86/Qreminder/main/runtimes/node/.env.example -o .env

# 编辑 .env，至少填好 BETTER_AUTH_SECRET 和 APP_URL
docker compose pull
docker compose up -d
```

镜像默认从 `ghcr.io/yzgolden86/qreminder:latest` 拉。完整步骤、注册第一个 admin、反向代理 + 自定义域名、备份和故障排查见 [docs/NODE_DOCKER_DEPLOY.md](./docs/NODE_DOCKER_DEPLOY.md)。

如果不想用 Docker，可以直接源码起：

```bash
git clone https://github.com/yzgolden86/Qreminder.git
cd Qreminder
pnpm install --frozen-lockfile
pnpm --filter @qreminder/client build
pnpm --filter @qreminder/runtime-node start
```

## 本地开发

安装依赖：

```bash
pnpm install
```

启动 v2 TS 后端（Node 运行时）：

```bash
pnpm --filter @qreminder/runtime-node dev
```

启动前端（默认 `http://localhost:5173`，把 `/api` 代理到 `http://127.0.0.1:3000`）：

```bash
pnpm --filter @qreminder/client dev
```

## 验证

常用检查命令：

```bash
pnpm -r typecheck
pnpm --filter @qreminder/client test
pnpm --filter @qreminder/client build
pnpm --filter @qreminder/server test
```

## 数据迁移（v1 → v2）

如果你已经在跑 v1 Go + PocketBase 版本，可以用 [tools/pb-importer](./tools/pb-importer/) 把旧数据导入 v2：

```bash
pnpm --filter @qreminder/pb-importer build
node tools/pb-importer/dist/cli.js \
  --pb /path/to/pb_data \
  --target sqlite:///data/qreminder.db \
  --fs /data/assets
```

工具不会删除源数据，迁移失败可重跑。完整字段映射与回滚说明见 [docs/v2-proposal.md §8](./docs/v2-proposal.md#8-数据迁移工具pb-importer)。

## 参与贡献

欢迎提交 issue、改进文档、补充测试或发起 pull request。提交变更前，请尽量运行和改动相关的检查命令，并让文档、测试和实现保持同步。

如果你准备贡献较大的功能，建议先开 issue 说明目标、使用场景和大致方案，方便在实现前对齐方向。

## 友情链接

- [LINUX DO](https://linux.do/)：Qreminder 认可并感谢 LINUX DO 社区对开源项目交流的支持。

## 许可证

Qreminder 基于 [MIT License](LICENSE) 开源。
