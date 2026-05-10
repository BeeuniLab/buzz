ALTER TABLE `users` ADD `clerk_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_id_idx` ON `users` (`clerk_user_id`);
