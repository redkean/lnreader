import { category } from './category';
import { novel } from './novel';
import { chapter } from './chapter';
import { chapterCleanup } from './chapterCleanup';
import { chapterSummary } from './chapterSummary';
import { novelCategory } from './novelCategory';
import { novelGlossary } from './novelGlossary';
import { repository } from './repository';

export {
  category as categorySchema,
  type CategoryRow,
  type CategoryInsert,
} from './category';
export { novel as novelSchema, type NovelRow, type NovelInsert } from './novel';
export {
  chapter as chapterSchema,
  type ChapterRow,
  type ChapterInsert,
} from './chapter';
export {
  chapterCleanup as chapterCleanupSchema,
  type ChapterCleanupRow,
  type ChapterCleanupInsert,
} from './chapterCleanup';
export {
  chapterSummary as chapterSummarySchema,
  type ChapterSummaryRow,
  type ChapterSummaryInsert,
} from './chapterSummary';
export {
  novelCategory as novelCategorySchema,
  type NovelCategoryRow,
  type NovelCategoryInsert,
} from './novelCategory';
export {
  novelGlossary as novelGlossarySchema,
  type NovelGlossaryRow,
  type NovelGlossaryInsert,
} from './novelGlossary';
export {
  repository as repositorySchema,
  type RepositoryRow,
  type RepositoryInsert,
} from './repository';

/**
 * Unified schema object containing all database tables
 * Use this with Drizzle ORM for type-safe database operations
 */
export const schema = {
  category,
  novel,
  chapter,
  chapterCleanup,
  chapterSummary,
  novelCategory,
  novelGlossary,
  repository,
} as const;

export type Schema = typeof schema;
