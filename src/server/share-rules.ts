/**
 * Rules for a tower folder shared between a satellite and the hub (#164).
 * Pure functions only: the hub and the satellite both call these, so a
 * folder that one side accepts is judged the same way by the other.
 */

export const MAX_FILES = 200;
export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

const SHARE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const MAX_PATH_CHARS = 200;
const MAX_SEGMENTS = 8;
const TOWER_FILE = /\.tower\.ya?ml$/;

// Text formats only: a shared folder is read as text, never as binary blobs.
const TEXT_EXTENSIONS = [
  '.md', '.txt', '.json', '.yaml', '.yml', '.ts', '.tsx', '.js', '.mjs', '.cjs',
  '.py', '.sh', '.toml', '.csv', '.sql', '.html', '.css', '.svg', '.log',
];

// Name-based guard: keys and credentials can hide behind an allowed extension
// (e.g. `.env` has none), so the base name is checked on its own.
const SECRET_PREFIXES = ['.env', 'id_rsa', 'id_ed25519', 'credentials', 'secrets'];
const SECRET_SUFFIXES = ['.pem', '.key', '.p12', '.pfx'];
const SECRET_NAMES = ['tokens.json', '.npmrc'];

export function shareName(raw: string): string | undefined {
  return SHARE_NAME.test(raw) ? raw : undefined;
}

export function isTowerFile(p: string): boolean {
  return TOWER_FILE.test(p);
}

function baseName(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1).toLowerCase();
}

function looksSecret(name: string): boolean {
  return SECRET_NAMES.includes(name)
    || SECRET_PREFIXES.some((s) => name.startsWith(s))
    || SECRET_SUFFIXES.some((s) => name.endsWith(s));
}

export function allowedFile(p: string): boolean {
  if (looksSecret(baseName(p))) return false;
  if (isTowerFile(p)) return true;
  const dot = p.lastIndexOf('.');
  return dot >= 0 && TEXT_EXTENSIONS.includes(p.slice(dot).toLowerCase());
}

/** Returns an error message, or undefined when the path may be stored. */
export function checkPath(p: string): string | undefined {
  if (p.length === 0 || p.length > MAX_PATH_CHARS) return `path must be 1..${MAX_PATH_CHARS} characters`;
  // Backslashes are refused outright: on Windows they would act as separators.
  if (p.includes('\\')) return 'path must use "/" separators';
  if (p.startsWith('/')) return 'path must be relative';
  if (/^[A-Za-z]:/.test(p)) return 'path must not carry a drive letter';
  const segments = p.split('/');
  if (segments.length > MAX_SEGMENTS) return `path must have at most ${MAX_SEGMENTS} segments`;
  for (const seg of segments) {
    // The segment pattern also rejects `.`, `..` and hidden folders, so a
    // share can never escape its folder or land in a skipped `.staging` dir.
    if (!SEGMENT.test(seg)) return `invalid path segment: ${JSON.stringify(seg)}`;
  }
  if (!allowedFile(p)) return `file type or name not allowed: ${p}`;
  return undefined;
}

export function checkFiles(
  files: unknown,
): { files: { path: string; content: string }[] } | { error: string } {
  if (!Array.isArray(files)) return { error: 'files must be an array' };
  if (files.length < 1 || files.length > MAX_FILES) {
    return { error: `files must hold 1..${MAX_FILES} entries` };
  }
  const seen = new Set<string>();
  const out: { path: string; content: string }[] = [];
  let total = 0;
  for (const entry of files) {
    if (typeof entry !== 'object' || entry === null) return { error: 'each file must be an object' };
    const { path, content } = entry as { path?: unknown; content?: unknown };
    if (typeof path !== 'string') return { error: 'file path must be a string' };
    if (typeof content !== 'string') return { error: `content of ${path} must be a string` };
    const pathError = checkPath(path);
    if (pathError) return { error: pathError };
    if (seen.has(path)) return { error: `duplicate path: ${path}` };
    seen.add(path);
    // Measure UTF-8 bytes, since the limits are on what goes over the wire.
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_FILE_BYTES) return { error: `${path} exceeds ${MAX_FILE_BYTES} bytes` };
    total += bytes;
    if (total > MAX_TOTAL_BYTES) return { error: `total size exceeds ${MAX_TOTAL_BYTES} bytes` };
    out.push({ path, content });
  }
  if (!out.some((f) => isTowerFile(f.path))) return { error: 'at least one *.tower.yaml file is required' };
  return { files: out };
}
