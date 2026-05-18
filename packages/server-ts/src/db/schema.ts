import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  name: text("name").notNull().default(""),
  image: text("image"),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  password: text("password"),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text("scope"),
  idToken: text("idToken"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    user: text("user").notNull().references(() => users.id),
    name: text("name").notNull(),
    logo: text("logo").default(""),
    price: real("price").notNull().default(0),
    currency: text("currency").notNull().default("CNY"),
    billingCycle: text("billingCycle", {
      enum: ["weekly", "monthly", "quarterly", "semi-annual", "annual", "custom"],
    }).notNull().default("monthly"),
    customDays: integer("customDays"),
    category: text("category").notNull().default(""),
    status: text("status", {
      enum: ["trial", "active", "paused", "cancelled"],
    }).notNull().default("active"),
    paymentMethod: text("paymentMethod").default(""),
    startDate: text("startDate").notNull(),
    nextBillingDate: text("nextBillingDate").notNull(),
    autoCalculateNextBillingDate: integer("autoCalculateNextBillingDate", { mode: "boolean" }).notNull().default(true),
    trialEndDate: text("trialEndDate"),
    website: text("website"),
    notes: text("notes").default(""),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    extra: text("extra", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    reminderDays: integer("reminderDays").notNull().default(3),
    reminderOffsets: text("reminderOffsets", { mode: "json" }).$type<number[]>().notNull().default([3]),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => ({
    userIdx: index("idx_subscriptions_user").on(table.user),
  }),
);

export const settings = sqliteTable(
  "settings",
  {
    id: text("id").primaryKey(),
    user: text("user").notNull().references(() => users.id),
    settings: text("settings", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => ({
    userUnique: uniqueIndex("idx_settings_user_unique").on(table.user),
  }),
);

export const customConfigs = sqliteTable(
  "custom_configs",
  {
    id: text("id").primaryKey(),
    user: text("user").notNull().references(() => users.id),
    config: text("config", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => ({
    userUnique: uniqueIndex("idx_custom_configs_user_unique").on(table.user),
  }),
);

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  user: text("user").notNull().references(() => users.id),
  kind: text("kind", { enum: ["logo", "icon"] }).notNull(),
  file: text("file").notNull(),
  mimeType: text("mimeType").notNull().default(""),
  sizeBytes: integer("sizeBytes").notNull().default(0),
  originalName: text("originalName").notNull().default(""),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

export const notificationJobs = sqliteTable(
  "notification_jobs",
  {
    id: text("id").primaryKey(),
    user: text("user").notNull().references(() => users.id),
    scheduledLocalDate: text("scheduledLocalDate").notNull(),
    scheduledLocalTime: text("scheduledLocalTime").notNull(),
    timeZone: text("timeZone").notNull(),
    scheduledInstantUtc: text("scheduledInstantUtc").notNull(),
    status: text("status", {
      enum: ["pending", "sending", "sent", "failed", "skipped"],
    }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("lastError").default(""),
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>().default({}),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => ({
    userLocalTimeUnique: uniqueIndex("idx_notification_jobs_user_local_time_unique").on(
      table.user,
      table.scheduledLocalDate,
      table.scheduledLocalTime,
      table.timeZone,
    ),
  }),
);
