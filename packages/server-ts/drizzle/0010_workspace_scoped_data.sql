-- Migration: Add workspace_id to all business tables and backfill with personal workspaces
-- Phase 1: Create personal workspaces for all existing users
-- Phase 2: Add workspace_id columns to business tables
-- Phase 3: Backfill workspace_id with user's personal workspace
-- Phase 4: Add indexes

-- Phase 1: Create personal workspaces for all users who don't have one yet
-- Each user gets a workspace named "Personal" owned by them
INSERT INTO workspaces (id, name, owner, created_at, updated_at)
SELECT
  'ws_personal_' || id,
  'Personal',
  id,
  datetime('now'),
  datetime('now')
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM workspaces WHERE owner = users.id AND name = 'Personal'
);--> statement-breakpoint

-- Add workspace members for personal workspaces (owner role)
INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
SELECT
  'wsm_personal_' || users.id,
  'ws_personal_' || users.id,
  users.id,
  'owner',
  datetime('now')
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_members
  WHERE workspace_id = 'ws_personal_' || users.id AND user_id = users.id
);--> statement-breakpoint

-- Phase 2: Add workspace_id columns to all business tables
ALTER TABLE subscriptions ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE subscription_payments ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE budgets ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE custom_configs ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE notification_templates ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE subscription_notification_channels ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE subscription_price_history ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE notification_jobs ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE assets ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;--> statement-breakpoint

-- Phase 3: Backfill workspace_id with user's personal workspace
UPDATE subscriptions
SET workspace_id = 'ws_personal_' || user
WHERE workspace_id IS NULL;--> statement-breakpoint

UPDATE subscription_payments
SET workspace_id = 'ws_personal_' || user
WHERE workspace_id IS NULL;--> statement-breakpoint

UPDATE budgets
SET workspace_id = 'ws_personal_' || user
WHERE workspace_id IS NULL;--> statement-breakpoint

UPDATE settings
SET workspace_id = 'ws_personal_' || user
WHERE workspace_id IS NULL;--> statement-breakpoint

UPDATE custom_configs
SET workspace_id = 'ws_personal_' || user
WHERE workspace_id IS NULL;--> statement-breakpoint

UPDATE notification_templates
SET workspace_id = 'ws_personal_' || user
WHERE workspace_id IS NULL;--> statement-breakpoint

UPDATE subscription_notification_channels
SET workspace_id = 'ws_personal_' || user
WHERE workspace_id IS NULL;--> statement-breakpoint

UPDATE subscription_price_history
SET workspace_id = 'ws_personal_' || user
WHERE workspace_id IS NULL;--> statement-breakpoint

UPDATE notification_jobs
SET workspace_id = 'ws_personal_' || user
WHERE workspace_id IS NULL;--> statement-breakpoint

UPDATE assets
SET workspace_id = 'ws_personal_' || user
WHERE workspace_id IS NULL;--> statement-breakpoint

-- Phase 4: Add indexes for workspace_id columns
CREATE INDEX idx_subscriptions_workspace ON subscriptions(workspace_id);--> statement-breakpoint
CREATE INDEX idx_payments_workspace ON subscription_payments(workspace_id);--> statement-breakpoint
CREATE INDEX idx_budgets_workspace ON budgets(workspace_id);--> statement-breakpoint
CREATE INDEX idx_settings_workspace ON settings(workspace_id);--> statement-breakpoint
CREATE INDEX idx_custom_configs_workspace ON custom_configs(workspace_id);--> statement-breakpoint
CREATE INDEX idx_notif_templates_workspace ON notification_templates(workspace_id);--> statement-breakpoint
CREATE INDEX idx_sub_notif_channels_workspace ON subscription_notification_channels(workspace_id);--> statement-breakpoint
CREATE INDEX idx_price_history_workspace ON subscription_price_history(workspace_id);--> statement-breakpoint
CREATE INDEX idx_notification_jobs_workspace ON notification_jobs(workspace_id);--> statement-breakpoint
CREATE INDEX idx_assets_workspace ON assets(workspace_id);
