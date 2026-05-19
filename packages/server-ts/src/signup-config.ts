import { eq } from "drizzle-orm";
import { appSettings } from "./db/schema.js";
import type { Database } from "./db/types.js";

export type SignupConfig = {
  enabled: boolean;
  unrestricted: boolean;
  allowedDomains: string[];
};

export const SIGNUP_CONFIG_KEY = "signup_config";
export const DEFAULT_SIGNUP_CONFIG: SignupConfig = {
  enabled: false,
  unrestricted: false,
  allowedDomains: [],
};

export async function readSignupConfig(db: Database): Promise<SignupConfig> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SIGNUP_CONFIG_KEY))
    .limit(1);
  const row = rows[0];
  if (!row) return DEFAULT_SIGNUP_CONFIG;
  const value = row.value as Partial<SignupConfig> | null;
  return {
    enabled: Boolean(value?.enabled),
    unrestricted: Boolean(value?.unrestricted),
    allowedDomains: Array.isArray(value?.allowedDomains)
      ? value.allowedDomains.map((d) => String(d).trim().toLowerCase()).filter(Boolean)
      : [],
  };
}

export async function writeSignupConfig(db: Database, config: SignupConfig): Promise<void> {
  const now = new Date();
  const existing = await db
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(eq(appSettings.key, SIGNUP_CONFIG_KEY))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(appSettings).values({ key: SIGNUP_CONFIG_KEY, value: config, updatedAt: now });
  } else {
    await db
      .update(appSettings)
      .set({ value: config, updatedAt: now })
      .where(eq(appSettings.key, SIGNUP_CONFIG_KEY));
  }
}

export function isEmailAllowedBySignupConfig(email: string, config: SignupConfig): boolean {
  if (!config.enabled) return false;
  if (config.unrestricted) return true;
  if (config.allowedDomains.length === 0) return false;
  const domain = email.split("@")[1]?.trim().toLowerCase();
  return Boolean(domain && config.allowedDomains.includes(domain));
}
