import type { BillingCycle, Category, PaymentMethod, SubscriptionStatus } from "@/types/subscription";
import { DEFAULT_REMINDER_OFFSETS } from "@/types/subscription";
import type { DateOnly } from "@/lib/time/date-only";

/**
 * 订阅表单的本地状态（UI 输入专用）。
 *
 * 说明：
 * - `price/customDays/customReminderOffsetInput` 使用 string，是为了直接绑定 `<input />` 的 value
 * - `reminderOffsets` 是规范化后的整数数组（来自 chips 多选），不绑定到原生 input
 * - 最终提交时（新增/编辑）会转换为业务模型所需的 `number | DateOnly | undefined`
 */
export type SubscriptionFormState = {
  /** 订阅名称（必填）。 */
  name: string;
  /** Logo（可选，URL 或 data URL）。 */
  logo: string | undefined;
  /** 金额输入框字符串（提交时 parseFloat）。 */
  price: string;
  /** 货币代码（如：CNY、USD）。 */
  currency: string;
  /** 扣费周期。 */
  billingCycle: BillingCycle;
  /** 自定义周期天数（字符串，仅 billingCycle=custom 时启用）。 */
  customDays: string;
  /** 分类。 */
  category: Category;
  /** 状态。 */
  status: SubscriptionStatus;
  /** 支付方式（空字符串表示“未选择”）。 */
  paymentMethod: PaymentMethod | "";
  /** 开始日期（date-only，UI 日历边界才临时转 Date）。 */
  startDate: DateOnly | undefined;
  /** 下次扣费日期（date-only，UI 日历边界才临时转 Date）。 */
  nextBillingDate: DateOnly | undefined;
  /** 是否自动根据开始日期 + 周期推算 nextBillingDate。 */
  autoCalculate: boolean;
  /** 提醒档位数组（整数，0..MAX_REMINDER_OFFSET，去重，按降序排列）。 */
  reminderOffsets: number[];
  /** 自定义档位输入框字符串（提交时 parseInt 后并入 reminderOffsets）。 */
  customReminderOffsetInput: string;
  /** 官网链接输入（可选）。 */
  website: string;
  /** 备注输入（可选）。 */
  notes: string;
  /** 标签输入（逗号分隔字符串，提交时拆分为 string[]）。 */
  tags: string;
};

/**
 * 创建表单初始值（用于新增/编辑复用）。
 *
 * 说明：
 * - 默认值以“新增订阅”表单为准；编辑时可用 overrides 覆盖（例如 autoCalculate=false）
 */
export function createSubscriptionFormState(
  overrides: Partial<SubscriptionFormState> = {},
): SubscriptionFormState {
  return {
    name: "",
    logo: undefined,
    price: "",
    currency: "CNY",
    billingCycle: "monthly",
    customDays: "",
    category: "productivity",
    status: "active",
    paymentMethod: "",
    startDate: undefined,
    nextBillingDate: undefined,
    autoCalculate: true,
    reminderOffsets: [...DEFAULT_REMINDER_OFFSETS],
    customReminderOffsetInput: "",
    website: "",
    notes: "",
    tags: "",
    ...overrides,
  };
}
