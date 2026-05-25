/**
 * 离线指示器 — 监听 window online/offline，离线时显示顶部条幅。
 *
 * 配合 sw.js 的 API network-first 回退缓存，让用户离线时能看到上次同步的
 * 数据但同时知道自己处于离线状态。
 */
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export function OfflineIndicator() {
  const { t } = useI18n();
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500/95 px-3 py-1.5 text-[12px] font-medium text-amber-950 shadow-md">
      <WifiOff className="h-3.5 w-3.5" />
      <span>{t("pwa.offlineBanner")}</span>
    </div>
  );
}
