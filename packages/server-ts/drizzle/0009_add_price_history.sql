CREATE TABLE `subscription_price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`subscription_id` text NOT NULL,
	`old_price` real NOT NULL,
	`new_price` real NOT NULL,
	`old_currency` text NOT NULL,
	`new_currency` text NOT NULL,
	`changed_at` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_price_history_sub` ON `subscription_price_history` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `idx_price_history_user` ON `subscription_price_history` (`user`);