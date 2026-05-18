# 传统 Docker 部署（v1 Go + PocketBase，已进入维护模式）

> ⚠️ **维护模式说明**
>
> v1 的 Go + PocketBase 路径仍然能跑，但**前端已整体切到 v2 Better Auth + 新 API**，新功能（多档提醒 `reminderOffsets`、Mock A 单页布局等）只在 v2 后端可用。
>
> **新部署请走 [Cloudflare Workers 路径](./CF_GH_ACTIONS_DEPLOY.md)**。这份文档只为已经在跑 v1 的存量用户做向后兼容，方便平滑升级或保留现有部署。
>
> 数据迁移到 v2 见仓库根 README 的"数据迁移（v1 → v2）"一节。

## Docker 一键部署

推荐直接使用 Docker Hub 上的预构建镜像。下面的脚本会下载 Compose 模板、生成随机密钥、创建本地数据目录；一般不需要手动改 `.env` 或 `docker-compose.yml`。

准备一台已安装 Docker 和 Docker Compose v2 的服务器，执行：

```bash
mkdir -p renewlet && cd renewlet
curl -fsSL https://raw.githubusercontent.com/yzgolden86/Qreminder/main/deploy/docker-deploy.sh | bash
docker compose up -d
```

首次启动后访问：

```text
http://localhost:3000/setup
```

创建第一个管理员用户。如果 PocketBase 还没有 superuser，这个账号也会成为 PocketBase Admin UI 的初始账号；已有 superuser 时不会覆盖。

> 注意：v1 的 `/setup` 页面只对 v1 Go 后端有效，跟 v2 的 Better Auth 注册流程是两条独立路径。

脚本会生成这些文件：

| 路径 | 说明 |
| --- | --- |
| `docker-compose.yml` | 生产部署模板，默认使用 `zhiyingzzhou/renewlet:latest`。 |
| `.env` | 端口、镜像、时区、密钥和通知调度配置。`PB_ENCRYPTION_KEY` 与 `CRON_SECRET` 会自动生成。 |
| `data/` | 数据目录，会挂载到容器内的 `/pb_data`。 |

如果 Docker Hub 拉取不可用，可以把 `.env` 中的镜像改为 GHCR：

```env
RENEWLET_IMAGE="ghcr.io/zhiyingzzhou/renewlet:latest"
```

然后重新拉取并启动：

```bash
docker compose pull
docker compose up -d
```

## 常用运维

查看状态和日志：

```bash
docker compose ps
docker compose logs -f
```

升级前建议先备份数据和配置：

```bash
tar -czf renewlet-backup-$(date +%F).tgz .env docker-compose.yml data
```

升级到最新镜像：

```bash
docker compose pull
docker compose up -d
docker compose logs -f
```

重启服务：

```bash
docker compose restart
```

迁移到新机器时，在新机器解压备份后启动：

```bash
mkdir -p renewlet && cd renewlet
tar -xzf /path/to/renewlet-backup.tgz
docker compose up -d
```

停止服务但保留数据：

```bash
docker compose down
```

彻底卸载会删除本地数据，请确认已经备份：

```bash
docker compose down
rm -rf data .env docker-compose.yml
```

## 配置

一键部署后的配置都在 `.env`。普通部署可以先用默认值；如果你使用反向代理和域名，建议把 `APP_URL` 改成公网 HTTPS 地址，例如 `https://renewlet.example.com`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 对外服务端口。 |
| `RENEWLET_IMAGE` | `zhiyingzzhou/renewlet:latest` | Docker 镜像。`latest` 会跟随最新版本；生产环境可以固定为 `zhiyingzzhou/renewlet:vX.Y.Z`，也可以改成 `ghcr.io/zhiyingzzhou/renewlet:latest`。 |
| `APP_URL` | `http://localhost:3000` | 对外访问地址，用来生成邮件和通知里的链接。 |
| `TZ` | `Asia/Shanghai` | 容器时区，主要影响日志；提醒时间以用户自己的设置为准。 |
| `PB_ENCRYPTION_KEY` | 自动生成 | 必须正好 32 字符，用来加密 PocketBase settings 中的敏感字段。**部署后不要随意更换**。 |
| `GOMEMLIMIT` / `MEM_LIMIT` | `128MiB` / `256m` | Go 运行时软内存上限和容器内存限制。 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` / `SMTP_TLS` | 空 | 配置后可启用 PocketBase 密码找回邮件。 |
| `BACKUPS_CRON` | 空 | 可选的 PocketBase 自动备份 cron 表达式（例如 `0 3 * * *`）。 |
| `BACKUPS_CRON_MAX_KEEP` | `3` | PocketBase 备份保留份数。 |
| `NOTIFICATION_SCHEDULER_ENABLED` | `true` | 是否启用内置通知调度器。 |
| `CRON_SECRET` | 自动生成 | 外部平台 Cron 调用 `/api/cron/notifications` 的 Bearer 鉴权密钥。 |
| `NOTIFICATION_SCHEDULER_CRON` | `* * * * *` | 通知调度器 cron 表达式。 |
| `NOTIFICATION_CRON_WINDOW_MINUTES` | `2` | 通知窗口（分钟）。 |
| `NOTIFICATION_MAX_RETRIES` | `3` | 失败通知任务的最大重试次数。 |
| `NOTIFICATION_STALE_SENDING_MINUTES` | `15` | 长时间停留 sending 状态视为失败的阈值（分钟）。 |

完整模板见 [deploy/env.example](../deploy/env.example)。

## 定时通知

Docker/VPS 自托管时，建议保持 `NOTIFICATION_SCHEDULER_ENABLED=true`。应用会按 `NOTIFICATION_SCHEDULER_CRON` 检查所有用户设置，并根据用户自己的 IANA 时区和本地通知时间决定是否发送。

如果部署平台已经提供 Cron，或你想使用 GitHub Actions、宿主机 crontab 等外部调度器，可以关闭内置调度器并配置外部入口：

```env
NOTIFICATION_SCHEDULER_ENABLED="false"
CRON_SECRET="CHANGE_ME_TO_A_RANDOM_SECRET"
```

外部入口是 `GET /api/cron/notifications`。它只接受 `Authorization: Bearer <CRON_SECRET>`，不支持 URL query secret。Vercel Cron 会在配置 `CRON_SECRET` 后自动发送 Bearer header；GitHub Actions 或 crontab 可以这样调用：

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://YOUR_DOMAIN/api/cron/notifications"
```

