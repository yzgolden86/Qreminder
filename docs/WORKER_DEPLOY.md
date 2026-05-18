# Cloudflare Workers 部署指南

> 状态：v2 双部署形态之一。Docker 部署见 [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md) / 仓库根 README。

## 0. 前置依赖

- 一个 Cloudflare 账号（D1 / R2 / Workers 已开通）
- 本机安装 [`wrangler`](https://developers.cloudflare.com/workers/wrangler/install-and-update/) 4 + Node 22 + pnpm 11
- 一个用于发件的 [Resend](https://resend.com) 账号（拿到 API Key 和已验证发件人）

## 1. 一次性资源创建

```bash
# 创建 D1 数据库（记录返回的 database_id）
wrangler d1 create renewlet

# 创建 R2 存储桶
wrangler r2 bucket create renewlet-assets
```

把 `database_id` 填到 `runtimes/worker/wrangler.toml` 的 `d1_databases[].database_id`，覆盖占位的 `REPLACE_ME_AFTER_wrangler_d1_create`。

## 2. 配置 secrets

Worker 启动时从 env 读取以下 secret，需要逐项设置：

```bash
cd runtimes/worker

wrangler secret put BETTER_AUTH_SECRET   # 任意 32+ 位随机字符串
wrangler secret put APP_URL              # 例如 https://renewlet.your-domain.com
wrangler secret put RESEND_API_KEY       # Resend 控制台拿到的 API Key
wrangler secret put RESEND_FROM          # 已验证发件人，例如 noreply@your-domain.com
```

> Better Auth 的 `sendResetPassword` 会用 `RESEND_FROM` 作为发件地址，没有验证过的发件人会被 Resend 拒收。

## 3. 应用 Drizzle migrations

`packages/server-ts/drizzle/` 是单一 schema 真源；wrangler 通过 `wrangler.toml` 里的 `migrations_dir` 字段读到它，无需重复维护一份。

首次部署 / 后续 schema 变更：

```bash
cd runtimes/worker

# 远程 D1（生产）
wrangler d1 migrations apply RENEWLET_DB --remote

# 本地 D1（dev/preview）
wrangler d1 migrations apply RENEWLET_DB --local
```

如果你改了 `packages/server-ts/src/db/schema.ts`，先在 `packages/server-ts` 里跑一次：

```bash
pnpm --filter @renewlet/server db:generate
```

会在 `packages/server-ts/drizzle/` 下生成新的 `NNNN_*.sql` 与 `meta/NNNN_snapshot.json`，commit 后 wrangler 即可识别为新增 migration。

## 4. 构建 + 部署

```bash
# 1. 构建前端（产物落到 packages/client/dist，被 worker 通过 [assets] 静态托管）
pnpm --filter @renewlet/client build

# 2. 部署 worker（fetch + scheduled handler）
cd runtimes/worker
wrangler deploy
```

Worker 同时挂着 `* * * * *` 的 Cron Trigger，每分钟跑一次 `runNotificationCron`。

## 5. CI 自动化

仓库已包含 [.github/workflows/wrangler-deploy.yml](../.github/workflows/wrangler-deploy.yml)，会在 push 到 `main` 且涉及 server / worker / client 时：

1. 安装依赖
2. 构建前端
3. typecheck server-ts + worker
4. `wrangler d1 migrations apply --remote`
5. `wrangler deploy`

需要在 repo settings 配置以下 secrets：

| Secret | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 至少有 `Account.D1:Edit`、`Account.Workers Scripts:Edit`、`Account.Workers R2 Storage:Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 控制台 → 任一 worker 详情页可见 |

## 6. 创建第一个超级管理员

Worker 部署成功后，registration 默认关闭，需要手动种入第一个 admin：

```bash
# 在本地连接到远程 D1，临时打开注册（仅一次）
# 或者直接通过 wrangler d1 execute 写入：
wrangler d1 execute RENEWLET_DB --remote --command \
  "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

> 注册后才能 promote。先到 `<APP_URL>/setup`（或临时 `signupEnabled=true` 的 settings）注册一个普通用户，再用上面的 SQL 把他改成 admin。

## 7. 故障排查

| 现象 | 排查点 |
| --- | --- |
| 401 反复出现 | 检查 `APP_URL` 和实际访问域是否一致；Better Auth cookie 用 baseURL 决定 domain |
| 重置密码邮件没收到 | 检查 `RESEND_FROM` 是否已在 Resend 验证；`wrangler tail` 看是否有 mailer 抛错 |
| 新表没建出来 | `wrangler d1 migrations list RENEWLET_DB --remote` 看 journal 状态 |
| 通知 cron 没跑 | `wrangler tail` 看 `[cron] tick` 是否每分钟出现；并检查 `notificationTimeLocal` 设置 |
