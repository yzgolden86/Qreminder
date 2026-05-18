# Renewlet

[简体中文](README.md) | [English](README.en.md)

Renewlet is a self-hosted subscription manager. It puts the prices, renewal dates, budgets, and reminders for SaaS, AI tools, cloud services, and developer tools in one place. It works for individuals, indie teams, and home labs.

<p align="center">
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-0f172a?style=flat-square">
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Hono%20%2B%20Drizzle-3178c6?style=flat-square">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat-square">
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-111827?style=flat-square">
</p>

<p align="center">
  <img src="./docs/screenshots/renewlet-dashboard-en.png" alt="Renewlet English dashboard, showing 20 developer subscriptions with monthly spend, upcoming renewals, and category breakdown" width="100%">
</p>

<p align="center">
  <sub>Screenshots use 20 developer-focused services with public pricing as demo data (price snapshot: 2026-05-17). Real prices may change with vendor pages, region, taxes, and billing cycles.</sub>
</p>

<p align="center"><strong>Subscription Grid</strong></p>

<p align="center">
  <img src="./docs/screenshots/renewlet-subscriptions-en.png" alt="Renewlet English subscription grid with filters, tags, renewal status, and service logos" width="100%">
</p>

<p align="center"><strong>Statistics</strong></p>

<p align="center">
  <img src="./docs/screenshots/renewlet-statistics-en.png" alt="Renewlet English statistics view with category spend, payment methods, and budget charts" width="100%">
</p>

<p align="center"><strong>Renewal Calendar</strong></p>

<p align="center">
  <img src="./docs/screenshots/renewlet-calendar-en.png" alt="Renewlet English renewal calendar showing monthly renewal events and projected spend for developer subscriptions" width="100%">
</p>

<p align="center"><strong>Notifications</strong></p>

<p align="center">
  <img src="./docs/screenshots/renewlet-notifications-en.png" alt="Renewlet English notification settings with notification methods list and email notification configuration panel" width="100%">
</p>

## Overview

If you subscribe to lots of tools, Renewlet keeps the receipts: who charges you when, how much you spend per month, what's about to renew, and where reminders should go. You record price, currency, billing cycle, renewal date, payment method, tags, website, and notes — and then look at the dashboard, calendar, and statistics pages to see the whole picture.

Tech stack:

- `packages/client`: Vite + React 19 SPA, Tailwind 4 + shadcn/Radix, dashboard and subscription list merged into one page (Mock A), bilingual (zh-CN / en).
- `packages/server-ts`: TypeScript + Hono + Drizzle + Better Auth backend. The same code runs in two runtimes:
  - [runtimes/worker](./runtimes/worker/): Cloudflare Workers + D1 + R2 + Cron Triggers + Workers Assets — no VPS required.
  - [runtimes/node](./runtimes/node/): Node + better-sqlite3 + nodemailer + node-cron (experimental, runs on your own VPS).
- `packages/shared`: zod schemas and domain helpers shared between client and server.
- `tools/pb-importer`: CLI that imports legacy Go + PocketBase data into the new schema.
- `packages/server`: previous-generation Go + PocketBase backend, now in maintenance mode (see "Legacy Docker deployment (v1)" at the bottom).

The recommended deployment target is Cloudflare Workers. There are two paths: fork the repo and run everything from the GitHub web UI (recommended), or install wrangler CLI locally and run the commands yourself.

## Features

- Track subscriptions: name, logo, price, currency, billing cycle, status, category, payment method, website, tags, and notes.
- Multi-tier reminders: each subscription has its own `reminderOffsets` array like `[7, 3, 1]` (up to 365 days, monotonically decreasing). Subscriptions hit on the same day are merged into a single email so users don't get spammed.
- Multi-channel notifications: Workers mode uses Resend HTTP API; Node mode supports SMTP / Telegram / Notifyx / Webhook / WeCom Bot / Bark.
- Spending insights: normalize different billing cycles to monthly cost, show budget usage, category breakdown, payment-method breakdown, and savings from inactive subscriptions.
- Multiple currencies: Frankfurter or FloatRates as exchange-rate source, with fallback rates if remote sources fail.
- Multi-user: Better Auth with email/password sign-in. Admins can temporarily open signup and configure an email allowlist (supports `*@example.com` wildcards) under Settings → Signup.
- Bilingual UI: Simplified Chinese and English, switchable in app.

## Cloudflare Workers Deployment (recommended)

You only need a Cloudflare account and a Resend account. The whole app runs on Cloudflare's free tier (D1 + R2 + Workers + Cron Triggers + Workers Assets).

### Path A: fork + GitHub Actions (no local wrangler required)

For users who don't want a VPS and don't want to install CLI tools. Fork the repo and run the entire deployment from the GitHub web UI.

Two steps:

