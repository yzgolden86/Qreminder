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

### 1.1.1 打开仓库 Workflow 写权限（重要）

到 **Settings → Actions → General → Workflow permissions**，勾选 **"Read and write permissions"**，并勾选 **"Allow GitHub Actions to create and approve pull requests"**。

> 默认只读权限会导致 Bootstrap 在 `git push` 时报 `could not read Username for 'https://github.com': terminal prompts disabled`。Workflow 里虽然写了 `permissions: contents: write`，但仓库级开关优先级更高。

> **不想给 Actions 写权限？** 跳过 Bootstrap 走"手动写 database_id"路径：
> 1. 本地装 wrangler（`pnpm install -g wrangler@latest && wrangler login`）或直接登 Cloudflare 控制台
> 2. 创建 D1：`wrangler d1 create qreminder`，复制输出的 `database_id`
> 3. 创建 R2：`wrangler r2 bucket create qreminder-assets`
> 4. 直接在 GitHub 网页编辑 `runtimes/worker/wrangler.toml`，把 `database_id = "REPLACE_ME_AFTER_wrangler_d1_create"` 改成实际的 UUID，commit 到 main
> 5. 跳过 Bootstrap，直接 Run **Wrangler Deploy**（只要读权限即可）

### 1.2 必填 Secrets（Environment secrets）

| Secret 名 | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token，权限至少包含 `Account.D1:Edit`、`Account.Workers Scripts:Edit`、`Account.Workers R2 Storage:Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 控制台任一 worker 详情页右侧能看到，32 位 hex |
| `BETTER_AUTH_SECRET` | 任意 32+ 位随机串，可在本地 `openssl rand -hex 32` 生成 |
| `APP_URL` | worker 部署后对外的完整 URL，带 `https://`、不带尾斜杠。例：`https://qreminder.your-domain.com` 或 `https://qreminder.your-subdomain.workers.dev` |
| `RESEND_API_KEY` | Resend 控制台 API Keys 页面创建 |
| `RESEND_FROM` | 已在 Resend 验证过的发件人，例如 `noreply@your-domain.com` |

> `APP_URL` 还不知道完整域名？可以先填占位（例如 `https://placeholder.workers.dev`），等首次部署后控制台输出真实 URL 再回来更新这个 secret 并重跑一次 Wrangler Deploy。

### 1.3 可选 Variables（Environment variables）

非敏感配置走 **Variables** 标签页，不是 Secrets：

| Variable 名 | 默认 | 何时填 |
| --- | --- | --- |
| `SIGNUP_ENABLED` | `false` | 给"是否允许新用户注册"提供一个**启动时**的默认值。Worker 第一次跑会自动创建默认 admin（见 §4），admin 登录后可在 UI「设置 → 注册管理」里改这个开关并持久化到 D1 |
| `SIGNUP_ALLOWLIST` | 空 | 注册邮箱白名单的启动默认值（仅在数据库还没有相关设置时生效）。多个用逗号分隔，UI 改完后以数据库为准 |
| `TRUSTED_ORIGINS` | 等同于 `APP_URL` | Better Auth 的 cookie 域允许列表，多个域名逗号分隔。绑了自定义域名后这里要带上所有访问域 |

## 2. 跑一次 Cloudflare Bootstrap

仓库 → **Actions → Cloudflare Bootstrap → Run workflow**。

| 输入 | 默认 | 说明 |
| --- | --- | --- |
| `d1_name` | `qreminder` | D1 数据库名，可改 |
| `r2_bucket` | `qreminder-assets` | R2 桶名，可改 |

点 Run 之后 workflow 会：

1. 用 API token 列已有 D1 / R2，幂等创建（已存在直接复用）
2. 把拿到的 `database_id` 写回 `runtimes/worker/wrangler.toml`
3. 用 `github-actions[bot]` 身份 commit 这个改动 push 回当前分支

跑完后到仓库 commit 历史会看到一条 `chore(worker): set D1 database_id from cf-bootstrap`。这一步只需要做一次。

> 如果改了 `d1_name` / `r2_bucket`，记得同步改 `runtimes/worker/wrangler.toml` 里的 `database_name` 和 `bucket_name`，下一次 Wrangler Deploy 才能匹配上。

## 3. 跑 Wrangler Deploy 部署 worker

