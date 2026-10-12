// Local cost ledger for the dev squad (#156): one JSON line per run, so each issue's total can be read at close.
// It lives in the user folder, outside any checkout: costs are not repo content, and a git clean must not erase them.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function ledgerPath(env) {
  if (env.SQUAD_LEDGER) return env.SQUAD_LEDGER;
  return join(env.FLOW_TOWER_HOME || join(homedir(), '.config', 'flow-tower'), 'squad-costs.jsonl');
}

// An explicit --issue wins; otherwise the branch name (fix/126-bin-split) carries it. Anything else is unknown.
export function issueOf(explicit, branch) {
  if (explicit !== undefined && /^[1-9]\d*$/.test(String(explicit))) return String(explicit);
  const m = /\d+/.exec(String(branch ?? ''));
  return m ? m[0] : null;
}

// Never throws: a ledger failure must not fail a paid run, so the caller gets false and carries on.
export function appendRun(path, entry) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(entry)}\n`);
    return true;
  } catch {
    return false;
  }
}

// A torn or hand-edited line must not hide the rest of the ledger, so bad lines are skipped one by one.
export function readRuns(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { return []; }
  const runs = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { runs.push(JSON.parse(line)); } catch { /* malformed: skipped */ }
  }
  return runs;
}

// Groups one issue's runs by role and model; rows are sorted by cost so the expensive part reads first.
// A run whose cost is unknown (cost null, a batch the generation endpoint could not price) adds nothing to the
// cost, and is counted in unknownCost so the total is never read as complete when it is not.
export function summarize(runs, issue) {
  const rows = new Map();
  const total = { runs: 0, steps: 0, cost: 0, unknownCost: 0 };
  for (const r of runs) {
    if (String(r.issue) !== String(issue)) continue;
    const key = `${r.role}\u0000${r.model}`;
    if (!rows.has(key)) rows.set(key, { role: r.role, model: r.model, runs: 0, steps: 0, cost: 0, unknownCost: 0, promptTokens: 0, cachedTokens: 0 });
    const row = rows.get(key);
    const known = r.cost !== null && r.cost !== undefined && Number.isFinite(Number(r.cost));
    for (const t of [row, total]) {
      t.runs += 1;
      t.steps += Number(r.steps) || 0;
      if (known) t.cost += Number(r.cost);
      else t.unknownCost += 1;
    }
    row.promptTokens += Number(r.promptTokens) || 0;
    row.cachedTokens += Number(r.cachedTokens) || 0;
  }
  return {
    rows: [...rows.values()].sort((a, b) => b.cost - a.cost),
    total,
  };
}
