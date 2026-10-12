import type { ConnectedNode, LayerTable, TowerTree } from '../../core/docCharts';

/*
 * The chart figures that are tables, not drawings: a table reads better than bars when a reader looks up
 * one node or one count. They carry the same `data-chart` marker as the SVG figures, so the document check
 * counts every chart of a chapter the same way.
 */

/** The most-connected nodes: ref, name, layer, and how many edges come in and go out. */
export function ConnectedFigure({ rows }: { rows: ConnectedNode[] }) {
  return (
    <figure className="chart chart-table" data-chart="connected">
      <table>
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
      <figcaption>Most connected nodes: the edges into and out of each, most first.</figcaption>
    </figure>
  );
}

/**
 * The sub-tower tree of a root: each tower indented under the one that uses it, with a connector line down
 * its parent and the counts beside its name. The tree is a nested list, so the indentation survives print.
 */
export function TreeFigure({ tree }: { tree: TowerTree }) {
  return (
    <figure className="chart chart-tree" data-chart="tree">
      <ul className="tree">
        <TreeNode node={tree} />
      </ul>
      <figcaption>Sub-tower tree: each tower with its layers and nodes.</figcaption>
    </figure>
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
 * mistaken for a missing one.
 */
export function LayerTableFigure({ name, table, caption }: { name: string; table: LayerTable; caption: string }) {
  return (
    <figure className="chart chart-table" data-chart={name}>
      <table>
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
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
