import type { ReactNode } from 'react';
import { NODE_TYPES } from '../../core/schema';
import { pageBFlows, isWideTable, type ChapterCharts, type ControlCoverage, type LayerComposition, type LayerMatrix, type LayerTable } from '../../core/docCharts';
import { ConnectedFigure, LayerTableFigure, TreeFigure } from './ChartsTables';
import { ChartCard } from './ChartCard';

/*
 * The drawings of a chapter's overview. Every figure sits in a card (ChartCard) on one 12-column grid, so the
 * page reads as placed on purpose. The bar charts are HTML rows that share the metrics in doc.css (label column,
 * bar height, gap, value column), so their bars start at the same x in every card. The matrix is an inline SVG
 * with a square viewBox, so its cells stay square at the card's width. Text stays vector and selectable in the
 * PDF, and each card carries `data-chart`, which the document check counts. The colours are written here, not
 * in CSS, because a fill set by a class would not reach the print stylesheet's background rules.
 */

export const TYPE_FILLS = ['#0a1f3f', '#1d4e89', '#2f80c0', '#3ee6ff', '#9adbe8', '#c2410c', '#f59e0b', '#94a3b8'];

const ACCENT = '#c2410c';
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
 * darkest. The diagonal is a layer's own edges, and it is shaded like the rest. The viewBox is square, so the
 * cells are square at whatever width the card gives the drawing.
 */
export function MatrixFigure({ matrix, note }: { matrix: LayerMatrix; note: string }) {
  const n = matrix.codes.length;
  const cell = 34;
  const head = 44;
  const max = Math.max(1, ...matrix.counts.flat());
  const size = head + n * cell;
  return (
    <ChartCard name="matrix" title="Layer to layer" note={note} span={6}>
      <svg className="matrix" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Layer to layer: ${note}`}>
        {matrix.codes.map((c, i) => (
          <g key={`hc-${c}`}>
            <text x={head + i * cell + cell / 2} y={head - 8} textAnchor="middle" className="matrix-head" fill={ACCENT}>{c}</text>
            <text x={head - 8} y={head + i * cell + cell / 2 + 4} textAnchor="end" className="matrix-head" fill={ACCENT}>{c}</text>
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
    </ChartCard>
  );
}

/** One row of a bar chart: its label, the bar's length as a share of the track, its value, and its segments. */
export interface BarRow {
  key: string;
  label: string;
  /** The bar's length as a share of the track, from 0 to 1. */
  fraction: number;
  value: string;
  /** The parts of the bar, each with a weight; a bar with none is one accent segment. */
  segments?: { color: string; weight: number; title: string }[];
}

/**
 * The shared bar chart: the label column, the track, and the value to the right of the bar. Every bar chart
 * uses it, so the metrics (the label width, the bar height, the gap) come from one set of CSS variables.
 */
export function Bars({ rows }: { rows: BarRow[] }) {
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.key} className="bar-row">
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${r.fraction * 100}%` }}>
              {(r.segments ?? [{ color: ACCENT, weight: 1, title: '' }]).map((s, i) => (
                <span key={i} className="bar-seg" style={{ flex: `${s.weight} 1 0`, background: s.color }} title={s.title || undefined} />
              ))}
            </span>
          </span>
          <span className="bar-value">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One horizontal stacked bar per layer, its length the layer's node count over the largest layer, each
 * segment a type in the executive summary's colour. A legend under it matches the swatches to the types.
 */
export function CompositionFigure({ comp, note }: { comp: LayerComposition[]; note: string }) {
  const types = typesOf(comp);
  const max = Math.max(1, ...comp.map((c) => c.nodes));
  return (
    <ChartCard name="composition" title="Layer composition" note={note} span={6}>
      <Bars rows={comp.map((c) => ({
        key: c.code,
        label: `${c.code} ${c.title}`,
        fraction: c.nodes / max,
        value: String(c.nodes),
        segments: c.byType.map((t) => ({ color: fillOf(types, t.type), weight: t.nodes, title: `${t.type} ${t.nodes}` })),
      }))} />
      <p className="legend-line">
        {types.map((t) => (
          <span key={t} className="legend-item"><span className="swatch" style={{ background: fillOf(types, t) }} />{t}</span>
        ))}
      </p>
    </ChartCard>
  );
}

/** Edge counts per kind, as bars; the widest kind fills the track. */
export function EdgesFigure({ edges, note }: { edges: { kind: string; edges: number }[]; note: string }) {
  const max = Math.max(1, ...edges.map((e) => e.edges));
  return (
    <ChartCard name="edges" title="Edges by kind" note={note} span={6}>
      <Bars rows={edges.map((e) => ({ key: e.kind, label: e.kind, fraction: e.edges / max, value: String(e.edges) }))} />
      {edges.length === 0 && <p className="legend-line">No edges in this tower.</p>}
    </ChartCard>
  );
}

/**
 * Governance coverage: one bar per control, filled to `n / total` of the governed nodes. A tower with no
 * governed node has no denominator, so its bars are empty and say so.
 */
export function CoverageFigure({ coverage, note }: { coverage: ControlCoverage[]; note: string }) {
  return (
    <ChartCard name="coverage" title="Governance coverage" note={note} span={6}>
      <Bars rows={coverage.map((c) => ({
        key: c.control,
        label: c.control,
        fraction: c.total ? c.n / c.total : 0,
        value: `${c.n} / ${c.total}`,
      }))} />
    </ChartCard>
  );
}

/** A layer table spans the whole row when it has too many columns for half a page. */
function spanOf(table: LayerTable): 6 | 12 {
  return isWideTable(table) ? 12 : 6;
}

/**
 * The overview of one chapter, in two fixed pages. Page A: the 3D snapshot, then the layer matrix and the
 * composition side by side on one row. Page B: the edges and the governance coverage, the most-connected
 * nodes, the runtime and model tables, and the sub-tower tree of a root. A short page B (a small tower) is
 * flagged, so its rows flow onto page A instead of leaving it half empty. Every card is drawn even when
 * empty, so a chapter always shows its charts.
 */
export function ChapterOverview({ id, charts, title, snap }: { id: string; charts: ChapterCharts; title: string; snap?: ReactNode }) {
  const flow = pageBFlows(charts);
  const note = (what: string) => `${what}, ${title}`;
  return (
    <section className={`overview${flow ? ' overview-flow' : ''}`} id={`${id}-overview`}>
      <div className="overview-page page-a">
        <h3>Overview</h3>
        {snap}
        <div className="overview-grid">
          <MatrixFigure matrix={charts.matrix} note={note('edges between layers')} />
          <CompositionFigure comp={charts.composition} note={note('nodes by type')} />
        </div>
      </div>
      <div className="overview-page page-b">
        <div className="overview-grid">
          <EdgesFigure edges={charts.edges} note={note('edge counts by kind')} />
          <CoverageFigure coverage={charts.coverage} note={note('governed nodes carrying each control')} />
          <ConnectedFigure rows={charts.connected} note={note('edges into and out of each node, most first')} />
          <LayerTableFigure name="runtimes" table={charts.runtimes} title="Runtimes by layer" note={note('nodes per runtime')} span={spanOf(charts.runtimes)} />
          <LayerTableFigure name="models" table={charts.models} title="Models by layer" note={note('nodes per model')} span={spanOf(charts.models)} />
          {charts.tree && <TreeFigure tree={charts.tree} note={note('each tower with its layers and nodes')} />}
        </div>
      </div>
    </section>
  );
}
