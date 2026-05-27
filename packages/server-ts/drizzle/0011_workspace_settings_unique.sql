DROP INDEX IF EXISTS idx_settings_user_unique;--> statement-breakpoint
DROP INDEX IF EXISTS idx_custom_configs_user_unique;--> statement-breakpoint
CREATE UNIQUE INDEX idx_settings_user_workspace_unique ON settings(user, workspace_id);--> statement-breakpoint
CREATE UNIQUE INDEX idx_custom_configs_user_workspace_unique ON custom_configs(user, workspace_id);
