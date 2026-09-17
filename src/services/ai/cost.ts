/**
 * Rough token estimate. Providers tokenise differently and none of them will
 * tell us for free, so this deliberately errs high: it exists to stop a
 * range job from spending an unbounded amount, not to bill anyone.
 */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / 3.5);

export type AIJobEstimate = {
  chapters: number;
  inputTokens: number;
  outputTokens: number;
};

export const addEstimates = (
  a: AIJobEstimate,
  b: AIJobEstimate,
): AIJobEstimate => ({
  chapters: a.chapters + b.chapters,
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

/**
 * What one chapter costs for the passes that are enabled. Cleanup returns the
 * whole chapter, so its output is roughly its input; analysis returns a few
 * hundred tokens regardless of chapter length.
 */
export const estimateChapterJob = (
  chapterText: string,
  passes: { cleanup: boolean; analysis: boolean },
): AIJobEstimate => {
  const tokens = estimateTokens(chapterText);
  let inputTokens = 0;
  let outputTokens = 0;

  if (passes.cleanup) {
    inputTokens += tokens + 400;
    outputTokens += tokens;
  }
  if (passes.analysis) {
    inputTokens += tokens + 200;
    outputTokens += 600;
  }

  return { chapters: 1, inputTokens, outputTokens };
};

export const formatTokenCount = (tokens: number): string =>
  tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(1)}M`
    : tokens >= 1_000
    ? `${(tokens / 1_000).toFixed(1)}k`
    : String(tokens);
