import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';
import { fetchFile } from '../api';
import { useStore } from '../store';

const LANGS: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', md: 'markdown', yaml: 'yaml', yml: 'yaml', py: 'python', sh: 'bash', toml: 'toml',
  rs: 'rust', go: 'go', sql: 'sql', html: 'html', css: 'css', sol: 'solidity',
};

type View = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; html: string; lines: number; lang: string };

/** Modal popup showing one of the node's files with syntax highlighting. */
export function FileViewer() {
  const file = useStore((s) => s.file);
  const openFile = useStore((s) => s.openFile);
  const [view, setView] = useState<View>({ state: 'loading' });
  const path = file?.files[file.index];

  useEffect(() => {
    if (!file || !path) return;
    let alive = true;
    setView({ state: 'loading' });
    fetchFile(file.tower, path)
      .then(async ({ content, ext }) => {
        const lang = LANGS[ext] ?? 'text';
        // shiki escapes the source, so the generated HTML is safe to inject
        const html = await codeToHtml(content, { lang, theme: 'vitesse-dark' }).catch(() =>
          codeToHtml(content, { lang: 'text', theme: 'vitesse-dark' }));
        if (alive) setView({ state: 'ok', html, lines: content.split('\n').length, lang });
      })
      .catch((e: Error) => alive && setView({ state: 'error', message: e.message }));
    return () => { alive = false; };
  }, [file, path]);

  if (!file || !path) return null;
  return (
    <div className="overlay" onClick={() => openFile(undefined)}>
      <div className="panel viewer" onClick={(e) => e.stopPropagation()}>
        <button className="close" title="Close the file viewer (Esc)" style={{ position: 'absolute', top: 10, right: 20, fontSize: 18, zIndex: 1 }} onClick={() => openFile(undefined)}>✕</button>
        <nav className="files">
          {file.files.map((f, i) => (
            <button key={f} className={i === file.index ? 'on' : ''} onClick={() => openFile({ ...file, index: i })} title={`Show ${f}`}>
              {f.split('/').pop()}
            </button>
          ))}
        </nav>
        <div className="code">
          {view.state === 'loading' && <p className="mono dim" style={{ padding: 20 }}>DECRYPTING STREAM…</p>}
          {view.state === 'error' && <p className="mono" style={{ padding: 20, color: 'var(--error)' }}>{view.message}</p>}
          {view.state === 'ok' && <div dangerouslySetInnerHTML={{ __html: view.html }} />}
        </div>
        <footer>
          <span>{path}</span>
          <span>{view.state === 'ok' ? `${view.lines} lines · ${view.lang}` : ''} · ESC to close</span>
        </footer>
      </div>
    </div>
  );
}
