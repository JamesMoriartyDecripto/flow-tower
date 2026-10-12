import type { ReactNode } from 'react';
import type { EdgeRef, Legend, NodeDetail as NodeDetailData } from '../../core/doc';
import type { Issue } from '../../core/types';

/** One node's section at level 3: fields, incoming and outgoing edges as links, files, sub-tower. */
export function NodeDetail({ node: n }: { node: NodeDetailData }) {
  const rows: [string, ReactNode][] = [];
  if (n.agent?.name) rows.push(['Agent', n.agent.name]);
  if (n.agent?.model) rows.push(['Model', n.agent.model]);
  if (n.agent?.prompt) rows.push(['Prompt', n.agent.prompt]);
  if (n.runtime) rows.push(['Runtime', n.runtime]);
  if (n.tools.length) rows.push(['Tools', n.tools.join(', ')]);
  for (const [k, v] of n.ops) rows.push([k, v]);
  if (n.subTower) {
    rows.push(['Sub-tower', n.subTower.anchor ? <a href={`#${n.subTower.anchor}`}>{n.subTower.title}</a> : n.subTower.title]);
  }
  return (
    <section className="node" id={n.id}>
      <h4>{n.label} <span className="muted">{n.type}</span></h4>
      {n.description && <p>{n.description}</p>}
      {rows.length > 0 && (
        <dl>
          {rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      <EdgeList title="Incoming" items={n.incoming} />
      <EdgeList title="Outgoing" items={n.outgoing} />
      {n.files.length > 0 && (
        <div className="files">
          <h5>Files</h5>
          <ul>{n.files.map((f) => <li key={f}><code>{f}</code></li>)}</ul>
        </div>
      )}
    </section>
  );
}

function EdgeList({ title, items }: { title: string; items: EdgeRef[] }) {
  if (!items.length) return null;
  return (
    <div className="edges">
      <h5>{title}</h5>
      <ul>
        {items.map((e, i) => (
          <li key={i}>
            <a href={`#${e.other.anchor}`}>{e.other.label}</a>{' '}
            <span className="muted">{e.label ?? e.kind} ({e.kind})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LegendBlock({ legend }: { legend: Legend }) {
  const groups: [string, { value: string; label: string }[]][] = [
    ['Node types', legend.types],
    ['Edge kinds', legend.edgeKinds],
    ['Runtimes', legend.runtimes],
  ];
  return (
    <section className="legend">
      <h2>Legend</h2>
      {groups.filter(([, items]) => items.length > 0).map(([title, items]) => (
        <div key={title}>
          <h5>{title}</h5>
          <ul>{items.map((i) => <li key={i.value}><code>{i.value}</code> {i.label}</li>)}</ul>
        </div>
      ))}
    </section>
  );
}

export function IssuesBlock({ issues }: { issues: Issue[] }) {
  return (
    <section className="issues">
      <h2>Issues</h2>
      {issues.length === 0
        ? <p className="muted">No issues.</p>
        : <ul>{issues.map((i, k) => <li key={k}><strong>{i.level}</strong> {i.message}{i.path && <> <code>{i.path}</code></>}</li>)}</ul>}
    </section>
  );
}

export function SourcesBlock({ sources }: { sources: string[] }) {
  return (
    <section className="sources">
      <h2>Sources</h2>
      <ul>{sources.map((s) => <li key={s}><code>{s}</code></li>)}</ul>
    </section>
  );
}
