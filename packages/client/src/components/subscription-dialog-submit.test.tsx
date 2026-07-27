import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { assertDateOnly } from "@/lib/time/date-only";
import { createSubscriptionFormState } from "@/types/subscription-form";
import { SubscriptionDialog } from "./subscription-dialog";

vi.mock("@/contexts/CustomConfigContext", () => ({
  useCustomConfig: () => ({
    config: {
      categories: [{ id: "productivity", value: "productivity", labels: { "zh-CN": "效率工具", "en-US": "Productivity" } }],
      statuses: [{ id: "active", value: "active", labels: { "zh-CN": "活跃", "en-US": "Active" } }],
      paymentMethods: [{ id: "alipay", value: "alipay", labels: { "zh-CN": "支付宝", "en-US": "Alipay" } }],
      currencies: [
        { id: "CNY", value: "CNY", labels: { "zh-CN": "人民币 (¥)", "en-US": "Chinese yuan (¥)" }, enabled: true },
        { id: "USD", value: "USD", labels: { "zh-CN": "美元 ($)", "en-US": "US dollar ($)" }, enabled: true },
      ],
    },
  }),
}));

vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({
    data: { defaultCurrency: "USD" },
  }),
}));

vi.mock("@/components/subscription-form-fields", () => ({
  SubscriptionFormFields: ({ setFormData, formData, errors }: {
    setFormData: (updater: ReturnType<typeof createSubscriptionFormState>) => void;
    formData: ReturnType<typeof createSubscriptionFormState>;
    errors?: Record<string, string> | undefined;
  }) => (
    <>
      {/* 探针：把 formData.name 暴露出来，好断言关闭弹窗后表单是否真的重置了。 */}
      <span data-testid="form-name">{formData.name}</span>
      <button
        type="button"
        onClick={() =>
          setFormData(createSubscriptionFormState({
            name: "Aws",
            price: "15",
            currency: "USD",
            startDate: assertDateOnly("2026-05-14"),
            nextBillingDate: assertDateOnly("2026-06-14"),
            tags: "",
          }))
        }
      >
        填充有效订阅
      </button>
      <button
        type="button"
        onClick={() =>
          setFormData(createSubscriptionFormState({
            name: "Aws",
            price: "15",
            currency: "USD",
            startDate: assertDateOnly("2026-05-14"),
            nextBillingDate: assertDateOnly("2026-06-14"),
            website: "ftp://example.com",
          }))
        }
      >
        填充非法网站订阅
      </button>
      {errors?.["website"] ? <p role="alert">{errors["website"]}</p> : null}
    </>
  ),
}));

describe("SubscriptionDialog submit", () => {
  /** create 模式包含 TemplatePicker（内部 useQuery），需要 QueryClientProvider。 */
  function renderWithProviders(ui: React.ReactElement) {
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider delayDuration={0}>{ui}</TooltipProvider>
      </QueryClientProvider>,
    );
  }

  it("submits an empty tags array when the create form tags input is blank", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithProviders(
      <SubscriptionDialog
        mode="create"
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "填充有效订阅" }));
    await user.click(screen.getByRole("button", { name: "添加订阅" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: "Aws",
      tags: [],
    }));
  });

  // Regression: the dialog stays mounted across open/close (the parent only
  // toggles `open`), so useState initializers never re-run. Before the fix,
  // cancelling left formData + selectedTemplate behind, and reopening "new
  // subscription" showed the previous draft with its template still applied.
  it("clears the create form after cancelling so reopening starts blank", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderAt = (open: boolean) => (
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={0}>
          <SubscriptionDialog mode="create" open={open} onOpenChange={vi.fn()} onSubmit={vi.fn()} />
        </TooltipProvider>
      </QueryClientProvider>
    );

    const { rerender } = render(renderAt(true));

    await user.click(screen.getByRole("button", { name: "填充有效订阅" }));
    expect(screen.getByTestId("form-name")).toHaveTextContent("Aws");

    // Cancel without submitting. Radix unmounts the content, so the probe is
    // gone from the DOM while closed — assert after reopening instead.
    rerender(renderAt(false));
    await waitFor(() => {
      expect(screen.queryByTestId("form-name")).not.toBeInTheDocument();
    });

    // The reset is deferred ~200ms (useDeferredDialogCleanup) so it lands after
    // the close animation starts; wait it out before reopening.
    await new Promise((resolve) => setTimeout(resolve, 300));
    rerender(renderAt(true));

    expect(screen.getByTestId("form-name")).toBeEmptyDOMElement();
  });

  it("shows a field error for invalid website URLs", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithProviders(
      <SubscriptionDialog
        mode="create"
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "填充非法网站订阅" }));
    await user.click(screen.getByRole("button", { name: "添加订阅" }));

    expect(screen.getByRole("alert")).toHaveTextContent("网站地址必须使用 http:// 或 https://");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
