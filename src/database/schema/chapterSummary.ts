import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * AI-generated chapter summaries. Keyed by `contentHash` so a re-downloaded or
 * re-scraped chapter invalidates its summary instead of describing text the
 * reader can no longer see.
 */
export const chapterSummary = sqliteTable(
  'ChapterSummary',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chapterId: integer('chapterId').notNull(),
    novelId: integer('novelId').notNull(),
    contentHash: text('contentHash').notNull(),
    summary: text('summary').notNull(),
    model: text('model').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  table => [
    index('chapter_summary_chapter_idx').on(table.chapterId, table.contentHash),
    index('chapter_summary_novel_idx').on(table.novelId),
  ],
);

export type ChapterSummaryRow = typeof chapterSummary.$inferSelect;
export type ChapterSummaryInsert = typeof chapterSummary.$inferInsert;