1. In your fork, go to Settings → Environments and create an environment named `cloudflare`. Add the 6 required secrets per [docs/CF_GH_ACTIONS_DEPLOY.md §1](./docs/CF_GH_ACTIONS_DEPLOY.md#1-配置-github-secrets--variables) (Cloudflare API token / account id / Better Auth secret / app url / Resend api key + sender).
2. Actions → manually Run **Cloudflare Bootstrap** (creates D1 + R2, auto-commits the `database_id` back to `wrangler.toml`). When it finishes, **Wrangler Deploy** runs automatically and ships the worker.

See [docs/CF_GH_ACTIONS_DEPLOY.md](./docs/CF_GH_ACTIONS_DEPLOY.md) for the full walkthrough, first-admin signup, custom domain, and troubleshooting.

### Path B: local wrangler CLI

If you already have wrangler installed, prefer the command line, or want to test the workflow locally first:

```bash
pnpm install -g wrangler@latest
wrangler login
```

Then follow [docs/WORKER_DEPLOY.md](./docs/WORKER_DEPLOY.md) step by step: create D1 + R2 → set secrets → apply D1 migrations → build the client → `wrangler deploy` → register the first admin. About 15 minutes total (excluding Resend domain verification propagation time).

## Node Self-Hosted Deployment (experimental)

If you have your own VPS and want to run the v2 TypeScript backend on Node + SQLite instead of Cloudflare:

```bash
git clone https://github.com/yzgolden86/Qreminder.git
cd Qreminder
pnpm install --frozen-lockfile
pnpm --filter @renewlet/client build
pnpm --filter @renewlet/runtime-node start
```

Environment variables, see [runtimes/node/src/index.ts](./runtimes/node/src/index.ts). Key ones:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Listen port. |
| `DATABASE_PATH` | `./data/renewlet.db` | SQLite file path. |
| `ASSETS_DIR` | `./data/assets` | Logo and asset storage directory. |
| `BETTER_AUTH_SECRET` | (required) | 32+ char random string. Generate with `openssl rand -hex 32`. |
| `APP_URL` | `http://localhost:3000` | Public URL for email links and cookie domain. |
| `TRUSTED_ORIGINS` | empty | Better Auth cookie origin allowlist. Comma-separated. |
| `SIGNUP_ENABLED` | `false` | Set to `true` only when registering the first admin, then back to `false`. |
| `SIGNUP_ALLOWLIST` | empty | Email signup allowlist (effective only when `SIGNUP_ENABLED=true`). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | empty | Configure to enable password reset and renewal reminder email. |
| `NOTIFICATION_SCHEDULER_ENABLED` | `true` | Whether to enable the built-in node-cron scheduler. |
| `NOTIFICATION_SCHEDULER_CRON` | `* * * * *` | Cron expression for the scheduler. |

> The Node runtime doesn't have a dedicated Docker image or compose template yet. PRs welcome — see [runtimes/node/Dockerfile](./runtimes/node/Dockerfile).

## Local Development

Install dependencies:

```bash
pnpm install
```

Start the v2 TS backend (Node runtime):

```bash
pnpm --filter @renewlet/runtime-node dev
```

Start the client (defaults to `http://localhost:5173`, proxies `/api` to `http://127.0.0.1:3000`):

```bash
pnpm --filter @renewlet/client dev
```

## Verification

Common checks:

```bash
pnpm -r typecheck
pnpm --filter @renewlet/client test
pnpm --filter @renewlet/client build
pnpm --filter @renewlet/server-ts test
```

## Data Migration (v1 → v2)

If you're already on v1 (Go + PocketBase), use [tools/pb-importer](./tools/pb-importer/) to import the old data into v2:

```bash
pnpm --filter @renewlet/pb-importer build
node tools/pb-importer/dist/cli.js \
  --pb /path/to/pb_data \
  --target sqlite:///data/renewlet.db \
  --fs /data/assets
```

The tool doesn't delete the source — failed runs are safe to retry. Full field mapping and rollback notes in [docs/v2-proposal.md §8](./docs/v2-proposal.md#8-数据迁移工具pb-importer).

## Contributing

Issues, doc improvements, tests, and pull requests are welcome. Before submitting changes, please run the relevant checks and keep docs, tests, and implementation in sync.

For larger features, please open an issue first to align on goals, use cases, and approach before implementing.

## Friendly Links

- [LINUX DO](https://linux.do/): Renewlet appreciates the LINUX DO community for fostering open-source discussion.

## License

Renewlet is open-sourced under the [MIT License](LICENSE).

---

## Legacy Docker Deployment (v1, maintenance mode)

> ⚠️ **Maintenance mode**: the v1 Go + PocketBase path still runs, but **the frontend has been entirely migrated to v2 Better Auth + the new API**. New features (multi-tier reminders `reminderOffsets`, the Mock A merged dashboard, etc.) are available only on the v2 backend. **For new deployments, use the Cloudflare Workers path above**; this section exists for backward compatibility with users already running v1.

Full documentation in [docs/DOCKER_DEPLOY.md](./docs/DOCKER_DEPLOY.md). Quick start:

```bash
mkdir -p renewlet && cd renewlet
curl -fsSL https://raw.githubusercontent.com/yzgolden86/Qreminder/main/deploy/docker-deploy.sh | bash
docker compose up -d
```

After first startup, open `http://localhost:3000/setup` to create the PocketBase superuser. Existing v1 users keep these env vars (see `deploy/env.example`): `PB_ENCRYPTION_KEY` / `SMTP_HOST` / `BACKUPS_CRON` / `NOTIFICATION_SCHEDULER_ENABLED` / `CRON_SECRET` and so on.
