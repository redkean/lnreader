import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Index of cleaned chapters. The cleaned paragraphs themselves live on disk
 * next to the downloaded chapter (`cleaned.json`) so they share the download's
 * lifecycle; this table exists only so the chapter list can show a badge
 * without stat-ing thousands of files.
 */
export const chapterCleanup = sqliteTable(
  'ChapterCleanup',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chapterId: integer('chapterId').notNull(),
    novelId: integer('novelId').notNull(),
    contentHash: text('contentHash').notNull(),
    model: text('model').notNull(),
    paragraphCount: integer('paragraphCount').notNull(),
    changedCount: integer('changedCount').notNull().default(0),
    createdAt: text('createdAt').notNull(),
  },
  table => [
    index('chapter_cleanup_chapter_idx').on(table.chapterId, table.contentHash),
    index('chapter_cleanup_novel_idx').on(table.novelId),
  ],
);

export type ChapterCleanupRow = typeof chapterCleanup.$inferSelect;
export type ChapterCleanupInsert = typeof chapterCleanup.$inferInsert;
