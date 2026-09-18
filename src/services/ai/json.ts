/**
 * Escapes the quote marks a model leaves bare inside a JSON string. Prose full
 * of dialogue is exactly the payload models get this wrong on - `{"t": ""Run!""}`
 * - and the paragraph is worth recovering rather than re-billing. A quote is
 * read as closing the string only when what follows it can legally follow a
 * string; anything else is part of the text.
 */
const repairStringQuotes = (value: string): string => {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index++) {
    const character = value[index];

    if (!inString) {
      out += character;
      inString = character === '"';
      continue;
    }
    if (escaped) {
      out += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      out += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      if (/^\s*([,:}\]]|$)/.test(value.slice(index + 1))) {
        out += character;
        inString = false;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += character;
  }

  return out;
};

/**
 * Models wrap JSON in prose or code fences no matter how the prompt is worded,
 * so the payload is extracted rather than trusted to be the whole response.
 */
export const parseJsonResponse = <T>(text: string): T => {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();

  const candidates = [withoutFence, repairStringQuotes(withoutFence)];
  const firstArray = withoutFence.indexOf('[');
  const firstObject = withoutFence.indexOf('{');
  const start =
    firstArray === -1
      ? firstObject
      : firstObject === -1
      ? firstArray
      : Math.min(firstArray, firstObject);
  if (start > 0) {
    const sliced = withoutFence.slice(start);
    candidates.push(sliced, repairStringQuotes(sliced));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    `Model did not return valid JSON: ${withoutFence.slice(0, 200)}`,
  );
};
