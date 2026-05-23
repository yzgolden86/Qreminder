CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`scope_type` text DEFAULT 'global' NOT NULL,
	`scope_id` text DEFAULT '',
	`period` text DEFAULT 'monthly' NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_budgets_user` ON `budgets` (`user`);