import { useEffect, useRef, useState } from 'react';
import { codeToHtml } from 'shiki';
import { fetchFile } from '../api';
import { usePrefs } from '../settings';
import { useStore } from '../store';
import { MarkdownView } from './MarkdownView';
import { useDialogFocus } from './dialog';

const LANGS: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', md: 'markdown', yaml: 'yaml', yml: 'yaml', py: 'python', sh: 'bash', toml: 'toml',
  rs: 'rust', go: 'go', sql: 'sql', html: 'html', css: 'css', sol: 'solidity',
};

type View = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; html: string; lines: number; lang: string; source: string; markdown: boolean };

/** Modal popup showing one of the node's files with syntax highlighting. */
export function FileViewer() {
  const file = useStore((s) => s.file);
  const openFile = useStore((s) => s.openFile);
  const [view, setView] = useState<View>({ state: 'loading' });
  const path = file?.files[file.index];
  const wrap = usePrefs((s) => s.viewerWrap);
  const markdownSource = usePrefs((s) => s.markdownSource);

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
        if (alive) setView({ state: 'ok', html, lines: content.split('\n').length, lang, source: content, markdown: ext === 'md' || ext === 'markdown' });
      })
      .catch((e: Error) => alive && setView({ state: 'error', message: e.message }));
    return () => { alive = false; };
  }, [file, path]);

  // Keyboard: the viewer takes the focus when it opens and gives it back when it closes.
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel, !!file, '.files button.on');

  if (!file || !path) return null;
  return (
    <div className="overlay" onClick={() => openFile(undefined)}>
      <div className="panel viewer" ref={panel} role="dialog" aria-modal="true" aria-label={`File ${path}`} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button className="close" title="Close the file viewer (Esc)" style={{ position: 'absolute', top: 10, right: 20, fontSize: 18, zIndex: 1 }} onClick={() => openFile(undefined)}>✕</button>
        <nav className="files">
          {file.files.map((f, i) => (
            <button key={f} className={i === file.index ? 'on' : ''} onClick={() => openFile({ ...file, index: i })} title={`Show ${f}`}>
              {f.split('/').pop()}
            </button>
          ))}
        </nav>
        <div className={`code ${wrap ? 'wrap' : ''}`}>
          {view.state === 'loading' && <p className="mono dim" style={{ padding: 20 }}>DECRYPTING STREAM…</p>}
          {view.state === 'error' && <p className="mono" style={{ padding: 20, color: 'var(--error)' }}>{view.message}</p>}
          {view.state === 'ok' && (view.markdown && !markdownSource
            ? <MarkdownView source={view.source} path={path} files={file.files} onOpen={(f) => openFile({ ...file, index: file.files.indexOf(f) })} />
            : <div dangerouslySetInnerHTML={{ __html: view.html }} />)}
        </div>
        <footer>
          <span className="viewer-path">{path}</span>
          <span className="viewer-tools">
            {view.state === 'ok' && view.markdown && (
              <span className="seg" title="Markdown: formatted or source (V)">
                <button className={markdownSource ? '' : 'on'} onClick={() => usePrefs.getState().set({ markdownSource: false })}>Formatted</button>
                <button className={markdownSource ? 'on' : ''} onClick={() => usePrefs.getState().set({ markdownSource: true })}>Source</button>
              </span>
            )}
            <button className={`chip clickable ${wrap ? 'on' : ''}`} onClick={() => usePrefs.getState().set({ viewerWrap: !wrap })} title="Wrap long lines (W)">⏎ Wrap</button>
            <span>{view.state === 'ok' ? `${view.lines} lines · ${view.lang}` : ''} · ESC to close</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
