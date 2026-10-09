// Prices a locked shot list before any paid generation: shots x rate x expected takes,
// plus voice, music, avatar and render. Used by the producer (direction + script sign-off)
// and by the dispatcher to stop new jobs when the budget is spent.
// Usage: npx tsx pipeline/estimate-cost.ts content/first-ultra-shots.json 1200
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

type Shot = { id: string; kind: string; duration_s: number; aspect?: string[]; resolution?: string; tier?: string };
const rates = parse(readFileSync('config/model-rates.yaml', 'utf8'));

const VEO_MODEL: Record<string, string> = {
  standard: 'veo-3.1-generate-preview',
  fast: 'veo-3.1-fast-generate-preview',
  lite: 'veo-3.1-lite-generate-preview',
};
// Not published on the pages we read; see model-rates.yaml comments.
const AVATAR_PER_MIN = 3;
const KEYFRAME_USD = rates.image['gemini-3.1-flash-image']['1K'];

export function shotCost(s: Shot): number {
  const renders = s.aspect?.length ?? 1; // hero shots are generated once per aspect ratio
  if (s.kind === 'graphic') return 0;
  if (s.kind === 'avatar') return (s.duration_s / 60) * AVATAR_PER_MIN * renders;
  const tier = s.tier ?? 'fast';
  const perSecond = rates.video[VEO_MODEL[tier]][s.resolution ?? '720p'];
  const takes = rates.expected_takes[tier];
  const keyframes = s.kind === 'i2v' ? takes * KEYFRAME_USD : 0;
  return s.duration_s * perSecond * takes * renders + keyframes;
}

export function estimate(shots: Shot[], voChars: number, musicMin: number, renders: number) {
  const lines = shots.map((s) => ({ id: s.id, usd: +shotCost(s).toFixed(2) }));
  const video = lines.reduce((a, l) => a + l.usd, 0);
  const tts = rates.audio['elevenlabs/tts-v4'];
  const today = new Date().toISOString().slice(0, 10);
  const perK = today <= tts.promo_until ? tts.promo_per_1k_chars : tts.per_1k_chars;
  const voice = (voChars / 1000) * perK * 2; // budget for one full retake of every line
  const music = musicMin * rates.audio['elevenlabs/music'].per_minute * 3; // three candidates
  const render = renders * rates.render['remotion/automators'].per_render;
  const total = video + voice + music + render;
  return { lines, video, voice, music, render, total: +total.toFixed(2) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, budgetArg] = process.argv.slice(2);
  const { shots } = JSON.parse(readFileSync(file, 'utf8'));
  // VO length and music minutes come from the script; constants here for the sample.
  const result = estimate(shots, 7400, 9, 12);
  const budget = Number(budgetArg ?? Infinity);
  console.table(result.lines);
  console.log({ ...result, lines: undefined, budget, fits: result.total <= budget * 0.8 });
  process.exitCode = result.total <= budget * 0.8 ? 0 : 2; // 2 = over 80 % of budget, ask producer
}
