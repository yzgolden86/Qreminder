# Qreminder 项目迭代优化升级开发流程

> 适用项目：Qreminder  
> 当前目标：在现有 H5 / React / Hono / Drizzle / Cloudflare Workers / Node Docker 基础上，逐步增强移动端体验、微信通知、日历同步、备份迁移、续费账本、预算控制和通知策略能力。

---

## 0. 参考项目仓库地址

| 项目 | GitHub 地址 | 主要参考点 |
|---|---|---|
| Qreminder | https://github.com/yzgolden86/Qreminder | 当前项目，作为主开发基线 |
| subflare-vinext | https://github.com/Merack/subflare-vinext | Cloudflare Workers / D1 / Drizzle 架构、订阅管理结构、通知扩展思路 |
| laowang-subscription | https://github.com/tony-wang1990/laowang-subscription | PWA、日历视图、移动端体验、一键备份、健康检测 |
| RenewHelper | https://github.com/ieax/renewhelper | iCal、通知渠道、每项目独立通知、批量操作、农历、公历周期 |
| subscription-manager-bot | https://github.com/tslcat/subscription-manager-bot | Telegram Bot 交互、每日摘要、内联按钮、轻量提醒流程 |
| SubsTracker | https://github.com/wangwangit/SubsTracker | 支付历史、批量续订、多币种统计、Cloudflare Workers 轻量架构 |
| sub | https://github.com/mangguo02/sub | 极简 Cloudflare Worker 部署、多渠道通知、轻量实现 |
| SubTracker | https://github.com/Smile-QWQ/SubTracker | 预算、AI 识别、Logo 管理、Wallos 导入、备份恢复、标签筛选 |

---

## 1. 总体产品定位

Qreminder 后续建议定位为：

> 面向个人、家庭和小团队的自托管订阅支出管理系统。

核心能力不只是提醒订阅到期，而是完整回答以下问题：

- 我有哪些订阅？
- 谁在使用这些订阅？
- 什么时候续费？
- 会通知谁？
- 手机上是否方便查看？
- 微信是否能收到提醒？
- 本月、本年会花多少钱？
- 预算是否超支？
- 数据能不能备份、迁移和恢复？
- 通知是否真的发送成功？

---

## 2. 总体开发优先级

### 第一优先级：移动端和微信通知

目标：解决手机使用和微信提醒问题。

开发内容：

1. PWA 添加到桌面
2. Server酱 Turbo 微信通知
3. 企业微信群机器人通知增强
4. 通知渠道测试按钮
5. 通知失败日志基础版

参考项目：

- https://github.com/tony-wang1990/laowang-subscription
- https://github.com/ieax/renewhelper
- https://github.com/yzgolden86/Qreminder

---

### 第二优先级：日历和数据安全

目标：让用户敢长期使用 Qreminder。

开发内容：

1. iCal 日历订阅
2. iCal token 重置
3. JSON 导出
4. JSON 导入
5. 导入前校验
6. 导入前快照
7. CSV 导出

参考项目：

- https://github.com/ieax/renewhelper
- https://github.com/Smile-QWQ/SubTracker
- https://github.com/tony-wang1990/laowang-subscription

---

### 第三优先级：续费账本和真实支出

目标：从“提醒工具”升级为“订阅账本”。

开发内容：

1. 支付历史表
2. 快速续费
3. 续费记录编辑和删除
4. 实际支出统计
5. 预计账单 vs 实际支付

参考项目：

- https://github.com/Smile-QWQ/SubTracker
- https://github.com/wangwangit/SubsTracker
- https://github.com/ieax/renewhelper

---

### 第四优先级：预算控制和支出管理

目标：从“看支出”升级为“控支出”。

开发内容：

1. 月预算
2. 年预算
3. 分类预算
4. 标签预算
5. 用户预算
6. 预算超额提醒
7. 预算统计面板

参考项目：

- https://github.com/Smile-QWQ/SubTracker
- https://github.com/ieax/renewhelper

---

### 第五优先级：通知策略系统

目标：把多渠道通知升级为可配置、可诊断、可回退的通知策略系统。

开发内容：

1. 每订阅独立通知渠道
2. 分类默认通知渠道
3. 标签默认通知渠道
4. 备用通知渠道
5. 通知模板变量
6. 批量分配通知渠道
7. 通知失败自动切换备用渠道

参考项目：

- https://github.com/ieax/renewhelper
- https://github.com/Merack/subflare-vinext
- https://github.com/yzgolden86/Qreminder

---

### 第六优先级：迁移、Logo 和体验优化

目标：提升项目成熟度和迁移吸引力。

开发内容：

1. ZIP 备份恢复
2. CSV 导入
3. Wallos 导入
4. SubTracker 导入
5. Logo 自动抓取
6. Logo 上传
7. Logo 复用库
8. 系统诊断页

参考项目：

- https://github.com/Smile-QWQ/SubTracker
- https://github.com/tony-wang1990/laowang-subscription
- https://github.com/ieax/renewhelper

---

### 第七优先级：AI 和团队化

目标：形成差异化。

开发内容：

