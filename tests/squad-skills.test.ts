import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// The squad's skills loader is plain ESM with no types, so it is imported as an untyped module here.
import { SKILLS_MAX_BYTES, skillsFor, taskSkills } from '../tools/squad/skills.mjs';

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

// A temp repo whose tools/squad/skills/ holds the given name -> text files.
function repoWithSkills(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-skills-'));
  made.push(dir);
  const skills = join(dir, 'tools', 'squad', 'skills');
  mkdirSync(skills, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(skills, `${name}.md`), text);
  return dir;
}

describe('squad skills (#432)', () => {
  it('with no skill named the prompt gets an empty string', () => {
    const repo = repoWithSkills({ tests: 'Write tests first.' });
    expect(skillsFor(repo, { skills: {} }, 'coder', 'Do it.')).toBe('');
  });

  it('a role skill reaches only that role', () => {
    const repo = repoWithSkills({ tests: 'Write tests first.' });
    const config = { skills: { coder: ['tests'] } };
    expect(skillsFor(repo, config, 'coder', 'Do it.')).toContain('## tests\nWrite tests first.');
    expect(skillsFor(repo, config, 'reviewer', 'Do it.')).toBe('');
  });

  it('a Skills: line in the task adds its skill, and the last such line wins', () => {
    expect(taskSkills('Goal\nSkills: a, b,\nSkills: c')).toEqual(['c']);
    expect(taskSkills('Goal')).toEqual([]);
    const repo = repoWithSkills({ tests: 'T', shell: 'S' });
    expect(skillsFor(repo, { skills: {} }, 'coder', 'Skills: shell')).toContain('## shell\nS');
  });

  it('a skill named by the role and the task appears once', () => {
    const repo = repoWithSkills({ tests: 'T' });
    const out = skillsFor(repo, { skills: { coder: ['tests'] } }, 'coder', 'Skills: tests');
    expect(out.split('## tests').length - 1).toBe(1);
  });

  it.each(['../x', 'a/b', '.hidden', 'X'])('refuses the bad name "%s"', (name) => {
    const repo = repoWithSkills();
    expect(() => skillsFor(repo, { skills: { coder: [name] } }, 'coder', '')).toThrow(`bad skill name: "${name}"`);
  });

  it('refuses a missing skill, naming it', () => {
    const repo = repoWithSkills();
    expect(() => skillsFor(repo, { skills: { coder: ['tests'] } }, 'coder', '')).toThrow('skill not found: tests (tools/squad/skills/tests.md)');
  });

  it('refuses a skill over 4096 bytes, naming the size', () => {
    const repo = repoWithSkills({ big: 'x'.repeat(4097) });
    expect(() => skillsFor(repo, { skills: { coder: ['big'] } }, 'coder', '')).toThrow('skill big is 4097 bytes, over the 4096 cap');
  });

  it('refuses skills that add up over 12288 bytes', () => {
    const repo = repoWithSkills({ a: 'x'.repeat(4000), b: 'x'.repeat(4000), c: 'x'.repeat(4000), d: 'x'.repeat(4000) });
    expect(() => skillsFor(repo, { skills: { coder: ['a', 'b', 'c', 'd'] } }, 'coder', '')).toThrow(`over the ${SKILLS_MAX_BYTES} cap`);
  });

  it('refuses a skill that is a symlink, never reading it', () => {
    const repo = repoWithSkills();
    const outside = join(repo, 'secret.txt');
    writeFileSync(outside, 'secret');
    symlinkSync(outside, join(repo, 'tools', 'squad', 'skills', 'link.md'));
    expect(() => skillsFor(repo, { skills: { coder: ['link'] } }, 'coder', '')).toThrow('skill link is not a regular file');
  });

  it('refuses a skills folder that is a symlink', () => {
    const repo = repoWithSkills();
    const other = mkdtempSync(join(tmpdir(), 'squad-skills-other-'));
    made.push(other);
    writeFileSync(join(other, 'tests.md'), 'T');
    rmSync(join(repo, 'tools', 'squad', 'skills'), { recursive: true, force: true });
    symlinkSync(other, join(repo, 'tools', 'squad', 'skills'));
    expect(() => skillsFor(repo, { skills: { coder: ['tests'] } }, 'coder', '')).toThrow('tools/squad/skills is a symlink or not a folder');
  });
});
