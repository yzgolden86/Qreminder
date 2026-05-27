DROP INDEX IF EXISTS idx_notification_jobs_user_local_time_unique;--> statement-breakpoint
CREATE UNIQUE INDEX idx_notification_jobs_user_workspace_local_time_unique ON notification_jobs(user, workspace_id, scheduledLocalDate, scheduledLocalTime, timeZone);
