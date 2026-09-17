import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';

import { dbManager } from '@database/db';
import {
  chapterCleanupSchema,
  chapterSchema,
  chapterSummarySchema,
  novelGlossarySchema,
  type ChapterSummaryRow,
  type NovelGlossaryRow,
} from '@database/schema';
import type { AIGlossaryKind, AIGlossaryTerm } from '@services/ai/types';

const now = () => new Date().toISOString();

// #region Summaries

export const getChapterSummary = (
  chapterId: number,
  contentHash: string,
): ChapterSummaryRow | undefined =>
  dbManager.getSync(
    dbManager
      .select()
      .from(chapterSummarySchema)
      .where(
        and(
          eq(chapterSummarySchema.chapterId, chapterId),
          eq(chapterSummarySchema.contentHash, contentHash),
        ),
      ),
  );

export const saveChapterSummary = async (entry: {
  chapterId: number;
  novelId: number;
  contentHash: string;
  summary: string;
  model: string;
}): Promise<void> => {
  await dbManager.write(async tx => {
    // One summary per chapter: a re-run against new source text replaces the
    // stale one rather than accumulating rows nothing will ever read.
    await tx
      .delete(chapterSummarySchema)
      .where(eq(chapterSummarySchema.chapterId, entry.chapterId));
    await tx
      .insert(chapterSummarySchema)
      .values({ ...entry, createdAt: now() });
  });
};

/**
 * Summaries for the recap, oldest first. Capped at `limit` chapters ending at
 * the chapter being read, so a recap never describes anything ahead of the
 * reader.
 */
export const getRecapSummaries = (
  novelId: number,
  uptoPosition: number,
  limit: number,
): { chapterName: string; summary: string }[] => {
  const rows = dbManager.allSync(
    dbManager
      .select({
        chapterName: chapterSchema.name,
        summary: chapterSummarySchema.summary,
        position: chapterSchema.position,
      })
      .from(chapterSummarySchema)
      .innerJoin(
        chapterSchema,
        eq(chapterSchema.id, chapterSummarySchema.chapterId),
      )
      .where(
        and(
          eq(chapterSummarySchema.novelId, novelId),
          lte(chapterSchema.position, uptoPosition),
        ),
      )
      .orderBy(desc(chapterSchema.position))
      .limit(limit),
  );

  return [...rows]
    .reverse()
    .map(row => ({ chapterName: row.chapterName, summary: row.summary }));
};

/** Chapter ids that already have a summary for their current text. */
export const getSummarizedChapterIds = (
  novelId: number,
): Map<number, string> => {
  const rows = dbManager.allSync(
    dbManager
      .select({
        chapterId: chapterSummarySchema.chapterId,
        contentHash: chapterSummarySchema.contentHash,
      })
      .from(chapterSummarySchema)
      .where(eq(chapterSummarySchema.novelId, novelId)),
  );
  return new Map(rows.map(row => [row.chapterId, row.contentHash]));
};

// #endregion
// #region Cleanup index

export const getCleanedChapterIds = (novelId: number): Map<number, string> => {
  const rows = dbManager.allSync(
    dbManager
      .select({
        chapterId: chapterCleanupSchema.chapterId,
        contentHash: chapterCleanupSchema.contentHash,
      })
      .from(chapterCleanupSchema)
      .where(eq(chapterCleanupSchema.novelId, novelId)),
  );
  return new Map(rows.map(row => [row.chapterId, row.contentHash]));
};

export const saveChapterCleanupIndex = async (entry: {
  chapterId: number;
  novelId: number;
  contentHash: string;
  model: string;
  paragraphCount: number;
  changedCount: number;
}): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .delete(chapterCleanupSchema)
      .where(eq(chapterCleanupSchema.chapterId, entry.chapterId));
    await tx
      .insert(chapterCleanupSchema)
      .values({ ...entry, createdAt: now() });
  });
};

/**
 * Drops the AI rows belonging to chapters whose files were deleted. The
 * sidecar itself goes with the chapter folder; only the index has to be
 * cleared here.
 */
export const deleteChapterAIData = async (
  chapterIds: number[],
): Promise<void> => {
  if (!chapterIds.length) {
    return;
  }
  await dbManager.write(async tx => {
    await tx
      .delete(chapterCleanupSchema)
      .where(inArray(chapterCleanupSchema.chapterId, chapterIds));
  });
};

// #endregion
// #region Glossary

const toTerm = (row: NovelGlossaryRow): AIGlossaryTerm => {
  let aliases: string[] = [];
  try {
    const parsed = JSON.parse(row.aliases);
    if (Array.isArray(parsed)) {
      aliases = parsed.filter(
        (alias): alias is string => typeof alias === 'string',
      );
    }
  } catch {
    // A corrupt alias list degrades to no aliases, never to a broken glossary.
  }
  return {
    canonical: row.canonical,
    kind: row.kind as AIGlossaryKind,
    aliases,
    note: row.note ?? undefined,
  };
};

