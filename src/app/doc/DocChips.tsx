import type { Status } from '../../core/schema';

/**
 * Status colours for print. Each is a pale fill with a dark ink of the same hue, so the chip stays
 * readable on white paper and in greyscale it still differs by its label.
 */
const STATUS_COLOR: Record<Status, string> = {
  active: 'chip-green',
  experimental: 'chip-amber',
  planned: 'chip-blue',
  deprecated: 'chip-grey',
};

/** A small coloured label: a node type (neutral) or a status (coloured). */
export function Chip({ kind, value }: { kind: 'type' | 'status'; value: string }) {
  const cls = kind === 'status' ? STATUS_COLOR[value as Status] ?? 'chip-grey' : 'chip-type';
  return <span className={`chip ${cls}`}>{value}</span>;
}
