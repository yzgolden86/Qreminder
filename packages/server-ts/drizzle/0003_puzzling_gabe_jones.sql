CREATE TABLE `subscription_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`subscription_id` text NOT NULL,
	`paid_at` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`billing_period` text,
	`payment_method` text,
	`note` text DEFAULT '',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_payments_user` ON `subscription_payments` (`user`);--> statement-breakpoint
CREATE INDEX `idx_payments_subscription` ON `subscription_payments` (`subscription_id`);