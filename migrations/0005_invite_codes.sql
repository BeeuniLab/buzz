CREATE TABLE `invite_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`max_uses` integer DEFAULT 0,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`created_by` text
);--> statement-breakpoint
CREATE UNIQUE INDEX `invite_codes_code_idx` ON `invite_codes` (`code`);