bootstrap 那一步的 commit 落到 `main` 后，**Wrangler Deploy** 会自动被触发；如果没自动跑，到 Actions 页面手动 Run 一次 `Wrangler Deploy`。

它会按顺序执行：

1. `pnpm install` + `pnpm --filter @qreminder/client build`
2. typecheck `@qreminder/server` + `@qreminder/runtime-worker`
3. 校验 6 个必填 GH secret 是否都已设置（缺一个直接 fail）
4. `wrangler d1 migrations apply QREMINDER_DB --remote`
5. `wrangler deploy`，由 [cloudflare/wrangler-action](https://github.com/cloudflare/wrangler-action) 的 `secrets:` input 通过 `wrangler secret bulk` 把 `BETTER_AUTH_SECRET` / `APP_URL` / `RESEND_API_KEY` / `RESEND_FROM` 同步到 worker，并由 `vars:` input 通过 `--var KEY:VALUE` 覆盖 `SIGNUP_ENABLED` / `SIGNUP_ALLOWLIST` / `TRUSTED_ORIGINS`

部署成功后 Actions 日志末尾会有一行 `Deployed to https://...`，就是真实 URL。把它对照 1.2 里的 `APP_URL` 校验一下，如果当时填的是占位，现在更新成真实 URL 再 Run 一次。

## 4. 登录默认 admin

首次部署完成后，Worker 第一次响应任意 API 请求时会检测 D1 是否为空。如果为空就自动创建一个默认 admin：

```
邮箱：  admin@qreminder.local
密码：  Qreminder@2026
```

直接用这对凭据登录 `APP_URL`，系统会**强制要求**改邮箱和密码（`mustChangeCredentials=true`），改完后默认凭据失效。

### 后续开放注册（按需）

默认配置下普通用户无法注册。如果想让其他人也能注册：

1. 默认 admin 登录后，进 **设置 → 注册管理**
2. 打开「允许注册」开关，把允许的邮箱域名加到白名单（或勾选 Gmail / Outlook 等预设）
3. 关闭开关即可关闭注册口子

> Environment Variables 里的 `SIGNUP_ENABLED` / `SIGNUP_ALLOWLIST` 只在数据库里还没有这两条设置时作为初始默认值——之后以 UI 设置为准。无需为开/关注册重跑 Wrangler Deploy。

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
pnpm --filter @qreminder/server db:generate
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
| Bootstrap 报 `could not read Username for 'https://github.com': terminal prompts disabled` | 仓库 Settings → Actions → General → Workflow permissions 设成了 "Read repository contents permission"。改成 "Read and write permissions" 后重跑。若仍失败：手动编辑 `runtimes/worker/wrangler.toml` 把 `database_id` 填进去，commit + push，跳过 bootstrap 直接 Run Wrangler Deploy |
| Deploy 卡在 `Validate required secrets` | 6 个必填 secret 漏了一个，按 1.2 的表对一遍 |
| Deploy 成功但访问 401 反复跳登录 | `APP_URL` 与浏览器实际访问域不一致；或 `TRUSTED_ORIGINS` 没包含访问域 |
| 默认 admin 登不进去 | 通常说明 D1 已有数据但默认 admin 不存在。可在 Cloudflare 控制台 → D1 → qreminder → Console 里检查 `users` 表；若需要重置，删掉所有用户行，重新 deploy，bootstrap 会重建。代码逻辑在 [packages/server-ts/src/bootstrap-default-admin.ts](../packages/server-ts/src/bootstrap-default-admin.ts) |
| 注册接口返回 `signup_disabled` | UI「设置 → 注册管理」里把注册关了；admin 登录后开启即可。Variable 里的 `SIGNUP_ENABLED` 只在数据库还没有这条设置时作为默认值 |
| 注册接口返回 `signup_not_allowed` | 邮箱不在白名单里（设置 → 注册管理 → 白名单。已自动归一化为小写） |
| 找回密码邮件没收到 | `RESEND_FROM` 没在 Resend 验证；或 Resend 余额耗尽；本地 `wrangler tail` 看 mailer 抛错 |
| 静态资源 404 | `pnpm --filter @qreminder/client build` 没跑过；或 client 构建失败 → 看 Actions 日志的 Build client 步骤 |
| Cron 没跑 | `wrangler tail` 看是不是每分钟都有 `[notification-cron]` 输出；如果完全没有，去 Cloudflare Workers 控制台确认 Cron Triggers 已开 |
