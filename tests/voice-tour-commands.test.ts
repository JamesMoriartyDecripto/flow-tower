import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/loader';
import { isFixed, parseCommand, type VoiceAction } from '../src/app/voice/commands';

const { workspace: ws } = await loadLibrary(['examples/dev-squad', 'examples/db-api-playbook', 'examples/physics-notes']);
const squad = ws.towers['dev-squad/dev-squad.tower.yaml'];
const say = (text: string, library = false): VoiceAction => parseCommand(text, { ws, tower: squad, library });

const START_IT = ['panoramica guidata', 'fammi una panoramica guidata', 'fammi la panoramica guidata', 'visita guidata',
  'giro guidato', 'fammi il giro della torre', 'facciamo il giro della torre', 'spiegami la torre',
  'spiegami tutta la torre', 'spiegami questa torre', 'raccontami la torre'];
const START_EN = ['guided tour', 'start the guided tour', 'give me a guided tour', 'a tour of the tower',
  'give me a tour of the tower', 'walk me through the tower', 'walk me through this tower',
  'explain the tower', 'explain this tower', 'explain the whole tower'];

describe('voice tour commands (#275)', () => {
  it('starts the guided tour with the phrase as said, in Italian and English', () => {
    for (const phrase of [...START_IT, ...START_EN]) {
      expect(say(phrase), phrase).toEqual({ kind: 'tour', op: 'start', said: phrase, lang: START_IT.includes(phrase) ? 'it' : 'en' });
      expect(isFixed(say(phrase)), phrase).toBe(true);
    }
  });

  it('keeps the transcript as given, not the normalized form', () => {
    expect(say('Spiegami la torre!')).toEqual({ kind: 'tour', op: 'start', said: 'Spiegami la torre!', lang: 'it' });
  });

  it('asks for details and stops the tour', () => {
    for (const phrase of ['dettagli', 'più dettagli', 'nel dettaglio', 'in dettaglio', 'details', 'more details', 'in detail']) {
      expect(say(phrase), phrase).toMatchObject({ kind: 'tour', op: 'details' });
      expect(isFixed(say(phrase)), phrase).toBe(true);
    }
    for (const phrase of ['stop', 'basta', 'ferma', 'fermati', 'ferma il giro', 'fine del giro', 'stop the tour', 'end the tour']) {
      expect(say(phrase), phrase).toMatchObject({ kind: 'tour', op: 'stop' });
      expect(isFixed(say(phrase)), phrase).toBe(true);
    }
  });

  it('keeps the overview words as the overview, not the tour', () => {
    expect(say('panoramica')).toEqual({ kind: 'overview' });
    expect(say('overview')).toEqual({ kind: 'overview' });
    expect(say('tutta la torre')).toEqual({ kind: 'overview' });
  });

  it('keeps the mic and the steps as they were', () => {
    expect(say('spegni il microfono')).toEqual({ kind: 'mic-off' });
    expect(say('stop listening')).toEqual({ kind: 'mic-off' });
    expect(say('avanti')).toMatchObject({ kind: 'step', dir: 1 });
    expect(say('indietro')).toEqual({ kind: 'back' });
  });
});
