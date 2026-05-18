CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`password` text,
	`accessToken` text,
	`refreshToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`idToken` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`kind` text NOT NULL,
	`file` text NOT NULL,
	`mimeType` text DEFAULT '' NOT NULL,
	`sizeBytes` integer DEFAULT 0 NOT NULL,
	`originalName` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `custom_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_custom_configs_user_unique` ON `custom_configs` (`user`);--> statement-breakpoint
CREATE TABLE `notification_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`scheduledLocalDate` text NOT NULL,
	`scheduledLocalTime` text NOT NULL,
	`timeZone` text NOT NULL,
	`scheduledInstantUtc` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text DEFAULT '',
	`result` text DEFAULT '{}',
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notification_jobs_user_local_time_unique` ON `notification_jobs` (`user`,`scheduledLocalDate`,`scheduledLocalTime`,`timeZone`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`token` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_settings_user_unique` ON `settings` (`user`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`name` text NOT NULL,
	`logo` text DEFAULT '',
	`price` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`billingCycle` text DEFAULT 'monthly' NOT NULL,
	`customDays` integer,
	`category` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`paymentMethod` text DEFAULT '',
	`startDate` text NOT NULL,
	`nextBillingDate` text NOT NULL,
	`autoCalculateNextBillingDate` integer DEFAULT true NOT NULL,
	`trialEndDate` text,
	`website` text,
	`notes` text DEFAULT '',
	`tags` text DEFAULT '[]' NOT NULL,
	`extra` text DEFAULT '{}' NOT NULL,
	`reminderDays` integer DEFAULT 3 NOT NULL,
	`reminderOffsets` text DEFAULT '[3]' NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_subscriptions_user` ON `subscriptions` (`user`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`banned` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
