/**
 * Webhook notices for the hub's alerts (#191): a lead learns of an alert with no tab open. Pure formatting
 * plus one POST. The url is a secret in practice (a Slack or Telegram token sits in its path), so it is
 * never put in an error, a log line or a return value: a failure says only what went wrong.
 */
import type { Alert, Rule } from './alerts.ts';
import type { Config } from './config.ts';

export type NotifyConfig = NonNullable<Config['notify']>;
/**
 * What formatMessage accepts: a real alert, or the panel's test alert. `test` is not in RULES on purpose: it must
 * not become a toggle in the alerts settings, only a rule name a receiver can tell apart from a real one.
 */
export type NotifyAlert = Omit<Alert, 'rule'> & { rule: Rule | 'test' };
export type NotifyFormat = NotifyConfig['format'];
export type NotifyEvent = 'open' | 'clear';

export interface Payload {
  headers: Record<string, string>;
  body: string;
}

export interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** The fetch the sender uses; a test passes a fake, the notifier passes the global one. */
export type FetchLike = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; redirect: 'error'; signal: AbortSignal }) => Promise<{ status: number }>;

/** A webhook that has not answered in this long is given up on: a hung hook must not stall the ticker. */
export const NOTIFY_TIMEOUT_MS = 5_000;

/**
 * The message as a person reads it. Only the alert's own message: never event content, a prompt or a user
 * name, which the alert text already keeps out (see alerts.ts).
 */
const text = (alert: NotifyAlert, event: NotifyEvent): string =>
  event === 'open' ? `⚠ ${alert.message}` : `✓ cleared: ${alert.message}`;

/**
 * The request for one event in the format the receiver expects. json carries the alert's fields and the hub
 * name; slack and telegram take `{ text }` (telegram's chat_id travels in the url the user pastes); ntfy is
 * a plain-text body, with the title and priority as headers. Pure: the same input always gives the same payload.
 */
export function formatMessage(alert: NotifyAlert, event: NotifyEvent, format: NotifyFormat, hub = 'hub'): Payload {
  if (format === 'json') {
    const body = { event, alert: { id: alert.id, rule: alert.rule, level: alert.level, subject: alert.subject, message: alert.message }, hub };
    return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }
  if (format === 'ntfy') {
    // Headers are ASCII-only on the wire, so the title is plain; the emoji lives in the body.
    return {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: event === 'open' ? 'Flow Tower alert' : 'Flow Tower alert cleared',
        Priority: alert.level === 'critical' ? 'high' : 'default',
      },
      body: text(alert, event),
    };
  }
  // slack and telegram both read a `text` field.
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text(alert, event) }) };
}

/**
 * POSTs one payload to the webhook. Never throws and never returns the url: the error is a fixed word, so a
 * token in the url cannot leak through a log that prints the result.
 */
export async function sendNotification(notify: NotifyConfig, payload: Payload, fetchFn: FetchLike = globalThis.fetch as FetchLike): Promise<SendResult> {
  try {
    // redirect: 'error' so a webhook cannot bounce the POST to another host or scheme (SSRF).
    const res = await fetchFn(notify.url, {
      method: 'POST',
      headers: payload.headers,
      body: payload.body,
      redirect: 'error',
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
    // A 3xx that came back anyway is refused the same way, whatever the fetch did with it.
    if (res.status >= 300 && res.status < 400) return { ok: false, error: 'redirect refused' };
    return res.status >= 200 && res.status < 300 ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `http ${res.status}` };
  } catch (err) {
    // fetch reports a refused redirect as a TypeError whose cause names it; only that cause is read.
    const cause = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
    if (cause instanceof Error && /redirect/i.test(cause.message)) return { ok: false, error: 'redirect refused' };
    // The error object may quote the url (fetch does so in some messages): only its name is kept.
    const name = err instanceof Error ? err.name : 'error';
    return { ok: false, error: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'request failed' };
  }
}