排查问题时，可以追加 `dryRun=1` 只跑逻辑、不实际发送；也可以追加 `force=1` 强制命中调度窗口：

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://YOUR_DOMAIN/api/cron/notifications?dryRun=1&force=1"
```

## 源码构建部署

如果你想从源码构建镜像，而不是使用 Docker Hub 预构建镜像：

```bash
git clone https://github.com/yzgolden86/Qreminder.git
cd Qreminder
cp .env.example .env
docker compose up -d --build
```

仓库根目录的 [docker-compose.yml](../docker-compose.yml) 用于源码构建，默认用 Docker named volume `renewlet-pb-data` 持久化 `/pb_data`。一键部署脚本使用 [deploy/docker-compose.yml](../deploy/docker-compose.yml)，默认把数据放在当前目录的 `data/`。

## 发布镜像

> 上游仓库 `zhiyingzzhou/renewlet` 通过 GitHub Actions 构建多架构镜像并推送到：
>
> - `docker.io/zhiyingzzhou/renewlet`
> - `ghcr.io/zhiyingzzhou/renewlet`
>
> 触发方式包括推送到 `main`、创建 `v*.*.*` tag，或在 GitHub Actions 页面手动运行 `Docker Image` workflow。Fork 后如果你也想自己发镜像，需要在 fork 仓库加 `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` 两个 secret 并启用对应 workflow。

## 故障排查

| 现象 | 检查点 |
| --- | --- |
| 浏览器进 `/setup` 卡住 | PocketBase 还没就绪，`docker compose logs -f` 看是不是还在初始化 |
| 找回密码邮件没收到 | `SMTP_HOST` / `SMTP_FROM` 是否配齐；SMTP 凭证是否对；从 `docker compose logs` 找 `mailer` 抛错 |
| 升级后数据丢失 | 检查 `data/` 是否仍挂载；若用根 `docker-compose.yml`，数据在 named volume `renewlet-pb-data`，而非 `./data` |
| 前端登录后显示空白 | v1 后端的旧 PocketBase API 已不再被前端调用；如果你想跟仓库主线一起升级，把镜像替换为 v2 形态（暂未发布 v2 Docker 镜像，建议直接走 Cloudflare Workers 部署） |
| `PB_ENCRYPTION_KEY` 改了之后启动失败 | 这个 key 改了之后旧的 PocketBase settings 解密不出来；恢复原 key 或从备份还原 |

## 升级到 v2

考虑升级到 v2（Cloudflare Workers 或 Node 自托管）时建议这样做：

1. 备份当前 v1 数据：`tar -czf renewlet-v1-backup.tgz .env docker-compose.yml data`（或 PocketBase Admin UI 里手动导出）
2. 选一条 v2 部署路径：
   - [GitHub Actions 一键部署到 Cloudflare](./CF_GH_ACTIONS_DEPLOY.md)（推荐）
   - [本地 wrangler CLI 部署](./WORKER_DEPLOY.md)
   - 仓库根 README 的"Node 自托管部署（实验中）"小节
3. 用 [tools/pb-importer](../tools/pb-importer/) 把 v1 的 `pb_data/` 导入 v2 的 SQLite 或 D1，详见仓库根 README 的"数据迁移（v1 → v2）"一节
4. 验证 v2 跑通后再下线 v1 容器
