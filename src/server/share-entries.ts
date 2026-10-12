/**
 * The pure edits of the `shares` list in config.json (#164), kept apart from the `share` / `unshare` CLI so a
 * unit test can import them without running the command. Entries are kept raw: a hand-edited one that the
 * schema refuses stays in the file untouched, so a rewrite never drops what it does not understand.
 */
import { ShareSchema, type Share } from './config.ts';

/** A raw entry as a Share, or undefined when the schema refuses it. */
export function asShare(raw: unknown): Share | undefined {
  const parsed = ShareSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The list with `entry` added. A share is replaced when either its name or its folder is taken: one folder is
 * one share on the hub, so a second entry for the same folder or name would be a duplicate.
 */
export function withShare(shares: unknown[], entry: Share): unknown[] {
  const kept = shares.filter((s) => {
    const old = asShare(s);
    return !old || (old.name !== entry.name && old.dir !== entry.dir);
  });
  return [...kept, entry];
}

/** The list without the share called `name`. */
export function withoutShare(shares: unknown[], name: string): unknown[] {
  return shares.filter((s) => asShare(s)?.name !== name);
}
