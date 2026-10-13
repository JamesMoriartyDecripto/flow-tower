import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// The subcommands whose code is TypeScript (src/cli/*.ts): bin/ runs them with Node's built-in type
// stripping (Node >= 22.12) instead of re-implementing them in plain JS. `extra` returns the options
// that parseArgs stripped from the positionals, so the script still sees them; each one is named in
// the comment next to it, because a silent loss (e.g. `history --user ''`) would change behaviour.
export const TS_COMMANDS = [
  { name: 'config', script: 'config.ts', extra: () => [] },
  // `--json` is one of this parser's own options, so it is stripped from the positionals: append it back.
  // It is read from process.argv, as validate always did, so the flag is found wherever it sits.
  { name: 'validate', script: 'validate.ts', extra: () => (process.argv.includes('--json') ? ['--json'] : []) },
  // Same `--json` as validate: stripped from the positionals, so it is appended back.
  { name: 'audit', script: 'audit.ts', extra: (values) => (values.json ? ['--json'] : []) },
  // `--list` is stripped from the positionals too: append it back.
  { name: 'copy', script: 'copy.ts', extra: (values) => (values.list ? ['--list'] : []) },
  // `--json` is one of this parser's own options, so it is stripped from the positionals: append it back.
  { name: 'check-example', script: 'check-example.ts', extra: (values) => (values.json ? ['--json'] : []) },
  { name: 'token', script: 'token.ts', extra: () => [] },
  // `--user` with its exact value, the empty string included, or `history export|delete --user` loses it.
  { name: 'history', script: 'history.ts', extra: (values) => (values.user === undefined ? [] : ['--user', values.user]) },
  // --token/--user/--machine: each one with its exact value, so `--user ''` survives.
  {
    name: 'connect',
    script: 'connect.ts',
    extra: (values) => ['token', 'user', 'machine'].flatMap((name) => (values[name] === undefined ? [] : [`--${name}`, values[name]])),
  },
  // --pdf, --level, --out and --port are stripped from the positionals: each goes back with its exact value.
  {
    name: 'export',
    script: 'export.ts',
    // `port` has a default (5317) in parseArgs, so it is passed only when it was typed: the export picks a free port otherwise.
    extra: (values) => [
      ...(values.pdf ? ['--pdf'] : []),
      ...['level', 'out'].flatMap((name) => (values[name] === undefined ? [] : [`--${name}`, values[name]])),
      ...(process.argv.some((a) => a === '--port' || a.startsWith('--port=') || a === '-p') ? ['--port', values.port] : []),
    ],
  },
  // `--source` repeats, which the shared parser cannot hold (its `source` is emit's single string), so every
  // occurrence is read back from argv; --list, --out, --html and --drafts come back from the parsed values.
  {
    name: 'report',
    script: 'report.ts',
    extra: (values) => [
      ...(values.list ? ['--list'] : []),
      ...['out', 'html', 'drafts'].flatMap((name) => (values[name] === undefined ? [] : [`--${name}`, values[name]])),
      ...sourceArgs(process.argv),
    ],
  },
  // --name with its exact value, plus --files and --list: `share --list` is a flag, not a folder.
  {
    name: 'share',
    script: 'share.ts',
    extra: (values) => [
      ...(values.name === undefined ? [] : ['--name', values.name]),
      ...(values.files ? ['--files'] : []),
      ...(values.list ? ['--list'] : []),
    ],
  },
  // The script is shared with `share`: --unshare tells it which command this is, since it only sees the
  // arguments after the command word.
  { name: 'unshare', script: 'share.ts', extra: (values) => ['--unshare', ...(values.force ? ['--force'] : [])] },
  // `--target` defaults to claude in parseArgs (install-skill's default), so it is passed only when typed:
  // the hooks command then detects the harnesses on this machine. `--port` also has a default, so the same
  // argv check as export applies. `--project` and `--dry-run` are booleans stripped from the positionals.
  {
    name: 'hooks',
    script: 'hooks.ts',
    extra: (values) => [
      ...(process.argv.some((a) => a === '--target' || a.startsWith('--target=')) ? ['--target', values.target] : []),
      ...(values.project ? ['--project'] : []),
      ...(values['dry-run'] ? ['--dry-run'] : []),
      ...(process.argv.some((a) => a === '--port' || a.startsWith('--port=')) ? ['--port', values.port] : []),
    ],
  },
  // `library` is a TS command only with a subcommand (add/list/remove); see findTsCommand.
  { name: 'library', script: 'library.ts', extra: () => [] },
  // `--port` has a default in parseArgs, so it is passed only when typed: the service then takes the recorded port.
  {
    name: 'service',
    script: 'service.ts',
    extra: (values) => (process.argv.some((a) => a === '--port' || a.startsWith('--port=')) ? ['--port', values.port] : []),
  },
];

/** Every `--source <file>` and `--source=<file>` on the command line, in order, as `--source <file>` pairs. */
function sourceArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source') out.push('--source', args[++i]);
    else if (args[i].startsWith('--source=')) out.push('--source', args[i].slice('--source='.length));
  }
  return out;
}

/**
 * The TS command to run for these positionals, or undefined. A bare `library` (or one followed by a flag)
 * is not a subcommand: it serves the user's own towers, so it falls through to the serve path.
 */
export function findTsCommand(positionals) {
  const name = positionals[0];
  if (name === 'library') {
    const sub = positionals[1];
    if (sub === undefined || sub.startsWith('-')) return undefined;
  }
  return TS_COMMANDS.find((c) => c.name === name);
}

/**
 * Runs the entry's TypeScript script with the remaining positionals and its re-appended options,
 * output inherited. Returns the exit code for the caller to pass to process.exit.
 */
export function runTsCommand(pkgRoot, entry, positionals, values) {
  const script = join(pkgRoot, 'src', 'cli', entry.script);
  const args = [...positionals.slice(1), ...entry.extra(values)];
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', script, ...args], { stdio: 'inherit' });
  return r.status ?? 1;
}
