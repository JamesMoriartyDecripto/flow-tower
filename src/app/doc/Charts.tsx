import { NODE_TYPES } from '../../core/schema';
import type { ChapterCharts, ControlCoverage, LayerComposition, LayerMatrix } from '../../core/docCharts';
import { ConnectedFigure, LayerTableFigure, TreeFigure } from './ChartsTables';

/*
 * The drawings of a chapter's overview, as inline SVG: the text stays vector and selectable in the PDF, and
 * each figure carries `data-chart` so the document check can count the charts of a chapter. The colours are
 * written here, not in CSS, because an SVG fill set by a class would not reach the print stylesheet's
 * background rules; the type palette is the executive summary's eight steps, in the same order.
 */

export const TYPE_FILLS = ['#0a1f3f', '#1d4e89', '#2f80c0', '#3ee6ff', '#9adbe8', '#c2410c', '#f59e0b', '#94a3b8'];

const ACCENT = '#c2410c';
const MUTED = '#4b5563';
const RULE = '#e5e7eb';

/**
 * The types a tower uses, in the schema's order. The order is the one the executive summary's type bar uses,
 * so a type keeps the same colour on both pages.
 */
export function typesOf(comp: LayerComposition[]): string[] {
  const seen = new Set(comp.flatMap((c) => c.byType.map((t) => t.type)));
  return NODE_TYPES.filter((t) => seen.has(t));
}

/** The fill of a type: its palette step by position among the tower's types, as the summary's type bar gives it. */
export function fillOf(types: string[], type: string): string {
  return TYPE_FILLS[types.indexOf(type) % TYPE_FILLS.length];
}

/**
 * Layers down and across: a cell's shade is its count over the largest count, so the busiest pair is the
 * darkest. The diagonal is a layer's own edges, and it is shaded like the rest.
 */
