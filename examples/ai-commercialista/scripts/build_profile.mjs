// Matches a client JSON against the detect rules in config/profiles.yaml.
// Usage: node scripts/build_profile.mjs [--dry-run] [--client data/lumen-grid.json]
//
// Why: a missing field makes the match "needs data", never "matched" (profiles.yaml header).
// Profiles are a filter for the scanner, not a legal classification: the professional confirms them.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const clientPath = args.includes('--client') ? args[args.indexOf('--client') + 1] : 'data/lumen-grid.json';
const client = JSON.parse(readFileSync(resolve(root, clientPath), 'utf8'));

// Line parser for the fixed layout of profiles.yaml (2-space list items, 4-space keys, 6-space values).
// Inline lists like [srl, spa] are split on commas; quotes are stripped.
function parseInline(v) {
  const s = v.trim().replace(/^"|"$/g, '');
  if (s.startsWith('[')) return s.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

function loadProfiles() {
  const lines = readFileSync(resolve(root, 'config/profiles.yaml'), 'utf8').split('\n');
  const profiles = [];
  let cur = null;
  let block = null;
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const item = line.match(/^ {2}- id: (.+)$/);
    if (item) { cur = { id: item[1].trim(), detect: {}, levers: [], deadlines: [] }; profiles.push(cur); block = null; continue; }
    if (!cur) continue;
    const sec = line.match(/^ {4}(detect|levers|deadlines):\s*$/);
    if (sec) { block = sec[1]; continue; }
    if (block === 'detect') {
      const kv = line.match(/^ {6}([a-z_]+): (.+)$/);
      if (kv && !line.trim().startsWith('#')) cur.detect[kv[1]] = parseInline(kv[2]);
    } else if (block && line.match(/^ {6}- /)) {
      cur[block].push(line.replace(/^ {6}- /, '').trim());
    }
  }
  return profiles;
}

// Each rule returns true (matches), false (does not match) or null (field missing: needs data).
function checkRule(key, expected, c) {
  switch (key) {
    case 'legal_form': return c.legal_form === undefined ? null : expected.includes(c.legal_form);
    case 'regime': return c.regime === undefined ? null : c.regime === expected;
    case 'startup_innovativa_registered': return c.startup_innovativa_registered == null ? null : c.startup_innovativa_registered === expected;
    case 'company_age_months_max': return c.company_age_months == null ? null : c.company_age_months <= expected;
    case 'pv_kw': {
      if (c.pv_plant === undefined) return null;
      return (c.pv_plant?.kw ?? 0) > 0;
    }
    case 'employees': return c.employees == null ? null : c.employees > 0;
    default: return null; // unknown rule: never treated as a match
  }
}

const profiles = loadProfiles();
const results = profiles.map((p) => {
  const checks = Object.entries(p.detect).map(([k, v]) => ({ rule: k, result: checkRule(k, v, client) }));
  const status = checks.some((c) => c.result === false) ? 'no_match'
    : checks.some((c) => c.result === null) ? 'needs_data' : 'matched';
  return { id: p.id, status, checks, levers: p.levers.length, deadlines: p.deadlines.length };
});

const facts = {
  legal_form: client.legal_form,
  regime: client.regime,
  startup_innovativa_registered: client.startup_innovativa_registered,
  startup_innovativa_status_checked: client.startup_innovativa_status_checked ?? null,
  company_age_months: client.company_age_months,
  employees: client.employees,
  pv_kw: client.pv_plant?.kw ?? 0,
};

const warnings = [];
if (facts.startup_innovativa_registered && !facts.startup_innovativa_status_checked) {
  warnings.push('startup-innovativa: status not checked on the register and MIMIT circolare (L. 193/2024)');
}

console.log(JSON.stringify({
  estimate: false,
  client_id: client.id,
  matching: results.filter((r) => r.status === 'matched').map((r) => r.id),
  needs_data: results.filter((r) => r.status === 'needs_data').map((r) => r.id),
  profiles: results,
  facts,
  warnings,
}, null, 2));
