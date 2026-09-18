export type AIProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';

export type AIGlossaryKind = 'character' | 'place' | 'term' | 'skill';

export type AIMessage = {
  role: 'system' | 'user';
  content: string;
};

/**
 * The subset of JSON Schema every provider understands. Kept deliberately
 * narrow - an object with declared properties - because that is what OpenAI's
 * strict mode, Anthropic's tool inputs and Gemini's response schemas all
 * accept without translation.
 */
export type AIJsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

/** A response shape the provider is asked to guarantee. */
export type AIResponseSchema = {
  /** Identifier the provider shows in errors, and the tool name on Anthropic. */
  name: string;
  description: string;
  schema: AIJsonSchema;
};

export type AIRequest = {
  messages: AIMessage[];
  /** Upper bound on the response. Cleanup needs roughly the input size back. */
  maxOutputTokens: number;
  /** Deterministic-ish by default: rewriting prose is not a creative task. */
  temperature?: number;
  /**
   * Structured output. Providers that support it are asked to return exactly
   * this shape, which is what keeps dialogue-heavy prose from arriving as
   * JSON the app cannot parse. Providers - and local runtimes - that reject
   * it fall back to the prompt's own instructions.
   */
  schema?: AIResponseSchema;
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
