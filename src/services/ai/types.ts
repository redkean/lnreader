export type AIProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';

export type AIGlossaryKind = 'character' | 'place' | 'term' | 'skill';

export type AIMessage = {
  role: 'system' | 'user';
  content: string;
};

export type AIRequest = {
  messages: AIMessage[];
  /** Upper bound on the response. Cleanup needs roughly the input size back. */
  maxOutputTokens: number;
  /** Deterministic-ish by default: rewriting prose is not a creative task. */
  temperature?: number;
  signal?: AbortSignal;
};

export type AIUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type AIResponse = {
  text: string;
  usage?: AIUsage;
};

export type AIProviderConfig = {
  provider: AIProviderId;
  apiKey: string;
  model: string;
  /** Only meaningful for `custom`; the other providers have fixed endpoints. */
  baseUrl?: string;
};

export type AIProvider = {
  id: AIProviderId;
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  /** Whether the provider needs an API key at all (local runtimes do not). */
  requiresApiKey: boolean;
  send(config: AIProviderConfig, request: AIRequest): Promise<AIResponse>;
};

export type AIParagraph = {
  index: number;
  text: string;
};

/** A single word-level edit inside a cleaned paragraph. */
export type AIDiffOp = {
  /** Offset into the cleaned paragraph text. */
  start: number;
  /** Length of the replacement inside the cleaned paragraph. */
  length: number;
  /** The text this replaced, empty when the edit is an insertion. */
  original: string;
};

export type AICleanedParagraph = {
  index: number;
  /**
   * The source text this was cleaned from. The reader compares it against
   * what is actually in the DOM before swapping, so a paragraph list that
   * drifted - a plugin that changed its markup, a reader traversal that
   * counts differently - leaves the original text on screen instead of
   * writing cleaned prose onto the wrong paragraph.
   */
  original: string;
  cleaned: string;
  ops: AIDiffOp[];
};

/** The on-disk `cleaned.json` sidecar written next to a downloaded chapter. */
export type AICleanupSidecar = {
  version: 1;
  contentHash: string;
  model: string;
  createdAt: string;
  paragraphs: AICleanedParagraph[];
  /** Paragraph indices the user reverted; always rendered as the original. */
  reverted: number[];
};

export type AIGlossaryTerm = {
  canonical: string;
  kind: AIGlossaryKind;
  aliases: string[];
  note?: string;
};

export type AIChapterAnalysis = {
  summary: string;
  terms: AIGlossaryTerm[];
};
