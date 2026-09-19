import type { AIGlossaryTerm, AIParagraph } from './types';

const glossaryBlock = (terms: AIGlossaryTerm[]) =>
  terms.length === 0
    ? ''
    : `\n\nEstablished names and terms for this novel. Spell them exactly like this, and replace any variant spelling you find with the canonical form:\n${terms
        .map(term =>
          term.aliases.length
            ? `- ${term.canonical} (also written: ${term.aliases.join(', ')})`
            : `- ${term.canonical}`,
        )
        .join('\n')}`;

export const CLEANUP_SYSTEM_PROMPT = `You repair machine-translated web novel prose.

Fix only what is broken:
- grammar, verb tense, and word order that no English speaker would write
- pronouns that switch gender or person mid-scene
- untranslated fragments and obvious mistranslations
- punctuation and spacing that is missing or in the wrong place
- inconsistent spelling of names and terms

Also drop content that is not part of the story:
- translator, editor or uploader notes, including requests to report typos or
  errors, and apologies for the translation
- advertising, donation, subscription and Patreon plugs
- "read the rest at ...", site names, watermarks and credit lines
- navigation furniture: previous chapter, next chapter, table of contents
A paragraph that is nothing but such content: return "d": true and "t": "".
A paragraph of story prose with such content attached to it: return
"d": false and "t" holding the prose alone, with those sentences dropped.
Never drop story prose, the chapter's title, or an author's note that reads as
part of the work.

Never do any of these:
- do not summarise, shorten, expand, or add to the story itself; the only
  text you ever remove is the non-story content listed above
- do not change what happens, who says it, or the order events are told in
- do not alter the narrative voice, tone, or tense of the original
- do not translate or localise honorifics and terms of address; keep them as written
- do not merge two paragraphs or split one paragraph into two
- do not restyle punctuation: keep the quote marks, apostrophes, dashes and
  ellipses exactly as the source writes them, straight or curly

You will receive a JSON array of paragraph objects. Return
{"paragraphs": [...]} holding exactly the same number of objects, in the same
order, with the same "i" values. Each object is {"i": <number>,
"t": "<cleaned paragraph>", "d": <true only when the whole paragraph is not
part of the story>}. If a paragraph needs no change, return it unchanged with
"d": false. Dialogue is quoted prose, so every quote mark inside "t" must be
escaped as \\" - the response has to parse as JSON. Return the JSON object and
nothing else.`;

export const buildCleanupPrompt = (
  paragraphs: AIParagraph[],
  glossary: AIGlossaryTerm[],
) =>
  `Clean these ${paragraphs.length} paragraphs.${glossaryBlock(glossary)}

${JSON.stringify(
  paragraphs.map(paragraph => ({ i: paragraph.index, t: paragraph.text })),
)}`;

export const ANALYSIS_SYSTEM_PROMPT = `You read web novel chapters and report on them.

Return a single JSON object:
{
  "summary": "<3-5 sentences covering what happened, who was involved, and how the chapter ends>",
  "terms": [
    {
      "canonical": "<name or term exactly as the text spells it>",
      "kind": "character" | "place" | "term" | "skill",
      "aliases": ["<other spellings used in this chapter>"],
      "note": "<one short clause identifying it, no plot detail>"
    }
  ]
}

Rules:
- The summary covers only this chapter. Never speculate about what comes next.
- List only names and terms that actually appear in this chapter.
- Do not list common nouns, ordinary places, or words that are not proper to this story.
- Keep notes identifying, not narrative: "the protagonist's younger sister", not what she did.
- Return the JSON object and nothing else.`;

export const buildAnalysisPrompt = (
  novelName: string,
  chapterName: string,
  text: string,
  knownTerms: AIGlossaryTerm[],
) =>
  `Novel: ${novelName}
Chapter: ${chapterName}${
    knownTerms.length
      ? `\n\nAlready known, so list one of these only if this chapter introduces a new spelling for it:\n${knownTerms
          .map(term => `- ${term.canonical}`)
          .join('\n')}`
      : ''
  }

---
${text}`;

export const RECAP_SYSTEM_PROMPT = `You write "previously on" recaps for web novel readers returning after a break.

Write flowing prose, not a list. Cover the through-line: what changed, who is
where, and what is unresolved going into the next chapter. Six sentences at
most. Mention only what is in the summaries you are given - never invent or
predict. Return the recap text and nothing else.`;

export const buildRecapPrompt = (
  novelName: string,
  summaries: { chapterName: string; summary: string }[],
) =>
  `Novel: ${novelName}

Chapter summaries, oldest first:

${summaries
  .map(entry => `## ${entry.chapterName}\n${entry.summary}`)
  .join('\n\n')}`;
