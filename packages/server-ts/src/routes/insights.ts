/**
 * Insights 路由。
 *
 * - POST /api/insights/duplicates — 启发式检测重复订阅
 * - POST /api/insights/cancel-suggestions — 推荐可取消的订阅
 *
 * 纯本地启发式实现（不调用 LLM），保证免费 + 离线可用。AI 月度总结仍走 /api/ai/summary。
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { subscriptions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { detectDuplicates, type DuplicateGroup } from "./insights-duplicates.js";
import { suggestCancellations, type CancelSuggestion } from "./insights-cancel.js";
import type { AppEnv } from "../app.js";

export const insightsRouter = new Hono<AppEnv>();

insightsRouter.use("*", requireSession);

insightsRouter.post("/duplicates", async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");

  const rows = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId));
  const groups: DuplicateGroup[] = detectDuplicates(rows);
  return c.json({ groups });
});

insightsRouter.post("/cancel-suggestions", async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");

  const subs = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId));
  const suggestions: CancelSuggestion[] = suggestCancellations(subs);
  return c.json({ suggestions });
});
