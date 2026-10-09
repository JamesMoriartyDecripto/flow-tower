import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ResolvedEdge, ResolvedNode, ResolvedPrompt, ResolvedTower } from '../../core/types';
import { neighbours } from '../graph';
import { findNode, useStore, useTower } from '../store';
import { NODE_STYLE } from '../theme';
import { NodeLiveInfo } from './LiveFeed';

type Tab = 'overview' | 'prompt' | 'tools' | 'files';

const TAB_HINT: Record<Tab, string> = {
  overview: 'Description, model, runtime, harness, live state and connections',
  prompt: 'System prompt with its template variables',
  tools: 'Tools this node can use (click one to jump to its node)',
  files: 'Source files, logs, scripts and dashboards',
};

/** Right-hand panel with everything known about the selected node. */
export function Inspector() {
  const tower = useTower();
  const selected = useStore((s) => s.selected);
  const node = findNode(tower, selected);
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => setTab('overview'), [selected]);
  // [ and ] (App keyboard) cycle through the tabs that have content.
  useEffect(() => {
    const onTab = (e: Event) => {
      if (!node) return;
      const open: Tab[] = ['overview', ...(node.prompt ? ['prompt' as const] : []), ...(node.tools.length ? ['tools' as const] : []), ...(node.files.length + node.resources.length ? ['files' as const] : [])];
      setTab((cur) => open[(open.indexOf(cur) + (e as CustomEvent<number>).detail + open.length) % open.length]);
    };
    window.addEventListener('flow-tower:tab', onTab);
    return () => window.removeEventListener('flow-tower:tab', onTab);
  }, [node]);
  if (!tower || !node) return null;

  const { select, enterTower } = useStore.getState();
  const tabs: [Tab, string, number | undefined][] = [
    ['overview', 'Overview', undefined],
    ['prompt', 'Prompt', node.prompt ? 1 : 0],
    ['tools', 'Tools', node.tools.length],
    ['files', 'Files', node.files.length + node.resources.length],
  ];

  return (
    <aside className="panel inspector">
      <header>
        <button className="close" onClick={() => select(undefined)} title="Close (Esc)">✕</button>
        <div className="chips">
          <span className="chip">{NODE_STYLE[node.type].tag}</span>
          {node.model && <span className="chip">{node.model}</span>}
          {node.status !== 'active' && <span className={`chip status-${node.status}`}>{node.status.toUpperCase()}</span>}
          {node.runtime && <span className="chip" title={node.runtime.description}>@{node.runtime.label ?? node.runtime.id}</span>}
          {node.tower && <span className="chip sub" title="This node contains its own tower: use the button below, Enter, or double-click the node">⇣ SUB-TOWER</span>}
        </div>
        <h2>{node.label}</h2>
        <div className="mono dim">{node.key}</div>
      </header>
      <nav className="tabs">
        {tabs.map(([id, label, count]) => (
          <button key={id} className={tab === id ? 'on' : ''} disabled={count === 0} onClick={() => setTab(id)} title={count === 0 ? `This node has no ${label.toLowerCase()}` : TAB_HINT[id]}>
            {label}{count ? ` ${count}` : ''}
          </button>
        ))}
      </nav>
      <div className="tabbody">
        {tab === 'overview' && <Overview node={node} tower={tower} />}
        {tab === 'prompt' && node.prompt && <Prompt prompt={node.prompt} tower={tower.id} />}
        {tab === 'tools' && <Tools node={node} tower={tower} />}
        {tab === 'files' && <Files node={node} tower={tower.id} />}
      </div>
      {node.tower && (
        <button className="btn primary enter" onClick={() => enterTower(node.tower!)} title="Open the tower inside this node (Enter or double-click the node)">
          ⇣ Enter sub-tower
        </button>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="section"><span className="title">{title}</span>{children}</div>;
}

function Table({ data }: { data: Record<string, unknown> }) {
  const rows = Object.entries(data).filter(([, v]) => v !== undefined && v !== '');
  if (!rows.length) return null;
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Overview({ node, tower }: { node: ResolvedNode; tower: ResolvedTower }) {
  const { incoming, outgoing } = useMemo(() => neighbours(tower, node.key), [tower, node.key]);
  const agent = node.agent;
  return (
    <>
      <NodeLiveInfo nodeKey={node.key} />
      {node.description && <Section title="Description"><p style={{ margin: 0 }}>{node.description}</p></Section>}
      <Section title="Identity">
        <Table data={{
          type: `${node.type} — ${NODE_STYLE[node.type].hint}`,
          layer: node.layer,
          model: node.model,
          agent: agent && `${agent.name} (${agent.id})`,
          source: agent?.source,
          'sub-tower': node.tower,
        }} />
      </Section>
      {node.runtime && (
        <Section title={`Runtime · ${node.runtime.kind}`}>
          <Table data={{
            id: node.runtime.id, label: node.runtime.label, host: node.runtime.host, provider: node.runtime.provider,
            region: node.runtime.region, url: node.runtime.url, ...node.runtime.meta,
          }} />
          {node.runtime.description && <p className="dim" style={{ margin: '6px 0 0' }}>{node.runtime.description}</p>}
        </Section>
      )}
      {agent && Object.keys(agent.harness).length > 0 && <Section title="Harness"><Table data={agent.harness} /></Section>}
      {Object.keys({ ...agent?.meta, ...node.meta }).length > 0 && <Section title="Meta"><Table data={{ ...agent?.meta, ...node.meta }} /></Section>}
      <Section title={`Incoming · ${incoming.length}`}>
        {incoming.map((e) => <Conn key={e.id} edge={e} other={e.from} tower={tower} arrow="←" />)}
      </Section>
      <Section title={`Outgoing · ${outgoing.length}`}>
        {outgoing.map((e) => <Conn key={e.id} edge={e} other={e.to} tower={tower} arrow="→" />)}
      </Section>
    </>
  );
}

function Conn({ edge, other, tower, arrow }: { edge: ResolvedEdge; other: string; tower: ResolvedTower; arrow: string }) {
  const target = findNode(tower, other);
  const go = () => {
    const s = useStore.getState();
    s.select(other);
    if (s.focusedLayer !== undefined && target) s.focusLayer(tower.layers.findIndex((l) => l.id === target.layer));
  };
  return (
    <button className="conn" onClick={go} title={`Select ${target?.label ?? other}`}>
      <span className="k">{edge.kind.toUpperCase()}</span>
      <span>{arrow} {target?.label ?? other}</span>
      {edge.label && <span className="dim mono">· {edge.label}</span>}
    </button>
  );
}

function Prompt({ prompt, tower }: { prompt: ResolvedPrompt; tower: string }) {
  const parts = prompt.text.split(/(\{\{\s*[\w.-]+\s*\}\})/g);
  return (
    <>
      <Section title="Prompt">
        <div className="chips" style={{ marginBottom: 10 }}>
          <span className="chip">~{prompt.tokens.toLocaleString()} tokens</span>
          {prompt.id && <span className="chip">registry: {prompt.id}</span>}
          {prompt.source && (
            <button className="chip clickable" onClick={() => useStore.getState().openFile({ tower, files: [prompt.source!], index: 0 })} title="Open the prompt file">
              ⧉ {prompt.source}
            </button>
          )}
        </div>
        {prompt.description && <p className="dim" style={{ marginTop: 0 }}>{prompt.description}</p>}
        {prompt.vars.length > 0 && (
          <div className="chips" style={{ marginBottom: 10 }}>
            {prompt.vars.map((v) => <span key={v} className="chip">{`{{${v}}}`}</span>)}
          </div>
        )}
      </Section>
      <div className="prompt">{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</div>
    </>
  );
}

function Tools({ node, tower }: { node: ResolvedNode; tower: ResolvedTower }) {
  const all = tower.layers.flatMap((l) => l.nodes);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    <Section title="Tools available to this node">
      <div className="chips">
        {node.tools.map((t) => {
          const match = all.find((n) => n.key !== node.key && (norm(n.id) === norm(t) || norm(n.label) === norm(t)));
          return match ? (
            <button key={t} className="chip clickable" onClick={() => useStore.getState().select(match.key)} title={`Go to ${match.key}`}>
              ⌖ {t}
            </button>
          ) : <span key={t} className="chip">{t}</span>;
        })}
      </div>
    </Section>
  );
}

function Files({ node, tower }: { node: ResolvedNode; tower: string }) {
  const { files, resources } = node;
  const local = resources.filter((r) => r.path);
  const open = (list: string[], i: number) => useStore.getState().openFile({ tower, files: list, index: i });
  return (
    <>
      {files.length > 0 && (
        <Section title="Related files">
          <div className="filelist">
            {files.map((f, i) => (
              <button key={f} onClick={() => open(files, i)} title={`Open ${f}`}>
                <span className="ext">{(f.split('.').pop() ?? '').toUpperCase().slice(0, 4)}</span>
                {f}
              </button>
            ))}
          </div>
        </Section>
      )}
      {resources.length > 0 && (
        <Section title="Resources · logs, scripts, services">
          <div className="reslist">
            {resources.map((r) => r.url ? (
              // Only http(s) URLs pass schema validation, so this cannot become a javascript: link.
              <a key={r.label + r.url} href={r.url} target="_blank" rel="noopener noreferrer" title={r.url}>
                <span className="ext">{r.kind.toUpperCase()}</span>{r.label} <span className="dim">↗</span>
              </a>
            ) : (
              <button key={r.label + r.path} onClick={() => open(local.map((x) => x.path!), local.indexOf(r))} title={r.path}>
                <span className="ext">{r.kind.toUpperCase()}</span>{r.label} <span className="dim">· {r.path}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
