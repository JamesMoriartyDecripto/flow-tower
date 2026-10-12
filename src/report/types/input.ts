/*
 * Input checks shared by the report types. A report type takes untrusted input (a parsed YAML or JSON file), so
 * every field is checked here and a bad one throws an Error that names the field, so the author can fix the file
 * without reading the code. The path prefix (`findings[2]`) keeps nested fields readable.
 */

export type Obj = Record<string, unknown>;

export function fail(where: string, message: string): never {
  throw new Error(`${where}: ${message}`);
}

function at(where: string, key: string): string {
  return where ? `${where}.${key}` : key;
}

export function asObject(value: unknown, where: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(where, 'must be an object');
  return value as Obj;
}

export function reqString(obj: Obj, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') fail(at(where, key), 'must be a non-empty string');
  return value;
}

export function optString(obj: Obj, key: string, where: string): string | undefined {
  if (obj[key] === undefined) return undefined;
  return reqString(obj, key, where);
}

export function reqNumber(obj: Obj, key: string, where: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(at(where, key), 'must be a number');
  return value;
}

export function optNumber(obj: Obj, key: string, where: string): number | undefined {
  if (obj[key] === undefined) return undefined;
  return reqNumber(obj, key, where);
}

export function optBoolean(obj: Obj, key: string, where: string): boolean | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') fail(at(where, key), 'must be true or false');
  return value;
}

export function reqArray(obj: Obj, key: string, where: string): unknown[] {
  const value = obj[key];
  if (!Array.isArray(value)) fail(at(where, key), 'must be a list');
  return value;
}

/** An optional list of strings; absent means an empty list, so a report can say "not stated" instead. */
export function optStringList(obj: Obj, key: string, where: string): string[] {
  if (obj[key] === undefined) return [];
  return reqArray(obj, key, where).map((item, i) => {
    if (typeof item !== 'string' || item.trim() === '') fail(`${at(where, key)}[${i}]`, 'must be a non-empty string');
    return item as string;
  });
}

export function oneOf<T extends string>(value: unknown, options: readonly T[], where: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    fail(where, `must be one of ${options.join(', ')}`);
  }
  return value as T;
}
