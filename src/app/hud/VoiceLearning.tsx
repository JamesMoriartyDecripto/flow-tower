import { useEffect, useState } from 'react';
import { usePrefs } from '../settings';
import { decide, loadMemory, review, type Memory, type Stats } from '../voice/journal';
import { useVoice } from '../voice/voice';
import { Row, Toggle } from './Settings';

/**
 * Settings > Voice > Learning (#68): the opt-in journal, how voice did this week, and the suggestions
 * from reviews of past sessions, which change nothing until accepted here. Everything is stored in the
 * user's folder (~/.config/flow-tower), never in a repo.
 */
export function VoiceLearning() {
  const on = usePrefs((s) => s.voiceJournal);
  const [data, setData] = useState<{ memory: Memory; stats: Stats }>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void loadMemory().then(setData); }, [on]);

  const act = async (label: string, run: () => Promise<{ memory: Memory; stats: Stats } | undefined>) => {
    setBusy(label);
    setError('');
    try {
      const out = await run();
      if (out) setData(out);
      useVoice.setState({ suggestions: out?.memory.pending.length || undefined });
    } catch (err) {
      setError(`Failed: ${(err as Error).message}`); // shown in the hint; the buttons work again
    } finally {
      setBusy('');
    }
  };
  const s = data?.stats;
  const m = data?.memory;

  return (
    <>
      <Row label="Learn from my sessions" hint="Keeps a journal of what you say and what happened (text only, never audio) in ~/.config/flow-tower, outside every repo. Reviews send the new part to OpenRouter (zero data retention) and propose improvements you accept or reject here.">
        <Toggle on={on} onChange={(voiceJournal) => usePrefs.getState().set({ voiceJournal })} />
      </Row>
      {s && s.turns > 0 && (
        <p className="set-hint voice-stats">
          Last {s.days} days: {s.turns} turns · {s.notUnderstood}% not understood · {s.corrected}% corrected · {s.undone}% undone · {s.interrupted}% interrupted
          {s.agentMs ? ` · answers in ${(s.agentMs / 1000).toFixed(1)} s` : ''}
          {s.firstAudioMs ? ` · first audio after ${(s.firstAudioMs / 1000).toFixed(1)} s` : ''}
          {s.sttMs ? ` · transcribed in ${(s.sttMs / 1000).toFixed(1)} s` : ''}
          {s.cost ? ` · $${s.cost.toFixed(4)} ($${(s.costPerTurn ?? 0).toFixed(5)} a turn)` : ''}
          {s.reviews ? ` · ${s.reviews} review${s.reviews > 1 ? 's' : ''} $${s.reviewCost.toFixed(4)}` : ''}
        </p>
      )}
      {m && m.pending.length > 0 && (
        <div className="voice-suggestions">
          <div className="set-label">Suggestions</div>
          {m.pending.map((p) => (
            <div key={p.id} className="voice-suggestion">
              <span>
                {p.kind === 'alias' ? <>When I hear “{p.heard}”, it means <b>{p.means}</b></> : <><i>{p.kind}</i> {p.text}</>}
                <span className="set-hint"> {p.why}{p.evidence ? ` (${p.evidence}×)` : ''}</span>
              </span>
              <button className="btn" onClick={() => act('Saving…', () => decide({ accept: p.id }))}>Accept</button>
              <button className="btn" onClick={() => act('Saving…', () => decide({ reject: p.id }))}>Reject</button>
            </div>
          ))}
        </div>
      )}
      {m && (m.aliases.length > 0 || m.notes.length > 0) && (
        <div className="voice-suggestions">
          <div className="set-label">Learned</div>
          {m.aliases.map((a) => (
            <div key={`a:${a.heard}`} className="voice-suggestion">
              <span>“{a.heard}” → <b>{a.means}</b></span>
              <button className="btn" title="Forget this alias" onClick={() => act('Saving…', () => decide({ remove: { alias: a.heard } }))}>✕</button>
            </div>
          ))}
          {m.notes.map((n) => (
            <div key={`n:${n.text}`} className="voice-suggestion">
              <span><i>{n.kind}</i> {n.text}</span>
              <button className="btn" title="Forget this note" onClick={() => act('Saving…', () => decide({ remove: { note: n.text } }))}>✕</button>
            </div>
          ))}
        </div>
      )}
      {(on || (s && s.turns > 0)) && (
        <Row label="Journal" hint={busy || error || 'Reviews run by themselves after 20 new turns, when the microphone turns off.'}>
          <button className="btn" disabled={!!busy || !on} onClick={() => act('Reviewing…', async () => { await review(); return loadMemory(); })}>Review now</button>
          <button className="btn" disabled={!!busy} title="Delete the journal and everything learned" onClick={() => {
            if (window.confirm('Delete the voice journal and everything it learned?')) void act('Deleting…', () => decide({ forget: true }));
          }}>Forget everything</button>
        </Row>
      )}
    </>
  );
}
