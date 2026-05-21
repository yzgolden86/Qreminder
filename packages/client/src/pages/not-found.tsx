/**
 * 404 页面（App Router 的 not-found）。
 *
 * 说明：
 * - 这里会记录一次 console.error，便于在开发/监控里发现错误路由访问
 */

import { useEffect } from "react";
import { usePathname } from '@/lib/router';
import Link from '@/components/router-link';
import { useI18n } from "@/i18n/I18nProvider";

export default function NotFound() {
  const pathname = usePathname();
  const { t } = useI18n();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", pathname);
  }, [pathname]);

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="num-display mb-2 text-[72px] font-semibold leading-none text-foreground/10">404</h1>
        <p className="mb-4 text-[15px] text-muted-foreground">{t("notFound.title")}</p>
        <Link href="/" className="text-[13px] text-primary hover:text-primary/80 hover:underline">
          {t("notFound.home")}
        </Link>
      </div>
    </div>
  );
}
