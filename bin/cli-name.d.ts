/** Types for bin/cli-name.js: the command name a hint prints (#193). */

/** The hint suffix for the other machine: its checkout is unknown here. */
export declare const OTHER_MACHINE_SUFFIX: string;
/** `flow-tower` plus the other-machine suffix, for the server side's hints. */
export declare const OTHER_MACHINE_CLI: string;

/** A path as one shell word: quoted when it has a space. */
export declare function shellPath(path: string): string;

/** `flow-tower` when it works from PATH, else `node <checkout>/bin/flow-tower.js`. */
export declare function cliName(options?: { env?: NodeJS.ProcessEnv; checkout?: string }): string;
