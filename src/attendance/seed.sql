CREATE TABLE `attendance` (
	`id` integer PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`attendance` text NOT NULL,
	`sub_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`sub_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` integer PRIMARY KEY NOT NULL,
	`sub_name` text NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subjects_id_index` ON `attendance` (`sub_id`);--> statement-breakpoint
CREATE INDEX `users_id_index` ON `attendance` (`user_id`);--> statement-breakpoint
CREATE INDEX `users_id_index_from_sub` ON `subjects` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);