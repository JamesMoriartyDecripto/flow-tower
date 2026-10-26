import { describe, expect, it } from 'vitest';
import {
  checkTutorial,
  expandCommand,
  forbiddenStrings,
  parseArgs,
  pilotScenes,
  planRuns,
  slug,
} from '../examples/tutorial-studio/scripts/plan.mjs';

const USAGE = 'usage: node scripts/run.mjs <demo> [--dry | --pilot] [--headed]';

const tutorial = {
  app: { command: ['node', 'bin/x.js'], url: 'http://localhost:3000' },
  voices: [
    { model: 'a/b', voice: 'alice' },
    { model: 'c/d', voice: 'bob' },
  ],
  pilotUntil: 'intro',
};

describe('parseArgs', () => {
  it('defaults to a final run with a headless browser', () => {
    expect(parseArgs(['flow-tower'])).toEqual({ demo: 'flow-tower', mode: 'final', headed: false });
  });

  it('reads --pilot and --headed in any order', () => {
    expect(parseArgs(['flow-tower', '--pilot', '--headed'])).toEqual({
      demo: 'flow-tower',
      mode: 'pilot',
      headed: true,
    });
  });

  it('rejects the old --headless flag', () => {
    expect(() => parseArgs(['a', '--headless'])).toThrow(USAGE);
  });

  it('accepts the demo name after a flag', () => {
    expect(parseArgs(['--dry', 'x']).mode).toBe('dry');
  });

  it('throws the usage message on bad input', () => {
    expect(() => parseArgs([])).toThrow(USAGE);
    expect(() => parseArgs(['a', 'b'])).toThrow(USAGE);
    expect(() => parseArgs(['a', '--fast'])).toThrow(USAGE);
    expect(() => parseArgs(['a', '--dry', '--pilot'])).toThrow(USAGE);
  });
});

describe('checkTutorial', () => {
  it('accepts a valid config and returns it', () => {
    expect(checkTutorial(tutorial)).toBe(tutorial);
  });

  it('names what is wrong', () => {
    expect(() => checkTutorial({ ...tutorial, voices: [] })).toThrow(/^tutorial\.json: /);
    expect(() => checkTutorial({ ...tutorial, app: { ...tutorial.app, url: 'ftp://x' } })).toThrow(
      'tutorial.json: app.url must start with http:// or https://',
    );
    expect(() => checkTutorial({ ...tutorial, voices: [{ model: 'a/b' }] })).toThrow(
      'tutorial.json: each voice needs a non-empty model and voice',
    );
  });

  it('accepts a pcm voice and rejects an unknown format', () => {
    const pcm = { ...tutorial, voices: [{ model: 'a/b', voice: 'alice', format: 'pcm' as const }] };
    expect(checkTutorial(pcm)).toBe(pcm);
    expect(() => checkTutorial({ ...tutorial, voices: [{ model: 'a/b', voice: 'alice', format: 'wav' }] })).toThrow(
      'tutorial.json: voice format must be mp3 or pcm',
    );
  });
});

describe('checkTutorial homeEnv', () => {
  const withHome = (homeEnv: unknown) => ({ ...tutorial, app: { ...tutorial.app, homeEnv } });

  it('rejects an empty or non-string homeEnv', () => {
    expect(() => checkTutorial(withHome(''))).toThrow(
      'tutorial.json: app.homeEnv must be a non-empty string when set',
    );
    expect(() => checkTutorial(withHome(3))).toThrow(
      'tutorial.json: app.homeEnv must be a non-empty string when set',
    );
  });

  it('accepts a tutorial without homeEnv', () => {
    expect(checkTutorial(tutorial)).toBe(tutorial);
  });
});

describe('slug', () => {
  it('turns model ids into folder-safe names', () => {
    expect(slug('elevenlabs/eleven-v4')).toBe('elevenlabs-eleven-v4');
    expect(slug('microsoft/MAI-Voice-2.1')).toBe('microsoft-mai-voice-2-1');
  });
});

describe('planRuns', () => {
  it('plans one silent dry run', () => {
    expect(planRuns(tutorial, 'dry')).toEqual([{ name: 'dry', env: { TUTORIAL_TTS: 'silent' } }]);
  });

  it('plans one pilot per voice, up to pilotUntil', () => {
    const runs = planRuns(tutorial, 'pilot');
    expect(runs.map((r) => r.name)).toEqual(['pilot-a-b', 'pilot-c-d']);
    expect(runs[1].env).toEqual({
      TUTORIAL_TTS: 'openrouter',
      TUTORIAL_TTS_MODEL: 'c/d',
      TUTORIAL_TTS_VOICE: 'bob',
      TUTORIAL_TTS_FORMAT: 'mp3',
      TUTORIAL_UNTIL: 'intro',
    });
  });

  it('plans the final render from the first voice', () => {
    expect(planRuns(tutorial, 'final')).toEqual([
      {
        name: 'final',
        env: {
          TUTORIAL_TTS: 'openrouter',
          TUTORIAL_TTS_MODEL: 'a/b',
          TUTORIAL_TTS_VOICE: 'alice',
          TUTORIAL_TTS_FORMAT: 'mp3',
        },
      },
    ]);
  });

  it('passes each voice its reply format, mp3 by default', () => {
    const pcm = {
      ...tutorial,
      voices: [{ model: 'g/tts', voice: 'Charon', format: 'pcm' as const }, tutorial.voices[0]],
    };
    const runs = planRuns(pcm, 'pilot');
    expect(runs.map((r) => r.env.TUTORIAL_TTS_FORMAT)).toEqual(['pcm', 'mp3']);
  });
});

describe('pilotScenes', () => {
  it('keeps the scenes up to and including the given one', () => {
    const manifest = [{ scene: 'a' }, { scene: 'b' }, { scene: 'c' }];
    expect(pilotScenes(manifest, 'b')).toEqual([{ scene: 'a' }, { scene: 'b' }]);
  });

  it('throws when the scene is not in the manifest', () => {
    expect(() => pilotScenes([{ scene: 'a' }], 'z')).toThrow(
      'pilotUntil "z" is not a scene of the manifest',
    );
  });
});

describe('expandCommand', () => {
  it('replaces every ${NAME} with its value', () => {
    expect(expandCommand(['node', '${FT}/bin/x.js'], { FT: '/opt/ft' })).toEqual([
      'node',
      '/opt/ft/bin/x.js',
    ]);
  });

  it('throws naming the missing variable', () => {
    expect(() => expandCommand(['node', '${FT}/bin/x.js'], {})).toThrow(/\$\{FT\}.*set it in the environment/);
  });
});

describe('forbiddenStrings', () => {
  it('lists home, host and user in that order, skipping short and repeated values', () => {
    expect(forbiddenStrings({ user: 'al', host: 'box1', home: '/home/al' })).toEqual(['/home/al', 'box1']);
    expect(forbiddenStrings({ user: 'alice', host: 'alice', home: 'ab' })).toEqual(['alice']);
  });
});
