import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { canonicalJson, towerDoc, type DocLevel, type TowerDoc } from '../../core/doc';
import { libraryDoc, libraryProjects } from '../../core/docLibrary';
import type { Workspace } from '../../core/types';
import { layoutTower, type TowerLayout } from '../layout';
import { docImages, type DocImages } from './DocImages';
import { snapshotOf, type Snapshot } from './snapshots';
import { SnapFigure } from './SnapFigure';
import { ChapterHead, Cover, LayerBlock, Letterhead, LinkList, LEVEL_NAMES, Toc } from './DocParts';
import { LibraryDocument } from './DocLibraryBody';
import { FindingsBlock, LegendBlock, NodeDetail } from './DocDetails';
import { FilesAppendix } from './DocFiles';
import { ControlTable, SummaryPage } from './DocSummaryPage';
import { afterPaint } from './afterPaint';
import { cssString } from './cssString';
import { loadWorkspace } from './loadWorkspace';
import { clampLevel, resolveTower } from './resolve';
import { APP_VERSION } from './version';
import './doc.css';

interface Built { doc: TowerDoc; images: DocImages; snaps: Record<string, Snapshot>; title: string; running: string; footer: string }

/**
 * The first 16 hex digits of a sha256 over the canonical JSON of the resolved tower. The same tower gives
 * the same value on every load, so two prints of one tower can be matched by this line alone.
 */
async function fingerprintOf(ws: Workspace, towerId: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(ws.towers[towerId]));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lays out every tower in the document (the cover map and each layer need its positions). */
async function layoutsOf(ws: Workspace, doc: TowerDoc): Promise<Record<string, TowerLayout>> {
  const out: Record<string, TowerLayout> = {};
  for (const c of doc.chapters) out[c.towerId] = await layoutTower(ws.towers[c.towerId]);
  return out;
}

/**
 * The images of a document. A library has one set per project: the layer ids are already prefixed by the
 * project, so the per-project drawings merge without a clash.
 */
async function imagesOf(ws: Workspace, doc: TowerDoc): Promise<DocImages> {
  if (!doc.projects) return docImages(ws, doc, await layoutsOf(ws, doc));
  const out: DocImages = { layers: {} };
  for (const p of doc.projects) {
    const img = docImages(ws, p, await layoutsOf(ws, p));
    Object.assign(out.layers, img.layers);
    out.cover ??= img.cover;
  }
  return out;
}

/**
 * The document page: the same data as the PDF, rendered as print-first HTML. It owns the ready signal,
 * because only the finished document (not the loading screen) may tell a script or the print dialog to go.
 */
export function DocView({ ws, towerId, level, print, projectNames }: {
  ws: Workspace; towerId: string; level: DocLevel; print: boolean; projectNames?: string[];
}) {
  const [built, setBuilt] = useState<Built>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    // A new build must not inherit the ready flag of the previous level, so clear it before anything else.
    const root = document.documentElement.dataset;
    delete root.docReady;
    delete root.docError;
    let live = true;
    setBuilt(undefined);
    setError(undefined);
    const generator = `Flow Tower ${APP_VERSION}`;
    // Level 4 is a library: the towers are the library's projects, and the fingerprint is the one of the root.
    const doc = level === 4
      ? libraryDoc(ws, libraryProjects(ws, projectNames), { generator })
      : towerDoc(ws, towerId, level, { generator });
    const fp = level === 4 ? ws.projects.join('|') : towerId;
    // The 3D figures are one at a time (snapshotOf queues them), and they are part of the ready state.
    // Level 4 shows only each project's root tower, so it captures one snapshot per project, not every chapter.
    const snapsOf = async (d: TowerDoc): Promise<Record<string, Snapshot>> => {
      const out: Record<string, Snapshot> = {};
      const ids = level === 4 ? (d.projects ?? []).map((p) => p.towerId) : d.chapters.map((c) => c.towerId);
      for (const id of ids) out[id] = await snapshotOf(id);
      return out;
    };
    Promise.all([imagesOf(ws, doc), fingerprintOf(ws, fp), snapsOf(doc)])
      .then(([images, fingerprint, snaps]) => live && setBuilt({
        doc: { ...doc, control: { ...doc.control, fingerprint } },
        images,
        snaps,
        title: level === 4 ? `${doc.title} — ${LEVEL_NAMES[4]}` : `${ws.towers[towerId].name} — ${LEVEL_NAMES[level]}`,
        // The running header is upper case, as the letterhead was; the footer names the classification,
        // the build and the tower, as the classification is the first thing a reader of a print looks for.
        running: level === 4
          ? `TOWER LIBRARY · ${doc.projects?.length ?? 0} PROJECTS`
          : `${doc.title} · ${LEVEL_NAMES[level]}`.toUpperCase(),
        footer: `${doc.control.classification} · Generated by Flow Tower ${APP_VERSION} · ${level === 4 ? 'library' : towerId}`,
      }))
      .catch((e: Error) => {
        if (!live) return;
        root.docError = e.message;
        setError(e.message);
      });
    return () => { live = false; };
  }, [ws, towerId, level, projectNames]);

  if (error) return <Message text={`Could not build the document: ${error}`} />;
  if (!built) return <Message text="Building the document…" />;
  return <Document built={built} level={level} print={print} />;
}

