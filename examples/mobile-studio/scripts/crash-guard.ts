// Crash-rate guard, every 30 minutes during a rollout. Halting is automatic (the safe
// direction); resuming always needs a person. Thresholds: studio target for crash-free
// sessions, Android vitals bad-behavior thresholds for user-perceived crash and ANR rates.
import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { setPhasedRelease, setPlayRollout } from './play-rollout.ts';

const T = { crashFreeSessions: 99.5, userPerceivedCrashRate: 1.09, anrRate: 0.47, minSessions: 2000 };
const state = JSON.parse(readFileSync('logs/rollout-state.json', 'utf8')) as {
  version: string; androidVersionCode: string; iosPhasedReleaseId: string;
};

// Crash-free sessions per platform from the Crashlytics + Analytics BigQuery exports (last 24 h);
// a fatal event ends its session, so fatal events approximate crashed sessions.
async function crashFree(platform: 'IOS' | 'ANDROID') {
  const [rows] = await new BigQuery().query({
    query: `
      WITH s AS (SELECT COUNT(*) n FROM \`leafwise.analytics_000000.events_*\`
                 WHERE event_name = 'session_start' AND app_info.version = @v AND platform = @p
                   AND TIMESTAMP_MICROS(event_timestamp) > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)),
           c AS (SELECT COUNT(*) n FROM \`leafwise.firebase_crashlytics.com_example_leafwise_${platform}\`
                 WHERE is_fatal AND application.display_version = @v
                   AND event_timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR))
      SELECT s.n AS sessions, 100 * (1 - SAFE_DIVIDE(c.n, s.n)) AS crash_free FROM s, c`,
    params: { v: state.version, p: platform },
  });
  return rows[0] as { sessions: number; crash_free: number };
}

// Android vitals from the Play Developer Reporting API, hourly, filtered to the new versionCode.
async function vitals() {
  const auth = new google.auth.GoogleAuth({ keyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, scopes: ['https://www.googleapis.com/auth/playdeveloperreporting'] });
  const api = google.playdeveloperreporting({ version: 'v1beta1', auth });
  const range = { aggregationPeriod: 'HOURLY', startTime: hoursAgo(24), endTime: hoursAgo(1) };
  const q = { dimensions: ['versionCode'], filter: `versionCode = ${state.androidVersionCode}`, timelineSpec: range };
  const crash = await api.vitals.crashrate.query({ name: 'apps/com.example.leafwise/crashRateMetricSet', requestBody: { ...q, metrics: ['userPerceivedCrashRate'] } });
  const anr = await api.vitals.anrrate.query({ name: 'apps/com.example.leafwise/anrRateMetricSet', requestBody: { ...q, metrics: ['userPerceivedAnrRate'] } });
  const last = (r: typeof crash) => Number(r.data.rows?.at(-1)?.metrics?.[0]?.decimalValue?.value ?? 0) * 100;
  return { crashRate: last(crash), anrRate: last(anr) };
}

function hoursAgo(h: number) {
  const d = new Date(Date.now() - h * 3600_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hours: d.getUTCHours(), timeZone: { id: 'UTC' } };
}

const [ios, android, v] = await Promise.all([crashFree('IOS'), crashFree('ANDROID'), vitals()]);
const reasons: string[] = [];
if (ios.sessions >= T.minSessions && ios.crash_free < T.crashFreeSessions) reasons.push(`iOS crash-free ${ios.crash_free.toFixed(2)}%`);
if (android.sessions >= T.minSessions && android.crash_free < T.crashFreeSessions) reasons.push(`Android crash-free ${android.crash_free.toFixed(2)}%`);
if (v.crashRate > T.userPerceivedCrashRate) reasons.push(`user-perceived crash rate ${v.crashRate.toFixed(2)}%`);
if (v.anrRate > T.anrRate) reasons.push(`ANR rate ${v.anrRate.toFixed(2)}%`);

if (reasons.length) {
  await Promise.all([setPlayRollout(state.androidVersionCode, 'halted'), setPhasedRelease(state.iosPhasedReleaseId, 'PAUSED')]);
  await fetch(env.SLACK_ONCALL_WEBHOOK!, { method: 'POST', body: JSON.stringify({ text: `Rollout ${state.version} halted: ${reasons.join('; ')}. Kill switch approval requested.` }) });
}
console.log(JSON.stringify({ at: new Date().toISOString(), ios, android, ...v, halted: reasons.length > 0, reasons }));
