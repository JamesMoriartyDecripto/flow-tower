import type { EdgeRef, Legend, NodeDetail as NodeDetailData } from '../../core/doc';
import type { Field } from '../../core/docFields';
import type { Issue } from '../../core/types';
import { Chip } from './DocChips';
import { FieldGrid, Text } from './DocText';


/**
 * One node's card at level 3: header with type and status chips, the fields, incoming and outgoing side
 * by side, files, and the sub-tower as a link. The card does not split across pages unless it is taller.
 */
export function NodeDetail({ node: n }: { node: NodeDetailData }) {
  const facts: Field[] = [
    ...(n.agent?.name ? [{ label: 'Agent', value: { text: n.agent.name } }] : []),
    ...(n.agent?.model ? [{ label: 'Model', value: { text: n.agent.model } }] : []),
    ...(n.agent?.prompt ? [{ label: 'Prompt', value: { text: n.agent.prompt } }] : []),
    ...(n.runtime ? [{ label: 'Runtime', value: { text: n.runtime } }] : []),
    ...(n.tools.length ? [{ label: 'Tools', value: { list: n.tools } }] : []),
    ...n.ops,
  ];
  return (
    <section className="node" id={n.id}>
      <header className="node-head">
        <h4>{n.label}</h4>
        <Chip kind="type" value={n.type} />
        <Chip kind="status" value={n.status} />
      </header>
      {n.description && <p><Text text={n.description} /></p>}
      <FieldGrid fields={facts} />
      {n.subTower && (
        <p className="subtower">
          Sub-tower: {n.subTower.anchor ? <a href={`#${n.subTower.anchor}`}>{n.subTower.title}</a> : n.subTower.title}
        </p>
      )}
      <div className="edge-pair">
        <EdgeList title="Incoming" items={n.incoming} />
        <EdgeList title="Outgoing" items={n.outgoing} />
      </div>
      {n.files.length > 0 && (
        <div className="files">
          <h5>Files</h5>
          <ul className="mono">{n.files.map((f) => <li key={f}>{f}</li>)}</ul>
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
            <a href={`#${e.other.anchor}`}>{e.other.label}</a>
            {' '}<span className="muted">{e.label ? <><Text text={e.label} /> · </> : null}{e.kind}</span>
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
        : <ul>{issues.map((i, k) => <li key={k}><strong>{i.level}</strong> <Text text={i.message} />{i.path && <> <span className="mono">{i.path}</span></>}</li>)}</ul>}
    </section>
  );
}

export function SourcesBlock({ sources }: { sources: string[] }) {
  return (
    <section className="sources">
      <h2>Sources</h2>
      <ul className="mono">{sources.map((s) => <li key={s}>{s}</li>)}</ul>
    </section>
  );
}
