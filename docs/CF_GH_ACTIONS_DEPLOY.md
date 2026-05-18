# GitHub Actions 一键部署到 Cloudflare

> 状态：v2 第一次上线用，全程在浏览器里点鼠标，不用本地装 wrangler。
> 适用对象：fork 这个仓库自己用的人。需要更细的本地 CLI 流程见 [WORKER_DEPLOY.md](WORKER_DEPLOY.md)。

整体两个 workflow 配合：

| Workflow | 触发方式 | 干什么 | 跑几次 |
| --- | --- | --- | --- |
| [Cloudflare Bootstrap](../.github/workflows/cf-bootstrap.yml) | Actions 页面手动 Run | 创建 D1 + R2，把 `database_id` commit 回 `runtimes/worker/wrangler.toml` | 一次 |
| [Wrangler Deploy](../.github/workflows/wrangler-deploy.yml) | push `main` 自动触发 / 也可手动 Run | 同步 worker secrets → 跑 D1 migrations → `wrangler deploy` | 每次发布 |

预计 10 分钟内完成第一次上线（不含 Resend 域名验证传播时间）。

## 0. 前置准备

- 一个 GitHub 账号 + 这个仓库的 fork
- 一个 Cloudflare 账号（D1 / R2 / Workers 已开通，免费档够用）
- 一个 [Resend](https://resend.com) 账号 + 已验证的发件域名

## 1. 配置 GitHub Secrets / Variables

到 fork 出来的仓库 → **Settings → Secrets and variables → Actions**。

### 1.1 创建 environment

先到 **Settings → Environments → New environment**，名字填 `cloudflare`（小写，必须一致；两个 workflow 都用了 `environment: cloudflare`）。后续 secrets / vars 都加到这个 environment 下。

### 1.2 必填 Secrets（Environment secrets）

| Secret 名 | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token，权限至少包含 `Account.D1:Edit`、`Account.Workers Scripts:Edit`、`Account.Workers R2 Storage:Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 控制台任一 worker 详情页右侧能看到，32 位 hex |
| `BETTER_AUTH_SECRET` | 任意 32+ 位随机串，可在本地 `openssl rand -hex 32` 生成 |
| `APP_URL` | worker 部署后对外的完整 URL，带 `https://`、不带尾斜杠。例：`https://renewlet.your-domain.com` 或 `https://renewlet.your-subdomain.workers.dev` |
| `RESEND_API_KEY` | Resend 控制台 API Keys 页面创建 |
| `RESEND_FROM` | 已在 Resend 验证过的发件人，例如 `noreply@your-domain.com` |

> `APP_URL` 还不知道完整域名？可以先填占位（例如 `https://placeholder.workers.dev`），等首次部署后控制台输出真实 URL 再回来更新这个 secret 并重跑一次 Wrangler Deploy。

### 1.3 可选 Variables（Environment variables）

非敏感配置走 **Variables** 标签页，不是 Secrets：

| Variable 名 | 默认 | 何时填 |
| --- | --- | --- |
| `SIGNUP_ENABLED` | `false` | 第一次部署、需要注册第一个 admin 时改成 `true`，注册完再改回 `false` 重跑一次 |
| `SIGNUP_ALLOWLIST` | 空 | 留空 = 任何邮箱都能注册（仅在 `SIGNUP_ENABLED=true` 时生效）；填了就只放白名单内邮箱（多个用逗号分隔） |
| `TRUSTED_ORIGINS` | 等同于 `APP_URL` | Better Auth 的 cookie 域允许列表，多个域名逗号分隔。绑了自定义域名后这里要带上所有访问域 |

## 2. 跑一次 Cloudflare Bootstrap

仓库 → **Actions → Cloudflare Bootstrap → Run workflow**。

| 输入 | 默认 | 说明 |
| --- | --- | --- |
| `d1_name` | `renewlet` | D1 数据库名，可改 |
| `r2_bucket` | `renewlet-assets` | R2 桶名，可改 |

点 Run 之后 workflow 会：

1. 用 API token 列已有 D1 / R2，幂等创建（已存在直接复用）
2. 把拿到的 `database_id` 写回 `runtimes/worker/wrangler.toml`
3. 用 `github-actions[bot]` 身份 commit 这个改动 push 回当前分支

跑完后到仓库 commit 历史会看到一条 `chore(worker): set D1 database_id from cf-bootstrap`。这一步只需要做一次。

> 如果改了 `d1_name` / `r2_bucket`，记得同步改 `runtimes/worker/wrangler.toml` 里的 `database_name` 和 `bucket_name`，下一次 Wrangler Deploy 才能匹配上。

## 3. 跑 Wrangler Deploy 部署 worker

bootstrap 那一步的 commit 落到 `main` 后，**Wrangler Deploy** 会自动被触发；如果没自动跑，到 Actions 页面手动 Run 一次 `Wrangler Deploy`。

它会按顺序执行：

1. `pnpm install` + `pnpm --filter @renewlet/client build`
2. typecheck `@renewlet/server` + `@renewlet/runtime-worker`
3. 校验 6 个必填 GH secret 是否都已设置（缺一个直接 fail）
4. `wrangler d1 migrations apply RENEWLET_DB --remote`
5. `wrangler deploy`，由 [cloudflare/wrangler-action](https://github.com/cloudflare/wrangler-action) 的 `secrets:` input 通过 `wrangler secret bulk` 把 `BETTER_AUTH_SECRET` / `APP_URL` / `RESEND_API_KEY` / `RESEND_FROM` 同步到 worker，并由 `vars:` input 通过 `--var KEY:VALUE` 覆盖 `SIGNUP_ENABLED` / `SIGNUP_ALLOWLIST` / `TRUSTED_ORIGINS`

部署成功后 Actions 日志末尾会有一行 `Deployed to https://...`，就是真实 URL。把它对照 1.2 里的 `APP_URL` 校验一下，如果当时填的是占位，现在更新成真实 URL 再 Run 一次。

## 4. 注册第一个 admin

首次部署 `SIGNUP_ENABLED` 一般还是 `false`，数据库是空的。两种方式开个口子：

**方式 A — 通过 Variable 临时打开注册**

1. Settings → Environments → cloudflare → Variables，把 `SIGNUP_ENABLED` 改成 `true`，并把 `SIGNUP_ALLOWLIST` 填成你的邮箱
2. Actions 手动 Run 一次 `Wrangler Deploy`
3. 浏览器打开 `APP_URL`，进 `/login` → 注册链接 → 用白名单邮箱完成注册
4. 把 `SIGNUP_ENABLED` 改回 `false`，再 Run 一次 `Wrangler Deploy`
5. 把刚注册的用户提为 admin，见下面"提升角色"

**方式 B — 直接 SQL 写一条 admin 记录**

如果不想折腾两次部署，可以本地装一次 wrangler，跑：

```bash
cd runtimes/worker
wrangler d1 execute RENEWLET_DB --remote --command \
  "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

但这条命令只能 promote 已注册用户，注册本身还是要先打开 `SIGNUP_ENABLED`，所以多数情况下方式 A 更省事。

**提升角色（两种方式都需要）**

```bash
# 本地：
cd runtimes/worker
wrangler d1 execute RENEWLET_DB --remote --command \
  "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

或者在 Cloudflare 控制台 → D1 → renewlet → Console 直接跑同一条 SQL，不用本地装 wrangler。

## 5. 后续发布

之后每次 `git push` 到 `main` 且改动落在以下路径会自动触发 Wrangler Deploy：

- `packages/shared/**`
- `packages/server-ts/**`
- `packages/client/**`
- `runtimes/worker/**`
- `.github/workflows/wrangler-deploy.yml`

也可以随时到 Actions 手动 Run。

如果改了 `packages/server-ts/src/db/schema.ts`，先在本地：

```bash
pnpm --filter @renewlet/server db:generate
```

会在 `packages/server-ts/drizzle/` 下生成新的 `NNNN_*.sql` 与 `meta/NNNN_snapshot.json`，commit + push 之后 workflow 里的 `d1 migrations apply` 步骤会自动应用到远程 D1。

## 6. 域名（可选）

绑自定义域名两种走法：

- Cloudflare 控制台 → Workers → 你的 worker → Settings → Triggers → Custom Domains 添加
- 或在 `runtimes/worker/wrangler.toml` 加 `[[routes]]` 段并 commit

绑完之后必须更新两个值：

1. Secrets → 更新 `APP_URL` 为新域名
2. Variables → 更新 `TRUSTED_ORIGINS`，把新域名加进去（多个域名逗号分隔）

然后 Run 一次 `Wrangler Deploy`，新域名才会写到 worker 的 secret / vars 上。

## 故障排查速查

| 现象 | 检查点 |
| --- | --- |
| Bootstrap workflow 在 `Patch wrangler.toml` 步骤报 `database_id field not found` | `runtimes/worker/wrangler.toml` 被改坏，恢复成仓库默认的 `REPLACE_ME_AFTER_wrangler_d1_create` 占位再重跑 |
| Bootstrap 跑完没有 commit 回来 | API token 权限不够（需要包含 D1:Edit / R2:Edit）；或 `permissions: contents: write` 被仓库 setting 禁用，看 Actions → 仓库 Settings → Actions → Workflow permissions 改成 Read and write |
| Deploy 卡在 `Validate required secrets` | 6 个必填 secret 漏了一个，按 1.2 的表对一遍 |
| Deploy 成功但访问 401 反复跳登录 | `APP_URL` 与浏览器实际访问域不一致；或 `TRUSTED_ORIGINS` 没包含访问域 |
| 注册接口返回 `signup_disabled` | `SIGNUP_ENABLED` Variable 还是 `false`，改完一定要重跑 Wrangler Deploy 才生效 |
| 注册接口返回 `signup_not_allowed` | 邮箱不在 `SIGNUP_ALLOWLIST` 里（已自动归一化为小写） |
| 找回密码邮件没收到 | `RESEND_FROM` 没在 Resend 验证；或 Resend 余额耗尽；本地 `wrangler tail` 看 mailer 抛错 |
| 静态资源 404 | `pnpm --filter @renewlet/client build` 没跑过；或 client 构建失败 → 看 Actions 日志的 Build client 步骤 |
| Cron 没跑 | `wrangler tail` 看是不是每分钟都有 `[notification-cron]` 输出；如果完全没有，去 Cloudflare Workers 控制台确认 Cron Triggers 已开 |
