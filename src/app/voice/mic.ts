/**
 * Microphone with end-of-speech detection, in every browser. A MediaRecorder runs all the time;
 * an AnalyserNode watches the level. When speech is followed by ~0.6 s of silence the recorder is
 * cut and its clip handed over, and a new one starts at once, so the next command loses no syllable.
 * Silence is thrown away every 1.5 s, so a clip holds the command and little else: it is billed per
 * second, and Whisper invents words in long silences. Clips stay compressed (Opus or AAC).
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
const IDLE_CUT_MS = 1500;

export interface Mic { close(): void }
export interface MicEvents {
  speaking(on: boolean): void;
  clip(audio: Blob, format: string): void;
  /** The device went away (unplugged, taken by another app) or the recorder failed. */
  ended(): void;
}

export async function openMic(on: MicEvents): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  // Anything failing after the permission must release the device, or the browser keeps its mic indicator on.
  let ctx: AudioContext | undefined;
  try {
    const mimeType = TYPES.find(([t]) => MediaRecorder.isTypeSupported(t))?.[0];
    ctx = new AudioContext();
    await ctx.resume(); // Safari starts suspended even after the click
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let closed = false;

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
      rec.onerror = () => { if (!closed) on.ended(); };
      rec.start();
      return { rec, clip };
    };
    let current = record();
    const cut = (keep: boolean) => {
      current.clip.keep = keep;
      if (current.rec.state !== 'inactive') current.rec.stop(); // a failed recorder is already inactive
      current = record();
    };
    stream.getAudioTracks().forEach((t) => t.addEventListener('ended', () => { if (!closed) on.ended(); }));

    // Adaptive threshold: a fan or a busy room raises the floor instead of counting as speech. It adapts
    // slowly while "speaking" too, so steady noise does not keep cutting 8 s clips.
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
      floor = speaking ? floor * 0.998 + Math.min(rms, 0.05) * 0.002 : floor * 0.95 + Math.min(rms, 0.05) * 0.05;
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
        closed = true;
        clearInterval(timer);
        current.clip.keep = false;
        if (current.rec.state !== 'inactive') current.rec.stop();
        stream.getTracks().forEach((t) => t.stop());
        void ctx?.close();
      },
    };
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    throw err;
  }
}
