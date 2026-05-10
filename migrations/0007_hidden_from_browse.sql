ALTER TABLE `apps` ADD `hidden_from_browse` integer DEFAULT false;--> statement-breakpoint
CREATE INDEX `apps_hidden_from_browse_idx` ON `apps` (`hidden_from_browse`);
