import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/I18nProvider";
import type { AdminUser, UserRole } from "@/lib/api/schemas/admin";
import { isEnabledAdmin } from "./types";

/**
 * admin-user-row.tsx 渲染管理员用户列表中的单行操作区。
 *
 * 架构位置：页面负责 API 调用和错误处理，本组件只根据当前用户、最后管理员
 * 和更新中状态计算可交互性，让保护规则在 UI 上可见但不成为安全边界。
 *
 * Caveat: 前端禁用只提升体验；后端仍必须在 PATCH/DELETE 中执行最后管理员保护。
 */
export interface AdminUserRowProps {
  user: AdminUser;
  currentUserId: string | undefined;
  enabledAdminCount: number;
  isUpdating: boolean;
  onRoleChange: (user: AdminUser, role: UserRole) => void;
  onStatusChange: (user: AdminUser, enabled: boolean) => void;
  onResetPassword: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}

export function AdminUserRow({
  user,
  currentUserId,
  enabledAdminCount,
  isUpdating,
  onRoleChange,
  onStatusChange,
  onResetPassword,
  onDelete,
}: AdminUserRowProps) {
  const { t } = useI18n();
  const isCurrentUser = user.id === currentUserId;
  const isLastEnabledAdmin = isEnabledAdmin(user) && enabledAdminCount <= 1;
  // 前端提前禁用会造成更清晰的操作反馈；后端仍会重复校验，防止绕过 UI 造成系统无管理员。
  const protectionMessage = isCurrentUser
    ? t("admin.currentUserProtected")
    : isLastEnabledAdmin
      ? t("admin.lastAdmin")
      : undefined;
  const protectedMessageId = protectionMessage ? "admin-user-" + user.id + "-protection" : undefined;
  const shouldDisableRoleAndStatus = isUpdating || isCurrentUser || isLastEnabledAdmin;
  const shouldDisableDelete = isUpdating || isCurrentUser || isLastEnabledAdmin;

  return (
    <div className="border-b border-border/60 px-4 py-4 last:border-b-0 sm:px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_140px_120px_260px] lg:items-center lg:gap-4 lg:py-3.5">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-foreground">{user.name}</div>
        <div className="break-words text-[12px] text-muted-foreground">{user.email}</div>
        {protectionMessage ? (
          <p id={protectedMessageId} className="mt-1 text-[11px] text-muted-foreground">
            {protectionMessage}
          </p>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 lg:mt-0 lg:gap-0">
        <span className="text-[11px] font-medium text-muted-foreground lg:hidden">{t("admin.role")}</span>
        <Select
          value={user.role === "admin" ? "admin" : "user"}
          disabled={shouldDisableRoleAndStatus}
          onValueChange={(nextRole) => onRoleChange(user, nextRole === "admin" ? "admin" : "user")}
        >
          <SelectTrigger aria-label={t("admin.role")} aria-describedby={protectedMessageId} className="min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">{t("admin.roleUser")}</SelectItem>
            <SelectItem value="admin">{t("admin.roleAdmin")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 lg:mt-0 lg:justify-start lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
        <span className="text-[11px] font-medium text-muted-foreground lg:hidden">{t("admin.status")}</span>
        <div className="flex items-center gap-2">
          <Switch
            checked={!user.banned}
            disabled={shouldDisableRoleAndStatus}
            aria-label={t("admin.status")}
            aria-describedby={protectedMessageId}
            onCheckedChange={(enabled) => onStatusChange(user, enabled)}
          />
          <span className="text-[12px] text-muted-foreground">{user.banned ? t("admin.banned") : t("admin.enabled")}</span>
        </div>
      </div>
      <div className="mt-4 grid gap-2 lg:mt-0 lg:gap-0">
        <span className="text-[11px] font-medium text-muted-foreground lg:hidden">{t("admin.actions")}</span>
        <div className="grid gap-2 lg:flex lg:items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full lg:flex-1"
            disabled={isUpdating}
            onClick={() => onResetPassword(user)}
          >
            {t("admin.resetPassword")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-full lg:flex-1"
            disabled={shouldDisableDelete}
            aria-describedby={protectedMessageId}
            onClick={() => onDelete(user)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("common.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
