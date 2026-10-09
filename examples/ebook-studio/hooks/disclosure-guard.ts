// Disclosure guard: derives each store's AI answers from the provenance ledger.
// Runs before the publisher's go and on every republish. Deterministic; no model calls.
// Rules mirror checklists/kdp-ai-disclosure.md; re-check the store pages when they change.
import { readFileSync } from 'node:fs';

type Origin = 'author' | 'ai-draft' | 'ai-draft-rewritten';
interface Section { id: string; origin: Origin; share: number }
interface Image { id: string; origin: 'human' | 'ai' }
interface Chapter { chapter: number; sections: Section[]; images?: Image[] }
interface Ledger { chapters: Chapter[]; book_totals: { ai_generated_images: number; ai_translation: boolean } }

export interface Answers {
  kdp: { text: boolean; images: boolean; translations: boolean };
  apple: { aiGeneratedByRole: boolean; descriptionLine: boolean };
  d2d: { ok: boolean; reason: string };
  humanAuthoredMark: boolean;
  usRegistrationDisclaimer: string[];
}

export function decide(ledger: Ledger): Answers {
  const sections = ledger.chapters.flatMap((c) => c.sections);
  // KDP counts AI-drafted text as AI-generated "even if you applied substantial edits afterwards".
  const aiText = sections.some((s) => s.origin !== 'author');
  const aiImages = ledger.book_totals.ai_generated_images > 0
    || ledger.chapters.some((c) => (c.images ?? []).some((i) => i.origin === 'ai'));
  // D2D refuses text generated entirely by AI without extensive human editing.
  const lightlyEdited = sections.filter((s) => s.origin === 'ai-draft');
  const lightShare = lightlyEdited.length / Math.max(sections.length, 1);
  return {
    kdp: { text: aiText, images: aiImages, translations: ledger.book_totals.ai_translation },
    // Apple 1.13: AI-generated content needs the role and a description line. When in doubt, disclose.
    apple: { aiGeneratedByRole: aiText || aiImages, descriptionLine: aiText || aiImages },
    d2d: lightShare < 0.2
      ? { ok: true, reason: `${lightlyEdited.length} lightly edited AI sections of ${sections.length}` }
      : { ok: false, reason: 'too much AI text without extensive human editing' },
    // Authors Guild mark allows only de minimis AI text.
    humanAuthoredMark: !aiText,
    // US Copyright Office: disclaim AI-generated material that is more than de minimis.
    usRegistrationDisclaimer: lightlyEdited.map((s) => s.id),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ledger = JSON.parse(readFileSync(process.argv[2] ?? 'memory/provenance.json', 'utf8')) as Ledger;
  const answers = decide(ledger);
  console.log(JSON.stringify(answers, null, 2));
  // Block the publish step if D2D's rule would reject the book; the editor must act first.
  if (!answers.d2d.ok) process.exit(2);
}
