# 端到端烟测状态（v2）

> 状态：**首次部署进行中（2026-05-18）**。Cloudflare Workers 路径正在走 GH Actions 部署，此前未跑过完整浏览器烟测。本文档说明烟测前的最小数据准备、最小路径，以及后续自动化方向。

## 1. 当前为什么没跑

v2 后端（`packages/server-ts` + `runtimes/node` 或 `runtimes/worker`）已经 typecheck 通过、单元测试 209/209 通过，但完整的浏览器烟测要求一套真实的"已迁移数据 + 已存在 admin"环境。这条链路上目前还有两个空白：

1. **没有种子数据**：D1（或本地 sqlite）刚跑完 migrations 是空的；前端首屏立刻会到登录页，没有可用账号就走不下去。
2. **没有 v1 → v2 的离线灌库**：[tools/pb-importer](../tools/pb-importer/) 的 sqlite 路径已实现，但还没有人跑过一次完整 dump → 导入 → 用导入的账号登录。

这两个都是部署侧的一次性配置，不是代码问题。

## 2. 解锁步骤（首次冒烟）

按下面任一路径准备一份可用环境：

### 路径 A：从空库起步（最快）

**Cloudflare Workers（GH Actions 部署）**：

按 [CF_GH_ACTIONS_DEPLOY.md §4 路径 A](./CF_GH_ACTIONS_DEPLOY.md#4-注册第一个-admin) 走"通过 Variable 临时打开注册"的流程——把 `SIGNUP_ENABLED` 改成 `true`、`SIGNUP_ALLOWLIST` 填你的邮箱、Run 一次 Wrangler Deploy、注册、再把 `SIGNUP_ENABLED` 改回 `false` 重跑一次。然后用 `wrangler d1 execute` 或 Cloudflare 控制台把这个用户的 `role` 改成 `admin`。

**本地 Node runtime（最低门槛验证）**：

```bash
# 1. 起一个本地 server-ts 实例，自动 apply migrations
cd runtimes/node
DATABASE_PATH=./data/renewlet.db \
  BETTER_AUTH_SECRET=$(openssl rand -hex 32) \
  APP_URL=http://localhost:3000 \
  SIGNUP_ENABLED=true \
  pnpm dev

# 2. 用浏览器或 curl 注册第一个用户（注册一旦有人就关掉 SIGNUP_ENABLED）
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"admin@local","password":"password1234","name":"Admin"}'

# 3. 把这个用户提升为 admin
sqlite3 ./data/renewlet.db "UPDATE users SET role='admin' WHERE email='admin@local';"

# 4. 起前端，登录用 admin@local / password1234
cd ../../packages/client
pnpm dev
```

### 路径 B：从 v1 PocketBase 数据迁移

```bash
# 1. 从 v1 容器拷一份 pb_data
docker cp <renewlet-v1-container>:/app/pb_data ./pb_data_dump

# 2. 跑 importer，输出到本地 sqlite
cd tools/pb-importer
pnpm start -- --pb ../../pb_data_dump --target sqlite:///data/renewlet.db --fs ../../runtimes/node/data/assets

# 3. 启动 server-ts，登录用原账号
```

> Better Auth 不认 PocketBase 的密码哈希。pb-importer 当前会迁移 `users` 行，但 `accounts.password` 留空——首次登录前需要每个用户走 `/forgot-password` 重置密码（前提是 `RESEND_API_KEY` 或 SMTP 已配置，见 [WORKER_DEPLOY.md §2](./WORKER_DEPLOY.md#2-配置-secrets)）。

## 3. 烟测应覆盖的最小路径

数据准备好之后，按下面顺序在浏览器走一遍：

1. `/login` 用 admin 账号登录，查看 Mock A 首页
2. 点 "添加订阅"，填一条 monthly + reminderOffsets `[7, 3, 1]` 的订阅
3. 切到 "近期续费" 区域，确认这条订阅出现
4. 改订阅的 `nextBillingDate` 到今天，把 `notificationTimeLocal` 改到当前时间附近
5. 等一分钟（或本地手动调用 cron endpoint），收到提醒邮件
6. `/admin/users` 创建一个普通用户，logout 用普通账号登录，确认看不到 admin 入口
7. `/forgot-password` 走完整重置链路

## 4. 接下来该自动化的内容

- 把上面的最小路径用 [Playwright](../playwright.config.ts) 写成一组 e2e 测试（v1 仓库已经有 e2e 框架，只需把入口换成 server-ts 路由）
- 在 [.github/workflows/wrangler-deploy.yml](../.github/workflows/wrangler-deploy.yml) 加一个 staging 环境，每次 deploy 之后自动跑 e2e
- 给 pb-importer 加一个 "smoke 模式"：跑完导入后立刻发起一次 health-check 请求验证数据可读

这些不在本轮范围里——本轮交付的是：让冒烟"能跑"，并把仍然手工的步骤记录清楚。
