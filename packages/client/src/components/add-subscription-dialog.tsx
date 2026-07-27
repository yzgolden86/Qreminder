/**
 * 新增订阅弹窗适配器。
 *
 * 架构位置：
 * - 外层页面只关心 onAdd。
 * - 本组件维护 create dialog 的 open 状态和默认触发按钮。
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubscriptionDialog } from "@/components/subscription-dialog";
import type { SubscriptionTemplate } from "@/hooks/use-templates";
import type { SubscriptionDraft } from "@/types/subscription";
import { useI18n } from "@/i18n/I18nProvider";

interface AddSubscriptionDialogProps {
  /** 提交新增订阅（不包含 id，由后端生成）；meta.template 表示从模板创建。 */
  onAdd: (subscription: SubscriptionDraft, meta?: { template: SubscriptionTemplate }) => void;
  /** 自定义触发器（不传则使用默认 “+ 新增订阅” 按钮）。 */
  trigger?: ReactNode;
}

/** 以 create mode 渲染通用订阅弹窗。 */
export function AddSubscriptionDialog({ onAdd, trigger }: AddSubscriptionDialogProps) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  const defaultTrigger = (
    <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow">
      <Plus className="h-4 w-4" />
      <span className="hidden sm:inline">{t("subscription.add")}</span>
      <span className="sr-only sm:hidden">{t("subscription.add")}</span>
    </Button>
  );

  return (
    <SubscriptionDialog
      mode="create"
      open={open}
      onOpenChange={setOpen}
      onSubmit={onAdd}
      trigger={trigger || defaultTrigger}
    />
  );
}
