/**
 * 订阅表单字段渲染层。
 *
 * 架构位置：
 * - SubscriptionDialog 管理表单状态、提交和错误。
 * - 本组件只渲染字段，并把用户输入回传给外层。
 *
 * Caveat: 不在这里调用 API 或做最终保存校验，避免新增/编辑流程出现两个真相来源。
 * Caveat: 字段值保持 UI 输入态（多数是 string），不要在本组件提前转换成 domain 类型。
 */
import { memo, useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, CreditCard, Plus, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { dateOnlyToLocalDate, dateToDateOnly } from "@/lib/time/date-only";
import { LogoPicker, type UploadStatus as LogoUploadStatus } from "@/components/logo-picker";
import { AuthorizedImage } from "@/components/authorized-image";
import type { CustomConfig } from "@/types/config";
import type { BillingCycle, Category, PaymentMethod, SubscriptionStatus } from "@/types/subscription";
import { CURRENCY_OPTIONS, CYCLE_LABELS, REMINDER_OFFSET_PRESETS } from "@/types/subscription";
import type { SubscriptionFormState } from "@/types/subscription-form";
import { addCustomReminderOffset, removeReminderOffset, toggleReminderOffset } from "@/lib/subscription-form";
import { createCurrencySelectOptions } from "@/lib/searchable-options";
import { useI18n } from "@/i18n/I18nProvider";
import { localizedLabel } from "@/i18n/locales";

/** 透出订阅表单状态类型，字段值以 UI 输入态为准。 */
export type { SubscriptionFormState };

export interface SubscriptionFormFieldsProps {
  idPrefix: string;
  config: CustomConfig;
  formData: SubscriptionFormState;
  setFormData: Dispatch<SetStateAction<SubscriptionFormState>>;
  onLogoUploadStatusChange: (status: LogoUploadStatus) => void;
  onFieldChange?: <K extends keyof SubscriptionFormState>(key: K, value: SubscriptionFormState[K]) => void;
  showWebsiteAndNotes?: boolean;
  errors?: SubscriptionFormErrors | undefined;
  onClearFieldError?: ((field: keyof SubscriptionFormErrors) => void) | undefined;
}

export type SubscriptionFormErrors = Partial<Record<
  "name" | "price" | "dates" | "customDays" | "reminderOffsets" | "website",
  string
>>;

const errorFieldByFormKey: Partial<Record<keyof SubscriptionFormState, keyof SubscriptionFormErrors>> = {
  name: "name",
  price: "price",
  billingCycle: "customDays",
  customDays: "customDays",
  startDate: "dates",
  nextBillingDate: "dates",
  reminderOffsets: "reminderOffsets",
  customReminderOffsetInput: "reminderOffsets",
  website: "website",
} satisfies Partial<Record<keyof SubscriptionFormState, keyof SubscriptionFormErrors>>;

/** 渲染新增/编辑订阅共用字段。 */
export const SubscriptionFormFields = memo(function SubscriptionFormFields({
  idPrefix,
  config,
  formData,
  setFormData,
  onLogoUploadStatusChange,
  onFieldChange,
  showWebsiteAndNotes = false,
  errors = {},
  onClearFieldError,
}: SubscriptionFormFieldsProps) {
  const { t, locale, label, formatDateOnly } = useI18n();
  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false);
  const [nextBillingDatePickerOpen, setNextBillingDatePickerOpen] = useState(false);
  const [customReminderError, setCustomReminderError] = useState<"invalid" | "duplicate" | "tooMany" | null>(null);

  const update = useCallback(<K extends keyof SubscriptionFormState>(key: K, value: SubscriptionFormState[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    const errorField = errorFieldByFormKey[key];
    if (errorField) onClearFieldError?.(errorField);
    // onFieldChange 是外层识别“用户明确修改过某字段”的钩子，例如新增订阅默认货币同步策略。
    // 这里保持泛型 key/value 绑定，避免调用方把字段和值的类型拆散。
    onFieldChange?.(key, value);
  }, [onClearFieldError, onFieldChange, setFormData]);

  const id = (name: string) => `${idPrefix}${name}`;
  const categoryId = id("category");

  // 货币选项受“设置 → 货币管理（启用/禁用）”控制：
  // - 默认只展示 enabled=true 的货币
  // - 若当前值是“已禁用货币”（例如历史订阅数据），仍展示一个不可选项用于回显，避免选择器空白
  const currencyOptions = useMemo(
    () =>
      createCurrencySelectOptions({
        currencies: config.currencies,
        currencyOptions: CURRENCY_OPTIONS,
        includeDisabledCurrent: formData.currency,
        locale,
      }),
    [config.currencies, formData.currency, locale],
  );
  const statusLabel = config.statuses.find((status) => status.value === formData.status)?.labels;
  const categoryLabel = config.categories.find((category) => category.value === formData.category)?.labels;
  const paymentMethodLabel =
    config.paymentMethods.find((method) => method.value === formData.paymentMethod)?.labels;
  const selectedStartDate = formData.startDate ? dateOnlyToLocalDate(formData.startDate) : undefined;
  const selectedNextBillingDate = formData.nextBillingDate ? dateOnlyToLocalDate(formData.nextBillingDate) : undefined;

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={id("name")}>{t("subscription.field.name")}</Label>
        <Input
          id={id("name")}
          placeholder={t("subscription.placeholder.name")}
          value={formData.name}
          onChange={(e) => update("name", e.target.value)}
          required
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? id("name-error") : undefined}
          className="border-border bg-secondary"
        />
        <FieldError id={id("name-error")} message={errors.name} />
      </div>

      <LogoPicker
        value={formData.logo}
        onChange={(logo) => update("logo", logo)}
        onUploadStatusChange={onLogoUploadStatusChange}
        serviceName={formData.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={id("price")}>{t("subscription.field.price")}</Label>
          <NumericInput
            id={id("price")}
            allowNegative={false}
            allowedDecimalSeparators={[".", "。"]}
            inputMode="decimal"
            placeholder="0.00"
            thousandSeparator
            value={formData.price}
            onRawValueChange={(value: string) => update("price", value)}
            required
            aria-invalid={Boolean(errors.price)}
            aria-describedby={errors.price ? id("price-error") : undefined}
            className="border-border bg-secondary"
          />
          <FieldError id={id("price-error")} message={errors.price} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={id("currency")}>{t("subscription.field.currency")}</Label>
          <SearchableSelect
            value={formData.currency}
            onValueChange={(value) => update("currency", value)}
            options={currencyOptions}
            placeholder={t("subscription.placeholder.currency")}
            searchPlaceholder={t("subscription.search.currency")}
            emptyMessage={t("subscription.empty.currency")}
            className="border-border bg-secondary"
            aria-label={t("subscription.placeholder.currency")}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={id("status")}>{t("subscription.field.status")}</Label>
          <Select value={formData.status} onValueChange={(value) => update("status", value as SubscriptionStatus)}>
            <SelectTrigger className="border-border bg-secondary" tooltipContent={statusLabel ? label(statusLabel) : formData.status}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.statuses.map((status) => (
                <SelectItem key={status.id} value={status.value}>
                  {label(status.labels)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={categoryId}>{t("subscription.field.category")}</Label>
          <Select value={formData.category} onValueChange={(value) => update("category", value)}>
            <SelectTrigger className="border-border bg-secondary" tooltipContent={categoryLabel ? label(categoryLabel) : formData.category}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.categories.map((category) => (
                <SelectItem key={category.id} value={category.value}>
                  {label(category.labels)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={id("cycle")}>{t("subscription.field.billingCycle")}</Label>
          <Select
            value={formData.billingCycle}
            onValueChange={(value) => update("billingCycle", value as BillingCycle)}
          >
            <SelectTrigger className="border-border bg-secondary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CYCLE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {localizedLabel(label, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {formData.billingCycle === "custom" ? (
          <div className="grid gap-2">
            <Label htmlFor={id("customDays")}>{t("subscription.field.customDays")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("subscription.customCycleEvery")}</span>
              <NumericInput
                id={id("customDays")}
                allowNegative={false}
                decimalScale={0}
                inputMode="numeric"
                placeholder="30"
                value={formData.customDays}
                onRawValueChange={(value: string) => update("customDays", value)}
                aria-invalid={Boolean(errors.customDays)}
                aria-describedby={errors.customDays ? id("customDays-error") : undefined}
                className="border-border bg-secondary"
              />
              <span className="text-sm text-muted-foreground">{t("subscription.daysUnit")}</span>
            </div>
            <FieldError id={id("customDays-error")} message={errors.customDays} />
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor={id("paymentMethod")}>{t("subscription.field.paymentMethod")}</Label>
            <Select
              value={formData.paymentMethod}
              onValueChange={(value) => update("paymentMethod", value)}
            >
              <SelectTrigger className="border-border bg-secondary" tooltipContent={paymentMethodLabel ? label(paymentMethodLabel) : undefined}>
                <SelectValue placeholder={t("subscription.placeholder.paymentMethod")} />
              </SelectTrigger>
              <SelectContent>
                {config.paymentMethods.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    <div className="flex items-center gap-2">
                      {method.icon ? (
                        <AuthorizedImage src={method.icon} alt="" className="w-4 h-4 object-contain" />
                      ) : (
                        <CreditCard className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span>{label(method.labels)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {formData.billingCycle === "custom" && (
        <div className="grid gap-2">
          <Label htmlFor={id("paymentMethod")}>{t("subscription.field.paymentMethod")}</Label>
          <Select
            value={formData.paymentMethod}
            onValueChange={(value) => update("paymentMethod", value)}
          >
            <SelectTrigger className="border-border bg-secondary" tooltipContent={paymentMethodLabel ? label(paymentMethodLabel) : undefined}>
              <SelectValue placeholder={t("subscription.placeholder.paymentMethod")} />
            </SelectTrigger>
            <SelectContent>
              {config.paymentMethods.map((method) => (
                <SelectItem key={method.value} value={method.value}>
                  <div className="flex items-center gap-2">
                    {method.icon ? (
                      <AuthorizedImage src={method.icon} alt="" className="w-4 h-4 object-contain" />
                    ) : (
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span>{label(method.labels)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-4 rounded-lg border border-border bg-secondary/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Label className="text-base font-medium">{t("subscription.section.dates")}</Label>
          <div className="flex items-center gap-2">
            <Label htmlFor={id("autoCalculate")} className="text-sm text-muted-foreground cursor-pointer">
              {t("subscription.autoCalculate")}
            </Label>
            <Switch
              id={id("autoCalculate")}
              checked={formData.autoCalculate}
              onCheckedChange={(checked) => update("autoCalculate", checked)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>{t("subscription.field.startDate")}</Label>
            <Popover open={startDatePickerOpen} onOpenChange={setStartDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id={id("startDate")}
                  variant="outline"
                  aria-invalid={Boolean(errors.dates)}
                  aria-describedby={errors.dates ? id("dates-error") : undefined}
                  className={cn(
                    "w-full justify-start text-left font-normal border-border bg-secondary",
                    !formData.startDate && "text-muted-foreground",
                    errors.dates && "border-destructive focus-visible:ring-destructive/40",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.startDate ? (
                    formatDateOnly(formData.startDate, "full")
                  ) : (
                    <span>{t("subscription.placeholder.date")}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-border bg-card" align="start">
                <Calendar
                  mode="single"
                  {...(selectedStartDate ? { selected: selectedStartDate, defaultMonth: selectedStartDate } : {})}
                  onSelect={(date) => update("startDate", date ? dateToDateOnly(date) : undefined)}
                  autoFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-2">
            <Label>{t("subscription.field.nextBillingDate")}</Label>
            <Popover open={nextBillingDatePickerOpen} onOpenChange={setNextBillingDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id={id("nextBillingDate")}
                  variant="outline"
                  disabled={formData.autoCalculate}
                  aria-invalid={Boolean(errors.dates)}
                  aria-describedby={errors.dates ? id("dates-error") : undefined}
                  className={cn(
                    "w-full justify-start text-left font-normal border-border bg-secondary",
                    !formData.nextBillingDate && "text-muted-foreground",
                    formData.autoCalculate && "opacity-60",
                    errors.dates && "border-destructive focus-visible:ring-destructive/40",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.nextBillingDate ? (
                    formatDateOnly(formData.nextBillingDate, "full")
                  ) : (
                    <span>{t("subscription.placeholder.date")}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-border bg-card" align="start">
                <Calendar
                  mode="single"
                  {...(selectedNextBillingDate ? { selected: selectedNextBillingDate, defaultMonth: selectedNextBillingDate } : {})}
                  onSelect={(date) => update("nextBillingDate", date ? dateToDateOnly(date) : undefined)}
                  autoFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {formData.autoCalculate && (
              <p className="text-xs text-muted-foreground">{t("subscription.autoCalculateHelp")}</p>
            )}
          </div>
        </div>
        <FieldError id={id("dates-error")} message={errors.dates} />
      </div>

      <div className="grid gap-3">
        <Label>{t("subscription.field.reminder")}</Label>
        <p className="text-xs text-muted-foreground">{t("subscription.reminderHelp")}</p>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t("subscription.field.reminder")}
        >
          {REMINDER_OFFSET_PRESETS.map((preset) => {
            const selected = formData.reminderOffsets.includes(preset.value);
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => {
                  const next = toggleReminderOffset(formData.reminderOffsets, preset.value);
                  update("reminderOffsets", next);
                }}
                aria-pressed={selected}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary text-foreground hover:bg-secondary/70",
                )}
              >
                {label(preset.labels)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("subscription.reminderBefore")}</span>
          <NumericInput
            allowNegative={false}
            decimalScale={0}
            inputMode="numeric"
            placeholder={t("subscription.daysPlaceholder")}
            value={formData.customReminderOffsetInput}
            onRawValueChange={(value: string) => update("customReminderOffsetInput", value)}
            className="w-20 border-border bg-secondary"
            aria-label={t("subscription.reminderCustomInput")}
          />
          <span className="text-sm text-muted-foreground">{t("subscription.daysUnit")}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const result = addCustomReminderOffset(
                formData.reminderOffsets,
                formData.customReminderOffsetInput,
              );
              if (result.accepted) {
                update("reminderOffsets", result.next);
                update("customReminderOffsetInput", "");
                setCustomReminderError(null);
                return;
              }
              setCustomReminderError(result.reason ?? "invalid");
            }}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("subscription.reminderAdd")}
          </Button>
        </div>

        {customReminderError && (
          <p className="text-xs text-destructive">
            {t(`subscription.reminder.error.${customReminderError}`)}
          </p>
        )}

        {formData.reminderOffsets.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label={t("subscription.reminderSelected")}>
            {formData.reminderOffsets.map((offset) => (
              <span
                key={offset}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
              >
                {t("subscription.reminderChip", { days: offset })}
                <button
                  type="button"
                  onClick={() => {
                    const next = removeReminderOffset(formData.reminderOffsets, offset);
                    update("reminderOffsets", next);
                  }}
                  aria-label={t("subscription.reminderRemove", { days: offset })}
                  className="rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <FieldError id={id("reminder-error")} message={errors.reminderOffsets} />
      </div>

      {showWebsiteAndNotes && (
        <div className="grid gap-2">
          <Label htmlFor={id("website")}>{t("subscription.field.website")}</Label>
          <Input
            id={id("website")}
            type="url"
            placeholder="https://example.com"
            value={formData.website}
            onChange={(e) => update("website", e.target.value)}
            aria-invalid={Boolean(errors.website)}
            aria-describedby={errors.website ? id("website-error") : undefined}
            className="border-border bg-secondary"
          />
          <FieldError id={id("website-error")} message={errors.website} />
        </div>
      )}

      {showWebsiteAndNotes && (
        <div className="grid gap-2">
          <Label htmlFor={id("notes")}>{t("subscription.field.notes")}</Label>
          <Input
            id={id("notes")}
            placeholder={t("subscription.placeholder.notes")}
            value={formData.notes}
            onChange={(e) => update("notes", e.target.value)}
            className="border-border bg-secondary"
          />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor={id("tags")}>{t("subscription.field.tags")}</Label>
        <Input
          id={id("tags")}
          placeholder={t("subscription.placeholder.tags")}
          value={formData.tags}
          onChange={(e) => update("tags", e.target.value)}
          className="border-border bg-secondary"
        />
      </div>
    </>
  );
});
