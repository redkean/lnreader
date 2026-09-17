CREATE TABLE `ChapterCleanup` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`chapterId` integer NOT NULL,
	`novelId` integer NOT NULL,
	`contentHash` text NOT NULL,
	`model` text NOT NULL,
	`paragraphCount` integer NOT NULL,
	`changedCount` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ChapterSummary` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`chapterId` integer NOT NULL,
	`novelId` integer NOT NULL,
	`contentHash` text NOT NULL,
	`summary` text NOT NULL,
	`model` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `NovelGlossary` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`novelId` integer NOT NULL,
	`canonical` text NOT NULL,
	`kind` text DEFAULT 'term' NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`note` text,
	`firstSeenChapterId` integer,
	`firstSeenChapterNumber` integer,
	`pinned` integer DEFAULT false NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chapter_cleanup_chapter_idx` ON `ChapterCleanup` (`chapterId`,`contentHash`);--> statement-breakpoint
CREATE INDEX `chapter_cleanup_novel_idx` ON `ChapterCleanup` (`novelId`);--> statement-breakpoint
CREATE INDEX `chapter_summary_chapter_idx` ON `ChapterSummary` (`chapterId`,`contentHash`);--> statement-breakpoint
CREATE INDEX `chapter_summary_novel_idx` ON `ChapterSummary` (`novelId`);--> statement-breakpoint
CREATE UNIQUE INDEX `novel_glossary_term_unique` ON `NovelGlossary` (`novelId`,`canonical`);--> statement-breakpoint
CREATE INDEX `novel_glossary_novel_idx` ON `NovelGlossary` (`novelId`,`kind`);