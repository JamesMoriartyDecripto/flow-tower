export interface RunArgs {
  demo: string;
  mode: 'dry' | 'pilot' | 'final';
  headed: boolean;
}

export interface Voice {
  model: string;
  voice: string;
  /** Reply format of the speech endpoint; defaults to mp3. */
  format?: 'mp3' | 'pcm';
}

export interface Tutorial {
  app: { command: string[]; url: string; homeEnv?: string };
  voices: Voice[];
  pilotUntil: string;
}

export interface Run {
  name: string;
  env: Record<string, string>;
}

/** Allowed demo names: lower-case letters, digits and dashes, safe as a path segment. */
export const DEMO_NAME: RegExp;

/** Parses process.argv.slice(2); throws the usage message on bad input. */
export function parseArgs(argv: string[]): RunArgs;

/** Returns the config unchanged, or throws `tutorial.json: <what is wrong>`. */
export function checkTutorial<T>(t: T): T;

/** Lower-case, dash-separated form of a model id, safe as a folder name. */
export function slug(model: string): string;

export function planRuns(tutorial: Tutorial, mode: RunArgs['mode']): Run[];

/** Scenes up to and including `until`; throws when it is not a scene of the manifest. */
export function pilotScenes<T extends { scene: string }>(manifest: T[], until: string): T[];

/** Replaces each `${NAME}` in every argument with vars[NAME]. */
export function expandCommand(command: string[], vars: Record<string, string | undefined>): string[];

/** Distinct home, host and user values of at least 3 characters, in that order. */
export function forbiddenStrings(s: { user?: string; host?: string; home?: string }): string[];
