# 通知渠道配置指南 / Notification Channels Guide

[简体中文](#简体中文) | [English](#english)

---

## 简体中文

在 **设置 → 通知设置** 中启用渠道并填写对应凭据，点击「测试」按钮验证连通性。

### Telegram（推荐，最简单）

1. 在 Telegram 搜索 [@BotFather](https://t.me/botfather)，发送 `/newbot`，按提示创建机器人，获得 **Bot Token**
2. 把机器人拉进你想接收通知的群组（或直接给机器人发一条消息）
3. 访问 `https://api.telegram.org/bot<你的Token>/getUpdates`，找到 `chat.id` 字段
4. 在设置页填入 Bot Token 和 Chat ID，点击测试

### 邮件（Email）

邮件通知由部署时配置的邮件服务发送，无需在 UI 中配置 SMTP。

- **Cloudflare Workers 部署**：设置环境变量 `RESEND_API_KEY` 和 `RESEND_FROM`（通过 `wrangler secret put` 或 GitHub Actions secrets）
- **Node Docker 部署**：在 `.env` 文件中设置 `RESEND_API_KEY` 和 `RESEND_FROM`

在设置页只需填写接收通知的目标邮箱地址。

获取 Resend API Key：
1. 注册 [Resend](https://resend.com)（免费额度 100 封/天）
2. 验证发送域名，或使用 Resend 提供的测试域名
3. 在 API Keys 页面创建一个 key，填入部署环境变量

### 企业微信机器人（WeCom Bot）

1. 在企业微信群聊中添加「群机器人」，获得 Webhook URL
2. 在设置页粘贴 Webhook URL，选择消息格式（text 或 markdown），点击测试

### Webhook（通用）

适合对接任意支持 HTTP 回调的服务（如 n8n、IFTTT、自建服务）：

- 填写目标 URL
- 选择 HTTP 方法（POST/GET）
- 可选：自定义 Headers（JSON 格式）和 Payload 模板

Payload 模板支持以下占位符：

| 占位符 | 说明 |
| --- | --- |
| `{{title}}` | 通知标题 |
| `{{body}}` | 通知正文 |

### Bark（iOS 推送）

1. 在 App Store 下载 [Bark](https://apps.apple.com/app/bark/id1403753865)
2. 打开 App 复制设备 Key
3. 在设置页填入服务器地址（默认 `https://api.day.app`）和设备 Key，点击测试

### NotifyX

1. 注册 [NotifyX](https://www.notifyx.cn/) 账号，获取 API Key
2. 在设置页填入 API Key，点击测试

### Server酱 Turbo（微信推送）

通过 Server酱 Turbo 将通知推送到你的微信：

1. 访问 [sct.ftqq.com](https://sct.ftqq.com/)，使用微信扫码登录
2. 在「SendKey」页面复制你的 SendKey
3. 在设置页填入 SendKey，点击测试

安全说明：
- SendKey 等同于推送凭证，请勿泄露
- 消息经 Server酱 服务器中转到微信，Server酱 可读取消息内容
- 推送内容仅包含订阅名称和金额，不含密码等高敏感信息
- 前端使用密码输入框掩码显示，导出时自动剥离

---

## English

Enable channels and fill in credentials under **Settings → Notifications**. Use the "Test" button to verify connectivity.

### Telegram (recommended — easiest)

1. Search [@BotFather](https://t.me/botfather) on Telegram, send `/newbot`, follow prompts to create a bot and get the **Bot Token**
2. Add the bot to the group where you want notifications (or send it a direct message)
3. Visit `https://api.telegram.org/bot<YourToken>/getUpdates` and find the `chat.id` field
4. Enter Bot Token and Chat ID in settings, click Test

### Email

Email notifications are sent by the mailer configured at deployment — no SMTP setup needed in the UI.

- **Cloudflare Workers**: set env vars `RESEND_API_KEY` and `RESEND_FROM` (via `wrangler secret put` or GitHub Actions secrets)
- **Node Docker**: set `RESEND_API_KEY` and `RESEND_FROM` in your `.env` file

In the settings page, you only need to specify the recipient email address.

Getting a Resend API Key:
1. Sign up at [Resend](https://resend.com) (free tier: 100 emails/day)
2. Verify your sending domain, or use Resend's test domain
3. Create an API key and add it to your deployment environment

### WeCom Bot

1. Add a "Group Bot" in a WeCom group chat to get the Webhook URL
2. Paste the Webhook URL in settings, choose message format (text or markdown), click Test

### Webhook (generic)

For integrating with any HTTP-callback service (n8n, IFTTT, custom services):

- Enter the target URL
- Choose HTTP method (POST/GET)
- Optional: custom Headers (JSON format) and Payload template

Payload template supports these placeholders:

| Placeholder | Description |
| --- | --- |
| `{{title}}` | Notification title |
| `{{body}}` | Notification body |

### Bark (iOS push)

1. Download [Bark](https://apps.apple.com/app/bark/id1403753865) from the App Store
2. Open the app and copy your Device Key
3. Enter server URL (default `https://api.day.app`) and Device Key in settings, click Test

### NotifyX

1. Register at [NotifyX](https://www.notifyx.cn/) and get your API Key
2. Enter the API Key in settings, click Test

### ServerChan Turbo (WeChat push)

Push notifications to your WeChat via ServerChan Turbo:

1. Visit [sct.ftqq.com](https://sct.ftqq.com/) and sign in with WeChat
2. Copy your SendKey from the "SendKey" page
3. Enter the SendKey in settings, click Test

Security notes:
- The SendKey is a push credential — do not share it
- Messages are relayed through ServerChan's servers to WeChat
- Push content only includes subscription name and amount, no passwords or sensitive credentials
- The frontend masks the SendKey with a password input; exports automatically strip it
