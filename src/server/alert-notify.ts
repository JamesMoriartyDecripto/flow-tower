/**
 * Webhook notices for the hub's alerts (#191): a lead learns of an alert with no tab open. Pure formatting
 * plus one POST. The url is a secret in practice (a Slack or Telegram token sits in its path), so it is
 * never put in an error, a log line or a return value: a failure says only what went wrong.
 */
import type { Alert } from './alerts.ts';
import type { Config } from './config.ts';

export type NotifyConfig = NonNullable<Config['notify']>;
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
export type FetchLike = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number }>;

/** A webhook that has not answered in this long is given up on: a hung hook must not stall the ticker. */
export const NOTIFY_TIMEOUT_MS = 5_000;

/**
 * The message as a person reads it. Only the alert's own message: never event content, a prompt or a user
 * name, which the alert text already keeps out (see alerts.ts).
 */
const text = (alert: Alert, event: NotifyEvent): string =>
  event === 'open' ? `⚠ ${alert.message}` : `✓ cleared: ${alert.message}`;

/**
 * The request for one event in the format the receiver expects. json carries the alert's fields and the hub
 * name; slack and telegram take `{ text }` (telegram's chat_id travels in the url the user pastes); ntfy is
 * a plain-text body, with the title and priority as headers. Pure: the same input always gives the same payload.
 */
export function formatMessage(alert: Alert, event: NotifyEvent, format: NotifyFormat, hub = 'hub'): Payload {
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
    const res = await fetchFn(notify.url, {
      method: 'POST',
      headers: payload.headers,
      body: payload.body,
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
    return res.status >= 200 && res.status < 300 ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `http ${res.status}` };
  } catch (err) {
    // The error object may quote the url (fetch does so in some messages): only its name is kept.
    const name = err instanceof Error ? err.name : 'error';
    return { ok: false, error: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'request failed' };
  }
}
