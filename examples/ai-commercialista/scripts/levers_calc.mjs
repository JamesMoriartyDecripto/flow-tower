// Deterministic lever numbers: iperammortamento, new-hire super-deduction, forfettario vs ordinary.
// Usage: node scripts/levers_calc.mjs [--dry-run] [--capex 3000000] [--hires 2] [--disadvantaged 0]
//          [--coefficient 0.78] [--revenue 42000] [--costs 3500]
// Output is an ESTIMATE for the commercialista to check. Numbers come from code, never from the model.
//
// Why no defaults for the forfettario coefficient: the profitability coefficient depends on the ATECO code,
// and the repo notes do not state it for 74.10.10 (Sara Conti). Missing input means "needs data".
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const num = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : null;
};

// Iperammortamento extra deduction by bracket, from research/levers-2026.md section 1.1 and 2.1
// (art. 1 c. 427-436 L. 199/2025). The levels are +180% up to 2.5m, +100% 2.5-10m, +50% 10-20m.
// ASSUMPTION (unverified): each band is applied to the part of the investment that falls in it
// (marginal). The notes do not say whether the brackets are annual or cumulative over 2026-2028.
const IPER_BANDS = [
  { upTo: 2_500_000, rate: 1.8 },
  { upTo: 10_000_000, rate: 1.0 },
  { upTo: 20_000_000, rate: 0.5 },
];

function iperammortamento(capex) {
  let from = 0;
  let extra = 0;
  const bands = [];
  for (const b of IPER_BANDS) {
    const part = Math.max(0, Math.min(capex, b.upTo) - from);
    extra += part * b.rate;
    bands.push({ band_up_to_eur: b.upTo, rate_pct: b.rate * 100, base_eur: part });
    from = b.upTo;
  }
  // Above 20m the notes list no uplift: the amount beyond it earns nothing extra.
  return { extra_deduction_eur: Math.round(extra), bands, above_20m_uplift: 0 };
}

// New-hire super-deduction (D.Lgs. 216/2023 art. 4; notes section 2.9): 20% extra, 30% for disadvantaged
// workers (Allegato 1). The cost base is the lower of the hires' cost and the staff-cost increase, so this
// takes the hires' cost as the input and assumes the cap is not binding (stated in the output).
function superDeduction(hireCost, disadvantagedCost) {
  const base = hireCost - disadvantagedCost;
  return {
    extra_deduction_eur: Math.round(base * 0.2 + disadvantagedCost * 0.3),
    rule: 'cost base = lower of hires cost and staff-cost increase; cap not checked here',
  };
}

// Forfettario: substitute tax 15% (5% for the first 5 years of a new activity), on revenue x coefficient
// (L. 190/2014 art. 1 c. 54-89; notes section 3). The notes mark 5%/15% as M (not re-read on the current
// scheda), so the output carries that confidence.
function forfettario(revenue, costs, coefficient) {
  if (coefficient === null) return { status: 'needs_data', missing: 'coefficient (ATECO profitability, not in repo notes)' };
  const taxable = revenue * coefficient;
  return { status: 'ok', taxable_eur: Math.round(taxable), substitute_tax_15_eur: Math.round(taxable * 0.15), substitute_tax_5_eur: Math.round(taxable * 0.05), costs_ignored_by_regime: costs };
}

// Ordinary company view: IRES 24% (art. 77 TUIR, notes section 2.8: ordinary rate from FY2026) on profit.
// IRAP and individual IRPEF are not computed (no brackets for addizionali/INPS in the repo): a known gap.
// The profit is signed so a loss year is not shown as break-even. Losses carried forward are not modelled.
const IRES_RATE = 0.24;
function ordinaryIres(revenue, costs) {
  const profit = revenue - costs;
  return {
    profit_eur: profit,
    ires_eur: profit > 0 ? Math.round(profit * IRES_RATE) : 0,
    loss_eur: profit < 0 ? -profit : 0,
    ires_rate: IRES_RATE,
  };
}

// Revenue and costs come from the client file when not given on the command line. Capex, hire cost and
// the coefficient are not in the sample data, so they stay null unless passed (null = needs data).
const clientPath = args.includes('--client') ? args[args.indexOf('--client') + 1] : 'data/lumen-grid.json';
const client = JSON.parse(readFileSync(resolve(root, clientPath), 'utf8'));
const fin = client.financials_illustrative ?? {};
const revenue = num('--revenue') ?? fin.revenue_eur ?? null;
const costs = num('--costs') ?? fin.costs_eur ?? null;

const capex = num('--capex');
const hires = num('--hires');
const hireCost = num('--hire-cost');
const disadvantagedCost = num('--disadvantaged-cost') ?? 0;
const coefficient = num('--coefficient');

const out = { estimate: true, label: 'ESTIMATE - for review by the commercialista', client_id: client.id };
if (capex !== null) out.iperammortamento = iperammortamento(capex);
if (hires !== null && hireCost !== null) out.super_deduction = { hires, ...superDeduction(hireCost, disadvantagedCost) };
else if (hires !== null) out.super_deduction = { status: 'needs_data', missing: '--hire-cost' };
if (revenue !== null && costs !== null) {
  out.forfettario = forfettario(revenue, costs, coefficient);
  out.ordinary = ordinaryIres(revenue, costs);
}
console.log(JSON.stringify(out, null, 2));
