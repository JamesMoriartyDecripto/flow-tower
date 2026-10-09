// Play staged rollout and App Store phased release controls, shared by the crash guard and
// the release manager. Every call that widens exposure needs an approval id (release guard).
// Usage: tsx scripts/play-rollout.ts <fraction|halt|resume> <versionCode> [approvalId]
import { readFileSync } from 'node:fs';
import { argv, env, exit } from 'node:process';
import { google } from 'googleapis';
import { importPKCS8, SignJWT } from 'jose';

const PACKAGE = 'com.example.leafwise';

function play() {
  // Service account JSON mounted by CI; path given by name, never inlined.
  const auth = new google.auth.GoogleAuth({
    keyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  return google.androidpublisher({ version: 'v3', auth });
}

type Status = 'inProgress' | 'halted' | 'completed';

// One edit per change: insert, update the production track, commit.
export async function setPlayRollout(versionCode: string, status: Status, fraction?: number) {
  const api = play();
  const { data: edit } = await api.edits.insert({ packageName: PACKAGE });
  const editId = edit.id!;
  await api.edits.tracks.update({
    packageName: PACKAGE,
    editId,
    track: 'production',
    requestBody: {
      track: 'production',
      // Halting must omit userFraction; completing sends no fraction either.
      releases: [{ versionCodes: [versionCode], status, ...(status === 'inProgress' ? { userFraction: fraction } : {}) }],
    },
  });
  await api.edits.commit({ packageName: PACKAGE, editId });
}

// App Store Connect API: ES256 JWT valid for at most 20 minutes, minted per run.
async function ascToken(): Promise<string> {
  const key = await importPKCS8(readFileSync(env.ASC_API_KEY_PATH!, 'utf8'), 'ES256');
  return new SignJWT({ aud: 'appstoreconnect-v1' })
    .setProtectedHeader({ alg: 'ES256', kid: env.ASC_KEY_ID!, typ: 'JWT' })
    .setIssuer(env.ASC_ISSUER_ID!)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);
}

export async function setPhasedRelease(phasedReleaseId: string, state: 'PAUSED' | 'ACTIVE') {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/appStoreVersionPhasedReleases/${phasedReleaseId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await ascToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { type: 'appStoreVersionPhasedReleases', id: phasedReleaseId, attributes: { phasedReleaseState: state } } }),
  });
  if (!res.ok) throw new Error(`App Store Connect ${res.status}: ${await res.text()}`);
}

if (argv[1]?.endsWith('play-rollout.ts')) {
  const [action, versionCode, approvalId] = argv.slice(2);
  const fraction = Number(action);
  if (!versionCode) exit(2);
  if (action === 'halt') await setPlayRollout(versionCode, 'halted'); // safe direction: no approval needed
  else if (!approvalId) {
    console.error('widening a rollout needs an approval id');
    exit(3);
  } else if (action === 'resume') await setPlayRollout(versionCode, 'inProgress', 0.01);
  else if (fraction > 0 && fraction < 1) await setPlayRollout(versionCode, 'inProgress', fraction);
  else if (fraction === 1) await setPlayRollout(versionCode, 'completed');
  console.log(JSON.stringify({ at: new Date().toISOString(), action, versionCode, approvalId }));
}
