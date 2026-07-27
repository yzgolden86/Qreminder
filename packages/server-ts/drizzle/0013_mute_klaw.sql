CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`base_currency` text NOT NULL,
	`from_currency` text NOT NULL,
	`rate` real NOT NULL,
	`provider` text DEFAULT 'frankfurter' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_exchange_rates_date_base_from` ON `exchange_rates` (`date`,`base_currency`,`from_currency`);--> statement-breakpoint
CREATE INDEX `idx_exchange_rates_date` ON `exchange_rates` (`date`);--> statement-breakpoint
CREATE TABLE `subscription_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`workspace_id` text,
	`name` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`default_channels` text DEFAULT '[]' NOT NULL,
	`payment_method` text DEFAULT '',
	`billing_cycle` text DEFAULT 'monthly' NOT NULL,
	`custom_days` integer,
	`reminder_offsets` text DEFAULT '[3]' NOT NULL,
	`notes` text DEFAULT '',
	`logo_url` text DEFAULT '',
	`usage_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_templates_user` ON `subscription_templates` (`user`);--> statement-breakpoint
CREATE INDEX `idx_templates_workspace` ON `subscription_templates` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `subscription_payments` ADD `exchange_rate_to_base` real;--> statement-breakpoint
ALTER TABLE `subscription_payments` ADD `exchange_rate_date` text;