import type { ResolvedNode } from '../../core/types';
import { dataRows, evalPasses, opsRows } from '../ops';

function Rows({ data }: { data: Record<string, string | undefined> }) {
  const rows = Object.entries(data).filter(([, v]) => v);
  if (!rows.length) return null;
  return <dl className="kv">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

/** Operations, data handling and evals of a node: how it runs in production, not just what it does. */
export function OpsInfo({ node }: { node: ResolvedNode }) {
  const { ops } = node;
  const rows = opsRows(ops);
  const hasOps = Object.values(rows).some(Boolean);
  const data = ops.data;
  return (
    <>
      {hasOps && (
        <div className="section" tabIndex={-1}>
          <span className="title">Operations</span>
          <Rows data={rows} />
        </div>
      )}
      {data && (
        <div className="section" tabIndex={-1}>
          <span className="title">Data{data.sensitivity && <span className={`chip sens ${data.sensitivity}`}>{data.sensitivity.toUpperCase()}</span>}</span>
          <Rows data={dataRows(data)} />
          {data.description && <p className="dim" style={{ margin: '6px 0 0' }}>{data.description}</p>}
        </div>
      )}
      {ops.evals && ops.evals.length > 0 && (
        <div className="section" tabIndex={-1}>
          <span className="title">Evals · {ops.evals.length}</span>
          {ops.evals.map((e) => {
            const pass = evalPasses(e);
            return (
              <div key={e.name} className="eval" title={e.description}>
                <span className="name">{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.name}</a> : e.name}</span>
                <span className={`val ${pass === undefined ? '' : pass ? 'pass' : 'fail'}`}>{e.value ?? '—'}{e.unit && e.value !== undefined ? ` ${e.unit}` : ''}</span>
                {e.target !== undefined && <span className="dim mono">target {e.higher_is_better === false ? '≤' : '≥'} {e.target}</span>}
                {e.illustrative && <span className="chip" title="An example value, not a measurement">illustrative</span>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
