/** Types for scripts/tasks.mjs: the example stays plain JS, and this is what its TypeScript test sees. */

export const CHECKS: string[];

/** One task file, as loadTask reads it. */
export interface Task {
  file: string;
  dir: string;
  id: string;
  category: string;
  check?: string;
  command?: string;
  rubric: boolean;
  tools: string[];
  files: string[];
  images: string[];
  steps: number;
  title: string;
  prompt: string;
  expected: string;
}

export function blocks(text: string, lang: string): string[];
export function loadTask(file: string): Task;
export function taskProblems(t: Task): string[];
/** Plain prompt when there are no images; otherwise the text part, then one image_url part per image. */
export function userContent(t: Task): string | { type: string; [key: string]: unknown }[];
export function loadTasks(path: string): Task[];
