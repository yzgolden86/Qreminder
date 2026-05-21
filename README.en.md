# Qreminder

[简体中文](README.md) | [English](README.en.md)

Qreminder is a self-hosted subscription manager. It puts the prices, renewal dates, budgets, and reminders for SaaS, AI tools, cloud services, and developer tools in one place. Works for individuals, indie teams, and home labs.

<p align="center">
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-0f172a?style=flat-square">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Hono%20%2B%20Drizzle-3178c6?style=flat-square">
  <img alt="Tailwind 4" src="https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat-square">
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-111827?style=flat-square">
</p>

> Screenshots are being refreshed to match the 2026-05 visual redesign. Images under `docs/screenshots/` show the previous layout and are illustrative only; the sections below describe the current UI and feature set.

## What is it

If you subscribe to lots of tools, Qreminder keeps the receipts:

- **Who charges you when** — multi-tier reminders (e.g. `[7, 3, 1]` days), same-day hits coalesced into a single email
- **How much you spend** — different cycles normalized to monthly cost, then broken down by category and payment method
- **What's about to renew** — renewal calendar + trial-end glow + dashboard top-N renewal list
- **Where reminders go** — dedicated notification center with per-recipient drill-down

Self-hosted: your subscription data only lives in the instance you deploy. Nothing is reported to third parties.

## Features

| Area | Capabilities |
| --- | --- |
| **Subscription record** | Name, logo, price, currency, billing cycle (weekly/monthly/quarterly/semi-annual/annual/custom days), status (trial/active/paused/cancelled), category, payment method (including **Free**), website, tags, notes |
| **Multi-tier reminders** | Per-subscription `reminderOffsets`; same-day matches merged into one email |
| **Notification channels** | Workers uses Resend HTTP API; Node self-hosted supports SMTP, Telegram, Notifyx, Webhook, WeCom Bot, Bark |
| **Notification center** | Dedicated page combining upcoming batches + dispatch history, filterable by status, drillable into per-recipient results |
| **Spending insights** | Normalize cycles to monthly cost; category share, payment-method share, billing-cycle distribution, renewal/monthly top 5 |
| **Multi-currency** | Frankfurter or FloatRates; fallback rates when remote sources fail |
| **Multi-user** | Better Auth email/password sign-in; admins can open signup under Settings → Registration, with quick-toggle checkboxes for 12 common providers (Gmail / Outlook / QQ / 163 / iCloud / Proton …) or manual allowlist entries |
| **Admin tools** | Sidebar "Users" entry lets admins create, delete, reset passwords, ban accounts |
| **Bilingual** | Simplified Chinese / English, switchable in-app |
| **Theming** | Five preset themes (Emerald / Ocean / Sunset / Lavender / Rose) with light/dark mode, plus custom-color support |

## App structure

| Route | Purpose |
| --- | --- |
| `/` | Dashboard: monthly spend, active subs, upcoming renewals, trial counts; below is the filterable/sortable subscription grid/list |
| `/calendar` | Renewal calendar: month view of renewal events, hover for amount |
| `/cards` | Cards: subscriptions grouped by payment method |
| `/notifications` | Notification center: upcoming + history with drill-down |
| `/settings` | System settings: account, appearance, exchange rates, notification channels, signup config, custom config |
| `/admin/users` | User management (admin only) |
| `/login` `/register` `/forgot-password` `/reset-password` | Auth flows |

## Stack

| Package | Description |
| --- | --- |
| [packages/client](./packages/client/) | Vite + React 19 + Tailwind 4 + shadcn/Radix SPA. Unified design system: 5-step elevation scale, surface/lift utilities, Apple-style motion easing. Bilingual zh-CN / en |
| [packages/server-ts](./packages/server-ts/) | TypeScript + Hono + Drizzle + Better Auth backend; one codebase, two runtimes |
| [runtimes/worker](./runtimes/worker/) | Cloudflare Workers + D1 + R2 + Cron Triggers + Workers Assets — no VPS |
| [runtimes/node](./runtimes/node/) | Node + better-sqlite3 + nodemailer + node-cron — your own VPS (experimental) |
| [packages/shared](./packages/shared/) | zod schemas and domain helpers shared between client and server |
| [tools/pb-importer](./tools/pb-importer/) | CLI that imports legacy Go + PocketBase data into the new schema |
| [packages/server](./packages/server/) | Previous-generation Go + PocketBase backend, maintenance mode (see legacy section) |

