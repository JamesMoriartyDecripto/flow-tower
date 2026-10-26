// Pure planning for scripts/run.mjs: argument parsing, config checks and the
// list of Argo runs. Nothing here spawns a process or touches the disk, so the
// rules can be tested without a browser or an API key.

const USAGE = 'usage: node scripts/run.mjs <demo> [--dry | --pilot] [--headed]';
const FLAGS = new Set(['--dry', '--pilot', '--headed']);

export function parseArgs(argv) {
  let demo;
  const flags = new Set();
  for (const arg of argv) {
    if (arg.startsWith('-')) {
      if (!FLAGS.has(arg)) throw new Error(USAGE);
      flags.add(arg);
    } else if (demo === undefined) {
      demo = arg;
    } else {
      throw new Error(USAGE);
    }
  }
  if (demo === undefined) throw new Error(USAGE);
  if (flags.has('--dry') && flags.has('--pilot')) throw new Error(USAGE);
  const mode = flags.has('--dry') ? 'dry' : flags.has('--pilot') ? 'pilot' : 'final';
  return { demo, mode, headed: flags.has('--headed') };
}

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

export function checkTutorial(t) {
  const fail = (what) => {
    throw new Error(`tutorial.json: ${what}`);
  };
  if (!t || typeof t !== 'object') fail('must be an object');
  const app = t.app;
  if (!app || typeof app !== 'object') fail('app is missing');
  if (!Array.isArray(app.command) || app.command.length === 0 || !app.command.every(isNonEmptyString)) {
    fail('app.command must be a non-empty array of strings');
  }
  if (typeof app.url !== 'string' || !/^https?:\/\//.test(app.url)) {
    fail('app.url must start with http:// or https://');
  }
  if (!Array.isArray(t.voices) || t.voices.length === 0) fail('voices must be a non-empty array');
  for (const v of t.voices) {
    if (!v || typeof v !== 'object' || !isNonEmptyString(v.model) || !isNonEmptyString(v.voice)) {
      fail('each voice needs a non-empty model and voice');
    }
    // Only the formats the speech engine can decode; a typo would otherwise fail deep in ffmpeg.
    if (v.format !== undefined && v.format !== 'mp3' && v.format !== 'pcm') {
      fail('voice format must be mp3 or pcm');
    }
  }
  if (!isNonEmptyString(t.pilotUntil)) fail('pilotUntil must be a non-empty string');
  return t;
}

// Run folder names must be safe as path segments: "elevenlabs/eleven-v4" -> "elevenlabs-eleven-v4".
export function slug(model) {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function planRuns(tutorial, mode) {
  const voiceEnv = (voice) => ({
    TUTORIAL_TTS: 'openrouter',
    TUTORIAL_TTS_MODEL: voice.model,
    TUTORIAL_TTS_VOICE: voice.voice,
    // Passed on as its own variable: the engine must know the reply format before it parses the audio.
    TUTORIAL_TTS_FORMAT: voice.format ?? 'mp3',
  });
  if (mode === 'dry') {
    return [{ name: 'dry', env: { TUTORIAL_TTS: 'silent' } }];
  }
  if (mode === 'pilot') {
    // One Argo run per candidate voice; each gets its own folder, since clips are cached by voice, not model.
    return tutorial.voices.map((voice) => ({
      name: 'pilot-' + slug(voice.model),
      env: { ...voiceEnv(voice), TUTORIAL_UNTIL: tutorial.pilotUntil },
    }));
  }
  if (mode === 'final') {
    return [{ name: 'final', env: voiceEnv(tutorial.voices[0]) }];
  }
  throw new Error(`unknown mode "${mode}"`);
}

export function pilotScenes(manifest, until) {
  const index = manifest.findIndex((s) => s.scene === until);
  if (index === -1) throw new Error(`pilotUntil "${until}" is not a scene of the manifest`);
  return manifest.slice(0, index + 1);
}

const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function expandCommand(command, vars) {
  return command.map((arg) =>
    arg.replace(PLACEHOLDER, (_, name) => {
      const value = vars[name];
      if (value === undefined || value === '') {
        throw new Error(`tutorial.json app.command needs \${${name}}: set it in the environment`);
      }
      return value;
    }),
  );
}

// Strings shorter than 3 characters would match ordinary words on screen, so they are not checked.
export function forbiddenStrings({ user, host, home }) {
  const out = [];
  for (const value of [home, host, user]) {
    if (typeof value === 'string' && value.length >= 3 && !out.includes(value)) out.push(value);
  }
  return out;
}
