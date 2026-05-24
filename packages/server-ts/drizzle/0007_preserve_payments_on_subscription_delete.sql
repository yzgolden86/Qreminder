PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_subscription_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`subscription_id` text,
	`subscription_name` text DEFAULT '',
	`paid_at` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`billing_period` text,
	`payment_method` text,
	`note` text DEFAULT '',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_subscription_payments`("id", "user", "subscription_id", "subscription_name", "paid_at", "amount", "currency", "billing_period", "payment_method", "note", "created_at", "updated_at") SELECT "id", "user", "subscription_id", '', "paid_at", "amount", "currency", "billing_period", "payment_method", "note", "created_at", "updated_at" FROM `subscription_payments`;--> statement-breakpoint
DROP TABLE `subscription_payments`;--> statement-breakpoint
ALTER TABLE `__new_subscription_payments` RENAME TO `subscription_payments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_payments_user` ON `subscription_payments` (`user`);--> statement-breakpoint
CREATE INDEX `idx_payments_subscription` ON `subscription_payments` (`subscription_id`);