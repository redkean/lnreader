export { analyzeChapter, chapterPlainText } from './analyze';
export { AINotConfiguredError, requestAI } from './client';
export {
  cleanChapterHtml,
  ParagraphCountMismatchError,
  type CleanupProgress,
} from './cleanup';
export {
  addEstimates,
  estimateChapterJob,
  estimateTokens,
  formatTokenCount,
  type AIJobEstimate,
} from './cost';
export { diffParagraph } from './diff';
export { loadChapterHtmlForAI } from './chapterText';
export {
  chunkParagraphs,
  extractCleanupParagraphs,
  hashChapterText,
  selectCleanableParagraphs,
} from './paragraphs';
export {
  processChapter,
  resolvePasses,
  type ChapterAIPasses,
  type ProcessChapterResult,
} from './processChapter';
export {
  processChapters,
  type AIChapterJobItem,
  type AIProcessChaptersData,
} from './processChapters';
export { AI_PROVIDER_LIST, AI_PROVIDERS, getAIProvider } from './providers';
export { buildRecap, NoSummariesError } from './recap';
export {
  AI_REQUEST_LOG_KEY,
  clearAIRequestLog,
  getAIRequestLog,
  type AIRequestLogEntry,
  type AIRequestStatus,
} from './requestLog';
export {
  deleteCleanupSidecar,
  readCleanupSidecar,
  setParagraphReverted,
  writeCleanupSidecar,
} from './storage';
export type * from './types';
