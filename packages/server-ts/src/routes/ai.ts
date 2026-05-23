/**
 * AI 功能路由。
 *
 * POST /api/ai/extract — 从文本提取订阅信息
 * POST /api/ai/summary — 生成月度消费总结
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { settings, subscriptions, subscriptionPayments } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const aiRouter = new Hono<AppEnv>();

aiRouter.use("*", requireSession);

interface AiConfig {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
}

function getAiConfig(userSettings: Record<string, unknown>): AiConfig {
  return {
    enabled: Boolean(userSettings["aiEnabled"]),
    endpoint: String(userSettings["aiApiEndpoint"] ?? "https://api.openai.com/v1").trim(),
    apiKey: String(userSettings["aiApiKey"] ?? "").trim(),
    model: String(userSettings["aiModel"] ?? "gpt-4o-mini").trim(),
  };
}

async function callLlm(config: AiConfig, systemPrompt: string, userMessage: string): Promise<string> {
  const url = `${config.endpoint.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`AI API error: HTTP ${res.status} ${err.slice(0, 200)}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");
  return content;
}

const extractSchema = z.object({
  text: z.string().min(1).max(5000),
});

aiRouter.post("/extract", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;

  const [settingsRow] = await db.select().from(settings).where(eq(settings.user, userId));
  const userSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const config = getAiConfig(userSettings);

  if (!config.enabled || !config.apiKey) {
    return c.json({ error: "ai_not_configured", message: "Please enable AI and configure API key in settings" }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = extractSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const systemPrompt = `You are a subscription data extractor. Given a text (bill, email, SMS, payment notification), extract subscription information and return ONLY a JSON object with these fields:
- name: subscription/service name (string, required)
- amount: payment amount (number, required)
- currency: currency code like USD, CNY, HKD (string, required)
- nextRenewalDate: next billing date in YYYY-MM-DD format (string, optional)
- paymentMethod: payment method description (string, optional)
- billingCycle: one of "weekly", "monthly", "quarterly", "semi-annual", "annual" (string, optional)
- category: suggested category (string, optional)

If you cannot extract the information, return {"error": "cannot_extract", "reason": "brief explanation"}.
Return ONLY valid JSON, no markdown, no explanation.`;

  try {
    const result = await callLlm(config, systemPrompt, parsed.data.text);
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const extracted = JSON.parse(cleaned);
    return c.json({ result: extracted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI extraction failed";
    return c.json({ error: "ai_error", message }, 500);
  }
});

aiRouter.post("/summary", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;

  const [settingsRow] = await db.select().from(settings).where(eq(settings.user, userId));
  const userSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const config = getAiConfig(userSettings);

  if (!config.enabled || !config.apiKey) {
    return c.json({ error: "ai_not_configured", message: "Please enable AI and configure API key in settings" }, 400);
  }

  const [userSubs, userPayments] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.user, userId)),
    db.select().from(subscriptionPayments).where(eq(subscriptionPayments.user, userId)),
  ]);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;

  const thisMonthPayments = userPayments.filter((p) => p.paidAt.startsWith(currentMonth));
  const lastMonthPayments = userPayments.filter((p) => p.paidAt.startsWith(lastMonth));

  const activeSubs = userSubs.filter((s) => s.status === "active" || s.status === "trial");

  const context = {
    totalSubscriptions: userSubs.length,
    activeSubscriptions: activeSubs.length,
    thisMonthSpent: thisMonthPayments.reduce((sum, p) => sum + p.amount, 0),
    lastMonthSpent: lastMonthPayments.reduce((sum, p) => sum + p.amount, 0),
    subscriptions: activeSubs.map((s) => ({
      name: s.name,
      price: s.price,
      currency: s.currency,
      cycle: s.billingCycle,
      category: s.category,
      nextBillingDate: s.nextBillingDate,
    })),
  };

  const locale = String(userSettings["locale"] ?? "zh-CN");
  const lang = locale.startsWith("zh") ? "中文" : "English";

  const systemPrompt = `You are a personal finance assistant for a subscription management app. Generate a concise monthly spending summary in ${lang}. Include:
1. Total spending this month vs last month (with change direction)
2. Top spending categories
3. Upcoming large renewals (next 7 days)
4. Potential duplicate subscriptions (similar names or same category with overlapping function)
5. Suggestions for subscriptions that could be cancelled (low usage indicators: high price + infrequent category)

Keep it concise (under 300 words), friendly, and actionable. Use bullet points.`;

  try {
    const result = await callLlm(config, systemPrompt, JSON.stringify(context));
    return c.json({ summary: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI summary failed";
    return c.json({ error: "ai_error", message }, 500);
  }
});