1. AI 文本录入
2. AI 图片识别
3. AI 月度消费总结
4. 重复订阅识别
5. 可取消订阅建议
6. 家庭/团队空间
7. 成员权限
8. 审计日志

参考项目：

- https://github.com/Smile-QWQ/SubTracker
- https://github.com/yzgolden86/Qreminder

---

## 3. 版本路线图

---

# v2.1：移动端和微信提醒版

## 版本目标

让 Qreminder 在手机上像 App 一样使用，并支持微信提醒。

## 主要参考项目

- https://github.com/tony-wang1990/laowang-subscription
- https://github.com/ieax/renewhelper
- https://github.com/yzgolden86/Qreminder

## 任务 2.1.1：PWA 基础支持

### 功能说明

增加 PWA，让用户可以在手机浏览器中将 Qreminder 添加到桌面，获得近似 App 的体验。

### 开发内容

- 新增 `manifest.webmanifest`
- 新增 PWA 图标资源
- 配置 `display: standalone`
- 配置 `theme_color`
- 配置 `background_color`
- 配置应用名称和短名称
- 配置启动路径
- 增加 Service Worker 基础缓存
- 移动端增加“添加到桌面”提示

### 建议文件位置

前端项目中可参考以下位置，具体以当前仓库结构为准：

```text
apps/web/public/manifest.webmanifest
apps/web/public/icons/icon-192.png
apps/web/public/icons/icon-512.png
apps/web/src/pwa/
apps/web/src/components/pwa-install-prompt.tsx
```

### manifest 示例

```json
{
  "name": "Qreminder",
  "short_name": "Qreminder",
  "description": "Self-hosted subscription reminder and expense manager",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111827",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### 验收标准

- Android Chrome 可以添加到桌面
- iOS Safari 可以添加到主屏幕
- 从桌面图标打开时是独立窗口体验
- 登录状态可保持
- 离线时显示友好提示页，不出现白屏

### 暂不建议实现

- 离线编辑
- 本地数据同步
- Web Push 原生通知

原因：当前阶段 PWA 的主要价值是移动端入口和桌面快捷方式，不要把复杂度提前拉高。

---

## 任务 2.1.2：移动端首页优化

### 功能说明

针对手机 PWA/H5 优化首页，让用户一打开就看到最关键的信息。

### 开发内容

首页新增移动端快捷卡片：

- 今日到期
- 7 天内到期
- 本月待付
- 本年预计支出
- 最近通知状态
- 快速新增订阅

移动端导航建议：

- 首页
- 订阅
- 日历
- 统计
- 设置

### 参考项目

- https://github.com/tony-wang1990/laowang-subscription
- https://github.com/Smile-QWQ/SubTracker

### 验收标准

- 手机宽度下不用横向滚动
- 主要操作可以单手完成
- 订阅卡片、通知卡片、统计卡片在手机上清晰可读
- PWA 模式下底部导航不被系统安全区遮挡

---

## 任务 2.1.3：Server酱 Turbo 微信通知

### 功能说明

新增 Server酱 Turbo 作为通知渠道，用于把 Qreminder 的提醒推送到用户手机微信。

### 参考项目

- https://github.com/ieax/renewhelper
- https://github.com/yzgolden86/Qreminder

### 新增通知渠道类型

```text
serverchan_turbo
```

### 配置字段

```text
id
userId
name
type = serverchan_turbo
sendKey
enabled
createdAt
updatedAt
```

如当前项目已有统一 notification channel 表，应在现有结构上扩展，不要新建割裂表。

### 后端发送逻辑

实现一个 notifier adapter：

```ts
interface Notifier {
  type: string
  send(payload: NotificationPayload): Promise<NotificationResult>
}
```

Server酱请求建议封装为：

```ts
class ServerChanTurboNotifier implements Notifier {
  type = 'serverchan_turbo'

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    // 1. 读取 sendKey
    // 2. 构建 title 和 desp
    // 3. POST 到 Server酱接口
    // 4. 记录成功/失败
  }
}
```

### 消息模板建议

```text
标题：Qreminder：{{subscription.name}} 将在 {{daysLeft}} 天后续费

