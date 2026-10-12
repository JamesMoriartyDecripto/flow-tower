import type { TowerDoc } from '../../core/doc';
import type { DocImages } from './DocImages';
import { ChapterHead, Cover, LayerBlock, LinkList, Toc } from './DocParts';
import { LibraryCover } from './DocLibrary';
import { ControlTable, SummaryPage } from './DocSummaryPage';
import { SnapFigure } from './SnapFigure';
import type { Snapshot } from './snapshots';
import { APP_VERSION } from './version';

/**
 * The body of a level-4 library: its cover, control table and contents, then each project as a level-2
 * document (its own cover, control table, summary and chapters). Every anchor is project-prefixed, so one
 * page holds them all. The library's control table comes first, so the totals are what the checks read.
 */
export function LibraryDocument({ doc, images, snaps }: { doc: TowerDoc; images: DocImages; snaps: Record<string, Snapshot> }) {
  return (
    <main className="doc level-4">
      <LibraryCover doc={doc} version={APP_VERSION} />
      <div className="control-page"><ControlTable control={doc.control} /></div>
      <Toc entries={doc.toc} />
      {(doc.projects ?? []).map((p) => (
        <section key={p.towerId} className="library-project">
          <Cover doc={p} map={images.cover} version={APP_VERSION} />
          <SnapFigure towerTitle={p.title} layers={p.control.layers} snap={snaps[p.towerId]} />
          <div className="control-page"><ControlTable control={p.control} /></div>
          {p.summary && <SummaryPage summary={p.summary} />}
          {p.chapters.map((c) => (
            <article key={c.id} className="chapter">
              <ChapterHead chapter={c} />
              {c.layers.map((l) => (
                <div key={l.id} className="layer-block">
                  <LayerBlock section={l} level={2} markup={images.layers[l.id]} />
                </div>
              ))}
              {c.links.length > 0 && <LinkList links={c.links} />}
            </article>
          ))}
        </section>
      ))}
    </main>
  );
}
