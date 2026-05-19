/**
 * 卡片管理页 application hook。
 *
 * 把 React 依赖包装到纯函数 domain 模型外层，汇率函数由调用方注入。
 */
import { useMemo } from "react";
import type { CustomConfig } from "@/types/config";
import type { Subscription } from "@/types/subscription";
import { buildPaymentCardsModel } from "../domain/payment-cards-model";

/** 卡片管理页聚合 hook：按支付方式聚合订阅与月支出。 */
export function usePaymentCards(
  subscriptions: readonly Subscription[],
  config: CustomConfig,
  defaultCurrency: string,
  convert: (amount: number, from: string, to: string) => number,
) {
  return useMemo(
    () => buildPaymentCardsModel({ subscriptions, config, defaultCurrency, convert }),
    [config, convert, defaultCurrency, subscriptions],
  );
}
