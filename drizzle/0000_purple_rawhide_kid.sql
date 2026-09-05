CREATE TABLE `signal_players` (
	`room` text NOT NULL,
	`id` text NOT NULL,
	`slot` integer NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`token` text NOT NULL,
	`input` text NOT NULL,
	`seen` integer NOT NULL,
	PRIMARY KEY(`room`, `id`),
	FOREIGN KEY (`room`) REFERENCES `signal_rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_signal_player_slot` ON `signal_players` (`room`,`slot`);--> statement-breakpoint
CREATE TABLE `signal_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`owner` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_signal_rooms_expires` ON `signal_rooms` (`expires`);--> statement-breakpoint
CREATE INDEX `idx_signal_rooms_owner` ON `signal_rooms` (`owner`);