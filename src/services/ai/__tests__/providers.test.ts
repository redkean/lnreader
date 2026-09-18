import { AI_PROVIDERS } from '../providers';
import { AIRequestError } from '../providers/http';
import { isSchemaRejection, toGeminiSchema } from '../providers/schema';
import { CLEANUP_SCHEMA } from '../schemas';
import type { AIRequest } from '../types';

const request: AIRequest = {
  messages: [
    { role: 'system', content: 'Clean it.' },
    { role: 'user', content: '["paragraph"]' },
  ],
  maxOutputTokens: 500,
  schema: CLEANUP_SCHEMA,
};

const respondWith = (payload: unknown, ...rest: unknown[]) => {
  const responses = [payload, ...rest];
  const fetchMock = jest.fn(async () => {
    const next = responses.length > 1 ? responses.shift() : responses[0];
    if (next instanceof Error) {
      throw next;
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => next,
      text: async () => JSON.stringify(next),
    } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

/** The body of the nth request, parsed. */
const bodyOf = (fetchMock: jest.Mock, call = 0) =>
  JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);

const rejection = (status: number, message: string) => {
  let calls = 0;
  const fetchMock: jest.Mock = jest.fn(async (): Promise<Response> => {
    calls++;
    const failing = calls === 1;
    return {
      ok: !failing,
      status: failing ? status : 200,
      statusText: failing ? 'Bad Request' : 'OK',
      json: async () => ({
        choices: [{ message: { content: '{"paragraphs":[]}' } }],
        candidates: [{ content: { parts: [{ text: '{"paragraphs":[]}' }] } }],
      }),
      text: async () => message,
    } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

describe('structured output', () => {
  it('asks OpenAI for the schema in strict mode', async () => {
    const fetchMock = respondWith({
      choices: [{ message: { content: '{"paragraphs":[]}' } }],
    });

    await AI_PROVIDERS.openai.send(
      { provider: 'openai', apiKey: 'key', model: 'gpt-4.1-mini' },
      request,
    );

    expect(bodyOf(fetchMock).response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: CLEANUP_SCHEMA.name,
        description: CLEANUP_SCHEMA.description,
        schema: CLEANUP_SCHEMA.schema,
        strict: true,
      },
    });
  });

  it('re-sends without the schema when a runtime rejects it', async () => {
    const fetchMock = rejection(400, 'response_format is not supported');

    const response = await AI_PROVIDERS.custom.send(
      { provider: 'custom', apiKey: '', model: 'local' },
      request,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 1).response_format).toBeUndefined();
    expect(response.text).toBe('{"paragraphs":[]}');
  });

  it('keeps a rejection that has nothing to do with the schema', async () => {
    const fetchMock = rejection(401, 'invalid api key');

    await expect(
      AI_PROVIDERS.openai.send(
        { provider: 'openai', apiKey: 'bad', model: 'gpt-4.1-mini' },
        request,
      ),
    ).rejects.toThrow('401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forces the schema as a tool call on Anthropic and reads its input', async () => {
    const fetchMock = respondWith({
      content: [
        {
          type: 'tool_use',
          input: { paragraphs: [{ i: 0, t: '"Run!"' }] },
        },
      ],
    });

    const response = await AI_PROVIDERS.anthropic.send(
      { provider: 'anthropic', apiKey: 'key', model: 'claude-opus-5' },
      request,
    );

    const body = bodyOf(fetchMock);
    expect(body.tool_choice).toEqual({
      type: 'tool',
      name: CLEANUP_SCHEMA.name,
    });
    expect(body.tools[0].input_schema).toEqual(CLEANUP_SCHEMA.schema);
    expect(JSON.parse(response.text)).toEqual({
      paragraphs: [{ i: 0, t: '"Run!"' }],
    });
  });

  it('sends Gemini a response schema it understands', async () => {
    const fetchMock = respondWith({
      candidates: [{ content: { parts: [{ text: '{"paragraphs":[]}' }] } }],
    });

    await AI_PROVIDERS.gemini.send(
      { provider: 'gemini', apiKey: 'key', model: 'gemini-2.5-flash' },
      request,
    );

    const config = bodyOf(fetchMock).generationConfig;
    expect(config.responseMimeType).toBe('application/json');
    expect(JSON.stringify(config.responseSchema)).not.toContain(
      'additionalProperties',
    );
  });
});

describe('toGeminiSchema', () => {
  it('turns a nullable union into a flag', () => {
    expect(
      toGeminiSchema({
        type: 'object',
        properties: { note: { type: ['string', 'null'] } },
        required: ['note'],
        additionalProperties: false,
      }),
    ).toEqual({
      type: 'object',
      properties: { note: { type: 'string', nullable: true } },
      required: ['note'],
    });
  });
});

describe('isSchemaRejection', () => {
  it('is true for a 4xx that names the schema', () => {
    expect(
      isSchemaRejection(
        new AIRequestError('400 Bad Request: unknown response_format', 400),
      ),
    ).toBe(true);
  });

  it('is false for a server error', () => {
    expect(isSchemaRejection(new AIRequestError('500 schema', 500))).toBe(
      false,
    );
  });
});
