import type { ConnectedNode, LayerTable, TowerTree } from '../../core/docCharts';
import { ChartCard } from './ChartCard';

/*
 * The chart figures that are tables, not drawings: a table reads better than bars when a reader looks up
 * one node or one count. They sit in the same cards as the drawings and carry the same `data-chart` marker,
 * so the document check counts every chart of a chapter the same way.
 */

/** The most-connected nodes: ref, name, layer, and how many edges come in and go out. Always full width. */
export function ConnectedFigure({ rows, note }: { rows: ConnectedNode[]; note: string }) {
  return (
    <ChartCard name="connected" title="Most connected nodes" note={note} span={12}>
      <table className="chart-table">
        <thead>
          <tr><th>Ref</th><th>Node</th><th>Layer</th><th className="num">In</th><th className="num">Out</th></tr>
        </thead>
        <tbody>
          {rows.length > 0
            ? rows.map((r) => (
              <tr key={r.ref}>
                <td className="mono ref">{r.ref}</td>
                <td className="chart-name">{r.label}</td>
                <td className="mono">{r.layer}</td>
                <td className="num">{r.in}</td>
                <td className="num">{r.out}</td>
              </tr>
            ))
            : <tr><td colSpan={5} className="muted">No edge joins two nodes.</td></tr>}
        </tbody>
      </table>
    </ChartCard>
  );
}

/**
 * The sub-tower tree of a root: each tower indented under the one that uses it, with a connector line down
 * its parent and the counts beside its name. The tree is a nested list, so the indentation survives print.
 */
export function TreeFigure({ tree, note }: { tree: TowerTree; note: string }) {
  return (
    <ChartCard name="tree" title="Sub-tower tree" note={note} span={12}>
      <ul className="tree">
        <TreeNode node={tree} />
      </ul>
    </ChartCard>
  );
}

function TreeNode({ node }: { node: TowerTree }) {
  return (
    <li>
      <span className="tree-name">{node.title}</span>
      <span className="muted"> · {node.layers} layers · {node.nodes} nodes</span>
      {node.children.length > 0 && (
        <ul>{node.children.map((c) => <TreeNode key={c.id} node={c} />)}</ul>
      )}
    </li>
  );
}

/**
 * Nodes per layer against one column each (runtime or model). A zero is a dot, so an empty cell is not
 * mistaken for a missing one. The table takes the card's width, and its model ids wrap only at `/` and `-`.
 */
export function LayerTableFigure({ name, table, title, note, span }: {
  name: string; table: LayerTable; title: string; note: string; span: 6 | 12;
}) {
  return (
    <ChartCard name={name} title={title} note={note} span={span}>
      <table className="chart-table">
        <thead>
          <tr><th>Layer</th>{table.columns.map((c) => <th key={c} className="num">{c}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.code}>
              <td className="mono">{r.code} {r.title}</td>
              {r.counts.map((n, i) => (
                <td key={table.columns[i]} className="num">{n > 0 ? n : <span className="muted">·</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.columns.length === 0 && <p className="legend-line">None recorded in this tower.</p>}
    </ChartCard>
  );
}
