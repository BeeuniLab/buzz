CREATE TABLE `user_follows` (
	`id` text PRIMARY KEY NOT NULL,
	`follower_id` text NOT NULL,
	`following_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`following_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `user_follows_follower_following_idx` ON `user_follows` (`follower_id`,`following_id`);--> statement-breakpoint
CREATE INDEX `user_follows_follower_idx` ON `user_follows` (`follower_id`);--> statement-breakpoint
CREATE INDEX `user_follows_following_idx` ON `user_follows` (`following_id`);--> statement-breakpoint
CREATE INDEX `user_follows_following_created_at_idx` ON `user_follows` (`following_id`,`created_at`);
