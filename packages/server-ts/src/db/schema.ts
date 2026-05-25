import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  name: text("name").notNull().default(""),
  image: text("image"),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
  mustChangeCredentials: integer("mustChangeCredentials", { mode: "boolean" }).notNull().default(false),
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
    // snoozedUntil is a YYYY-MM-DD date; when set and >= today (in user TZ),
    // notification-cron skips this subscription's reminders entirely until it
    // passes. Set via POST /subscriptions/:id/snooze. Cleared automatically by
    // the next sub update or manually via the same endpoint with days=0.
    snoozedUntil: text("snoozedUntil"),
    // lastUsedAt is a YYYY-MM-DD date set by the user (or "track usage" button)
    // to mark when they last actually used the subscription. Drives the
    // "inactive subscriptions" dashboard panel (Phase 2.1).
    lastUsedAt: text("lastUsedAt"),
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

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

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

export const subscriptionPayments = sqliteTable(
  "subscription_payments",
  {
    id: text("id").primaryKey(),
    user: text("user").notNull().references(() => users.id),
    // subscriptionId is nullable + set null on delete: deleting a subscription
    // must not erase the financial ledger. Past payments are a historical fact;
    // they get orphaned (subscriptionId = null) but keep their amount/date.
    subscriptionId: text("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    // Cache the subscription's name at payment time so orphaned rows are still
    // human-readable in the payments list after the original subscription is deleted.
    subscriptionName: text("subscription_name").default(""),
    paidAt: text("paid_at").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency").notNull().default("CNY"),
    billingPeriod: text("billing_period"),
    paymentMethod: text("payment_method"),
    note: text("note").default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    userIdx: index("idx_payments_user").on(table.user),
    subscriptionIdx: index("idx_payments_subscription").on(table.subscriptionId),
  }),
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    user: text("user").notNull().references(() => users.id),
    scopeType: text("scope_type", {
      enum: ["global", "category", "tag", "payment_method"],
    }).notNull().default("global"),
    scopeId: text("scope_id").default(""),
    period: text("period", { enum: ["monthly", "yearly"] }).notNull().default("monthly"),
    amount: real("amount").notNull(),
    currency: text("currency").notNull().default("CNY"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    userIdx: index("idx_budgets_user").on(table.user),
  }),
);

export const subscriptionNotificationChannels = sqliteTable(
  "subscription_notification_channels",
  {
    id: text("id").primaryKey(),
    user: text("user").notNull().references(() => users.id),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    subIdx: index("idx_sub_notif_channels_sub").on(table.subscriptionId),
    userIdx: index("idx_sub_notif_channels_user").on(table.user),
  }),
);

export const notificationTemplates = sqliteTable(
  "notification_templates",
  {
    id: text("id").primaryKey(),
    user: text("user").notNull().references(() => users.id),
    scope: text("scope", {
      enum: ["global", "channel", "subscription"],
    }).notNull().default("global"),
    scopeId: text("scope_id").default(""),
    titleTemplate: text("title_template").notNull().default("Qreminder: {{subscription.name}} 续费提醒"),
    bodyTemplate: text("body_template").notNull().default("订阅 {{subscription.name}} 将在 {{daysLeft}} 天后续费\n金额: {{subscription.currency}} {{subscription.amount}}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    userIdx: index("idx_notif_templates_user").on(table.user),
  }),
);

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    owner: text("owner").notNull().references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    role: text("role", { enum: ["owner", "admin", "editor", "viewer"] }).notNull().default("viewer"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_ws_members_workspace").on(table.workspaceId),
    userIdx: index("idx_ws_members_user").on(table.userId),
  }),
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    workspaceId: text("workspace_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    summary: text("summary").default(""),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().default({}),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    userIdx: index("idx_audit_logs_user").on(table.userId),
    workspaceIdx: index("idx_audit_logs_workspace").on(table.workspaceId),
    createdAtIdx: index("idx_audit_logs_created").on(table.createdAt),
  }),
);

// Records every price/currency change of a subscription so the user can see
// historical pricing. Written by the subscription PATCH handler when price or
// currency actually changes. ON DELETE CASCADE: history dies with the sub.
export const subscriptionPriceHistory = sqliteTable(
  "subscription_price_history",
  {
    id: text("id").primaryKey(),
    user: text("user").notNull().references(() => users.id),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    oldPrice: real("old_price").notNull(),
    newPrice: real("new_price").notNull(),
    oldCurrency: text("old_currency").notNull(),
    newCurrency: text("new_currency").notNull(),
    changedAt: text("changed_at").notNull(),
  },
  (table) => ({
    subIdx: index("idx_price_history_sub").on(table.subscriptionId),
    userIdx: index("idx_price_history_user").on(table.user),
  }),
);
