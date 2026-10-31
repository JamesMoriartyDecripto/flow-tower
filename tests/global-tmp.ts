// Gives each test run its own temp folder and removes it afterwards (#357).
// Before this, 24 test files used mkdtempSync(join(tmpdir(), ...)) and never
// cleaned up; a squad test copies about 38 MB per run, and 2205 leftover
// /tmp/squad-* folders filled the /tmp quota. Instead of touching every test,
// the run sets TMPDIR to a folder of its own, and the teardown removes it.
// Tests that need a folder outside any git checkout still get one, because
// the base folder is the system temp dir, which is outside the repo.
import { lstatSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

const PREFIX = 'flow-tower-tests-';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Runs once in the main process before the workers start; workers and the
// child processes they spawn inherit the environment set here.
export default function globalTmp(): () => void {
  // Read the base before changing TMPDIR, so the new folder lands in the
  // real system temp dir rather than inside a previous run's folder.
  const base = tmpdir();

  // Leftovers from runs that crashed before their teardown. Only folders
  // older than a day are removed, so a concurrent run's folder is safe.
  const now = Date.now();
  for (const name of readdirSync(base)) {
    if (!name.startsWith(PREFIX)) continue;
    const path = join(base, name);
    try {
      // lstat, not stat: the base is shared, so another user could plant a
      // symlink named like ours. stat would follow it and could age the
      // target, and the recursive rm would then reach a folder we do not own.
      // A symlink is not a directory under lstat, so it is skipped too.
      const st = lstatSync(path);
      if (!st.isDirectory()) continue;
      if (now - st.mtimeMs < MAX_AGE_MS) continue;
      rmSync(path, { recursive: true, force: true });
    } catch {
      // One bad entry must not stop the cleanup of the others.
    }
  }

  const dir = mkdtempSync(join(base, PREFIX));
  const saved = {
    TMPDIR: env.TMPDIR,
    TMP: env.TMP,
    TEMP: env.TEMP,
  };
  // TMP and TEMP are read by some Windows tools, so they point at the same folder.
  env.TMPDIR = dir;
  env.TMP = dir;
  env.TEMP = dir;

  return () => {
    restore('TMPDIR', saved.TMPDIR);
    restore('TMP', saved.TMP);
    restore('TEMP', saved.TEMP);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`could not remove test temp folder ${dir}:`, error);
    }
  };
}

// Put back a variable exactly as it was; an unset variable is deleted, not set to "undefined".
function restore(key: 'TMPDIR' | 'TMP' | 'TEMP', value: string | undefined): void {
  if (value === undefined) delete env[key];
  else env[key] = value;
}
