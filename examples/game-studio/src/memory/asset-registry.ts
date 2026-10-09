import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from '../config';

/**
 * The asset registry: one JSON file that every department agrees on.
 * Blender production writes it (register_asset), the art director gate approves,
 * Unreal integration reads only "approved" rows, marketing pulls hero shots from it,
 * and the credits screen is generated from license + source_url.
 */
export interface AssetRecord {
  id: string;
  path: string;
  asset_class: string;
  tris: number[];
  texture_max: number;
  materials: number;
  bones: number;
  license: string;
  source_url?: string;
  tags: string[];
  status: 'in_review' | 'approved' | 'rejected';
  version: number;
  reviewed_by?: string;
  updated_at: string;
}

export type AssetFilter = Partial<Pick<AssetRecord, 'status' | 'asset_class' | 'license' | 'source_url'>> & { tag?: string };

const FILE = join(ROOT, '.forge', 'asset-registry.json');

function load(): Record<string, AssetRecord> {
  return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, AssetRecord>) : {};
}

/** Atomic write: parallel artists (modelling, materials, rigging) register at the same time. */
function save(rows: Record<string, AssetRecord>) {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(rows, null, 2));
  renameSync(tmp, FILE);
}

export const registry = {
  get(id: string): AssetRecord | undefined {
    return load()[id];
  },

  list(filter: AssetFilter = {}): AssetRecord[] {
    const { tag, ...fields } = filter;
    return Object.values(load()).filter((a) =>
      (!tag || a.tags.includes(tag)) &&
      Object.entries(fields).every(([k, v]) => v === undefined || a[k as keyof AssetRecord] === v));
  },

  upsert(asset: Omit<AssetRecord, 'version'> & { version?: number }): AssetRecord {
    const rows = load();
    const prev = rows[asset.id];
    const changed = !prev || prev.path !== asset.path || prev.tris.join() !== asset.tris.join();
    const record: AssetRecord = {
      ...prev,
      ...asset,
      version: changed ? (prev?.version ?? 0) + 1 : prev.version,
      // Any content change sends an approved asset back to review.
      status: changed && prev?.status === 'approved' && asset.status === 'approved' ? 'in_review' : asset.status,
    };
    rows[asset.id] = record;
    save(rows);
    return record;
  },

  /** Only the art director gate calls this. */
  approve(id: string, reviewer: string): AssetRecord {
    const rows = load();
    if (!rows[id]) throw new Error(`unknown asset ${id}`);
    rows[id] = { ...rows[id], status: 'approved', reviewed_by: reviewer, updated_at: new Date().toISOString() };
    save(rows);
    return rows[id];
  },

  /** Credits lines for every shipped third-party asset that needs attribution. */
  credits(): string[] {
    return this.list({ status: 'approved' })
      .filter((a) => a.license.startsWith('CC-BY'))
      .map((a) => `${a.id} — ${a.license} — ${a.source_url ?? 'source missing'}`);
  },
};
