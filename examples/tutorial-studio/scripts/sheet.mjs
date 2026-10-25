// Contact sheet: one HTML page with a card per scene, so the reviewer can check
// every scene without scrubbing the video. Reads only what Argo already writes.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Every value goes through here: narration text and ids are arbitrary strings
// and must not break the markup.
function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Formats milliseconds as m:ss with zero-padded seconds. */
export function mmss(ms) {
  const total = Math.floor(ms / 1000);
  const s = String(total % 60).padStart(2, '0');
  return `${Math.floor(total / 60)}:${s}`;
}

const STYLE = `
body { margin: 0; padding: 24px; background: #111; color: #eee; font: 14px/1.4 system-ui, sans-serif; }
header { margin-bottom: 16px; }
h1 { margin: 0 0 4px; font-size: 20px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.card { background: #1d1d1d; border: 1px solid #333; border-radius: 6px; padding: 12px; }
.card img { width: 100%; display: block; border-radius: 4px; background: #000; }
.missing { height: 180px; display: flex; align-items: center; justify-content: center; color: #888; background: #000; border-radius: 4px; }
.meta { margin: 8px 0; color: #aaa; }
.text { white-space: pre-wrap; }
.none { color: #888; font-style: italic; }
`;

/** Returns a complete HTML document: a header, then one card per scene of the report. */
export function buildSheet({ demo, report, scenes, thumbs }) {
  const narration = new Map(scenes.map((s) => [s.scene, s.text]));
  const cards = report.scenes.map(({ scene, startMs, durationMs }) => {
    const media = thumbs.has(scene)
      ? `<img src="${esc(`.argo/${demo}/thumbs/${scene}.jpg`)}" alt="${esc(scene)}">`
      : '<div class="missing">no thumbnail</div>';
    const text = narration.get(scene);
    const body = text === undefined
      ? '<p class="none">no narration</p>'
      : `<p class="text">${esc(text)}</p>`;
    return `<article class="card">
<h2>${esc(scene)}</h2>
<p class="meta">start ${mmss(startMs)} · length ${(durationMs / 1000).toFixed(1)} s</p>
${media}
${body}
</article>`;
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(demo)} · contact sheet</title>
<style>${STYLE}</style>
</head>
<body>
<header>
<h1>${esc(demo)}</h1>
<p>${report.scenes.length} scenes · ${mmss(report.totalDurationMs)} total</p>
</header>
<main class="grid">
${cards.join('\n')}
</main>
</body>
</html>
`;
}

async function main([runDir, demo]) {
  if (!runDir || !demo) {
    console.error('usage: node scripts/sheet.mjs <run-dir> <demo>');
    process.exit(1);
  }
  const argoDir = join(runDir, '.argo', demo);
  const [report, scenes, files] = await Promise.all([
    readFile(join(argoDir, 'scene-report.json'), 'utf8').then(JSON.parse),
    readFile(join(runDir, 'demos', `${demo}.scenes.json`), 'utf8').then(JSON.parse),
    readdir(join(argoDir, 'thumbs')).catch(() => []),
  ]);
  const thumbs = new Set(files.filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)));
  const out = join(runDir, 'sheet.html');
  await writeFile(out, buildSheet({ demo, report, scenes, thumbs }));
  console.log(out);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main(process.argv.slice(2));
}
