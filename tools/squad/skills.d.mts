// Types for the project skills loader (skills.mjs), so the TypeScript side imports the same loader without any.
// Keep in step with skills.mjs: the runtime file is the source of truth.
export const SKILL_NAME: RegExp;
export const SKILL_MAX_BYTES: number;
export const SKILLS_MAX_BYTES: number;
export function skillsDir(repo: string): string;
export function taskSkills(task: string): string[];
export function skillsFor(repo: string, config: { skills?: Record<string, string[]> }, role: string, task: string): string;
