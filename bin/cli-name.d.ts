/** Types for bin/cli-name.js: the command name a hint prints (#193). */

/** The hint suffix for the other machine: its checkout is unknown here. */
export declare const OTHER_MACHINE_SUFFIX: string;
/** `flow-tower` plus the other-machine suffix, for the server side's hints. */
export declare const OTHER_MACHINE_CLI: string;

/** POSIX single-quote a value; an embedded `'` becomes `'\''`. */
export declare function shellQuote(value: string): string;
/** A path as one shell word: single-quoted only when it has a character outside the safe set. */
export declare function shellPath(path: string): string;

/** `flow-tower` when it works from PATH, else `node <checkout>/bin/flow-tower.js`. */
export declare function cliName(options?: { env?: NodeJS.ProcessEnv; checkout?: string }): string;
