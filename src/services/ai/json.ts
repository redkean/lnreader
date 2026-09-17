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

  const candidates = [withoutFence];
  const firstArray = withoutFence.indexOf('[');
  const firstObject = withoutFence.indexOf('{');
  const start =
    firstArray === -1
      ? firstObject
      : firstObject === -1
      ? firstArray
      : Math.min(firstArray, firstObject);
  if (start > 0) {
    candidates.push(withoutFence.slice(start));
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
