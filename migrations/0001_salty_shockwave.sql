CREATE TABLE `document_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`documentId` integer NOT NULL,
	`content` text NOT NULL,
	`embedding` text,
	`chunkIndex` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`threadId` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`messageId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`threadId`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`threadId` text NOT NULL,
	`userId` text NOT NULL,
	`title` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `threads_threadId_unique` ON `threads` (`threadId`);