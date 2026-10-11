import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { isFixed, parseCommand, type VoiceAction } from '../src/app/voice/commands';

const { workspace: ws } = await loadLibrary(['examples/dev-squad', 'examples/db-api-playbook', 'examples/physics-notes']);
const squad = ws.towers['dev-squad/dev-squad.tower.yaml'];
const say = (text: string, library = false): VoiceAction => parseCommand(text, { ws, tower: squad, library });

describe('voice commands (#62)', () => {
  it('opens a project by name, in Italian and English', () => {
    expect(say('apri il progetto della dev squad', true)).toEqual({ kind: 'tower', id: 'dev-squad/dev-squad.tower.yaml' });
    expect(say('open the database API playbook')).toEqual({ kind: 'tower', id: 'db-api-playbook/db-api-playbook.tower.yaml' });
    expect(say('physics notes', true)).toMatchObject({ kind: 'tower', id: 'physics-notes/physics-notes.tower.yaml' });
  });

  it('focuses a layer by number or by name', () => {
    expect(say('fammi vedere il primo livello')).toEqual({ kind: 'layer', index: 0 });
    expect(say('show layer three')).toEqual({ kind: 'layer', index: 2 });
    expect(say("passiamo al livello degli MCP")).toEqual({ kind: 'layer', index: squad.layers.findIndex((l) => l.id === 'tools') });
    expect(say("l'ultimo livello")).toEqual({ kind: 'layer', index: squad.layers.length - 1 });
  });

  it('selects a node, even misheard', () => {
    expect(say('vai al nodo del triage')).toEqual({ kind: 'node', tower: squad.id, key: 'intake.triage' });
    expect(say('go to the triaje node')).toEqual({ kind: 'node', tower: squad.id, key: 'intake.triage' });
    expect(say('fresh verifier')).toEqual({ kind: 'node', tower: squad.id, key: 'quality.verifier' });
    expect(say('can you show me the triage node')).toEqual({ kind: 'node', tower: squad.id, key: 'intake.triage' });
    expect(say('puoi andare al nodo del triage')).toEqual({ kind: 'node', tower: squad.id, key: 'intake.triage' });
  });

  it('understands views and navigation words', () => {
    expect(say('torna alla libreria')).toEqual({ kind: 'library' });
    expect(say('vista mappa')).toEqual({ kind: 'view', view: 'map' });
    expect(say('tower view')).toEqual({ kind: 'view', view: 'tower' });
    expect(say('panoramica')).toEqual({ kind: 'overview' });
    expect(say('Indietro.')).toEqual({ kind: 'back' });
    expect(say('spegni il microfono')).toEqual({ kind: 'mic-off' });
  });

  it('keeps the phrases of the issue working, in English and with Italian variants', () => {
    const tools = squad.layers.findIndex((l) => l.id === 'tools');
    expect(say('open the dev squad project', true)).toEqual({ kind: 'tower', id: 'dev-squad/dev-squad.tower.yaml' });
    expect(say('show layer one')).toEqual({ kind: 'layer', index: 0 });
    expect(say('go to the triage node')).toEqual({ kind: 'node', tower: squad.id, key: 'intake.triage' });
    expect(say('tools layer')).toEqual({ kind: 'layer', index: tools });
    expect(say('aprimi la dev squad', true)).toEqual({ kind: 'tower', id: 'dev-squad/dev-squad.tower.yaml' });
    expect(say('portami al terzo livello')).toEqual({ kind: 'layer', index: 2 });
    expect(say('vediamo i livelli degli MCP')).toEqual({ kind: 'layer', index: tools });
    // Whisper hears "matta" for "mappa": one wrong letter in a command word is forgiven.
    expect(say('Vista matta.')).toEqual({ kind: 'view', view: 'map' });
  });

  it('closes only the file viewer, in both languages (#128)', () => {
    for (const text of ['chiudi il file', 'chiudi file', 'chiudi la finestra', 'close the file', 'close file', 'close the window']) {
      expect(say(text), text).toEqual({ kind: 'close-file' });
    }
    expect(say('chiudi')).toEqual({ kind: 'close' });
    // A whole-utterance match only: a node named here stays with the agent.
    expect(say('chiudi il file del nodo triage')).not.toEqual({ kind: 'close-file' });
  });

  it('marks the whole-phrase commands as fixed, so the agent route yields to them (#128)', () => {
    expect(isFixed(say('chiudi il file'))).toBe(true);
    expect(isFixed(say('indietro'))).toBe(true);
    expect(isFixed(say('chiudi'))).toBe(true);
    // Fuzzy name matches are not fixed: with an agent configured they keep today's routing.
    expect(isFixed(say('nodo triage'))).toBe(false);
    expect(isFixed(say('cosa fa questo file?'))).toBe(false);
  });

  it('offers a choice when names tie, and admits when nothing matches', () => {
    const r = say('vai al nodo MCP');
    expect(r.kind).toBe('ambiguous');
    expect(r.kind === 'ambiguous' && r.options.length).toBe(4);
    expect(say('ordina una pizza margherita')).toEqual({ kind: 'unknown' });
  });
});
