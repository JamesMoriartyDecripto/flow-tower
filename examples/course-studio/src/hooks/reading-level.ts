import type { HookCallback, PostToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { GATES, PATHS } from '../config';
import { deny, toolInput } from './decide';

const TARGETS = parse(readFileSync(PATHS.readingLevels, 'utf8')) as {
  default: { fk_grade_max: number; avg_sentence_words_max: number };
  locales: Record<string, { fk_grade_max: number }>;
};

/** Strip what learners do not read as prose: code, front matter, links, citations, tables. */
const prose = (md: string) =>
  md.replace(/^---[\s\S]*?---/, '').replace(/```[\s\S]*?```/g, '').replace(/\[S\d+\]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^\|.*\|$/gm, '').replace(/[#>*_`]/g, '');

const syllables = (word: string) => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  return Math.max(1, (w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g) ?? []).length);
};

/** Flesch-Kincaid grade level. Rough, but stable and explainable to SMEs. */
export function readability(md: string) {
  const sentences = prose(md).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 2);
  const words = sentences.flatMap((s) => s.split(/\s+/));
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const wps = words.length / Math.max(sentences.length, 1);
  const grade = 0.39 * wps + 11.8 * (syl / Math.max(words.length, 1)) - 15.59;
  const hardest = [...sentences].sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length).slice(0, 3);
  return { grade: Math.round(grade * 10) / 10, wordsPerSentence: Math.round(wps * 10) / 10, hardest };
}

/** PreToolUse on full lesson writes: deny above target + tolerance, with the fix list. */
export const readingLevelGate: HookCallback = async (input) => {
  const { file_path = '', content } = toolInput(input);
  if (!/\/(lessons|l10n\/[\w-]+\/lessons)\/.*\.md$/.test(file_path) || !content) return {};
  const locale = file_path.match(/l10n\/([\w-]+)\//)?.[1];
  const max = (locale ? TARGETS.locales[locale]?.fk_grade_max : undefined) ?? TARGETS.default.fk_grade_max;
  const r = readability(content);
  if (r.grade <= max + GATES.reading.tolerance_grade) return {};
  return deny(
    `Reading level grade ${r.grade} exceeds target ${max} (+${GATES.reading.tolerance_grade}). ` +
      `Average ${r.wordsPerSentence} words/sentence. Simplify these first:\n- ${r.hardest.join('\n- ')}`,
  );
};

/** PostToolUse: feed the numbers back even when the write passed, so writers self-correct early. */
export const readabilityFeedback: HookCallback = async (input) => {
  const { tool_input } = input as PostToolUseHookInput;
  const { file_path = '', content } = tool_input as { file_path?: string; content?: string };
  if (!file_path.includes('/lessons/') || !content) return {};
  const r = readability(content);
  return { hookSpecificOutput: { hookEventName: 'PostToolUse' as const, additionalContext: `Readability: grade ${r.grade}, ${r.wordsPerSentence} words/sentence.` } };
};
