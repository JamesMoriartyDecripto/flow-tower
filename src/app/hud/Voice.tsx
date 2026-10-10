import { STATIC } from '../staticData';
import { useVoice } from '../voice/voice';
import { usePrefs } from '../settings';

const STATUS = {
  off: 'Voice commands (V)',
  starting: 'Starting the microphone…',
  listening: 'Listening: say a command (V to stop)',
  hearing: 'Hearing you…',
  thinking: 'Working…',
} as const;

/** Mic toggle, in the top bar and in the library header. The static demo has no server, so no voice. */
export function MicButton() {
  const { status, toggle } = useVoice();
  if (STATIC) return null;
  return (
    <button className={`btn mic ${status}`} onClick={toggle} aria-pressed={status !== 'off'} title={STATUS[status]}>
      <i />MIC
    </button>
  );
}

/** Settings, scrolled to Voice where the suggestions wait (after the dialog has focused its first control). */
function openVoiceSettings() {
  usePrefs.getState().set({ open: true });
  setTimeout(() => document.getElementById('settings-voice')?.scrollIntoView({ block: 'start' }), 50);
}

/** What was heard and what it did, under the top bar, above the library too. */
export function VoiceCaption() {
  const { status, heard, did, error, cloud, suggestions, toggle, dismiss } = useVoice();
  // Off, the caption stays for an error or for suggestions from the review that ran at mic-off (#68).
  if (STATIC || (status === 'off' && !error && !suggestions)) return null;
  return (
    <div className={`panel voice-caption ${status}`} role="status" aria-live="polite">
      <button className="voice-close" onClick={error || status === 'off' ? dismiss : toggle} aria-label={error || status === 'off' ? 'Dismiss' : 'Stop listening'} title={error || status === 'off' ? 'Dismiss' : 'Stop listening (V)'}>✕</button>
      <div className="voice-state">
        <i />{status === 'off' ? 'Voice off' : STATUS[status]}
        {cloud && <span className="chip" title="OpenRouter (zero data retention) transcribes the audio, answers questions and speaks the replies; plain navigation is matched in the page">CLOUD STT</span>}
        {!!suggestions && <button className="chip voice-chip" title="Suggestions from the voice journal: accept or reject them in Settings > Voice" onClick={openVoiceSettings}>{suggestions} SUGGESTION{suggestions > 1 ? 'S' : ''}</button>}
      </div>
      {heard && <div className="voice-heard">“{heard}” <b>→ {did}</b></div>}
      {!heard && status === 'listening' && <div className="dim">“apri dev squad” · “livello 2” · “vai al nodo triage” · “vista mappa” · “indietro”</div>}
      {error && <div className="voice-error">{error}</div>}
    </div>
  );
}
