/** Types for scripts/tasks.mjs: the example stays plain JS, and this is what its TypeScript test sees. */

export interface Task {
  file: string;
  dir: string;
  id: string;
  category: string;
  check: string;
  command?: string;
  rubric: boolean;
  tools: string[];
  files: string[];
  steps: number;
  title: string;
  endpoint: string;
  images: string[];
  audio: string;
  prompt: string;
  expected: string;
  requestText: string;
  request: Record<string, unknown> | null;
}

export const CHECKS: string[];
export const ENDPOINTS: string[];
export function mimeOf(name: string): string | undefined;
export function blocks(text: string, lang: string): string[];
export function loadTask(file: string): Task;
export function taskProblems(t: Task): string[];
export function loadTasks(path: string): Task[];
