import type { Chapter, LayerSection, NodeRow, TocEntry, TowerDoc } from '../../core/doc';
import type { LinkRow } from '../../core/doc';

export const LEVEL_NAMES: Record<1 | 2 | 3, string> = { 1: 'Images', 2: 'Overview', 3: 'Full documentation' };

/** An SVG drawing inline, not as an <img>: its text stays vector and selectable in the PDF. */
export function Svg({ markup, className }: { markup: string; className: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: markup }} />;
}

export const layerNumber = (index: number) => `L${String(index + 1).padStart(2, '0')}`;

export function Cover({ doc, map }: { doc: TowerDoc; map?: string }) {
  const c = doc.generated.counts;
  return (
    <section className="cover">
      <p className="kicker">Flow Tower · {LEVEL_NAMES[doc.level]}</p>
      <h1>{doc.title}</h1>
      {doc.description && <p className="lead">{doc.description}</p>}
      {doc.generated.tags.length > 0 && (
        <p className="tags">{doc.generated.tags.map((t) => <span key={t} className="tag">{t}</span>)}</p>
      )}
      <p className="counts">
        {c.layers} layers · {c.nodes} nodes · {c.agents} agents{c.subTowers ? ` · ${c.subTowers} sub-towers` : ''}
      </p>
      {map && <Svg className="image map" markup={map} />}
    </section>
  );
}

export function Toc({ entries }: { entries: TocEntry[] }) {
  return (
    <nav className="toc" aria-label="Contents">
      <h2>Contents</h2>
      <ol>
        {entries.map((e) => (
          <li key={e.id} className={`depth-${e.depth}`}><a href={`#${e.id}`}>{e.label}</a></li>
        ))}
      </ol>
    </nav>
  );
}

function NodeTable({ rows }: { rows: NodeRow[] }) {
  return (
    <table className="nodes">
      <thead>
        <tr><th>Node</th><th>Type</th><th>Runtime</th><th>Status</th><th>Summary</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td><a href={`#${r.id}`}>{r.label}</a></td>
            <td>{r.type}</td>
            <td>{r.runtime ?? '—'}</td>
            <td>{r.status}</td>
            <td>{r.description ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One layer: its title, description, drawing, then (levels 2-3) the node table. Details come after. */
export function LayerBlock({ section, level, markup }: { section: LayerSection; level: 1 | 2 | 3; markup?: string }) {
  return (
    <section className="layer">
      <h3 id={section.id}>{layerNumber(section.index)} {section.title}</h3>
      {section.description && <p className="lead">{section.description}</p>}
      {markup && <Svg className="image layer-image" markup={markup} />}
      {level >= 2 && section.nodes.length > 0 && <NodeTable rows={section.nodes} />}
    </section>
  );
}

export function LinkList({ links }: { links: LinkRow[] }) {
  return (
    <section className="links">
      <h3>Links</h3>
      <ul>
        {links.map((l, i) => (
          <li key={i}>
            <a href={`#${l.from.anchor}`}>{l.from.label}</a> → <a href={`#${l.to.anchor}`}>{l.to.label}</a>
            {' '}<span className="muted">{l.label ?? l.kind} ({l.kind})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ChapterHead({ chapter }: { chapter: Chapter }) {
  return (
    <header className="chapter-head">
      <h2 id={chapter.id}>{chapter.title}</h2>
      {chapter.description && <p className="lead">{chapter.description}</p>}
      {chapter.budget && <p className="muted">{chapter.budget.join(' · ')}</p>}
    </header>
  );
}
