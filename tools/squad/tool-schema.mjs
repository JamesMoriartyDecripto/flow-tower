// The tool list the model is offered by the tool loop (run.mjs). Pure: what a role may call, and how each tool is described,
// follow from the role, its write folders and the commands the project offers. So the rules are tested without spawning
// the runner. The descriptors are the wording the model was given; change them only with a test that says why.
import { canWrite } from './roles.mjs';

const fn = (name, description, properties, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const S = { type: 'string' };

// runNames are the command names the project offers (the keys of run.mjs RUNS). Only those are named, so a dryrun that
// the extras leave out is not advertised. base is the diff base from the repo's config.
export function toolSchema({ role, dirs, runNames, base }) {
  const offers = (n) => runNames.includes(n);
  return [
    fn('list_files', 'Tracked files under a folder.', { dir: S }),
    fn('read_file', 'Read a repo file with line numbers (optionally a line range).', { path: S, from: { type: 'integer' }, to: { type: 'integer' } }, ['path']),
    fn('grep', 'git grep -n -E over tracked files.', { pattern: S, path: S }, ['pattern']),
    ...(canWrite(role) ? [
      fn('edit_file', `Replace one exact, unique occurrence of \`old\` with \`new\` (${dirs.join('/, ')}/ only).`, { path: S, old: S, new: S }, ['path', 'old', 'new']),
      fn('write_file', `Create or overwrite a file (${dirs.join('/, ')}/ only).`, { path: S, content: S }, ['path', 'content']),
      fn('delete_file', 'Delete a file you may write (e.g. one the task says to remove).', { path: S }, ['path']),
    ] : []),
    fn('run', [
      `Run a whitelisted command: ${runNames.join(', ')}.`,
      ...(offers('test') ? ['test takes a file.'] : []),
      `diff is vs ${base}.`,
      ...(offers('dryrun') ? ['dryrun (file: examples/<name>/scripts/<script>.mjs) runs it with --dry-run and no API key.'] : []),
    ].join(' '), { command: { type: 'string', enum: runNames }, file: S }, ['command']),
    fn('finish', 'End with your final report (the format your task asks for).', { report: S }, ['report']),
  ];
}
