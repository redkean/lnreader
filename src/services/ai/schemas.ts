import type { AIResponseSchema } from './types';

/**
 * Response shapes the providers are asked to guarantee.
 *
 * Both are rooted in an object rather than an array: OpenAI's strict mode
 * only accepts an object root, and Anthropic's tool inputs are objects by
 * definition. The parsers accept a bare array too, so a provider that ignores
 * the schema and follows the prompt still lands.
 */
export const CLEANUP_SCHEMA: AIResponseSchema = {
  name: 'cleaned_paragraphs',
  description: 'The cleaned paragraphs, one for every paragraph sent.',
  schema: {
    type: 'object',
    properties: {
      paragraphs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            i: {
              type: 'integer',
              description: 'The index the paragraph was sent with.',
            },
            t: { type: 'string', description: 'The cleaned paragraph text.' },
          },
          required: ['i', 't'],
          additionalProperties: false,
        },
      },
    },
    required: ['paragraphs'],
    additionalProperties: false,
  },
};

export const ANALYSIS_SCHEMA: AIResponseSchema = {
  name: 'chapter_analysis',
  description: 'A summary of the chapter and the terms it introduces.',
  schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: '3-5 sentences covering what happened in this chapter.',
      },
      terms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            canonical: {
              type: 'string',
              description: 'The name or term as the chapter spells it.',
            },
            kind: {
              type: 'string',
              enum: ['character', 'place', 'term', 'skill'],
            },
            aliases: {
              type: 'array',
              items: { type: 'string' },
              description: 'Other spellings used in this chapter.',
            },
            note: {
              type: ['string', 'null'],
              description: 'One short identifying clause, or null.',
            },
          },
          required: ['canonical', 'kind', 'aliases', 'note'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'terms'],
    additionalProperties: false,
  },
};