内容：
订阅：{{subscription.name}}
金额：{{subscription.currency}} {{subscription.amount}}
到期日：{{subscription.nextRenewalDate}}
分类：{{subscription.category}}
付款方式：{{subscription.paymentMethod}}
```

### 前端配置页

新增设置项：

- 通道名称
- SendKey
- 是否启用
- 测试发送按钮
- 最近一次测试结果
- 最近一次失败原因

### 验收标准

- 用户可以新增 Server酱通知渠道
- 用户可以发送测试消息
- 订阅提醒任务可以通过 Server酱发出
- 成功和失败都记录到通知日志
- SendKey 不在前端明文回显完整值，只显示掩码

---

## 任务 2.1.4：企业微信群机器人通知增强

### 功能说明

在已有企业微信能力基础上，增加或增强企业微信群机器人 Webhook 通知。

### 参考项目

- https://github.com/ieax/renewhelper
- https://github.com/yzgolden86/Qreminder

### 新增或扩展通知渠道类型

```text
wechat_work_bot
```

### 配置字段

```text
id
userId
name
type = wechat_work_bot
webhookUrl
messageType: text | markdown
enabled
createdAt
updatedAt
```

### 功能点

- 支持 text 消息
- 支持 markdown 消息
- 支持测试发送
- 支持失败日志
- 支持在通知中心查看发送结果

### 验收标准

- 用户可以填写企业微信群机器人 Webhook
- 可以发送测试消息到企业微信群
- 订阅到期提醒可以发送到企业微信群
- Webhook URL 前端只显示掩码
- 发送失败时记录 HTTP 状态码和错误信息

---

## 任务 2.1.5：通知渠道测试按钮

### 功能说明

所有通知渠道增加统一“测试发送”能力。

### 参考项目

- https://github.com/ieax/renewhelper
- https://github.com/yzgolden86/Qreminder

### 后端 API

```text
POST /api/notification-channels/:id/test
```

请求体：

```json
{
  "message": "This is a test notification from Qreminder."
}
```

返回示例：

```json
{
  "success": true,
  "provider": "serverchan_turbo",
  "sentAt": "2026-05-23T12:00:00.000Z"
}
```

失败返回示例：

```json
{
  "success": false,
  "provider": "serverchan_turbo",
  "error": "Invalid SendKey or provider rejected the request."
}
```

### 验收标准

- 每个通知渠道详情页都有测试按钮
- 测试结果即时展示
- 测试记录进入通知日志
- 不影响正式订阅提醒任务

---

## 任务 2.1.6：通知失败日志基础版

### 功能说明

把通知发送失败原因记录下来，方便用户排查配置问题。

### 建议数据表

```text
notification_delivery_logs
```

字段建议：

```text
id
userId
subscriptionId
channelId
channelType
status: success | failed
messageTitle
messageBody
providerResponse
errorMessage
sentAt
createdAt
```

### 前端入口

- 设置页：通知渠道详情中展示最近 10 条日志
- 通知中心：可以按成功/失败筛选
- 订阅详情页：展示该订阅最近提醒记录

### 验收标准

- 所有通知发送都写入日志
- 失败日志包含可读错误原因
- 用户可以在前端看到最近失败记录

---

# v2.2：日历同步和数据安全版

## 版本目标

让用户可以把续费日期同步到手机日历，并能导出、导入和备份数据。

## 主要参考项目

- https://github.com/ieax/renewhelper
- https://github.com/Smile-QWQ/SubTracker
- https://github.com/tony-wang1990/laowang-subscription

---

## 任务 2.2.1：iCal 日历订阅

### 功能说明

为每个用户生成独立 iCal 订阅链接，让用户可以在 iOS 日历、Google Calendar、Outlook 等工具中查看订阅续费日期。

### 参考项目

- https://github.com/ieax/renewhelper

### API 设计

```text
GET /api/ical/:token
POST /api/settings/ical/reset-token
```

### iCal token 字段

可在用户设置表中新增：

```text
icalToken
icalEnabled
icalCreatedAt
icalUpdatedAt
```

### 导出规则

默认导出：

- 启用中的订阅
- 未来 12 个月内的续费事件
- 试用到期事件
- 到期日事件

可选配置：

- 是否包含已暂停订阅
- 是否包含已取消订阅
- 是否包含金额
- 是否包含备注

### ICS 事件内容

```text
SUMMARY: Netflix 续费提醒
DTSTART;VALUE=DATE:20260601
DESCRIPTION: 金额 HKD 78\n周期 月付\n分类 影音\n付款方式 Visa\n网站 https://netflix.com
```

### 开发步骤

1. 后端增加 ICS 生成工具
2. 用户设置表增加 iCal token
3. 新增公开只读接口 `/api/ical/:token`
4. 设置页增加复制链接按钮
5. 设置页增加重置 token 按钮
6. 日历页增加“同步到手机日历”说明

### 验收标准

- iCal 链接无需登录即可只读访问
- token 无效时返回 404
- 重置 token 后旧链接立即失效
- iOS 日历可以订阅
- Google Calendar 可以订阅
- Outlook 可以订阅
- 事件描述中包含订阅关键信息

---

## 任务 2.2.2：JSON 导出

### 功能说明

用户可以导出自己的 Qreminder 数据为 JSON 文件。

### API 设计

```text
GET /api/export/json
```

### 导出内容

```text
subscriptions
categories
tags
notificationChannels
userSettings
paymentMethods
```

如果 v2.3 已经实现支付历史，也应加入：

```text
payments
```

### 导出文件结构

```json
{
  "app": "Qreminder",
  "schemaVersion": 1,
  "exportedAt": "2026-05-23T12:00:00.000Z",
  "data": {
    "subscriptions": [],
    "categories": [],
    "tags": [],
    "notificationChannels": [],
    "userSettings": []
  }
}
```

### 安全要求

敏感字段需要处理：

- notification channel token 默认不导出完整值，或要求用户确认
- password / session / auth token 绝对不能导出
- webhookUrl / sendKey 可提供“包含敏感配置”的选项

### 验收标准

- 用户可以下载 JSON 文件
- JSON 中包含订阅、分类、标签、设置
- 不包含密码、session、auth token
- 文件可以被后续导入流程识别

---

## 任务 2.2.3：JSON 导入

### 功能说明

用户可以导入 Qreminder JSON 备份。

### API 设计

```text
POST /api/import/json/preview
POST /api/import/json/confirm
```

### 导入流程

1. 用户上传 JSON
2. 后端校验 schemaVersion
3. 后端生成导入预览
4. 前端展示新增、更新、冲突、跳过数量
5. 用户确认导入
6. 后端执行导入
7. 返回导入结果

### 冲突处理策略

可选策略：

```text
skip: 跳过已存在数据
overwrite: 覆盖已存在数据
rename: 重名数据自动重命名
merge: 合并标签和分类
```

### 验收标准

- 非 Qreminder JSON 会被拒绝并提示原因
- 导入前可以预览
- 导入前自动创建快照
- 导入失败不会污染已有数据
- 重复数据有明确处理策略

---

## 任务 2.2.4：CSV 导出

### 功能说明

支持将订阅列表导出为 CSV，方便用户用 Excel、Numbers、Google Sheets 查看。

### API 设计

```text
GET /api/export/subscriptions.csv
```

### CSV 字段

```text
name
amount
currency
billingCycle
nextRenewalDate
category
tags
paymentMethod
website
notes
status
createdAt
updatedAt
```

### 验收标准

- CSV 可被 Excel 正常打开
- 中文不乱码，建议 UTF-8 BOM
- 标签字段可以用逗号或分号分隔
- 日期格式统一为 ISO 或 yyyy-MM-dd

---

# v2.3：续费账本版

## 版本目标

让 Qreminder 记录真实支付行为，而不只是预计续费日期。

## 主要参考项目

- https://github.com/Smile-QWQ/SubTracker
- https://github.com/wangwangit/SubsTracker
- https://github.com/ieax/renewhelper

---

## 任务 2.3.1：支付历史数据表

### 功能说明

新增支付历史表，记录每一次订阅续费或付款。

### 数据表

```text
subscription_payments
```

### 字段建议

```text
id
userId
subscriptionId
paidAt
amount
currency
billingPeriod
paymentMethod
previousRenewalDate
nextRenewalDate
note
createdAt
updatedAt
```

### Drizzle schema 参考

```ts
export const subscriptionPayments = sqliteTable('subscription_payments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  subscriptionId: text('subscription_id').notNull(),
  paidAt: integer('paid_at', { mode: 'timestamp' }).notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull(),
  billingPeriod: text('billing_period'),
  paymentMethod: text('payment_method'),
  previousRenewalDate: integer('previous_renewal_date', { mode: 'timestamp' }),
  nextRenewalDate: integer('next_renewal_date', { mode: 'timestamp' }),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
```

### 验收标准

- 可以为某个订阅创建支付记录
- 支付记录归属当前用户
- 非拥有者不能访问支付记录
- 支持 SQLite 和 D1 两种运行环境

---

## 任务 2.3.2：快速续费

### 功能说明

用户在订阅列表或订阅详情中点击“续费”，系统自动创建支付记录并推算下一次续费日期。

### API 设计

```text
POST /api/subscriptions/:id/renew
```

请求体示例：

```json
{
  "paidAt": "2026-05-23",
  "amount": 20,
  "currency": "USD",
  "paymentMethod": "Visa",
  "note": "Manual renewal"
}
```

### 后端逻辑

1. 查询订阅
2. 读取当前金额、币种、周期、付款方式
3. 计算 previousRenewalDate
4. 计算 nextRenewalDate
5. 创建 payment 记录
6. 更新 subscription.nextRenewalDate
7. 写入通知中心或活动日志

### 验收标准

- 快速续费默认填入当前订阅信息
- 可以手动修改金额、币种、付款方式
- 续费后下一次到期日正确更新
- 支付历史中能看到记录

---

## 任务 2.3.3：支付历史 UI

### 页面入口

- 订阅详情页增加“支付历史”Tab
- 统计页增加“真实支出”模块
- 订阅列表增加“快速续费”按钮

### 功能

- 查看支付记录
- 新增支付记录
- 编辑支付记录
- 删除支付记录
- 按时间筛选
- 按付款方式筛选

### 验收标准

- 订阅详情页可以看到该订阅所有支付记录
- 修改支付记录后统计同步更新
- 删除支付记录时提示是否影响订阅下一次到期日

---

## 任务 2.3.4：实际支出统计

### 功能说明

基于 payment 表统计实际支出，与基于订阅周期推算的预计账单区分开。

### 指标

```text
本月实际支出
本月预计待付
今年实际支出
今年预计总支出
未来 30 天待付
按分类实际支出
按标签实际支出
按付款方式实际支出
```

### 验收标准

- 统计页能切换“预计账单”和“实际支付”
- 多币种按基础币种换算
- 删除或编辑支付记录后统计结果更新

---

# v2.4：预算控制版

## 版本目标

让用户不只是查看订阅支出，而是控制订阅支出。

## 主要参考项目

- https://github.com/Smile-QWQ/SubTracker
- https://github.com/ieax/renewhelper

---

## 任务 2.4.1：预算数据表

### 数据表

```text
budgets
```

### 字段建议

```text
id
userId
scopeType: global | category | tag | payment_method | user
scopeId
period: monthly | yearly
amount
currency
enabled
createdAt
updatedAt
```

### 验收标准

- 可以创建全局月预算
- 可以创建全局年预算
- 可以创建分类预算
- 可以创建标签预算
- 可以启用和停用预算

---

## 任务 2.4.2：预算统计

### 功能说明

根据实际支付和预计账单计算预算使用情况。

### 指标

```text
预算金额
已使用金额
预计月底金额
剩余额度
使用率
是否超支
```

### 前端展示

- 预算进度条
- 超预算警告
- 分类预算排行
- 标签预算排行
- 本月预算摘要

### 验收标准

- 预算页能展示当前预算使用率
- 超过 80% 有提示
- 超过 100% 有明确超支标记
- 多币种按基础币种换算

---

## 任务 2.4.3：预算超额提醒

### 通知触发条件

```text
预算使用超过 80%
预算使用超过 100%
预计月底将超预算
某分类支出异常增长
```

### 通知渠道

复用现有通知系统：

- 站内通知
- Email
- Telegram
- Server酱 Turbo
- 企业微信
- Bark
- NotifyX
- Webhook

### 验收标准

- 预算超额时能生成站内通知
- 可以通过微信渠道收到预算提醒
- 同一预算同一阈值不会重复刷屏

---

# v2.5：通知策略版

## 版本目标

把 Qreminder 的通知能力从“多渠道发送”升级为“通知策略系统”。

## 主要参考项目

- https://github.com/ieax/renewhelper
- https://github.com/Merack/subflare-vinext
- https://github.com/yzgolden86/Qreminder

---

## 任务 2.5.1：每订阅独立通知渠道

### 功能说明

允许每条订阅单独选择通知渠道。

### 数据关系

新增关联表：

```text
subscription_notification_channels
```

字段建议：

```text
id
userId
subscriptionId
channelId
createdAt
```

### 策略优先级

```text
订阅独立渠道 > 标签默认渠道 > 分类默认渠道 > 用户默认渠道 > 系统默认渠道
```

### 验收标准

- 订阅详情页可以选择通知渠道
- 不选择时走用户默认渠道
- 选择后只发送到指定渠道
- 支持多选渠道

---

## 任务 2.5.2：分类和标签默认通知渠道

### 功能说明

允许分类或标签配置默认通知渠道。

### 使用场景

- AI 工具发到个人微信
- 公司 SaaS 发到企业微信群
- VPS / 域名发到 Email + Bark
- 家庭订阅发到家庭微信群

### 验收标准

- 分类可以设置默认通知渠道
- 标签可以设置默认通知渠道
- 订阅未设置独立渠道时，能自动继承分类或标签渠道

---

## 任务 2.5.3：备用通知渠道

### 功能说明

当主通知渠道失败时，自动尝试备用通知渠道。

### 数据字段

可在 notification channel 或策略表中新增：

```text
fallbackChannelIds
retryCount
retryIntervalSeconds
```

### 验收标准

- 主渠道失败后自动尝试备用渠道
- 日志中能看到主渠道失败和备用渠道成功/失败
- 避免无限重试

---

## 任务 2.5.4：通知模板变量系统

### 功能说明

允许用户自定义通知内容。

### 模板变量

```text
{{subscription.name}}
{{subscription.amount}}
{{subscription.currency}}
{{subscription.nextRenewalDate}}
{{subscription.category}}
{{subscription.paymentMethod}}
{{daysLeft}}
{{renewalUrl}}
{{user.name}}
```

### 模板作用域

```text
全局默认模板
渠道模板
订阅模板
预算提醒模板
```

### 验收标准

- 用户可以编辑模板
- 模板变量可以正确渲染
- 无效变量有提示
- Markdown 渠道保留 Markdown 格式

---

# v2.6：迁移和体验版

## 版本目标

让 Qreminder 更容易迁移、更好看、更容易排障。

## 主要参考项目

- https://github.com/Smile-QWQ/SubTracker
- https://github.com/tony-wang1990/laowang-subscription
- https://github.com/ieax/renewhelper

---

## 任务 2.6.1：ZIP 备份恢复

### 功能说明

导出完整备份包，包含订阅、支付历史、设置和 Logo。

### ZIP 结构

```text
qreminder-backup.zip
  metadata.json
  subscriptions.json
  payments.json
  categories.json
  tags.json
  budgets.json
  settings.json
  notification-channels.json
  logos/
```

### metadata.json 示例

```json
{
  "app": "Qreminder",
  "version": "2.6.0",
  "schemaVersion": 1,
  "exportedAt": "2026-05-23T12:00:00.000Z"
}
```

### 验收标准

- 用户可以下载完整 ZIP 备份
- 用户可以上传 ZIP 并预览
- 导入前自动创建快照
- Logo 可以恢复
- 敏感通知配置有明确导出选项

---

## 任务 2.6.2：CSV 导入

### 功能说明

支持从 Excel、Numbers、Google Sheets 或 Notion 导出的 CSV 导入订阅。

### CSV 字段

```text
name
amount
currency
billingCycle
nextRenewalDate
category
tags
paymentMethod
website
notes
status
```

### 导入流程

1. 上传 CSV
2. 自动识别字段
3. 用户确认字段映射
4. 预览导入结果
5. 确认导入

### 验收标准

- 支持中文 CSV
- 支持字段映射
- 错误行可单独提示
- 导入失败不会影响已有数据

---

## 任务 2.6.3：Wallos 导入

### 参考项目

- https://github.com/Smile-QWQ/SubTracker

### 功能说明

支持从 Wallos 导出的 JSON 或 SQLite 数据迁移到 Qreminder。

### 开发建议

先支持 JSON，再考虑 SQLite。

### 验收标准

- 可以解析 Wallos JSON
- 可以转换为 Qreminder subscriptions
- 可以保留金额、周期、到期日、分类、备注等主要字段

---

## 任务 2.6.4：Logo 自动抓取和管理

### 参考项目

- https://github.com/Smile-QWQ/SubTracker

### 功能说明

提升订阅卡片视觉效果，减少用户手动找图标的成本。

### 开发内容

1. 根据 website 自动抓取 favicon
2. Logo 加载失败 fallback
3. 手动上传 Logo
4. Logo 复用库
5. 批量刷新 Logo

### 验收标准

- 用户填写网站后可以自动获取 Logo
- 获取失败时显示默认 Logo
- 用户可以手动上传 Logo
- 备份恢复时 Logo 不丢失

---

## 任务 2.6.5：系统诊断页

### 参考项目

- https://github.com/tony-wang1990/laowang-subscription

### 功能说明

为自托管用户提供排障入口。

### 诊断内容

```text
当前版本号
运行环境：Cloudflare Workers / Node
数据库状态：D1 / SQLite
文件存储状态：R2 / local
最近一次 Cron 执行时间
下一次计划执行时间
通知渠道状态
最近 10 条通知失败日志
汇率更新时间
关键环境变量检查
```

### 验收标准

- 管理员可以打开诊断页
- 可以看到 Cron 是否正常运行
- 可以看到通知渠道最近失败情况
- 缺少关键环境变量时有明确提示

---

# v3.0：AI 和团队版

## 版本目标

做出 Qreminder 的长期差异化。

## 主要参考项目

- https://github.com/Smile-QWQ/SubTracker
- https://github.com/yzgolden86/Qreminder

---

## 任务 3.0.1：AI 文本录入

### 功能说明

用户粘贴账单短信、邮件、支付记录文本后，AI 自动提取订阅信息。

### 输入示例

```text
Your Netflix subscription of HKD 78 will renew on 2026-06-01 using Visa ending 1234.
```

### 输出字段

```json
{
  "name": "Netflix",
  "amount": 78,
  "currency": "HKD",
  "nextRenewalDate": "2026-06-01",
  "paymentMethod": "Visa ending 1234",
  "billingCycle": "monthly"
}
```

### 验收标准

- AI 输出必须进入表单让用户确认，不直接入库
- 用户可以修改识别结果
- 识别失败时给出清晰提示

---

## 任务 3.0.2：AI 月度消费总结

### 功能说明

在统计页生成自然语言总结。

### 总结内容

```text
本月订阅总支出
相比上月变化
支出最高的分类
即将续费的大额订阅
可能重复的订阅
可考虑取消的低频订阅
```

### 验收标准

- 用户手动点击生成
- 不自动把敏感数据发送给第三方，除非用户开启 AI 功能
- 有明确隐私提示

---

## 任务 3.0.3：家庭/团队空间

### 功能说明

基于 Qreminder 已有多用户能力，进一步支持共享空间。

### 概念

```text
Workspace
Member
Role
SharedSubscription
```

### 角色

```text
owner
admin
editor
viewer
```

### 验收标准

- 用户可以创建家庭/团队空间
- 可以邀请成员
- 可以设置成员权限
- 订阅可以归属于个人或空间

---

## 任务 3.0.4：审计日志

### 功能说明

团队化后记录关键操作。

### 记录内容

```text
创建订阅
修改订阅
删除订阅
续费订阅
修改预算
修改通知渠道
导入数据
导出数据
```

### 验收标准

- 管理员可以查看审计日志
- 日志包含操作者、操作对象、时间和变更摘要
- 普通用户不能查看无权限空间日志

---

## 4. 推荐实际开发顺序

如果只考虑投入产出比，建议按下面顺序开发：

```text
1. PWA 添加到桌面
2. 移动端首页优化
3. Server酱 Turbo 微信通知
4. 企业微信群机器人通知增强
5. 通知渠道测试按钮
6. 通知失败日志基础版
7. iCal 日历订阅
8. iCal token 重置
9. JSON 导出
10. JSON 导入
11. CSV 导出
12. 支付历史表
13. 快速续费
14. 支付历史 UI
15. 实际支出统计
16. 预算数据表
17. 预算统计
18. 预算超额提醒
19. 每订阅独立通知渠道
20. 分类和标签默认通知渠道
21. 备用通知渠道
22. 通知模板变量系统
23. ZIP 备份恢复
24. CSV 导入
25. Logo 自动抓取
26. Logo 上传和复用库
27. 系统诊断页
28. Wallos 导入
29. AI 文本录入
30. AI 月度消费总结
31. 家庭/团队空间
32. 审计日志
```

---

## 5. 小程序与 PWA 的取舍建议

当前阶段不建议优先做小程序。

原因：

- Qreminder 已经有 H5
- PWA 可以添加到手机桌面
- PWA 不需要小程序审核
- PWA 不需要维护第二套前端
- PWA 不需要处理微信小程序登录体系
- 自托管项目更适合 Web / PWA

建议策略：

```text
先做 PWA + 微信通知。
如果后续用户强烈需要微信内打开、微信分享、微信订阅消息，再考虑小程序。
```

小程序适合的条件：

- 已经有稳定用户规模
- 大量用户明确要求微信内使用
- 需要微信小程序订阅消息
- 需要微信生态分享
- 面向非技术大众用户

---

## 6. 微信通知推荐方案

### 第一优先级：Server酱 Turbo

适用场景：个人微信提醒。

优点：

- 配置简单
- 适合个人用户
- 手机微信接收体验好

在 Qreminder 中建议命名为：

```text
微信提醒：Server酱 Turbo
```

---

### 第二优先级：企业微信群机器人

适用场景：家庭群、团队群、公司群。

优点：

- 免费
- 适合群提醒
- 实现简单

在 Qreminder 中建议命名为：

```text
微信群提醒：企业微信群机器人
```

---

### 第三优先级：企业微信应用消息

适用场景：高级用户、公司内部使用。

优点：

- 更正式
- 适合企业用户
- 可管理成员和应用权限

---

## 7. Agent 开发提示词模板

下面这段可以直接交给 coding agent 使用。

```text
请在 Qreminder 仓库中实现本阶段功能。仓库地址：
https://github.com/yzgolden86/Qreminder

请优先保持现有技术栈和代码风格，不要引入不必要的新框架。项目可能包含 React/Vite/Tailwind/shadcn 前端，以及 Hono/Drizzle/Better Auth 后端，并支持 Cloudflare Workers/D1 和 Node/SQLite 双运行时。

开发要求：
1. 先阅读 README、package.json、apps/*、packages/*、数据库 schema、路由结构和现有通知模块。
2. 复用现有 auth、database、notification、settings 结构。
3. 新增功能必须同时考虑 Cloudflare Workers 和 Node/Docker 环境。
4. 涉及数据库变更时，补充 Drizzle schema 和 migration。
5. 涉及通知渠道时，必须接入现有通知中心和日志体系。
6. 前端 UI 复用现有组件风格。
7. 敏感字段如 token、webhook、sendKey 在前端必须掩码显示。
8. 补充必要的错误处理和空状态。
9. 提供最终变更清单和测试步骤。
```

---

## 8. v2.1 Agent 任务模板：PWA + 微信通知

```text
请为 Qreminder 实现 v2.1：移动端和微信提醒版。

参考仓库：
- 当前项目：https://github.com/yzgolden86/Qreminder
- PWA 参考：https://github.com/tony-wang1990/laowang-subscription
- 通知渠道参考：https://github.com/ieax/renewhelper

需要实现：
1. PWA 基础支持：manifest、icons、standalone display、离线友好页。
2. 移动端首页优化：今日到期、7天内到期、本月待付、快速新增。
3. 新增 Server酱 Turbo 通知渠道。
4. 新增或增强企业微信群机器人 Webhook 通知渠道。
5. 所有通知渠道增加测试发送按钮。
6. 增加通知失败日志基础版。

验收标准：
- 手机浏览器可以添加到桌面。
- PWA 打开后是独立窗口体验。
- Server酱可以收到测试消息和正式订阅提醒。
- 企业微信群机器人可以收到测试消息和正式订阅提醒。
- 通知发送成功和失败都有日志。
- token、sendKey、webhookUrl 在前端掩码显示。
```

---

## 9. v2.2 Agent 任务模板：iCal + 导入导出

```text
请为 Qreminder 实现 v2.2：日历同步和数据安全版。

参考仓库：
- 当前项目：https://github.com/yzgolden86/Qreminder
- iCal 参考：https://github.com/ieax/renewhelper
- 备份迁移参考：https://github.com/Smile-QWQ/SubTracker
- 备份参考：https://github.com/tony-wang1990/laowang-subscription

需要实现：
1. iCal 订阅链接：GET /api/ical/:token。
2. iCal token 重置。
3. 设置页增加复制 iCal 链接。
4. JSON 导出。
5. JSON 导入预览。
6. JSON 导入确认。
7. CSV 导出。

验收标准：
- iOS 日历、Google Calendar、Outlook 能订阅 iCal。
- token 重置后旧链接失效。
- JSON 导出不包含密码、session、auth token。
- JSON 导入前有预览和冲突处理。
- CSV 中文不乱码。
```

---

## 10. v2.3 Agent 任务模板：支付历史 + 快速续费

```text
请为 Qreminder 实现 v2.3：续费账本版。

参考仓库：
- 当前项目：https://github.com/yzgolden86/Qreminder
- 支付历史参考：https://github.com/Smile-QWQ/SubTracker
- 续费记录参考：https://github.com/wangwangit/SubsTracker
- 支出统计参考：https://github.com/ieax/renewhelper

需要实现：
1. 新增 subscription_payments 表。
2. 新增支付记录 CRUD API。
3. 新增快速续费 API：POST /api/subscriptions/:id/renew。
4. 订阅详情页增加支付历史。
5. 订阅列表增加快速续费按钮。
6. 统计页增加实际支出统计。
7. 支持预计账单和实际支付切换。

验收标准：
- 支付记录按用户隔离。
- 快速续费会更新下一次到期日。
- 支付历史可以编辑和删除。
- 实际支出统计根据 payment 表计算。
- 多币种统计沿用现有汇率逻辑。
```

---

## 11. v2.4 Agent 任务模板：预算系统

```text
请为 Qreminder 实现 v2.4：预算控制版。

参考仓库：
- 当前项目：https://github.com/yzgolden86/Qreminder
- 预算参考：https://github.com/Smile-QWQ/SubTracker
- 支出分析参考：https://github.com/ieax/renewhelper

需要实现：
1. 新增 budgets 表。
2. 支持全局月预算、全局年预算。
3. 支持分类预算、标签预算、用户预算。
4. 统计页展示预算使用率。
5. 预算超过 80% 和 100% 时提醒。
6. 预算提醒接入现有通知系统。

验收标准：
- 用户可以创建、编辑、删除预算。
- 预算统计支持多币种换算。
- 预算超额能生成站内通知。
- Server酱/企业微信等渠道可以收到预算提醒。
```

---

## 12. v2.5 Agent 任务模板：通知策略系统

```text
请为 Qreminder 实现 v2.5：通知策略版。

参考仓库：
- 当前项目：https://github.com/yzgolden86/Qreminder
- 通知策略参考：https://github.com/ieax/renewhelper
- 架构参考：https://github.com/Merack/subflare-vinext

需要实现：
1. 每订阅独立通知渠道。
2. 分类默认通知渠道。
3. 标签默认通知渠道。
4. 备用通知渠道。
5. 通知模板变量系统。
6. 批量分配通知渠道。

通知优先级：
订阅独立渠道 > 标签默认渠道 > 分类默认渠道 > 用户默认渠道 > 系统默认渠道。

验收标准：
- 订阅可以单独选择通知渠道。
- 分类和标签可以配置默认渠道。
- 主渠道失败后可以尝试备用渠道。
- 通知模板变量可以正确渲染。
- 所有发送路径都有日志。
```

---

## 13. v2.6 Agent 任务模板：迁移、Logo、诊断

```text
请为 Qreminder 实现 v2.6：迁移和体验版。

参考仓库：
- 当前项目：https://github.com/yzgolden86/Qreminder
- 迁移和 Logo 参考：https://github.com/Smile-QWQ/SubTracker
- 备份和健康检测参考：https://github.com/tony-wang1990/laowang-subscription
- 批量操作参考：https://github.com/ieax/renewhelper

需要实现：
1. ZIP 备份恢复。
2. CSV 导入。
3. Wallos JSON 导入。
4. Logo 自动抓取 favicon。
5. Logo 上传。
6. Logo 复用库。
7. 系统诊断页。

验收标准：
- ZIP 可以完整导出和恢复。
- CSV 可以通过字段映射导入。
- Wallos JSON 可以转换为 Qreminder 订阅。
- 填写网站后可以自动获取 Logo。
- 管理员可以查看系统诊断信息。
```

---

## 14. 风险和注意事项

### 数据安全

- 导入前必须做快照。
- 敏感配置默认不导出，或要求用户明确确认。
- 删除和覆盖操作必须二次确认。

### 多运行时兼容

Qreminder 同时支持 Cloudflare Workers 和 Node/Docker，因此新增能力需要注意：

- 不要使用 Node-only API，除非有 Workers 替代实现。
- 文件上传、ZIP、Logo 存储要区分 R2 和本地文件系统。
- Cron 行为要同时考虑 Cloudflare Cron 和 node-cron。

### 通知可靠性

- 所有通知发送必须写日志。
- 所有通知渠道必须支持测试发送。
- 通知失败不能中断整个提醒任务。
- 备用渠道要避免无限重试。

### PWA 现实限制

- PWA 添加到桌面可以实现。
- iOS 上 Web Push 支持有限，且用户体验不如原生 App 或微信通知稳定。
- 当前阶段不要依赖 Web Push 做核心提醒，应优先用 Server酱、企业微信、Email、Telegram、Bark 等服务端通知渠道。

---

## 15. 最终建议

当前最推荐立即启动的开发任务是：

```text
1. PWA 添加到桌面
2. Server酱 Turbo 微信通知
3. 企业微信群机器人通知增强
4. 通知测试按钮
5. 通知失败日志
6. iCal 日历订阅
7. JSON 导出/导入
```

这组功能完成后，Qreminder 会明显提升：

- 手机使用体验更接近 App
- 微信可以收到提醒
- 通知配置更容易排查
- 续费日期可以同步到手机日历
- 用户可以备份和迁移数据

后续再依次推进：

```text
支付历史 → 预算系统 → 通知策略 → ZIP 备份 → 迁移导入 → Logo 管理 → AI → 团队空间
```
