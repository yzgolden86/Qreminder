import { type FormEvent, useRef, useState } from "react";
import Link from '@/components/router-link';
import { ArrowLeft, CheckCircle2, Mail, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QreminderLogo } from "@/components/icons/qreminder-logo";
import { getDisplayErrorMessage } from "@/lib/display-error";
import { toast } from "@/components/ui/sonner";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/i18n/I18nProvider";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ForgotPasswordClientProps = {
  enabled: boolean;
};

export function ForgotPasswordClient({ enabled }: ForgotPasswordClientProps) {
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { t } = useI18n();

  const validateEmail = () => {
    const trimmed = email.trim();
    if (!trimmed) return t("passwordReset.emailRequired");
    if (!emailPattern.test(trimmed)) return t("passwordReset.emailInvalid");
    return "";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = validateEmail();
    if (error) {
      setEmailError(error);
      emailInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setEmailError("");
    try {
      const result = await authClient.forgetPassword({ email: email.trim() });
      if (result.error) throw result.error;
      setSubmitted(true);
      toast.success(t("passwordReset.mailHandled"));
    } catch (err: unknown) {
      toast.error(t("passwordReset.sendFailed"), {
        description: getDisplayErrorMessage(err, t("passwordReset.sendFailedDescription")),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen theme-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="surface-elevated rounded-2xl p-8 grid gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_24px_-16px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
              <QreminderLogo className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">{t("passwordReset.forgotTitle")}</h1>
              <p className="text-[11px] text-muted-foreground">{t("passwordReset.forgotSubtitle")}</p>
            </div>
          </div>

          {!enabled ? (
            <div className="rounded-lg border border-border/60 bg-secondary/50 p-4 text-[13px] text-muted-foreground">
              <ShieldAlert className="mb-3 h-4 w-4 text-primary" />
              <p>{t("passwordReset.smtpUnavailable1")}</p>
              <p className="mt-2">{t("passwordReset.smtpUnavailable2")}</p>
            </div>
          ) : submitted ? (
            <div className="rounded-lg border border-border/60 bg-secondary/50 p-4 text-[13px] text-muted-foreground">
              <CheckCircle2 className="mb-3 h-4 w-4 text-primary" />
              <p>{t("passwordReset.successMessage")}</p>
              <p className="mt-2">{t("passwordReset.successHint")}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
              <div className="grid gap-2">
                <Label htmlFor="forgot-email">{t("auth.email")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={emailInputRef}
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (emailError) setEmailError("");
                    }}
                    className="pl-10 bg-secondary border-border"
                    autoComplete="email"
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? "forgot-email-error" : "forgot-email-description"}
                    required
                  />
                </div>
                <p id="forgot-email-description" className="text-[11px] text-muted-foreground">
                  {t("passwordReset.emailHelp")}
                </p>
                <FieldError id="forgot-email-error" message={emailError} />
              </div>

              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary-glow"
                disabled={isSubmitting}
              >
                {isSubmitting ? t("passwordReset.sending") : t("passwordReset.sendLink")}
              </Button>
            </form>
          )}

          <div className="flex items-center justify-between text-[13px]">
            <Link href="/login" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("common.backToLogin")}
            </Link>
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              {t("common.backHome")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
