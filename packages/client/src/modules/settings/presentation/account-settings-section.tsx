import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from '@/components/router-link';
import { useI18n } from '@/i18n/I18nProvider';
import { ExternalLink } from 'lucide-react';

/**
 * account-settings-section.tsx 渲染账号信息和修改密码弹窗。
 *
 * 架构位置：密码更新状态来自 useSettingsFormController，本组件只负责表单呈现，
 * 不直接接触 auth client 或 API client，保持 presentation/application 分层。
 *
 * Caveat: accountEmail 为 null 表示仍在加载，不代表账号缺失；占位文案必须区分
 * loading 和 missing，避免管理员误判账号状态。
 */
export interface AccountSettingsSectionProps {
  accountEmail: string | null;
  canAccessPocketBaseAdmin: boolean;
  passwordResetEnabled: boolean;
  passwordDialogOpen: boolean;
  setPasswordDialogOpen: (open: boolean) => void;
  handlePasswordDialogOpenChange: (open: boolean) => void;
  currentPassword: string;
  setCurrentPassword: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  isUpdatingPassword: boolean;
  updatePassword: () => void | Promise<void>;
  emailDialogOpen: boolean;
  setEmailDialogOpen: (open: boolean) => void;
  handleEmailDialogOpenChange: (open: boolean) => void;
  emailCurrentPassword: string;
  setEmailCurrentPassword: (value: string) => void;
  newEmail: string;
  setNewEmail: (value: string) => void;
  isUpdatingEmail: boolean;
  updateEmail: () => void | Promise<void>;
}

export function AccountSettingsSection({
  accountEmail,
  canAccessPocketBaseAdmin,
  passwordResetEnabled,
  passwordDialogOpen,
  setPasswordDialogOpen,
  handlePasswordDialogOpenChange,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  isUpdatingPassword,
  updatePassword,
  emailDialogOpen,
  setEmailDialogOpen,
  handleEmailDialogOpenChange,
  emailCurrentPassword,
  setEmailCurrentPassword,
  newEmail,
  setNewEmail,
  isUpdatingEmail,
  updateEmail,
}: AccountSettingsSectionProps) {
  const { t } = useI18n();

  return (
    <>
                  <section className="surface-card rounded-xl p-6">
                    <h2 className="mb-6 text-lg font-semibold text-foreground">{t("settings.account")}</h2>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="username">{t("settings.username")}</Label>
                        <Input
                          id="username"
                          value={accountEmail ?? ""}
                          placeholder={accountEmail === null ? t("settings.emailLoading") : t("settings.emailMissing")}
                          readOnly
                          className="border-border bg-secondary"
                        />
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-primary/40 text-primary hover:bg-primary/10"
                            onClick={() => setEmailDialogOpen(true)}
                          >
                            {t("settings.email.changeEmail")}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">{t("settings.email.help")}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <Link
                            href="/admin/users"
                            className="inline-flex text-xs text-primary hover:underline"
                          >
                            {t("settings.manageUsers")}
                          </Link>
                          {canAccessPocketBaseAdmin ? (
                            <a
                              href="/_/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              {t("settings.pocketBaseAdmin")}
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="password">{t("auth.password")}</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="••••••••"
                          readOnly
                          className="border-border bg-secondary"
                        />
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-primary/40 text-primary hover:bg-primary/10"
                            onClick={() => setPasswordDialogOpen(true)}
                          >
                            {t("settings.changePassword")}
                          </Button>
                          {passwordResetEnabled ? (
                            <Link
                              href="/forgot-password"
                              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                            >
                              {t("auth.forgotPassword")}
                            </Link>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{t("settings.passwordHelp")}</p>
                      </div>
                    </div>
                  </section>
      
                  {/* 修改密码弹窗 */}
                  <Dialog
                    open={passwordDialogOpen}
                    onOpenChange={handlePasswordDialogOpenChange}
                  >
                    <DialogContent className="border-border bg-card">
                      <DialogHeader>
                        <DialogTitle>{t("settings.passwordDialogTitle")}</DialogTitle>
                        <DialogDescription>
                          {t("settings.passwordDialogDescription")}
                        </DialogDescription>
                      </DialogHeader>
      
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="currentPassword">{t("settings.currentPassword")}</Label>
                          <Input
                            id="currentPassword"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder={t("settings.currentPasswordPlaceholder")}
                            className="border-border bg-secondary"
                            autoComplete="current-password"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="newPassword">{t("passwordReset.newPassword")}</Label>
                          <Input
                            id="newPassword"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t("settings.newPasswordPlaceholder")}
                            className="border-border bg-secondary"
                            autoComplete="new-password"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="confirmPassword">{t("passwordReset.confirmPassword")}</Label>
                          <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder={t("settings.confirmPasswordPlaceholder")}
                            className="border-border bg-secondary"
                            autoComplete="new-password"
                          />
                        </div>
                      </div>
      
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                          {t("common.cancel")}
                        </Button>
                        <Button
                          type="button"
                          onClick={updatePassword}
                          disabled={isUpdatingPassword}
                          className="bg-primary text-primary-foreground hover:bg-primary-glow"
                        >
                          {isUpdatingPassword ? t("common.saving") : t("settings.saveNewPassword")}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog
                    open={emailDialogOpen}
                    onOpenChange={handleEmailDialogOpenChange}
                  >
                    <DialogContent className="border-border bg-card">
                      <DialogHeader>
                        <DialogTitle>{t("settings.email.dialogTitle")}</DialogTitle>
                        <DialogDescription>
                          {t("settings.email.dialogDescription")}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="emailNewEmail">{t("settings.email.newEmailLabel")}</Label>
                          <Input
                            id="emailNewEmail"
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder={t("settings.email.newEmailPlaceholder")}
                            className="border-border bg-secondary"
                            autoComplete="email"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="emailCurrentPassword">{t("settings.currentPassword")}</Label>
                          <Input
                            id="emailCurrentPassword"
                            type="password"
                            value={emailCurrentPassword}
                            onChange={(e) => setEmailCurrentPassword(e.target.value)}
                            placeholder={t("settings.currentPasswordPlaceholder")}
                            className="border-border bg-secondary"
                            autoComplete="current-password"
                          />
                        </div>
                      </div>

                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setEmailDialogOpen(false)}>
                          {t("common.cancel")}
                        </Button>
                        <Button
                          type="button"
                          onClick={updateEmail}
                          disabled={isUpdatingEmail}
                          className="bg-primary text-primary-foreground hover:bg-primary-glow"
                        >
                          {isUpdatingEmail ? t("common.saving") : t("common.save")}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

    </>
  );
}
