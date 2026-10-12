// Argument parsing for run.mjs, kept apart from it: run.mjs runs the squad on import, so its helpers cannot be tested there.

// The folders a coder may write (--write a,b). A dir keeps its "/" (tools/squad is a folder, not one name). Other
// characters are dropped as before. Leading and trailing "/" are dropped. An empty dir, an absolute one or one with a
// ".." segment is refused: null, so the caller prints the usage and exits 2. A write must never leave the repo.
// The absolute test runs on the raw value: stripping a leading "/" first would turn "/etc" into a relative dir.
export function writeDirs(str) {
  const out = [];
  for (const raw of String(str).split(',')) {
    if (raw.trim().startsWith('/')) return null;
    const dir = raw.replace(/[^\w./-]/g, '').replace(/\/+$/, '');
    if (!dir || dir.split('/').includes('..')) return null;
    out.push(dir);
  }
  return out;
}
