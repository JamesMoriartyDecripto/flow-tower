// Shortlist filters per role: which OpenRouter output modality to query, and what a model must support.
// Mirrors the role ids of src/core/roles.ts; tests/models-roles.test.ts keeps them in step.
// Needs are either a supported parameter (tools, structured_outputs) or input:<modality> (input:image).
// No dependencies: this file runs as a plain Node script.

const text = (needs) => ({ modality: 'text', needs });

export const ROLE_FILTERS = {
  coding: text(['tools']),
  review: text(['structured_outputs']),
  orchestrator: text(['tools']),
  router: text(['structured_outputs']),
  research: text(['tools']),
  writing: text([]),
  data: text(['structured_outputs']),
  guard: text(['structured_outputs']),
  general: text([]),
  decision: { modality: 'decisions', needs: [] },
  rerank: { modality: 'rerank', needs: [] },
  embeddings: { modality: 'embeddings', needs: [] },
  'image-gen': { modality: 'image', needs: [] },
  'video-gen': { modality: 'video', needs: [] },
  'voice-tts': { modality: 'speech', needs: [] },
  'voice-stt': { modality: 'transcription', needs: [] },
  'realtime-voice': { modality: 'audio', needs: ['input:audio'] },
  vision: { modality: 'text', needs: ['input:image'] },
};

/** True when the model record has every need: a supported parameter, or an input modality. */
export function meets(model, needs) {
  const params = model.supported_parameters ?? [];
  const inputs = model.architecture?.input_modalities ?? [];
  return needs.every((need) =>
    need.startsWith('input:') ? inputs.includes(need.slice('input:'.length)) : params.includes(need),
  );
}

/** Provider part of a model id: "~perplexity/pplx-decider-latest" → "perplexity". */
export function familyOf(id) {
  return id.replace(/^~/, '').split('/')[0];
}

/**
 * Drops ids that are not a model of their own: ":batch" is the same model priced for batch jobs,
 * and "~" marks an alias that points at another model. Listing them would count one model twice.
 */
export function dropVariants(models) {
  return models.filter((m) => !m.id.endsWith(':batch') && !m.id.startsWith('~'));
}

/** Keeps the first n models of each family, in the order given (so a server sort is kept). */
export function capPerFamily(models, n) {
  const seen = new Map();
  return models.filter((m) => {
    const fam = familyOf(m.id);
    const count = seen.get(fam) ?? 0;
    if (count >= n) return false;
    seen.set(fam, count + 1);
    return true;
  });
}

/**
 * The measured pick rows of catalogue.md for one role id. A row matches when its first cell is the id, or the id
 * followed by a space or " (": "voice-stt (live)" and "review (security: …)" match, "data" never matches "database".
 * Columns: Role | Pick | Correct | $/run | s | Alternatives | Avoid here.
 */
export function cataloguePicks(markdown, roleId) {
  const picks = [];
  for (const line of String(markdown).split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6) continue;
    const label = cells[0];
    const matches = label === roleId || label.startsWith(`${roleId} `) || label.startsWith(`${roleId} (`);
    if (matches) picks.push({ label, pick: cells[1], alternatives: cells[5] });
  }
  return picks;
}
