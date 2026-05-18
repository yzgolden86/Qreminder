import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app.js";

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.get("auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("session", session.session);
  c.set("user", session.user);
  await next();
};
