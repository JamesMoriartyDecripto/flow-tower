// Project skills (#432): a named Markdown file in tools/squad/skills/ that a role or one task opts into, so the know-how
// only some jobs need is not repeated by hand in every task file. Read here, never run: a skill is text in the prompt.
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A name, never a path: no slash, no dot (so no "..", no hidden or secret file, no extension).
export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const SKILL_MAX_BYTES = 4096;
export const SKILLS_MAX_BYTES = 12288;

export function skillsDir(repo) {
  return join(repo, 'tools', 'squad', 'skills');
}

// The last "Skills:" line of a task names its skills, so a late line wins over an earlier one.
export function taskSkills(task) {
  const lines = String(task ?? '').split('\n').filter((l) => l.startsWith('Skills:'));
  if (lines.length === 0) return [];
  return lines[lines.length - 1].slice('Skills:'.length).split(',').map((s) => s.trim()).filter(Boolean);
}

// lstat does not follow links, so a symlink is seen as a link and never read from outside the repo.
// A missing entry is undefined; any other error is real and is raised.
function entry(path) {
  try { return lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return undefined; throw e; }
}

// The prompt text for the skills a role and a task name. No skill gives '' so the prompt is unchanged.
export function skillsFor(repo, config, role, task) {
  const names = [...new Set([...(config.skills?.[role] ?? []), ...taskSkills(task)])];
  if (names.length === 0) return '';
  const dir = skillsDir(repo);
  const dirStat = entry(dir);
  if (dirStat && (dirStat.isSymbolicLink() || !dirStat.isDirectory())) throw new Error('tools/squad/skills is a symlink or not a folder');
  let total = 0;
  let out = '\n\nProject skills (apply them where they fit the task):';
  for (const name of names) {
    if (!SKILL_NAME.test(name)) throw new Error(`bad skill name: "${name}"`);
    const st = entry(join(dir, `${name}.md`));
    if (!st) throw new Error(`skill not found: ${name} (tools/squad/skills/${name}.md)`);
    if (st.isSymbolicLink() || !st.isFile()) throw new Error(`skill ${name} is not a regular file`);
    if (st.size > SKILL_MAX_BYTES) throw new Error(`skill ${name} is ${st.size} bytes, over the ${SKILL_MAX_BYTES} cap`);
    total += st.size;
    if (total > SKILLS_MAX_BYTES) throw new Error(`skill ${name} brings the skills to ${total} bytes, over the ${SKILLS_MAX_BYTES} cap`);
    out += `\n\n## ${name}\n${readFileSync(join(dir, `${name}.md`), 'utf8').trim()}`;
  }
  return out;
}
