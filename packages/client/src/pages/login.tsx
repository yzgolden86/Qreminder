/**
 * 登录/注册页（/login）。
 *
 * 支持：
 * - 邮箱 + 密码登录
 *
 * 跳转逻辑：
 * - 通过查询参数 `next` 传入登录后要跳转的站内路径（例如：/settings）
 * - 为安全起见，仅允许以 `/` 开头的站内相对路径
 */

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from '@/components/router-link';
import { useRouter } from '@/lib/router';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldError } from "@/components/ui/field-error";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QreminderLogo } from '@/components/icons/qreminder-logo';
import { toast } from '@/components/ui/sonner';
import { authClient } from '@/lib/auth-client';
import { getAuthDisplayMessage } from '@/lib/display-error';
import { sanitizeNextPath } from '@/lib/redirect';
import { usePasswordResetAvailability } from '@/hooks/use-password-reset-availability';
import { useSignupStatus } from '@/hooks/use-signup-status';
import { useI18n } from '@/i18n/I18nProvider';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LoginErrors = Partial<Record<"email" | "password", string>>;

const Login = () => {
  const router = useRouter();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});
  const passwordResetEnabled = usePasswordResetAvailability();
  const signupStatusQuery = useSignupStatus();
  const signupEnabled = signupStatusQuery.data ?? false;
  const { t } = useI18n();

  /** 读取并校验 next 跳转路径（只允许站内路径）。 */
  const getNextPath = () => {
    if (typeof window === "undefined") return "/";
    const raw = new URLSearchParams(window.location.search).get("next");
    return sanitizeNextPath(raw);
  };

  const validate = () => {
    const trimmedEmail = email.trim();
    const nextErrors: LoginErrors = {};

    if (!trimmedEmail) {
      nextErrors.email = t("auth.validation.emailRequired");
    } else if (!emailPattern.test(trimmedEmail)) {
      nextErrors.email = t("auth.validation.emailInvalid");
    }
    if (!password) nextErrors.password = t("auth.validation.passwordRequired");

    return { nextErrors, trimmedEmail };
  };

  const focusFirstError = (nextErrors: LoginErrors) => {
    if (nextErrors.email) {
      emailInputRef.current?.focus();
      return;
    }
    if (nextErrors.password) {
      passwordInputRef.current?.focus();
    }
  };

  const clearError = (field: keyof LoginErrors) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  /** 邮箱密码登录。 */
  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { nextErrors, trimmedEmail } = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});
    try {
      const { error } = await authClient.signIn.email({ email: trimmedEmail, password });
      if (error) {
        console.error('Login error:', error);
        toast.error(t("auth.loginFailed"), {
          description: getAuthDisplayMessage(error),
        });
        return;
      }
      toast.success(t("auth.loginSuccess"));
      router.push(getNextPath());
    } catch (err: unknown) {
      console.error('Login error:', err);
      toast.error(t("auth.loginFailed"), {
        description: getAuthDisplayMessage(err),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background theme-gradient">
      {/* Ambient color glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
      >
        <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-0 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[140px]" />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* Left side - Branding */}
        <div className="hidden items-center justify-center p-12 lg:flex lg:w-1/2">
          <div className="grid max-w-md gap-10 animate-[rise-in_var(--motion-slow)_var(--motion-ease-out)]">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute -inset-2 rounded-2xl bg-primary/30 opacity-60 blur-xl" aria-hidden />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_18px_36px_-22px_rgba(0,0,0,0.85)] ring-1 ring-white/10">
                  <QreminderLogo className="h-7 w-7" />
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Qreminder</h1>
                <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
              </div>
            </div>

            <div className="grid gap-5">
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
                {t("auth.heroTitle")}
              </h2>
              <ul className="grid gap-3 text-sm text-muted-foreground">
                {[
                  t("auth.heroTrackCosts"),
                  t("auth.heroRenewalReminder"),
                  t("auth.heroAnalyzeSpending"),
                ].map((line, idx) => (
                  <li key={idx} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right side - Login Form */}
        <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
          <div className="grid w-full max-w-md gap-8 animate-[rise-in_var(--motion-slow)_var(--motion-ease-out)]">
            {/* Mobile logo */}
            <div className="flex items-center justify-center gap-3 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_32px_-22px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
                <QreminderLogo className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Qreminder</h1>
                <p className="text-xs text-muted-foreground">{t("app.tagline")}</p>
              </div>
            </div>

            <div className="surface-elevated rounded-2xl p-8 backdrop-blur-sm">
              <div className="text-center lg:text-left">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("auth.welcomeBack")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("auth.loginSubtitle")}
                </p>
              </div>

              <div className="mt-7 grid gap-6">
                <form onSubmit={handleLogin} className="grid gap-4" noValidate>
                  <div className="grid gap-2">
                    <Label htmlFor="login-email">{t("auth.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={emailInputRef}
                        id="login-email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          clearError("email");
                        }}
                        className="h-11 border-border bg-secondary/60 pl-10"
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "login-email-error" : undefined}
                        required
                      />
                    </div>
                    <FieldError id="login-email-error" message={errors.email} />
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">{t("auth.password")}</Label>
                      {passwordResetEnabled ? (
                        <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                          {t("auth.forgotPassword")}
                        </Link>
                      ) : null}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={passwordInputRef}
                        id="login-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          clearError("password");
                        }}
                        className="h-11 border-border bg-secondary/60 pl-10 pr-10"
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby={errors.password ? "login-password-error" : undefined}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <FieldError id="login-password-error" message={errors.password} />
                  </div>

                  <div className="pt-3">
                    <Button
                      type="submit"
                      className="group h-11 w-full bg-primary text-primary-foreground shadow-primary transition-all duration-200 hover:bg-primary-glow hover:shadow-[0_16px_40px_-8px_hsl(var(--primary)/0.45)]"
                      disabled={isLoading}
                    >
                      {isLoading ? t("auth.loggingIn") : t("auth.login")}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  </div>
                </form>

                {signupEnabled && (
                  <p className="text-center text-sm text-muted-foreground">
                    {t("auth.noAccount")}{" "}
                    <Link href="/register" className="font-medium text-primary hover:underline">
                      {t("auth.signUp")}
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
