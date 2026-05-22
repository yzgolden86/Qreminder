import { useState } from 'react';
import { ExternalLink, Check, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/messages';
import {
  CHANNEL_LABELS,
  WEBHOOK_HEADERS_PLACEHOLDER,
  WEBHOOK_PAYLOAD_PLACEHOLDER,
  type AppSettings,
  type NotificationChannel,
} from '@/types/subscription';
import { CheckboxSettingRow, LoadingButtonContent, type UpdateSetting } from './settings-shared-controls';

/**
 * notification-channel-config-panel.tsx 渲染单个通知渠道的字段编辑面板。
 *
 * 架构位置：所有渠道最终都会进入后端 notification settings schema；这里按渠道
 * 分支只负责收集字段，测试发送通过 controller 走严格 schema 校验后的 API。
 *
 * Caveat: 新增渠道时必须同步 AppSettings、默认设置、Zod schema、Go appSettings、
 * knownChannels、history result schema 和这里的测试按钮。
 */
type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

function SecretInput({
  id,
  placeholder,
  value,
  onChange,
  className,
}: {
  id: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={className}
        autoComplete="off"
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        onClick={() => setVisible(!visible)}
        tabIndex={-1}
        aria-label={visible ? "Hide" : "Show"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function NotificationTestButton({
  channel,
  label,
  testingChannel,
  onTest,
}: {
  channel: NotificationChannel;
  label: string;
  testingChannel: NotificationChannel | null;
  onTest: (channel: NotificationChannel) => void;
}) {
  const { t } = useI18n();
  const isTesting = testingChannel === channel;

  return (
    <Button
      type="button"
      variant="outline"
      className="relative border-primary text-primary hover:bg-primary/10"
      onClick={() => onTest(channel)}
      disabled={testingChannel !== null}
      aria-busy={isTesting ? true : undefined}
    >
      <LoadingButtonContent loading={isTesting} loadingLabel={t("settings.testing")}>
        <Check aria-hidden="true" className="h-4 w-4" />
        {label}
      </LoadingButtonContent>
    </Button>
  );
}


function getNotificationChannelHelp(channel: NotificationChannel, t: Translate): { href: string; label: string } | null {
  switch (channel) {
    case 'telegram':
      return { href: 'https://t.me/botfather', label: t("settings.help.telegram") };
    case 'webhook':
      return { href: 'https://en.wikipedia.org/wiki/Webhook', label: t("settings.help.webhook") };
    case 'wechat':
      return { href: 'https://developer.work.weixin.qq.com/document/path/91770', label: t("settings.help.wechat") };
    case 'bark':
      return { href: 'https://github.com/Finb/Bark', label: t("settings.help.bark") };
    case 'notifyx':
      return { href: 'https://www.notifyx.cn/help', label: t("settings.help.notifyx") };
    case 'email':
      return null;
  }
}


export function NotificationChannelConfigPanel({
  channel,
  settings,
  enabled,
  updateSetting,
  testingChannel,
  onTest,
}: {
  channel: NotificationChannel;
  settings: AppSettings;
  enabled: boolean;
  updateSetting: UpdateSetting;
  testingChannel: NotificationChannel | null;
  onTest: (channel: NotificationChannel) => void;
}) {
  const { t, label } = useI18n();
  const help = getNotificationChannelHelp(channel, t);
  const channelLabel = label(CHANNEL_LABELS[channel]);

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("settings.channelConfig", { channel: channelLabel })}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {enabled ? t("settings.channelEnabledHelp") : t("settings.channelDisabledHelp")}
          </p>
        </div>
        {help ? (
          <a
            href={help.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {help.label}
          </a>
        ) : null}
      </div>

      {channel === 'telegram' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="telegramBot">Bot Token</Label>
              <SecretInput
                id="telegramBot"
                placeholder="xx:xxxxxxxxx-token"
                value={settings.telegramBotToken}
                onChange={(e) => updateSetting('telegramBotToken', e.target.value)}
                className="border-border bg-secondary"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="telegramChat">Chat ID</Label>
              <Input
                id="telegramChat"
                placeholder={t("settings.telegramChatPlaceholder")}
                value={settings.telegramChatId}
                onChange={(e) => updateSetting('telegramChatId', e.target.value)}
                className="border-border bg-secondary"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-col items-start gap-2 sm:items-end">
            <NotificationTestButton
              channel="telegram"
              label={t("settings.testChannel", { channel: channelLabel })}
              testingChannel={testingChannel}
              onTest={onTest}
            />
          </div>
        </>
      ) : null}

      {channel === 'notifyx' ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="notifyxKey">API Key</Label>
            <SecretInput
              id="notifyxKey"
              placeholder="napi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={settings.notifyxApiKey}
              onChange={(e) => updateSetting('notifyxApiKey', e.target.value)}
              className="border-border bg-secondary"
            />
            <p className="text-xs text-muted-foreground">{t("settings.notifyxHelp")}</p>
          </div>
          <div className="mt-4 flex justify-end">
            <NotificationTestButton
              channel="notifyx"
              label={t("settings.testChannel", { channel: channelLabel })}
              testingChannel={testingChannel}
              onTest={onTest}
            />
          </div>
        </>
      ) : null}

      {channel === 'webhook' ? (
        <>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="webhookUrl">Webhook URL</Label>
              <Input
                id="webhookUrl"
                placeholder="https://your-webhook-endpoint.com/path"
                value={settings.webhookUrl}
                onChange={(e) => updateSetting('webhookUrl', e.target.value)}
                className="border-border bg-secondary"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.webhookGetPostHelp")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="webhookMethod">{t("settings.webhookMethod")}</Label>
                <Select
                  value={settings.webhookMethod}
                  onValueChange={(value) => updateSetting('webhookMethod', value as 'GET' | 'POST')}
                >
                  <SelectTrigger className="border-border bg-secondary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="webhookHeaders">{t("settings.webhookHeaders")}</Label>
              <Textarea
                id="webhookHeaders"
                placeholder={WEBHOOK_HEADERS_PLACEHOLDER}
                value={settings.webhookHeaders}
                onChange={(e) => updateSetting('webhookHeaders', e.target.value)}
                className="min-h-[80px] border-border bg-secondary font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{t("settings.webhookHeadersHelp")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="webhookPayload">{t("settings.webhookPayload")}</Label>
              <Textarea
                id="webhookPayload"
                placeholder={WEBHOOK_PAYLOAD_PLACEHOLDER}
                value={settings.webhookPayload}
                onChange={(e) => updateSetting('webhookPayload', e.target.value)}
                className="min-h-[80px] border-border bg-secondary font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.webhookPayloadHelp")}
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <NotificationTestButton
              channel="webhook"
              label={t("settings.testChannel", { channel: channelLabel })}
              testingChannel={testingChannel}
              onTest={onTest}
            />
          </div>
        </>
      ) : null}

      {channel === 'wechat' ? (
        <>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="wechatUrl">{t("settings.wechatUrl")}</Label>
              <SecretInput
                id="wechatUrl"
                placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx-xxxx"
                value={settings.wechatWebhookUrl}
                onChange={(e) => updateSetting('wechatWebhookUrl', e.target.value)}
                className="border-border bg-secondary"
              />
              <p className="text-xs text-muted-foreground">{t("settings.wechatHelp")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="wechatMsgType">{t("settings.messageType")}</Label>
                <Select
                  value={settings.wechatMessageType}
                  onValueChange={(value) => updateSetting('wechatMessageType', value as 'text' | 'markdown')}
                >
                  <SelectTrigger className="border-border bg-secondary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{t("settings.textMessage")}</SelectItem>
                    <SelectItem value="markdown">Markdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CheckboxSettingRow
              id="wechatModeTag"
              checked={settings.wechatAddModeTag}
              onCheckedChange={(checked) => updateSetting('wechatAddModeTag', checked)}
              label={t("settings.wechatModeTag")}
            />
            <div className="grid gap-2">
              <Label htmlFor="wechatPhones">{t("settings.wechatPhones")}</Label>
              <Input
                id="wechatPhones"
                placeholder="135xxxxxxxx,136xxxxxxxx"
                value={settings.wechatAtPhones}
                onChange={(e) => updateSetting('wechatAtPhones', e.target.value)}
                className="border-border bg-secondary"
              />
              <p className="text-xs text-muted-foreground">{t("settings.wechatPhonesHelp")}</p>
            </div>
            <CheckboxSettingRow
              id="wechatAtAll"
              checked={settings.wechatAtAll}
              onCheckedChange={(checked) => updateSetting('wechatAtAll', checked)}
              label={t("settings.wechatAtAll")}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <NotificationTestButton
              channel="wechat"
              label={t("settings.testChannel", { channel: channelLabel })}
              testingChannel={testingChannel}
              onTest={onTest}
            />
          </div>
        </>
      ) : null}

      {channel === 'email' ? (
        <>
          <div className="grid gap-4">
            <p className="text-xs text-muted-foreground">
              {t("settings.emailDeployNote")}
            </p>
            <CheckboxSettingRow
              id="notifyMultipleAddresses"
              checked={settings.notifyMultipleAddresses}
              onCheckedChange={(checked) => updateSetting('notifyMultipleAddresses', checked)}
              label={t("settings.multipleRecipients")}
              description={t("settings.multipleRecipientsHelp")}
            />
            <div className="grid gap-2">
              <Label htmlFor="recipientEmail">{t("settings.recipientEmail")}</Label>
              <Input
                id="recipientEmail"
                type={settings.notifyMultipleAddresses ? 'text' : 'email'}
                placeholder={settings.notifyMultipleAddresses ? 'a@example.com, b@example.com' : 'user@example.com'}
                value={settings.recipientEmail}
                onChange={(e) => updateSetting('recipientEmail', e.target.value)}
                className="border-border bg-secondary"
              />
              <p className="text-xs text-muted-foreground">{t("settings.recipientEmailHelp")}</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <NotificationTestButton
              channel="email"
              label={t("settings.testChannel", { channel: channelLabel })}
              testingChannel={testingChannel}
              onTest={onTest}
            />
          </div>
        </>
      ) : null}

      {channel === 'bark' ? (
        <>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="barkUrl">{t("settings.barkServer")}</Label>
              <Input
                id="barkUrl"
                placeholder="https://api.day.app"
                value={settings.barkServerUrl}
                onChange={(e) => updateSetting('barkServerUrl', e.target.value)}
                className="border-border bg-secondary"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.barkServerHelp")}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="barkKey">{t("settings.barkKey")}</Label>
              <SecretInput
                id="barkKey"
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                value={settings.barkDeviceKey}
                onChange={(e) => updateSetting('barkDeviceKey', e.target.value)}
                className="border-border bg-secondary"
              />
              <p className="text-xs text-muted-foreground">{t("settings.barkKeyHelp")}</p>
            </div>
            <CheckboxSettingRow
              id="barkSilent"
              checked={settings.barkSilentPush}
              onCheckedChange={(checked) => updateSetting('barkSilentPush', checked)}
              label={t("settings.barkSilent")}
              description={t("settings.barkSilentHelp")}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <NotificationTestButton
              channel="bark"
              label={t("settings.testChannel", { channel: channelLabel })}
              testingChannel={testingChannel}
              onTest={onTest}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

