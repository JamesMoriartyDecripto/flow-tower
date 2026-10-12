import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { towerDoc, type TowerDoc } from '../../core/doc';
import type { Workspace } from '../../core/types';
import { layoutTower, type TowerLayout } from '../layout';
import { docImages, type DocImages } from './DocImages';
import { ChapterHead, Cover, LayerBlock, LinkList, LEVEL_NAMES, Toc } from './DocParts';
import { IssuesBlock, LegendBlock, NodeDetail, SourcesBlock } from './DocDetails';
import { loadWorkspace } from './loadWorkspace';
import { clampLevel, resolveTower } from './resolve';
import './doc.css';

interface Built { doc: TowerDoc; images: DocImages; title: string }

/** Lays out every tower in the document (the cover map and each layer need its positions). */
async function layoutsOf(ws: Workspace, doc: TowerDoc): Promise<Record<string, TowerLayout>> {
  const out: Record<string, TowerLayout> = {};
  for (const c of doc.chapters) out[c.towerId] = await layoutTower(ws.towers[c.towerId]);
  return out;
}

/** The document page: the same data as the PDF, rendered as print-first HTML. */
export function DocView({ ws, towerId, level }: { ws: Workspace; towerId: string; level: 1 | 2 | 3 }) {
  const [built, setBuilt] = useState<Built>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    const doc = towerDoc(ws, towerId, level);
    layoutsOf(ws, doc)
      .then((layouts) => docImages(ws, doc, layouts))
      .then((images) => live && setBuilt({ doc, images, title: doc.title }))
      .catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [ws, towerId, level]);

  if (error) return <Message text={`Could not build the document: ${error}`} />;
  if (!built) return <Message text="Building the document…" />;
  return <Document built={built} level={level} />;
}

function Document({ built, level }: { built: Built; level: 1 | 2 | 3 }) {
  const { doc, images } = built;
  return (
    <main className={`doc level-${level}`}>
      <Cover doc={doc} map={images.cover} />
      {level >= 2 && <Toc entries={doc.toc} />}
      {doc.chapters.map((c) => (
        <article key={c.id} className="chapter">
          <ChapterHead chapter={c} />
          {c.layers.map((l) => (
            <div key={l.id} className="layer-block">
              <LayerBlock section={l} level={level} markup={images.layers[l.id]} />
              {l.details && (
                <div className="details">
                  {l.details.map((n) => <NodeDetail key={n.id} node={n} />)}
                </div>
              )}
            </div>
          ))}
          {c.links.length > 0 && <LinkList links={c.links} />}
        </article>
      ))}
      {doc.legend && <LegendBlock legend={doc.legend} />}
      {doc.issues && <IssuesBlock issues={doc.issues} />}
      {doc.sources && <SourcesBlock sources={doc.sources} />}
      <footer className="doc-foot">{LEVEL_NAMES[level]} · Flow Tower</footer>
    </main>
  );
}

function Message({ text }: { text: string }) {
  return (
    <main className="doc doc-message">
      <p>{text}</p>
      <p><a href={appHref()}>Back to Flow Tower</a></p>
    </main>
  );
}

/** The app without the document parameters. */
const appHref = () => {
  const q = new URLSearchParams(location.search);
  for (const k of ['doc', 'level', 'print']) q.delete(k);
  const s = q.toString();
  return `${location.pathname}${s ? `?${s}` : ''}`;
};

/**
 * Entry point of the document page (called by main.tsx). Sets the PDF file name and the ready flag only
 * once the workspace is rendered and the fonts are in, so a print or a screenshot never catches a half page.
 */
export function mountDoc(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  const level = clampLevel(q.get('level'));
  createRoot(root).render(<Loader doc={q.get('doc') ?? ''} level={level} print={q.get('print') === '1'} />);
}

function Loader({ doc, level, print }: { doc: string; level: 1 | 2 | 3; print: boolean }) {
  const [ws, setWs] = useState<Workspace>();
  const [failed, setFailed] = useState<string>();
  const [towerId, setTowerId] = useState<string>();

  useEffect(() => {
    loadWorkspace().then(setWs).catch((e: Error) => setFailed(e.message));
  }, []);

  useEffect(() => {
    if (!ws) return;
    const id = resolveTower(ws, doc);
    setTowerId(id);
    if (!id) return;
    const name = ws.towers[id].name;
    // The browser suggests the PDF name from the title; the flag tells a script the page is complete.
    void document.fonts.ready.then(() => {
      document.title = `${name} — ${LEVEL_NAMES[level]}`;
      document.documentElement.dataset.docReady = '1';
      if (print) window.print();
    });
  }, [ws, doc, level, print]);

  if (failed) return <Message text={`Could not load the workspace: ${failed}`} />;
  if (!ws) return <Message text="Loading…" />;
  if (!towerId) return <Message text={`No tower matches “${doc}”.`} />;
  return <DocView ws={ws} towerId={towerId} level={level} />;
}
