/**
 * 模板选择器（新增订阅弹窗顶部）。
 *
 * 只在存在模板时渲染；选中后由父组件把模板字段预填进表单。
 * 「空白订阅」选项清空选择（不回滚已填内容，避免覆盖用户输入）。
 */
import { LayoutTemplate } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTemplates, type SubscriptionTemplate } from "@/hooks/use-templates";
import { useI18n } from "@/i18n/I18nProvider";

const BLANK_VALUE = "__blank__";

export interface TemplatePickerProps {
  /** 当前选中的模板 id；null 表示空白订阅。 */
  selectedId: string | null;
  /** 选中模板（或 null=空白）时回调，携带完整模板对象供预填。 */
  onSelect: (template: SubscriptionTemplate | null) => void;
}

export function TemplatePicker({ selectedId, onSelect }: TemplatePickerProps) {
  const { t } = useI18n();
  const templatesQuery = useTemplates();
  const templates = templatesQuery.data ?? [];

  // 没有任何模板时不渲染，保持新用户的创建流程零噪音。
  if (templates.length === 0) return null;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="template-picker" className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <LayoutTemplate className="h-3.5 w-3.5" />
        {t("template.pickerLabel")}
      </Label>
      <Select
        value={selectedId ?? BLANK_VALUE}
        onValueChange={(value) => {
          if (value === BLANK_VALUE) {
            onSelect(null);
            return;
          }
          const template = templates.find((tpl) => tpl.id === value);
          onSelect(template ?? null);
        }}
      >
        <SelectTrigger id="template-picker" className="border-border bg-secondary">
          <SelectValue placeholder={t("template.pickerPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BLANK_VALUE}>{t("template.blankOption")}</SelectItem>
          {templates.map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>
              {tpl.name}
              {tpl.category ? ` · ${tpl.category}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
