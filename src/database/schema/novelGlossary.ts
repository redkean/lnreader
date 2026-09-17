import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Per-novel glossary of characters, places and terms. Entries carry the
 * chapter they were first seen in so the reader can be shown - and the cleanup
 * prompt can be given - only the terms at or below the current read progress.
 */
export const novelGlossary = sqliteTable(
  'NovelGlossary',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    novelId: integer('novelId').notNull(),
    canonical: text('canonical').notNull(),
    kind: text('kind').notNull().default('term'),
    /** JSON array of alternative spellings seen in the source text. */
    aliases: text('aliases').notNull().default('[]'),
    note: text('note'),
    firstSeenChapterId: integer('firstSeenChapterId'),
    firstSeenChapterNumber: integer('firstSeenChapterNumber'),
    /** Set when the user edited the entry, so re-extraction never overwrites it. */
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    uniqueIndex('novel_glossary_term_unique').on(
      table.novelId,
      table.canonical,
    ),
    index('novel_glossary_novel_idx').on(table.novelId, table.kind),
  ],
);

export type NovelGlossaryRow = typeof novelGlossary.$inferSelect;
export type NovelGlossaryInsert = typeof novelGlossary.$inferInsert;
