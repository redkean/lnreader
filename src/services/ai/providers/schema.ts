import type { AIJsonSchema } from '../types';
import { AIRequestError } from './http';

/**
 * Whether a provider turned the request down over the response schema rather
 * than over the request itself.
 *
 * The base URL is user-supplied: `custom` points at Ollama, LM Studio or a
 * proxy, and those speak the chat-completions shape without necessarily
 * implementing structured output. A rejected schema means the request is
 * re-sent plain, so those runtimes keep working on the prompt's instructions
 * alone rather than losing the feature entirely.
 */
export const isSchemaRejection = (error: unknown): boolean =>
  error instanceof AIRequestError &&
  error.status !== undefined &&
  error.status >= 400 &&
  error.status < 500 &&
  /schema|response_format|structured|tool/i.test(error.message);

/**
 * Gemini takes an OpenAPI subset rather than JSON Schema: `additionalProperties`
 * is not a field it knows, and a nullable value is a flag rather than a union
 * of types.
 */
export const toGeminiSchema = (schema: AIJsonSchema): Record<string, unknown> =>
  convert(schema) as Record<string, unknown>;

const convert = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(convert);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'additionalProperties') {
      continue;
    }
    if (key === 'type' && Array.isArray(entry)) {
      const types = entry.filter(type => type !== 'null');
      result.type = types[0] ?? 'string';
      if (types.length !== entry.length) {
        result.nullable = true;
      }
      continue;
    }
    result[key] = convert(entry);
  }
  return result;
};