export function MatrixFigure({ matrix, caption }: { matrix: LayerMatrix; caption: string }) {
  const n = matrix.codes.length;
  const cell = 34;
  const head = 44;
  const max = Math.max(1, ...matrix.counts.flat());
  const w = head + n * cell;
  const h = head + n * cell;
  return (
    <figure className="chart" data-chart="matrix">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={caption}>
        {matrix.codes.map((c, i) => (
          <g key={`hc-${c}`}>
            <text x={head + i * cell + cell / 2} y={head - 8} textAnchor="middle" className="mono" fontSize={10} fill={MUTED}>{c}</text>
            <text x={head - 8} y={head + i * cell + cell / 2 + 3} textAnchor="end" className="mono" fontSize={10} fill={MUTED}>{c}</text>
          </g>
        ))}
        {matrix.counts.map((row, from) => row.map((v, to) => {
          const x = head + to * cell;
          const y = head + from * cell;
          const alpha = v === 0 ? 0 : 0.12 + 0.88 * (v / max);
          return (
            <g key={`c-${from}-${to}`}>
              <rect x={x} y={y} width={cell} height={cell} fill={v === 0 ? '#f8fafc' : ACCENT} fillOpacity={alpha} stroke={RULE} />
              <text x={x + cell / 2} y={y + cell / 2 + 4} textAnchor="middle" fontSize={11} fill={alpha > 0.5 ? '#ffffff' : '#111827'}>{v || ''}</text>
            </g>
          );
        }))}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/**
 * One horizontal stacked bar per layer, its width the layer's node count over the largest layer, each
 * segment a type in the executive summary's colour. A legend under it matches the swatches to the types.
 */
export function CompositionFigure({ comp, caption }: { comp: LayerComposition[]; caption: string }) {
  const types = typesOf(comp);
  const max = Math.max(1, ...comp.map((c) => c.nodes));
  const rowH = 22;
  const labelW = 150;
  const barW = 330;
  const h = comp.length * rowH + 8;
  const w = labelW + barW + 40;
  return (
    <figure className="chart" data-chart="composition">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={caption}>
        {comp.map((c, row) => {
          const y = row * rowH + 4;
          const total = barW * (c.nodes / max);
          let x = labelW;
          return (
            <g key={c.code}>
              <text x={labelW - 8} y={y + 14} textAnchor="end" fontSize={10} fill={MUTED}>{c.code} {c.title}</text>
              {c.byType.map((t) => {
                const width = c.nodes ? total * (t.nodes / c.nodes) : 0;
                const seg = <rect key={t.type} x={x} y={y} width={width} height={16} fill={fillOf(types, t.type)}>
                  <title>{`${t.type} ${t.nodes}`}</title>
                </rect>;
                x += width;
                return seg;
              })}
              <text x={labelW + total + 6} y={y + 12} fontSize={10} fill="#111827">{c.nodes}</text>
            </g>
          );
        })}
      </svg>
      <p className="legend-line">
        {types.map((t) => (
          <span key={t} className="legend-item"><span className="swatch" style={{ background: fillOf(types, t) }} />{t}</span>
        ))}
      </p>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** Edge counts per kind, as bars; the widest kind fills the bar width. */
export function EdgesFigure({ edges, caption }: { edges: { kind: string; edges: number }[]; caption: string }) {
  const max = Math.max(1, ...edges.map((e) => e.edges));
  const rowH = 20;
  const labelW = 110;
  const barW = 320;
  const h = Math.max(1, edges.length) * rowH + 8;
  const w = labelW + barW + 40;
  return (
    <figure className="chart" data-chart="edges">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={caption}>
        {edges.map((e, row) => {
          const y = row * rowH + 4;
          const width = barW * (e.edges / max);
          return (
            <g key={e.kind}>
              <text x={labelW - 8} y={y + 12} textAnchor="end" fontSize={10} fill={MUTED}>{e.kind}</text>
              <rect x={labelW} y={y} width={width} height={14} fill={ACCENT} />
              <text x={labelW + width + 6} y={y + 11} fontSize={10} fill="#111827">{e.edges}</text>
            </g>
          );
        })}
      </svg>
      {edges.length === 0 && <p className="legend-line">No edges in this tower.</p>}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/**
 * The overview of one chapter: the matrix and the composition side by side (one page when they fit), then
 * the edges, the most-connected table, the governance bars and the runtime and model tables. A root chapter
 * ends with its sub-tower tree. Every figure is drawn even when empty, so a chapter always shows its charts.
 */
export function ChapterOverview({ id, charts, title }: { id: string; charts: ChapterCharts; title: string }) {
  const caption = (what: string) => `${what} — ${title}`;
  return (
    <section className="overview" id={`${id}-overview`}>
      <h3>Overview</h3>
      <div className="chart-pair">
        <MatrixFigure matrix={charts.matrix} caption={caption('Layer to layer: edges between layers')} />
        <CompositionFigure comp={charts.composition} caption={caption('Layer composition: nodes by type')} />
      </div>
      <EdgesFigure edges={charts.edges} caption={caption('Edges by kind')} />
      <ConnectedFigure rows={charts.connected} />
      <CoverageFigure coverage={charts.coverage} caption={caption('Governance coverage: governed nodes carrying each control')} />
      <LayerTableFigure name="runtimes" table={charts.runtimes} caption={caption('Runtimes by layer: nodes per runtime')} />
      <LayerTableFigure name="models" table={charts.models} caption={caption('Models by layer: nodes per model')} />
      {charts.tree && <TreeFigure tree={charts.tree} />}
    </section>
  );
}

/**
 * Governance coverage: one bar per control, filled to `n / total` of the governed nodes. A tower with no
 * governed node has no denominator, so its bars are empty and say so.
 */
export function CoverageFigure({ coverage, caption }: { coverage: ControlCoverage[]; caption: string }) {
  const rowH = 22;
  const labelW = 110;
  const barW = 260;
  const h = coverage.length * rowH + 8;
  const w = labelW + barW + 90;
  return (
    <figure className="chart" data-chart="coverage">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={caption}>
        {coverage.map((c, row) => {
          const y = row * rowH + 4;
          const frac = c.total ? c.n / c.total : 0;
          return (
            <g key={c.control}>
              <text x={labelW - 8} y={y + 12} textAnchor="end" fontSize={10} fill={MUTED}>{c.control}</text>
              <rect x={labelW} y={y} width={barW} height={14} fill={RULE} />
              <rect x={labelW} y={y} width={barW * frac} height={14} fill={ACCENT} />
              <text x={labelW + barW + 6} y={y + 11} fontSize={10} fill="#111827">{`${c.n} / ${c.total}`}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
