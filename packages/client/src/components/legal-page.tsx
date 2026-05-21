/**
 * 法务/声明类页面外壳。
 *
 * 架构位置：
 * - 登录页可链接到无需登录的 terms/privacy 页面。
 * - 本组件统一品牌区、正文容器和返回入口。
 */
import Link from '@/components/router-link';
import type { ReactNode } from "react";
import { ArrowLeft, Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QreminderLogo } from "@/components/icons/qreminder-logo";
import { useI18n } from "@/i18n/I18nProvider";

/**
 * 法务/声明类页面通用外壳（/terms、/privacy 等）。
 *
 * 目标：
 * - 登录页里会链接到这些页面，因此必须是“无需登录也可访问”
 * - 统一 UI：避免重复维护两套布局
 */
export function LegalPageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen theme-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="surface-elevated rounded-2xl p-8 grid gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_24px_-16px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
              <QreminderLogo className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">{title}</h1>
              {subtitle ? <p className="text-[11px] text-muted-foreground">{subtitle}</p> : null}
            </div>
          </div>

          <div className="text-[13px] text-muted-foreground leading-relaxed">
            {children}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/login" className="inline-flex items-center gap-2">
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("common.backToLogin")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/" className="inline-flex items-center gap-2">
                <Home className="h-3.5 w-3.5" />
                {t("common.backHome")}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