function Document({ built, level, print }: { built: Built; level: DocLevel; print: boolean }) {
  const { doc, images, snaps } = built;
  // The cover names the version (from package.json at build time) and the tower id: no date, so the same tower prints the same file.

  // The appendix's file texts load after the first paint; the document is ready only once they are in place.
  const [filesReady, setFilesReady] = useState(!doc.files);
  const onFilesReady = useCallback(() => setFilesReady(true), []);

  useEffect(() => {
    if (!filesReady) return;
    // Runs after this document is committed to the DOM; the fonts and two frames let it paint before the flag.
    let live = true;
    void afterPaint(document.fonts.ready, requestAnimationFrame).then(() => {
      if (!live) return;
      document.title = built.title;
      // The @page margin boxes read these: the running header (tower and level) and the footer. They are set
      // as quoted CSS strings, so a `"` or `\` in the tower text cannot break the rule.
      const style = document.documentElement.style;
      style.setProperty('--doc-running', cssString(built.running));
      style.setProperty('--doc-footer', cssString(built.footer));
      document.documentElement.dataset.docReady = '1';
      if (print) window.print();
    });
    return () => { live = false; };
  }, [built, print, filesReady]);

  // The library has its own body; the ready signal above still covers it, since the hook runs first.
  if (level === 4) return <LibraryDocument doc={doc} images={images} snaps={snaps} />;

  return (
    <main className={`doc level-${level}`}>
      <Letterhead title={doc.title} level={level} />
      <Cover doc={doc} map={images.cover} version={APP_VERSION} />
      <div className="control-page"><ControlTable control={doc.control} /></div>
      {level >= 2 && <Toc entries={doc.toc} />}
      {level >= 2 && doc.summary && <SummaryPage summary={doc.summary} />}
      {doc.chapters.map((c) => (
        <article key={c.id} className="chapter">
          <ChapterHead chapter={c} />
          <SnapFigure towerTitle={c.title} layers={c.layers.length} snap={snaps[c.towerId]} />
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
      {doc.findings && <FindingsBlock findings={doc.findings} severities={doc.severities ?? []} />}
      {doc.files && <FilesAppendix files={doc.files} onReady={onFilesReady} />}
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
 * Entry point of the document page (called by main.tsx). Reads the page parameters and mounts the loader;
 * the ready signal itself comes from the DocView once the document is painted.
 */
export function mountDoc(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  const level = clampLevel(q.get('level'));
  const projects = parseProjects(q.get('projects'));
  createRoot(root).render(
    <Loader doc={q.get('doc') ?? ''} level={level} print={q.get('print') === '1'} projects={projects} />,
  );
}

function Loader({ doc, level, print, projects }: { doc: string; level: DocLevel; print: boolean; projects?: string[] }) {
  const [ws, setWs] = useState<Workspace>();
  const [failed, setFailed] = useState<string>();
  const [towerId, setTowerId] = useState<string>();

  useEffect(() => {
    loadWorkspace().then(setWs).catch((e: Error) => setFailed(e.message));
  }, []);

  useEffect(() => {
    if (!ws) return;
    // The library is not a tower: its `doc` is the word `library`, so it resolves to the first project, unused.
    setTowerId(level === 4 ? ws.projects[0] : resolveTower(ws, doc));
  }, [ws, doc, level]);

  if (failed) return <Message text={`Could not load the workspace: ${failed}`} />;
  if (!ws) return <Message text="Loading…" />;
  if (!towerId) return <Message text={`No tower matches “${doc}”.`} />;
  return <DocView ws={ws} towerId={towerId} level={level} print={print} projectNames={projects} />;
}

/** `?projects=a,b` is a comma list of project names; an empty or absent list means every project. */
function parseProjects(raw: string | null): string[] | undefined {
  const names = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return names.length ? names : undefined;
}
