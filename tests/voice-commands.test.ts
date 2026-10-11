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

  it('opens the selected node\'s file, numbered in both languages (#130b)', () => {
    for (const [text, index] of [
      ['apri il suo file', 0], ['apri il suo file?', 0], ['il suo file', 0], ['apri il file', 0], ['apri il file 2', 1],
      ['apri il secondo file', 1], ['il secondo file', 1], ['open its file', 0], ['its file', 0], ['open the file', 0],
      ['open file 2', 1], ['open the second file', 1],
    ] as [string, number][]) {
      expect(say(text), text).toEqual({ kind: 'its-file', index });
    }
    // Whole-utterance only: a node named here stays with the agent.
    expect(say('apri il file del nodo triage')).not.toEqual({ kind: 'its-file', index: 0 });
  });

  it('steps forward and back through files, lists and nodes (#130b)', () => {
    for (const text of ['il prossimo', 'il successivo', 'prossimo', 'successivo', 'quello dopo', 'e il prossimo', 'avanti', 'next', 'next one', 'the next', 'the next one']) {
      expect(say(text), text).toEqual({ kind: 'step', dir: 1, what: 'auto' });
    }
    for (const text of ['il precedente', 'precedente', 'quello prima', 'indietro di uno', 'previous', 'the previous one']) {
      expect(say(text), text).toEqual({ kind: 'step', dir: -1, what: 'auto' });
    }
    for (const [text, dir] of [['file successivo', 1], ['prossimo file', 1], ['next file', 1], ['file precedente', -1], ['previous file', -1]] as [string, 1 | -1][]) {
      expect(say(text), text).toEqual({ kind: 'step', dir, what: 'file' });
    }
    // "indietro" alone is still the plain back command.
    expect(say('indietro')).toEqual({ kind: 'back' });
  });

  it('marks the whole-phrase commands as fixed, so the agent route yields to them (#128)', () => {
    expect(isFixed(say('chiudi il file'))).toBe(true);
    expect(isFixed(say('indietro'))).toBe(true);
    expect(isFixed(say('chiudi'))).toBe(true);
    // The #130b phrases too: "apri il suo file" and "il prossimo" are commands, not questions.
    expect(isFixed(say('apri il suo file'))).toBe(true);
    expect(isFixed(say('il prossimo'))).toBe(true);
    expect(isFixed(say('file successivo'))).toBe(true);
    // The #145b phrases are whole-utterance commands too: scroll and the Hub panel.
    expect(isFixed(say('scorri giù'))).toBe(true);
    expect(isFixed(say('go to the bottom'))).toBe(true);
    expect(isFixed(say("apri l'hub"))).toBe(true);
    expect(isFixed(say('show the machines'))).toBe(true);
    // Fuzzy name matches are not fixed: with an agent configured they keep today's routing.
    expect(isFixed(say('nodo triage'))).toBe(false);
    expect(isFixed(say('cosa fa questo file?'))).toBe(false);
    // Kinds matched on a keyword anywhere are questions as often as commands: not fixed.
    expect(isFixed(say('cosa mostra la panoramica?'))).toBe(false);
    expect(isFixed(say('what does the overview show?'))).toBe(false);
    expect(isFixed(say('come spengo il microfono?'))).toBe(false);
    // Deliberate: `norm` drops punctuation, so the question mark does not make this a question.
    expect(isFixed(say('chiudi il file?'))).toBe(true);
    expect(say('chiudi il file?')).toEqual({ kind: 'close-file' });
    expect(isFixed(say('chiudi il file del nodo triage'))).toBe(false);
  });

  it('scrolls the open file by voice (#145b)', () => {
    for (const text of ['scorri giù', 'scorri in giù', 'giù', 'scroll down', 'page down']) {
      expect(say(text), text).toEqual({ kind: 'scroll', to: 'down' });
    }
    for (const text of ['scorri su', 'scorri in su', 'su di poco', 'scroll up', 'page up']) {
      expect(say(text), text).toEqual({ kind: 'scroll', to: 'up' });
    }
    for (const text of ['vai in fondo', 'fine del file', 'go to the bottom']) {
      expect(say(text), text).toEqual({ kind: 'scroll', to: 'bottom' });
    }
    for (const text of ["vai all'inizio", 'inizio del file', 'go to the top']) {
      expect(say(text), text).toEqual({ kind: 'scroll', to: 'top' });
    }
    // "su" alone keeps its old meaning: it is still `back`, not a scroll up.
    expect(say('su')).toEqual({ kind: 'back' });
  });

  it('opens and closes the Hub panel by voice (#145b)', () => {
    for (const text of ["apri l'hub", 'pannello hub', 'hub', "mostra l'hub", 'open the hub', 'hub panel']) {
      expect(say(text), text).toEqual({ kind: 'hub', tab: 'now' });
    }
    for (const text of ['mostra le macchine', 'le macchine', 'show the machines']) {
      expect(say(text), text).toEqual({ kind: 'hub', tab: 'machines' });
    }
    for (const text of ["chiudi l'hub", 'close the hub']) {
      expect(say(text), text).toEqual({ kind: 'hub', tab: 'close' });
    }
  });

  it('offers a choice when names tie, and admits when nothing matches', () => {
    const r = say('vai al nodo MCP');
    expect(r.kind).toBe('ambiguous');
    expect(r.kind === 'ambiguous' && r.options.length).toBe(4);
    expect(say('ordina una pizza margherita')).toEqual({ kind: 'unknown' });
  });
});
