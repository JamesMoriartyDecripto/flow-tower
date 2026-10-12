/**
 * The app version, read from package.json when the bundle is built: the printed footer names the
 * build, and no date is printed, so the same tower gives the same file.
 */
const pkg = import.meta.glob('../../../package.json', { eager: true, import: 'default' });
const json = Object.values(pkg)[0] as { version?: string } | undefined;

export const APP_VERSION: string = json?.version ?? 'unknown';