export const getNovelGlossary = (novelId: number): NovelGlossaryRow[] =>
  dbManager.allSync(
    dbManager
      .select()
      .from(novelGlossarySchema)
      .where(eq(novelGlossarySchema.novelId, novelId))
      .orderBy(asc(novelGlossarySchema.canonical)),
  );

/**
 * Glossary terms first seen at or before `uptoChapterNumber`. Feeding the
 * cleanup prompt - or the glossary screen - anything past the reader's
 * progress would spoil the novel.
 */
export const getGlossaryForPrompt = (
  novelId: number,
  uptoChapterNumber: number,
  limit = 120,
): AIGlossaryTerm[] => {
  const rows = dbManager.allSync(
    dbManager
      .select()
      .from(novelGlossarySchema)
      .where(
        and(
          eq(novelGlossarySchema.novelId, novelId),
          lte(novelGlossarySchema.firstSeenChapterNumber, uptoChapterNumber),
        ),
      )
      .orderBy(asc(novelGlossarySchema.firstSeenChapterNumber))
      .limit(limit),
  );
  return rows.map(toTerm);
};

export const upsertGlossaryTerms = async (
  novelId: number,
  terms: AIGlossaryTerm[],
  firstSeen: { chapterId: number; chapterNumber: number },
): Promise<void> => {
  if (!terms.length) {
    return;
  }

  const existing = new Map(
    getNovelGlossary(novelId).map(row => [row.canonical.toLowerCase(), row]),
  );
  const timestamp = now();

  await dbManager.write(async tx => {
    for (const term of terms) {
      const canonical = term.canonical.trim();
      if (!canonical) {
        continue;
      }
      const current = existing.get(canonical.toLowerCase());

      if (!current) {
        await tx.insert(novelGlossarySchema).values({
          novelId,
          canonical,
          kind: term.kind,
          aliases: JSON.stringify([...new Set(term.aliases)]),
          note: term.note ?? null,
          firstSeenChapterId: firstSeen.chapterId,
          firstSeenChapterNumber: firstSeen.chapterNumber,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        continue;
      }

      // A term the reader edited is theirs; re-extraction only ever adds
      // aliases to it, and never rewrites the name or the note.
      const merged = [
        ...new Set([...toTerm(current).aliases, ...term.aliases]),
      ].filter(alias => alias !== canonical);

      await tx
        .update(novelGlossarySchema)
        .set({
          aliases: JSON.stringify(merged),
          ...(current.pinned
            ? {}
            : { kind: term.kind, note: term.note ?? current.note }),
          updatedAt: timestamp,
        })
        .where(eq(novelGlossarySchema.id, current.id));
    }
  });
};

export const updateGlossaryTerm = async (
  id: number,
  values: { canonical?: string; kind?: AIGlossaryKind; note?: string | null },
): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .update(novelGlossarySchema)
      .set({ ...values, pinned: true, updatedAt: now() })
      .where(eq(novelGlossarySchema.id, id));
  });
};

export const deleteGlossaryTerm = async (id: number): Promise<void> => {
  await dbManager.write(async tx => {
    await tx.delete(novelGlossarySchema).where(eq(novelGlossarySchema.id, id));
  });
};

/** Folds `sourceId` into `targetId`, keeping the target's name. */
export const mergeGlossaryTerms = async (
  targetId: number,
  sourceId: number,
): Promise<void> => {
  const rows = dbManager.allSync(
    dbManager
      .select()
      .from(novelGlossarySchema)
      .where(inArray(novelGlossarySchema.id, [targetId, sourceId])),
  );
  const target = rows.find(row => row.id === targetId);
  const source = rows.find(row => row.id === sourceId);
  if (!target || !source) {
    return;
  }

  const aliases = [
    ...new Set([
      ...toTerm(target).aliases,
      ...toTerm(source).aliases,
      source.canonical,
    ]),
  ].filter(alias => alias !== target.canonical);

  await dbManager.write(async tx => {
    await tx
      .update(novelGlossarySchema)
      .set({
        aliases: JSON.stringify(aliases),
        pinned: true,
        firstSeenChapterNumber: Math.min(
          target.firstSeenChapterNumber ?? Number.MAX_SAFE_INTEGER,
          source.firstSeenChapterNumber ?? Number.MAX_SAFE_INTEGER,
        ),
        updatedAt: now(),
      })
      .where(eq(novelGlossarySchema.id, targetId));
    await tx
      .delete(novelGlossarySchema)
      .where(eq(novelGlossarySchema.id, sourceId));
  });
};

export const deleteNovelGlossary = async (novelId: number): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .delete(novelGlossarySchema)
      .where(eq(novelGlossarySchema.novelId, novelId));
  });
};

// #endregion