## Cloudflare Workers deployment (recommended)

You only need a Cloudflare account and a Resend account. The whole app runs on Cloudflare's free tier (D1 + R2 + Workers + Cron Triggers + Workers Assets).

### Path A: fork + GitHub Actions (no local CLI required)

For users who don't want a VPS or local tooling. Fork the repo and run everything from the GitHub web UI.

1. In your fork: **Settings → Environments** → create an environment named `cloudflare`, add the 6 required secrets per [docs/CF_GH_ACTIONS_DEPLOY.md §1](./docs/CF_GH_ACTIONS_DEPLOY.md#1-配置-github-secrets--variables) (Cloudflare API token, account id, Better Auth secret, APP_URL, Resend API key + sender)
2. **Actions** → manually run **Cloudflare Bootstrap** (creates D1 + R2, auto-commits `database_id` back to `wrangler.toml`). When it finishes, **Wrangler Deploy** runs automatically and ships the worker

See [docs/CF_GH_ACTIONS_DEPLOY.md](./docs/CF_GH_ACTIONS_DEPLOY.md) for the full walkthrough, first-login, custom domain, and troubleshooting.

### Path B: local wrangler CLI

```bash
pnpm install -g wrangler@latest
wrangler login
```

Then follow [docs/WORKER_DEPLOY.md](./docs/WORKER_DEPLOY.md) step by step: create D1 + R2 → set secrets → apply D1 migrations → build the client → `wrangler deploy` → log in as default admin. About 15 minutes total (excluding Resend domain verification propagation).

### First login

After deployment, sign in with the default credentials. The system will force a password change on first login:

```
Email:    admin@qreminder.local
Password: Qreminder@2026
```

## Node self-hosted (Docker)

If you have a VPS, run the whole app in a single Docker container: v2 TS backend + frontend SPA + SQLite + built-in cron scheduler.

```bash
mkdir -p qreminder && cd qreminder
curl -fsSL https://raw.githubusercontent.com/yzgolden86/Qreminder/main/runtimes/node/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/yzgolden86/Qreminder/main/runtimes/node/.env.example -o .env

# Edit .env — at minimum set BETTER_AUTH_SECRET and APP_URL
docker compose pull
docker compose up -d
```

The image defaults to `ghcr.io/yzgolden86/qreminder:latest`. Full walkthrough — first-login, reverse proxy, custom domain, backup, troubleshooting — see [docs/NODE_DOCKER_DEPLOY.md](./docs/NODE_DOCKER_DEPLOY.md).

Without Docker, run from source:

```bash
git clone https://github.com/yzgolden86/Qreminder.git
cd Qreminder
pnpm install --frozen-lockfile
pnpm --filter @qreminder/client build
pnpm --filter @qreminder/runtime-node start
```

## Local development

```bash
pnpm install

# v2 TS backend (Node runtime, listens on :3000)
pnpm --filter @qreminder/runtime-node dev

# Frontend SPA (http://localhost:5173, /api proxied to :3000)
pnpm --filter @qreminder/client dev
```

Pre-submit checks:

```bash
pnpm -r typecheck
pnpm --filter @qreminder/client test
pnpm --filter @qreminder/client build
pnpm --filter @qreminder/server test
```

## Data migration (v1 → v2)

If you're already on v1 (Go + PocketBase), use [tools/pb-importer](./tools/pb-importer/) to import the old data into v2:

```bash
pnpm --filter @qreminder/pb-importer build
node tools/pb-importer/dist/cli.js \
  --pb /path/to/pb_data \
  --target sqlite:///data/qreminder.db \
  --fs /data/assets
```

The tool doesn't delete the source — failed runs are safe to retry. Full field mapping and rollback notes in [docs/v2-proposal.md §8](./docs/v2-proposal.md#8-数据迁移工具pb-importer).

## Contributing

Issues, doc improvements, tests, and pull requests are welcome. Before submitting changes, please run the relevant checks and keep docs, tests, and implementation in sync.

For larger features, please open an issue first to align on goals, use cases, and approach before implementing.

## Friendly links

- [LINUX DO](https://linux.do/) — Qreminder appreciates the LINUX DO community for fostering open-source discussion.

## License

Qreminder is open-sourced under the [MIT License](LICENSE). Copyright © 2026 yzgolden86.
