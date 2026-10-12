import type { ControlBlock, DocSummary } from '../../core/doc';
import { Chip } from './DocChips';
import { FieldGrid } from './DocText';

/**
 * The document control table: a framed two-column table of who made the file and what it covers. Every
 * value is a fact of the tower or a fixed label; there is no date, so two prints of one tower match.
 */
export function ControlTable({ control }: { control: ControlBlock }) {
  const rows: [string, string, boolean?][] = [
    ['Tower', control.tower],
    ['Source', control.source, true],
    ['Fingerprint', control.fingerprint ?? '', true],
    ['Generator', control.generator],
    ['Level', control.level],
    ['Classification', control.classification],
    ['Layers', String(control.layers)],
    ['Nodes', String(control.nodes)],
    ['Sub-towers', String(control.subTowers)],
  ];
  return (
    <section className="control">
      <h2>Document control</h2>
      <table className="frame">
        <tbody>
          {rows.map(([k, v, mono]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td className={mono ? 'mono' : undefined} data-field={k === 'Fingerprint' ? 'fingerprint' : undefined}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const STATUS_CHIP: Record<string, string> = {
  active: 'chip-green', experimental: 'chip-amber', planned: 'chip-blue', deprecated: 'chip-grey',
};

/**
 * The executive summary: counts only, on one page. Each bar is a horizontal stack of the nodes by type or
 * by status; a segment's width is its share of the total, so the bar reads without a legend of numbers.
 */
export function SummaryPage({ summary }: { summary: DocSummary }) {
  const tiles: [number, string][] = [
    [summary.layers, 'layers'],
    [summary.nodes, 'nodes'],
    [summary.agents, 'agents'],
    [summary.models.length, 'models'],
    [summary.humans, 'human checkpoints'],
    [summary.subTowers, 'sub-towers'],
  ];
  const v = summary.validation;
  return (
    <section className="exec-summary">
      <h2>Executive summary</h2>
      <div className="tiles">
        {tiles.map(([n, label]) => (
          <div key={label} className="tile"><strong>{n}</strong><span>{label}</span></div>
        ))}
        <div className={`tile verdict verdict-${v.verdict.toLowerCase()}`}>
          <strong>{v.verdict === 'PASS' ? 'PASS' : `${v.verdict} ${v.count}`}</strong><span>validation</span>
        </div>
      </div>
      <p className="legend-line">
        Validation: {v.errors} error{v.errors === 1 ? '' : 's'} · {v.warnings} warning{v.warnings === 1 ? '' : 's'} · {v.info} info
      </p>
      <Stack title="Nodes by type" kind="type" parts={summary.byType.map((t, i) => ({ label: t.type, n: t.nodes, cls: `seg-type t${i % 8}` }))} />
      <Stack
        title="Nodes by status"
        kind="status"
        parts={summary.byStatus.map((s) => ({ label: s.status, n: s.nodes, cls: `seg-${STATUS_CHIP[s.status]}` }))}
      />
      {summary.models.length > 0 && (
        <table className="models">
          <caption>Models in use</caption>
          <thead><tr><th>Model</th><th className="num">Nodes</th></tr></thead>
          <tbody>
            {summary.models.map((m) => <tr key={m.model}><td className="mono">{m.model}</td><td className="num">{m.nodes}</td></tr>)}
          </tbody>
        </table>
      )}
      {summary.budget.length > 0 && (
        <>
          <h5>Run budget and limits</h5>
          <FieldGrid fields={summary.budget} />
        </>
      )}
    </section>
  );
}

/**
 * A single horizontal bar, one segment per item. Counts live in the legend under it, never inside the segments: a
 * narrow segment cannot hold its number, and numbers piled up there read as noise. Each legend item carries a swatch
 * of its segment's colour, so the two are matched without labels on the bar.
 */
function Stack({ title, kind, parts }: { title: string; kind: 'type' | 'status'; parts: { label: string; n: number; cls: string }[] }) {
  if (parts.reduce((s, p) => s + p.n, 0) === 0) return null;
  return (
    <div className="stack">
      <h5>{title}</h5>
      <div className="bar" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
        {parts.map((p) => (
          <span key={p.label} className={`seg ${p.cls}`} style={{ flexGrow: p.n }} title={`${p.label} ${p.n}`} />
        ))}
      </div>
      <p className="legend-line">
        {parts.map((p) => (
          <span key={p.label} className="legend-item"><span className={`swatch ${p.cls}`} /><Chip kind={kind} value={p.label} /> {p.n}</span>
        ))}
      </p>
    </div>
  );
}
