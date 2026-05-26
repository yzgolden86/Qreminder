import { Hono } from "hono";
import { z } from "zod";
import { requireSession } from "../middleware/require-session.js";
import { writeAuditLog } from "./audit-logs.js";
import {
  readSignupConfig,
  writeSignupConfig,
  type SignupConfig,
} from "../signup-config.js";
import type { AppEnv } from "../app.js";

export const signupConfigRouter = new Hono<AppEnv>();

signupConfigRouter.use("*", requireSession, async (c, next) => {
  const user = c.get("user") as { role?: string };
  if (user.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
});

const updateSchema = z.object({
  enabled: z.boolean(),
  unrestricted: z.boolean(),
  allowedDomains: z.array(z.string().min(1)).max(50),
});

signupConfigRouter.get("/", async (c) => {
  const deps = c.get("deps");
  const config = await readSignupConfig(deps.db);
  return c.json({ config });
});

signupConfigRouter.patch("/", async (c) => {
  const deps = c.get("deps");
  const body = await c.req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const next: SignupConfig = {
    enabled: parsed.data.enabled,
    unrestricted: parsed.data.unrestricted,
    allowedDomains: parsed.data.allowedDomains
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  };
  await writeSignupConfig(deps.db, next);
  await writeAuditLog(deps.db, {
    userId: c.get("user").id,
    action: "admin.signupConfig.update",
    targetType: "signup_config",
    metadata: { enabled: next.enabled, unrestricted: next.unrestricted, domainCount: next.allowedDomains.length },
  });
  return c.json({ config: next });
});
