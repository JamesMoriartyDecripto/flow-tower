/**
 * The text of the service files (#194): the systemd user unit and the launchd plist, built from plain values.
 * Pure functions with no I/O, so the tests can check the exact text without touching a home folder. The
 * install and status code lives in service.ts, which re-exports these builders.
 */

/** The launchd label: the reverse-DNS name the plist and the launchctl calls use. */
export const AGENT_LABEL = 'dev.flowtower.library';

/**
 * Throws when a value holds a control character. A newline or carriage return would end the line it sits on
 * in the unit file (or split a plist value), so the value is refused rather than written with the break in it.
 */
function refuseControl(value: string): void {
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('value contains a control character (newline, carriage return, tab or similar); remove it from the path or the port');
  }
}

/**
 * One word for a systemd ExecStart or Environment= line (systemd.syntax): a value with spaces, quotes or
 * backslashes is double-quoted, with `\` and `"` escaped inside. `$` and `%` are doubled in every case, or
 * systemd would expand them as environment variables and unit specifiers.
 */
export function systemdWord(value: string): string {
  refuseControl(value);
  const escaped = value.replaceAll('%', '%%').replaceAll('$', '$$$$').replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return /[\s"\\]/.test(value) ? `"${escaped}"` : escaped;
}

/** XML text for a plist: the five predefined entities, so a `&` or `<` in a path stays data. */
export function xml(value: string): string {
  refuseControl(value);
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** The library's argv after the Node binary and the CLI script: the same command the hooks rely on. */
function libraryArgs(cli: string, port: number): string[] {
  return [cli, 'library', '--no-open', '--port', String(port)];
}

/** The systemd user unit. Restart=on-failure brings the library back after a crash, not after a clean stop. */
export function unitText({ node, cli, port, home }: { node: string; cli: string; port: number; home?: string }): string {
  const exec = [node, ...libraryArgs(cli, port)].map(systemdWord).join(' ');
  const env = home ? `Environment=${systemdWord(`FLOW_TOWER_HOME=${home}`)}\n` : '';
  return `[Unit]
Description=flow-tower library
After=network.target

[Service]
ExecStart=${exec}
${env}Restart=on-failure
# The library exits 143 (SIGTERM) or 130 (SIGINT) on purpose when stopped; systemd must read those as a clean stop, not a failure.
SuccessExitStatus=130 143

[Install]
WantedBy=default.target
`;
}

/**
 * The launchd agent. RunAtLoad starts it at login; KeepAlive with SuccessfulExit=false restarts it only when
 * it exits with a failure, the launchd equivalent of Restart=on-failure (a bare `true` would restart it even
 * after a clean stop). Output goes to one log file the user can read.
 */
export function plistText({ node, cli, port, home, logFile }: { node: string; cli: string; port: number; home?: string; logFile: string }): string {
  const args = [node, ...libraryArgs(cli, port)].map((a) => `    <string>${xml(a)}</string>`).join('\n');
  const env = home
    ? `  <key>EnvironmentVariables</key>\n  <dict>\n    <key>FLOW_TOWER_HOME</key>\n    <string>${xml(home)}</string>\n  </dict>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
${env}  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logFile)}</string>
</dict>
</plist>
`;
}
