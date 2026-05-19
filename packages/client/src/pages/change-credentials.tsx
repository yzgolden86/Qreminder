import { type FormEvent, useRef, useState } from "react";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QreminderLogo } from "@/components/icons/qreminder-logo";
import { toast } from "@/components/ui/sonner";
import { apiFetch } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/i18n/I18nProvider";
import { z } from "zod";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const responseSchema = z.object({ ok: z.boolean() }).passthrough();

export default function ChangeCredentials() {
  const { t } = useI18n();
  const emailRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!currentPassword) e["currentPassword"] = t("changeCredentials.currentRequired");
    if (!newEmail) e["newEmail"] = t("changeCredentials.emailRequired");
    else if (!emailPattern.test(newEmail)) e["newEmail"] = t("changeCredentials.emailInvalid");
    if (!newPassword) e["newPassword"] = t("changeCredentials.passwordRequired");
    else if (newPassword.length < 8) e["newPassword"] = t("changeCredentials.passwordTooShort");
    if (newPassword !== confirmPassword) e["confirmPassword"] = t("changeCredentials.passwordMismatch");
    return e;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    try {
      await apiFetch("/api/account/change-credentials", responseSchema, {
        method: "POST",
        body: JSON.stringify({ currentPassword, newEmail, newPassword }),
      });
      toast.success(t("changeCredentials.success"));
      await authClient.signOut();
      window.location.href = "/login";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown_error";
      if (msg.includes("invalid_password")) {
        setErrors({ currentPassword: t("changeCredentials.wrongPassword") });
      } else if (msg.includes("email_taken")) {
        setErrors({ newEmail: t("changeCredentials.emailTaken") });
      } else {
        toast.error(t("changeCredentials.failed"), { description: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen theme-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-card grid gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_32px_-22px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
              <QreminderLogo className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{t("changeCredentials.title")}</h1>
              <p className="text-xs text-muted-foreground">{t("changeCredentials.subtitle")}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="current-password">{t("changeCredentials.currentPassword")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="current-password"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pl-10 pr-10 bg-secondary border-border"
                  autoComplete="current-password"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowCurrent(!showCurrent)}>
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <FieldError id="current-password-error" message={errors["currentPassword"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-email">{t("changeCredentials.newEmail")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={emailRef}
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="pl-10 bg-secondary border-border"
                  autoComplete="email"
                  placeholder={t("changeCredentials.emailPlaceholder")}
                />
              </div>
              <FieldError id="new-email-error" message={errors["newEmail"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-password">{t("changeCredentials.newPassword")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new-password"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10 bg-secondary border-border"
                  autoComplete="new-password"
                  placeholder={t("changeCredentials.passwordPlaceholder")}
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNew(!showNew)}>
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <FieldError id="new-password-error" message={errors["newPassword"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confirm-password">{t("changeCredentials.confirmPassword")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type={showNew ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 bg-secondary border-border"
                  autoComplete="new-password"
                />
              </div>
              <FieldError id="confirm-password-error" message={errors["confirmPassword"]} />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary-glow"
              disabled={isSubmitting}
            >
              {isSubmitting ? t("changeCredentials.submitting") : t("changeCredentials.submit")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
