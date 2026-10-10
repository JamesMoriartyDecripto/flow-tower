/**
 * Microphone with end-of-speech detection, in every browser. A MediaRecorder runs all the time;
 * an AnalyserNode watches the level. When speech is followed by ~0.6 s of silence the recorder is
 * cut and its clip handed over, and a new one starts at once, so the next command loses no syllable.
 * Clips stay compressed (Opus or AAC): a 2 s command is ~10 KB, quick to upload.
 */
const TYPES: [mime: string, format: string][] = [
  ['audio/webm;codecs=opus', 'webm'], // Chrome, Edge, Firefox
  ['audio/ogg;codecs=opus', 'ogg'], // Firefox
  ['audio/mp4', 'm4a'], // Safari
];
const TICK_MS = 40;
const END_SILENCE_MS = 600;
const MIN_SPEECH_MS = 200;
const MAX_SPEECH_MS = 8000;
/** Silence is thrown away every few seconds, so a clip holds the command and little else. */
const IDLE_CUT_MS = 5000;

export interface Mic { close(): void }
export interface MicEvents {
  speaking(on: boolean): void;
  clip(audio: Blob, format: string): void;
}

export async function openMic(on: MicEvents): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const mimeType = TYPES.find(([t]) => MediaRecorder.isTypeSupported(t))?.[0];
  const ctx = new AudioContext();
  await ctx.resume(); // Safari starts suspended even after the click
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const record = () => {
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    const chunks: Blob[] = [];
    const clip = { keep: false, at: performance.now() };
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      if (!clip.keep || !chunks.length) return;
      // Label the clip with what the browser recorded (known once it ran), not with what was asked for.
      const type = chunks[0].type || rec.mimeType;
      on.clip(new Blob(chunks, { type }), TYPES.find(([t]) => type.startsWith(t.split(';')[0]))?.[1] ?? 'webm');
    };
    rec.start();
    return { rec, clip };
  };
  let current = record();
  const cut = (keep: boolean) => {
    current.clip.keep = keep;
    current.rec.stop();
    current = record();
  };

  // Adaptive threshold: a fan or a busy room raises the floor instead of counting as speech.
  let floor = 0.01;
  let speaking = false;
  let start = 0;
  let lastLoud = 0;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const rms = Math.sqrt(sum / samples.length);
    const now = performance.now();
    if (!speaking) floor = floor * 0.95 + Math.min(rms, 0.05) * 0.05;
    if (rms > Math.max(0.02, floor * 2.5)) {
      lastLoud = now;
      if (!speaking) { speaking = true; start = now; on.speaking(true); }
    }
    if (speaking && (now - lastLoud > END_SILENCE_MS || now - start > MAX_SPEECH_MS)) {
      speaking = false;
      on.speaking(false);
      cut(lastLoud - start >= MIN_SPEECH_MS); // a click or a cough is not a command
    } else if (!speaking && now - current.clip.at > IDLE_CUT_MS) {
      cut(false);
    }
  }, TICK_MS);

  return {
    close() {
      clearInterval(timer);
      current.clip.keep = false;
      current.rec.stop();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
