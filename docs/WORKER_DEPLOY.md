# Cloudflare Workers 部署指南（本地 wrangler CLI）

> 状态：v2 部署形态之一，假设你在本地用 wrangler CLI 操作。
>
> 如果你 fork 了仓库、想全程在 GitHub 网页里点鼠标完成部署（不本地装 wrangler），改看 [CF_GH_ACTIONS_DEPLOY.md](CF_GH_ACTIONS_DEPLOY.md)。
>
> 如果你在跑上一代 v1 Go + PocketBase Docker 部署，见 [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md)。

完成所有步骤大概需要 15 分钟（不含 R2 / Resend 域名验证传播时间）。每条命令都假定在仓库根目录跑，除非另注。

## 0. 前置依赖

- 一个 Cloudflare 账号（D1 / R2 / Workers 已开通，免费档够用）
- 本机安装 [wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) 4 + Node 22 + pnpm 11
- 一个用于发件的 [Resend](https://resend.com) 账号（拿到 API Key 和已验证发件人）

```bash
# 装/升 wrangler 到 4.x
pnpm install -g wrangler@latest

# 登录你的 Cloudflare 账号（浏览器弹窗）
wrangler login

# 确认本机 Node ≥ 22.13、pnpm ≥ 11
node -v
pnpm -v
```

## 1. 创建 D1 + R2 资源

```bash
# 创建 D1，记下输出里的 database_id
wrangler d1 create qreminder

# 创建 R2 存储桶
wrangler r2 bucket create qreminder-assets
```

把上一步的 `database_id` 填进 [runtimes/worker/wrangler.toml](../runtimes/worker/wrangler.toml) 的 `d1_databases[].database_id`，覆盖占位的 `REPLACE_ME_AFTER_wrangler_d1_create`。

## 2. 配置 secrets

Worker 启动时从 env 读取以下 secret，需要逐项设置：

```bash
cd runtimes/worker

# 32+ 位随机串；可以用 `openssl rand -hex 32` 生成
wrangler secret put BETTER_AUTH_SECRET

# 部署后 worker 对外的完整 URL（带 https，不带尾斜杠）
# 例：https://qreminder.your-domain.com  或  https://qreminder.your-subdomain.workers.dev
wrangler secret put APP_URL

# Resend 控制台拿到的 API Key
wrangler secret put RESEND_API_KEY

# 已在 Resend 验证过的发件人，例如 noreply@your-domain.com
wrangler secret put RESEND_FROM
```

> Better Auth 的 `sendResetPassword` 会用 `RESEND_FROM` 作为发件地址，没有验证过的发件人会被 Resend 拒收。

## 3. 临时打开注册（仅一次）

第一次上线时数据库是空的，需要注册第一个 admin。修改 [runtimes/worker/wrangler.toml](../runtimes/worker/wrangler.toml) 的 `[vars]`：

```toml
[vars]
SIGNUP_ENABLED = "true"          # 部署完成 + 注册完成后改回 "false"
SIGNUP_ALLOWLIST = "you@example.com"
TRUSTED_ORIGINS = "https://qreminder.your-domain.com"
```

> `SIGNUP_ALLOWLIST` 留空时任何邮箱都能注册（仅在 `SIGNUP_ENABLED=true` 时生效），填了就只放白名单内的邮箱。
> `TRUSTED_ORIGINS` 是 Better Auth 的 cookie 域允许列表，必须包含 `APP_URL` 的 origin。

## 4. 应用 D1 schema

`packages/server-ts/drizzle/` 是单一 schema 真源；wrangler 通过 `wrangler.toml` 里的 `migrations_dir` 字段读到它，无需重复维护一份。

```bash
# 仍在 runtimes/worker 目录

# 远程 D1（生产）
wrangler d1 migrations apply QREMINDER_DB --remote

# 本地 D1（dev/preview）
wrangler d1 migrations apply QREMINDER_DB --local
```

如果 `packages/server-ts/src/db/schema.ts` 有改动，先在 `packages/server-ts` 里跑一次：

```bash
pnpm --filter @qreminder/server db:generate
```

会在 `packages/server-ts/drizzle/` 下生成新的 `NNNN_*.sql` 与 `meta/NNNN_snapshot.json`，commit 后 wrangler 即可识别为新增 migration。

## 5. 构建前端 + 部署 worker

```bash
cd ../..
pnpm install --frozen-lockfile
pnpm --filter @qreminder/client build

cd runtimes/worker
wrangler deploy
```

部署成功后控制台会输出 worker URL，访问应该能看到登录页。Worker 同时挂着 `* * * * *` 的 Cron Trigger，每分钟跑一次 `runNotificationCron`。

## 6. 注册第一个 admin

打开 worker URL，走 `/login` 页面下方"注册"链接（或直接 POST `/api/auth/sign-up/email`）：

```bash
# 用 SIGNUP_ALLOWLIST 里的邮箱
curl -X POST https://qreminder.your-domain.com/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password1234","name":"You"}'
```

把它升级成 admin：

```bash
wrangler d1 execute QREMINDER_DB --remote --command \
  "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

## 7. 关闭注册

把 [runtimes/worker/wrangler.toml](../runtimes/worker/wrangler.toml) 里的 `SIGNUP_ENABLED` 改回 `"false"`，再 deploy 一次：

```bash
wrangler deploy
```

## 8. 烟测

按 [E2E_SMOKE_STATUS.md §3](E2E_SMOKE_STATUS.md#3-烟测应覆盖的最小路径) 的最小路径走一遍：

1. `/login` 登入
2. 添加一条月付订阅，reminderOffsets 填 `[7, 3, 1]`
3. 把 `notificationTimeLocal` 改到当前时间附近，等下一分钟看有没有提醒邮件（用 `wrangler tail` 看 cron tick / mailer 调用）
4. `/admin/users` 创建一个普通用户、ban / unban、改密码
5. `/forgot-password` 发一封重置邮件，从邮件链接进 `/reset-password` 设新密码

## 9. 域名（可选）

绑自定义域名两种方式：

- Cloudflare 控制台 → Workers → 你的 worker → Settings → Triggers → Custom Domains 添加
- 或在 [runtimes/worker/wrangler.toml](../runtimes/worker/wrangler.toml) 加 `[[routes]]` 段并 commit

绑完之后必须更新 secret 和 vars：

```bash
wrangler secret put APP_URL  # 输入新域名
# 然后修改 [vars] 里的 TRUSTED_ORIGINS 也带上新域名（多个域名逗号分隔）
wrangler deploy
```

## 10. CI 自动化（可选）

仓库已包含 [.github/workflows/wrangler-deploy.yml](../.github/workflows/wrangler-deploy.yml)，会在 push 到 `main` 且涉及 server / worker / client 时自动跑：

1. 安装依赖
2. 构建前端
3. typecheck server-ts + worker
4. 校验必填 secret
5. `wrangler d1 migrations apply --remote`
6. `wrangler deploy`，由 [cloudflare/wrangler-action](https://github.com/cloudflare/wrangler-action) 通过 `secrets:` / `vars:` input 同步 secret 和覆盖 `[vars]`

需要在 repo Settings → Environments → cloudflare 配置 secret，详见 [CF_GH_ACTIONS_DEPLOY.md](CF_GH_ACTIONS_DEPLOY.md)。

## 故障排查速查

| 现象 | 检查点 |
| --- | --- |
| 登录后立即 401 | `APP_URL` 与浏览器看到的 origin 不一致；或 `TRUSTED_ORIGINS` 没包含访问域 |
| 注册返回 `signup_disabled` | `SIGNUP_ENABLED` 不是 `"true"`，需要 `wrangler deploy` 才生效 |
| 注册返回 `signup_not_allowed` | 邮箱不在 `SIGNUP_ALLOWLIST`（注意大小写已自动归一化为小写） |
| 重置密码邮件没收到 | `RESEND_FROM` 未验证；或 Resend 余额耗尽；`wrangler tail` 看 mailer 抛错 |
| 静态资源 404 | `pnpm --filter @qreminder/client build` 没跑过；或 `packages/client/dist` 不存在 |
| `wrangler deploy` 卡在 build | 检查 `runtimes/worker` 内的 typecheck 是否通过 |
| 新表没建出来 | `wrangler d1 migrations list QREMINDER_DB --remote` 看 journal 状态 |
| 通知 cron 没跑 | `wrangler tail` 看 `[notification-cron]` 是否每分钟出现；并检查用户的 `notificationTimeLocal` 设置 |
