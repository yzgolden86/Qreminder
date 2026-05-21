/**
 * 通知中心独立页面（/notifications）。
 *
 * 把原本嵌在 Settings 通知 section 的"通知历史 + 即将发送"面板抽到顶层路由，
 * 让用户从 sidebar 直接进入，不再被通知渠道配置的长表单淹没。
 *
 * Caveat: 通知 *渠道配置*（邮件/Telegram/Webhook 等）仍留在 /settings，
 * 因为它们和账户级别的密钥、白名单耦合，不适合放在历史视图旁。
 */
import { useI18n } from "@/i18n/I18nProvider";
import { NotificationHistoryPanel } from "@/modules/settings/presentation/notification-history-panel";
import { useNotificationHistory } from "@/modules/settings/application/use-notification-history";

export default function NotificationsPage() {
  const { t } = useI18n();
  const history = useNotificationHistory();

  return (
    <div className="flex flex-col">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{t("notifications.pageTitle")}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("notifications.pageSubtitle")}</p>
      </div>

      <NotificationHistoryPanel
        data={history.data}
        isLoading={history.isLoading}
        isFetching={history.isFetching}
        error={history.error}
        status={history.historyStatus}
        setStatus={history.setStatus}
        loadMore={history.loadMore}
        refetch={() => void history.refetch()}
      />
    </div>
  );
}
