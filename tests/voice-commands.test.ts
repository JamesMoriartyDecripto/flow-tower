import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { parseCommand, type VoiceAction } from '../src/app/voice/commands';

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
  });

  it('understands views and navigation words', () => {
    expect(say('torna alla libreria')).toEqual({ kind: 'library' });
    expect(say('vista mappa')).toEqual({ kind: 'view', view: 'map' });
    expect(say('tower view')).toEqual({ kind: 'view', view: 'tower' });
    expect(say('panoramica')).toEqual({ kind: 'overview' });
    expect(say('Indietro.')).toEqual({ kind: 'back' });
    expect(say('spegni il microfono')).toEqual({ kind: 'mic-off' });
  });

  it('offers a choice when names tie, and admits when nothing matches', () => {
    const r = say('vai al nodo coder');
    expect(r.kind === 'node' || r.kind === 'ambiguous').toBe(true);
    expect(say('ordina una pizza margherita')).toEqual({ kind: 'unknown' });
  });
});
