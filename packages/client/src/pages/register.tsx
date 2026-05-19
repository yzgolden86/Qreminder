import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from '@/components/router-link';
import { useRouter } from '@/lib/router';
import { Mail, Lock, User as UserIcon, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QreminderLogo } from '@/components/icons/qreminder-logo';
import { toast } from '@/components/ui/sonner';
import { authClient } from '@/lib/auth-client';
import { getAuthDisplayMessage } from '@/lib/display-error';
import { useSignupStatus } from '@/hooks/use-signup-status';
import { useI18n } from '@/i18n/I18nProvider';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegisterErrors = Partial<Record<'name' | 'email' | 'password', string>>;

const Register = () => {
  const router = useRouter();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<RegisterErrors>({});
  const signupStatusQuery = useSignupStatus();
  const signupEnabled = signupStatusQuery.data ?? false;
  const { t } = useI18n();

  const validate = () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const nextErrors: RegisterErrors = {};

    if (!trimmedName) nextErrors.name = t('register.validation.nameRequired');
    if (!trimmedEmail) {
      nextErrors.email = t('register.validation.emailRequired');
    } else if (!emailPattern.test(trimmedEmail)) {
      nextErrors.email = t('register.validation.emailInvalid');
    }
    if (!password) {
      nextErrors.password = t('register.validation.passwordRequired');
    } else if (password.length < 8) {
      nextErrors.password = t('register.validation.passwordLength');
    }

    return { nextErrors, trimmedName, trimmedEmail };
  };

  const focusFirstError = (nextErrors: RegisterErrors) => {
    if (nextErrors.name) {
      nameInputRef.current?.focus();
      return;
    }
    if (nextErrors.email) {
      emailInputRef.current?.focus();
      return;
    }
    if (nextErrors.password) {
      passwordInputRef.current?.focus();
    }
  };

  const clearError = (field: keyof RegisterErrors) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { nextErrors, trimmedName, trimmedEmail } = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});
    try {
      const { error } = await authClient.signUp.email({
        email: trimmedEmail,
        password,
        name: trimmedName,
      });
      if (error) {
        toast.error(t('register.failed'), {
          description: getAuthDisplayMessage(error),
        });
        return;
      }
      toast.success(t('register.success'));
      router.push('/');
    } catch (err: unknown) {
      toast.error(t('register.failed'), {
        description: getAuthDisplayMessage(err),
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!signupStatusQuery.isPending && !signupEnabled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center grid gap-4">
          <h1 className="text-2xl font-bold text-foreground">{t('register.title')}</h1>
          <p className="text-muted-foreground">{t('register.failed')}</p>
          <Link href="/login" className="text-primary hover:underline">
            {t('common.backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background theme-gradient flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/20 via-primary/10 to-background items-center justify-center p-12">
        <div className="max-w-md grid gap-8">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_36px_-22px_rgba(0,0,0,0.82)] ring-1 ring-white/10">
              <QreminderLogo className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Qreminder</h1>
              <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <h2 className="text-2xl font-semibold text-foreground">{t('auth.heroTitle')}</h2>
            <ul className="grid gap-3 text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                {t('auth.heroTrackCosts')}
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                {t('auth.heroRenewalReminder')}
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                {t('auth.heroAnalyzeSpending')}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md grid gap-8">
          <div className="flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_32px_-22px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
              <QreminderLogo className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Qreminder</h1>
              <p className="text-xs text-muted-foreground">{t('app.tagline')}</p>
            </div>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">{t('register.title')}</h2>
            <p className="mt-2 text-muted-foreground">{t('register.subtitle')}</p>
          </div>

          <div className="grid gap-6">
            <form onSubmit={handleRegister} className="grid gap-4" noValidate>
              <div className="grid gap-2">
                <Label htmlFor="register-name">{t('register.name')}</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={nameInputRef}
                    id="register-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder={t('register.namePlaceholder')}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearError('name');
                    }}
                    className="pl-10 bg-secondary border-border"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'register-name-error' : undefined}
                    required
                  />
                </div>
                <FieldError id="register-name-error" message={errors.name} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="register-email">{t('auth.email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={emailInputRef}
                    id="register-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder={t('register.emailPlaceholder')}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearError('email');
                    }}
                    className="pl-10 bg-secondary border-border"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'register-email-error' : undefined}
                    required
                  />
                </div>
                <FieldError id="register-email-error" message={errors.email} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="register-password">{t('auth.password')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={passwordInputRef}
                    id="register-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={t('register.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearError('password');
                    }}
                    className="pl-10 pr-10 bg-secondary border-border"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'register-password-error' : undefined}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FieldError id="register-password-error" message={errors.password} />
              </div>

              <div className="pt-3">
                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary-glow"
                  disabled={isLoading}
                >
                  {isLoading ? t('register.submitting') : t('register.submit')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {t('register.hasAccount')}{' '}
              <Link href="/login" className="text-primary hover:underline font-medium">
                {t('register.signIn')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
