import type { EdgeRef, Legend, NodeDetail as NodeDetailData } from '../../core/doc';
import type { Field } from '../../core/docFields';
import { LEVEL_LABEL, type Finding, type SeverityCount } from '../../core/docFindings';
import type { IssueLevel } from '../../core/types';
import { Chip } from './DocChips';
import { FieldGrid, Text } from './DocText';
import { linkTo } from './DocParts';

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
    <section className={`node status-${n.status}`} id={n.id}>
      <header className="node-head">
        <span className="ref mono">{n.ref}</span>
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
            {linkTo(e.other)}
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

/**
 * The validation findings: a severity count table, then one row per issue with its V-number, a chip for
 * the severity, the location and the message. A finding is printed as the tower wrote it, never reworded.
 */
export function FindingsBlock({ findings, severities }: { findings: Finding[]; severities: SeverityCount[] }) {
  return (
    <section className="issues">
      <h2>Validation</h2>
      <table className="severity">
        <thead><tr><th>Severity</th><th className="num">Count</th></tr></thead>
        <tbody>
          {severities.map((s) => (
            <tr key={s.level}><td><span className={`chip ${SEVERITY_CHIP[s.level]}`}>{s.label}</span></td><td className="num">{s.count}</td></tr>
          ))}
        </tbody>
      </table>
      {findings.length === 0
        ? <p className="muted">No findings: the tower validates without issues.</p>
        : (
          <table className="findings">
            <thead><tr><th>ID</th><th>Severity</th><th>Location</th><th>Message</th></tr></thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id}>
                  <td className="mono">{f.id}</td>
                  <td><span className={`chip ${SEVERITY_CHIP[f.level]}`}>{LEVEL_LABEL[f.level]}</span></td>
                  <td className="mono">{f.location}</td>
                  <td><Text text={f.message} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </section>
  );
}

const SEVERITY_CHIP: Record<IssueLevel, string> = { error: 'chip-red', warning: 'chip-amber', info: 'chip-blue' };

