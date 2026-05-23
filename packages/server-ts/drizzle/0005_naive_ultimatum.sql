CREATE TABLE `notification_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`scope_id` text DEFAULT '',
	`title_template` text DEFAULT 'Qreminder: {{subscription.name}} 续费提醒' NOT NULL,
	`body_template` text DEFAULT '订阅 {{subscription.name}} 将在 {{daysLeft}} 天后续费
金额: {{subscription.currency}} {{subscription.amount}}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notif_templates_user` ON `notification_templates` (`user`);--> statement-breakpoint
CREATE TABLE `subscription_notification_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`subscription_id` text NOT NULL,
	`channel` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sub_notif_channels_sub` ON `subscription_notification_channels` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `idx_sub_notif_channels_user` ON `subscription_notification_channels` (`user`);