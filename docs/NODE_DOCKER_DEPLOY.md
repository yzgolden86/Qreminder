# Node + Docker 自托管部署

> 状态：v2 部署形态之一，把 TypeScript 后端 + 前端 SPA 打成单镜像跑在自有 VPS 上。
>
> 如果你想把应用部署到 Cloudflare Workers，免 VPS、免 Docker，见 [WORKER_DEPLOY.md](WORKER_DEPLOY.md)（本地 wrangler）或 [CF_GH_ACTIONS_DEPLOY.md](CF_GH_ACTIONS_DEPLOY.md)（GitHub Actions）。
>
> v1 Go + PocketBase Docker 镜像已进入维护模式，新部署不要用，详见 [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md)。

整个应用打成一个 Docker 镜像：内置 v2 TS 后端、前端静态资源、SQLite + 文件存储、内置 cron 调度器。最低跑起来只要一个容器 + 一份 `.env`。

## 0. 前置

- 一台 VPS 装好 Docker + Docker Compose
- （可选）SMTP 凭证用于密码找回和续费提醒邮件——没有也能跑，只是这两个功能不可用

## 1. 拉镜像 + 起容器

```bash
mkdir -p qreminder && cd qreminder

# 把 compose 模板和 .env 模板拉下来
curl -fsSL https://raw.githubusercontent.com/yzgolden86/Qreminder/main/runtimes/node/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/yzgolden86/Qreminder/main/runtimes/node/.env.example -o .env

# 编辑 .env，至少填好 BETTER_AUTH_SECRET 和 APP_URL
$EDITOR .env

docker compose pull
docker compose up -d
```

镜像默认从 `ghcr.io/yzgolden86/qreminder:latest` 拉。把它换成自己 fork 的 ghcr 路径（[docker-compose.yml](../runtimes/node/docker-compose.yml) 里改 `image:` 一行），可以用自己 GitHub Actions 出的镜像。

启动成功后访问 `http://<VPS_IP>:3000`，前端 SPA 直接渲染。Cron 每分钟扫一次，按用户的本地时区决定是否真发邮件。

## 2. 注册第一个 admin

数据库刚跑起来是空的。打开注册需要两步：

1. 把 `.env` 里 `SIGNUP_ENABLED` 改成 `true`，`SIGNUP_ALLOWLIST` 填你的邮箱
2. `docker compose restart`

然后浏览器访问 `APP_URL`，进 `/login` → 注册链接 → 用白名单邮箱完成注册。注册完把 `SIGNUP_ENABLED` 改回 `false`，再 `docker compose restart` 关掉注册口子。

把这个用户提为 admin（直接进容器跑 sqlite）：

```bash
docker compose exec qreminder sh -c \
  "sqlite3 /data/qreminder.db \"UPDATE users SET role='admin' WHERE email='you@example.com';\""
```

> 镜像本身没装 sqlite3 CLI，上面这条会失败。简单点的方式：装 sqlite3 后从宿主机直接动 `./data/qreminder.db`，或者临时改 `.env` 里的注册策略让它自己开口子。

## 3. 必填环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | （必填） | 32+ 位随机串。生成：`openssl rand -hex 32` |
| `APP_URL` | `http://localhost:3000` | 对外访问完整 URL，用于邮件链接和 cookie 域。带 https，不带尾斜杠 |

## 4. 可选环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 宿主机映射端口。容器内固定 3000 |
| `TRUSTED_ORIGINS` | 空 | Better Auth cookie 域允许列表。多个域名用逗号分隔；留空时退化成只接受 `APP_URL` 的 origin |
| `SIGNUP_ENABLED` | `false` | 第一次注册第一个 admin 时设为 `true`，注册完改回 `false` 并 `docker compose restart` |
| `SIGNUP_ALLOWLIST` | 空 | 注册邮箱白名单（仅 `SIGNUP_ENABLED=true` 时生效）。多个邮箱逗号分隔，支持 `*@example.com` 通配 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | 空 | 任一项空则邮件发送被禁用。配置后启用密码找回 + 续费提醒邮件 |
| `SMTP_SECURE` | `false` | 465 通常 `true`；587 通常 `false` 并使用 STARTTLS |
| `NOTIFICATION_SCHEDULER_ENABLED` | `true` | 是否启用内置 node-cron 调度器 |
| `NOTIFICATION_SCHEDULER_CRON` | `* * * * *` | 调度 cron 表达式 |

容器固定写入 `/data/qreminder.db` 和 `/data/assets/`。compose 模板把宿主机的 `./data` 挂到 `/data`，备份就是 tar 这个目录。

## 5. 反向代理 + 自定义域名

镜像监听 80 端口的 HTTP（容器内是 3000）。常见做法在前面挂 nginx / Caddy / Traefik 终端 TLS。Caddy 一行就够：

```caddy
qreminder.your-domain.com {
  reverse_proxy localhost:3000
}
```

绑完域名后必须更新两个 env：

1. `APP_URL` 改成新域名
2. `TRUSTED_ORIGINS` 加上新域名（多个域名逗号分隔）

然后 `docker compose restart`。

## 6. 升级

```bash
docker compose pull
docker compose up -d
```

镜像启动时会自动跑 `drizzle-kit migrate` 把 schema 升到最新。本地 `./data` 卷不动，数据保留。

## 7. 备份 / 恢复

```bash
# 备份：停容器 → tar data/ → 重启
docker compose stop
tar -czf qreminder-backup-$(date +%F).tgz data
docker compose start

# 恢复：把 tar 解到一个新目录的 data/ 下，docker compose up -d 即可
```

## 故障排查速查

| 现象 | 检查点 |
| --- | --- |
| `docker compose up` 起来但 `/api/setup-status` 一直 unhealthy | `docker compose logs qreminder` 看 server 启动报错；常见是 `BETTER_AUTH_SECRET` 未填或 `DATABASE_PATH` 权限不对 |
| 登录后立即 401 | `APP_URL` 和浏览器实际访问的域不一致；或 `TRUSTED_ORIGINS` 没包含访问域 |
| 注册返回 `signup_disabled` | `SIGNUP_ENABLED` 还是 `false`，改完要 `docker compose restart` |
| 注册返回 `signup_not_allowed` | 邮箱不在 `SIGNUP_ALLOWLIST` |
| 重置密码邮件没收到 | SMTP 任一项没填；或 `SMTP_HOST` / 凭证错；`docker compose logs qreminder` 看 mailer 报错 |
| 静态资源 404 | 镜像 build 时漏跑了 client build——拉最新 `:latest` 镜像即可，自构建时确认 `pnpm --filter @qreminder/client build` 跑过了 |
| Cron 没发邮件 | `docker compose logs qreminder | grep notification-cron` 看每分钟有没有 tick；检查用户 settings 里的 `notificationTimeLocal` |

## 8. 自构建镜像（不用上游 ghcr）

如果你 fork 了仓库，自己的 GitHub Actions 已经在 push main 时自动构建并推到 `ghcr.io/<your-fork>/qreminder:latest`，见 [.github/workflows/docker-image-node.yml](../.github/workflows/docker-image-node.yml)。

也可以在本地直接 build：

```bash
git clone https://github.com/yzgolden86/Qreminder.git
cd Qreminder
docker build -f runtimes/node/Dockerfile -t qreminder:local .
```

然后 compose 里把 `image: ghcr.io/...` 换成 `image: qreminder:local` 即可。
