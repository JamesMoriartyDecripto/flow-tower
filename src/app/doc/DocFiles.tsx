import { useEffect, useState } from 'react';
import { fetchFile } from '../api';
import type { AppendixFile } from '../../core/docFiles';
import { fileKey } from '../../core/docFiles';
import { afterPaint } from './afterPaint';

/**
 * The file's state for the appendix: its text, or the reason it is not printed. The reason is shown as
 * text in place of the content, so a reader sees what was left out and why.
 */
export type FileText = { kind: 'text'; content: string } | { kind: 'skipped'; reason: string };

/**
 * Loads one file through the same route the viewer uses, so the printed text follows the same rules: a
 * secret file, a file in the user's folder or a path outside the tower root is refused by the server, and
 * a binary or missing file answers with an error. Every refusal becomes a listed reason, never a blank.
 */
async function loadText(f: AppendixFile): Promise<FileText> {
  try {
    const payload = await fetchFile(f.tower, f.path);
    return { kind: 'text', content: payload.content };
  } catch (e) {
    return { kind: 'skipped', reason: (e as Error).message || 'not readable' };
  }
}

/**
 * The "Project files" appendix: each referenced file with the nodes that use it, then its full text in a
 * monospace block with line numbers. Loaded in order, one at a time, so a large project does not flood the
 * server; the document's ready flag waits for them (see DocView).
 */
export function FilesAppendix({ files, onReady }: { files: AppendixFile[]; onReady?: () => void }) {
  const [texts, setTexts] = useState<Record<string, FileText>>({});

  useEffect(() => {
    let live = true;
    (async () => {
      const out: Record<string, FileText> = {};
      for (const f of files) {
        out[fileKey(f)] = await loadText(f);
        if (!live) return;
      }
      if (live) {
        setTexts(out);
        await afterPaint(Promise.resolve(), requestAnimationFrame);
        if (live) onReady?.();
      }
    })();
    return () => { live = false; };
  }, [files, onReady]);

  return (
    <section className="files-appendix">
      <h2>Project files</h2>
      <p className="muted">Every file the project&apos;s towers reference, with the nodes that use it. Shown as source, not rendered.</p>
      {files.map((f) => {
        const t = texts[fileKey(f)];
        return (
          // The data attributes are what the CLI's blocking checks read from the printed page.
          <article key={fileKey(f)} className="file-entry" data-file-key={fileKey(f)} data-printed={t?.kind === 'text' || t?.kind === 'skipped' ? '1' : '0'}>
            <h3 className="mono">{f.path}</h3>
            <p className="muted">Tower: {f.tower} · Used by: {f.refs.join('; ')}</p>
            {!t && <p className="muted">Loading…</p>}
            {t?.kind === 'skipped' && <p className="file-skipped">Not printed: {t.reason}</p>}
            {t?.kind === 'text' && <FileBlock content={t.content} />}
          </article>
        );
      })}
    </section>
  );
}

/** The text as a monospace block with a line number per line. Plain text, never rendered as markup. */
function FileBlock({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <pre className="file-text mono">
      {lines.map((line, i) => (
        <span key={i} className="file-line">
          <span className="file-no">{i + 1}</span>
          {line}{'\n'}
        </span>
      ))}
    </pre>
  );
}
