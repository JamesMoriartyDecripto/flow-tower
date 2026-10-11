import { useEffect, useState } from 'react';
import { ago } from '../hub';
import { STATIC } from '../staticData';
import { Row } from './Settings';

/** `/api/version`: the daily check the server does in the background. `command` is only present for the local page. */
interface Version { current: string; latest?: string; url?: string; newer: boolean; checkedAt?: number; disabled?: boolean; command?: string; error?: 'offline' | 'unavailable' }
/** The forced check answers the same shape plus whether it replayed an answer inside the throttle window. */
interface VersionCheck extends Version { throttled?: boolean }

/** The top-bar chip reads `/api/version` itself: this event asks it to refresh after a forced check found a release. */
export const VERSION_EVENT = 'flow-tower:version';

/** GitHub tags carry the leading "v", package.json and the command do not: normalize so we never print "vv1.2.3". */
export const vtag = (v: string) => (v.startsWith('v') ? v : `v${v}`);

/** The one status line, in priority order: running, then why nothing came back, then what is available. */
export function statusOf(v: Version | undefined, busy: boolean, throttled: boolean): string {
  if (busy) return 'Checking…';
  const base = !v ? 'Up to date'
    : v.disabled ? 'Update check is off (FLOW_TOWER_NO_UPDATE_CHECK)'
    : v.error === 'offline' ? 'Could not reach GitHub'
    : v.error === 'unavailable' ? 'GitHub did not answer (try again later)'
    : v.newer && v.latest ? `${vtag(v.latest)} available`
    : 'Up to date';
  return `${base}${throttled ? ' (checked less than a minute ago)' : ''}`;
}

/**
 * Settings › Updates (#141): the installed version, the last check, the forced check and the local update command.
 * Loads `/api/version` when Settings opens (this section mounts with it), never on every render.
 */
export function UpdatesSection() {
  const [v, setV] = useState<Version>();
  const [busy, setBusy] = useState(false);
  const [throttled, setThrottled] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'manual'>();

  useEffect(() => {
    if (STATIC) return;
    void fetch('/api/version')
      .then((r) => (r.ok ? r.json() : undefined))
      .then((next?: Version) => { if (next) setV(next); })
      .catch(() => {});
  }, []);

  // "Copied" is a confirmation, not a state: put the button back after two seconds.
  useEffect(() => {
    if (copied !== 'ok') return;
    const t = setTimeout(() => setCopied(undefined), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (STATIC) return null;

  const check = () => {
    setBusy(true);
    setThrottled(false);
    setCopied(undefined);
    void fetch('/api/version/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((next?: VersionCheck) => {
        // 403 for a remote viewer: no answer to show, and the button was hidden for them anyway.
        if (!next) return;
        // Merge over the last read: a disabled answer omits `command`, which must stay for the local page.
        setV((prev) => ({ ...prev, ...next }));
        setThrottled(!!next.throttled);
        if (next.newer) window.dispatchEvent(new Event(VERSION_EVENT));
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const copy = () => {
    if (!v?.command) return;
    if (!navigator.clipboard) return setCopied('manual');
    navigator.clipboard.writeText(v.command).then(() => setCopied('ok')).catch(() => setCopied('manual'));
  };

  const status = statusOf(v, busy, throttled);
  return (
    <section id="settings-updates">
      <h3>Updates</h3>
      <Row label="Installed" hint="The version you are running.">
        <span className="mono dim">{v ? vtag(v.current) : '—'}</span>
      </Row>
      {v?.latest && (
        <Row label="Latest" hint="The newest release published on GitHub.">
          <span className="mono dim">{vtag(v.latest)}</span>
          {v.url && <a className="updates-link" href={v.url} target="_blank" rel="noopener noreferrer" title="Open the release notes on GitHub">Release notes</a>}
        </Row>
      )}
      {v?.checkedAt !== undefined && (
        <Row label="Checked" hint="When the last successful check ran.">
          <span className="mono dim">{ago(Date.now() - v.checkedAt)}</span>
        </Row>
      )}
      <Row label="Status" hint="The outcome of the last check.">
        <span className="mono dim">{status}</span>
      </Row>
      {/* No `command` means a remote viewer: the forced check is refused with 403 for them, so hide the button. */}
      {v?.command && (
        <Row label="Check now" hint="Ask GitHub right now instead of waiting for the daily check.">
          <button className="btn" onClick={check} disabled={busy} title="Check GitHub for a newer release now">{busy ? 'Checking…' : 'Check for updates'}</button>
        </Row>
      )}
      {v?.command && (
        <Row label="Update command" hint="Run this in your flow-tower folder to update.">
          <div className="updates-cmd">
            <code>{v.command}</code>
            <button className="btn" onClick={copy} title={copied === 'manual' ? 'Copy is unavailable: select the command and copy it yourself' : 'Copy the update command'}>
              {copied === 'ok' ? 'Copied' : copied === 'manual' ? 'Select and copy it' : 'Copy'}
            </button>
          </div>
        </Row>
      )}
    </section>
  );
}
