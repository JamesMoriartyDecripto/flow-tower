import type { Recorded } from './duplex';
import { dbToPower, flatness, isSpeech, updateFloor, VOICE_BAND, type Sensitivity } from './noise';

/**
 * Microphone with end-of-speech detection, in every browser. A MediaRecorder runs all the time;
 * an AnalyserNode watches the spectrum. When speech is followed by ~0.6 s of silence the recorder is
 * cut and its clip handed over, and a new one starts at once, so the next command loses no syllable.
 * Silence is thrown away every 1.5 s, so a clip holds the command and little else: it is billed per
 * second, and Whisper invents words in long silences. Clips stay compressed (Opus or AAC).
 * Speech is told from noise on the voice band (noise.ts): louder than its floor and peaky, not flat
 * like a fan, so a laptop fan spinning up no longer opens clips.
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
/** The noise floor is measured first: no speech is accepted while it is (the user rarely talks this soon). */
const CALIBRATE_MS = 700;

export interface Mic { close(): void }
export interface MicEvents {
  speaking(on: boolean): void;
  /** A finished command; `at` is when its speech started and when the clip was cut (recording time). */
  clip(audio: Blob, format: string, at: Recorded): void;
  /** The device went away (unplugged, taken by another app) or the recorder failed. */
  ended(): void;
}

/** `sensitivity` is read at every tick: a change in Settings applies without restarting the mic. */
export async function openMic(on: MicEvents, sensitivity: () => Sensitivity = () => 'normal'): Promise<Mic> {
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
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    const binHz = ctx.sampleRate / analyser.fftSize;
    const lo = Math.ceil(VOICE_BAND[0] / binHz);
    const hi = Math.min(spectrum.length - 1, Math.floor(VOICE_BAND[1] / binHz));
    const band = new Float64Array(hi - lo + 1); // this tick's power per bin
    const floor = new Float64Array(band.length); // the noise floor per bin
    const ratio = new Float64Array(band.length); // power over floor: steady noise is ~1 in every bin
    let closed = false;

    const record = () => {
      const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
      const chunks: Blob[] = [];
      const clip = { keep: false, at: performance.now(), speech: { from: 0, to: 0 } as Recorded };
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        if (!clip.keep || !chunks.length) return;
        // Label the clip with what the browser recorded (known once it ran), not with what was asked for.
        const type = chunks[0].type || rec.mimeType;
        on.clip(new Blob(chunks, { type }), TYPES.find(([t]) => type.startsWith(t.split(';')[0]))?.[1] ?? 'webm', clip.speech);
      };
      rec.onerror = () => { if (!closed) on.ended(); };
      rec.start();
      return { rec, clip };
    };
    let current = record();
    const cut = (keep: boolean, speech?: Recorded) => {
      current.clip.keep = keep;
      if (speech) current.clip.speech = speech;
      if (current.rec.state !== 'inactive') current.rec.stop(); // a failed recorder is already inactive
      current = record();
    };
    stream.getAudioTracks().forEach((t) => t.addEventListener('ended', () => { if (!closed) on.ended(); }));

    // Adaptive floor, per bin (noise.ts updateFloor): seeded at once, calibrated as the per-bin minimum
    // during the first CALIBRATE_MS, then following the room (a fan spinning up raises it instead of
    // counting as speech). It adapts slowly while "speaking" too, so steady noise does not keep cutting
    // 8 s clips; one tick can raise it 4× at most.
    const opened = performance.now();
    let minimum = false;
    let speaking = false;
    let start = 0;
    let lastLoud = 0;
    const timer = setInterval(() => {
      analyser.getFloatFrequencyData(spectrum);
      const now = performance.now();
      let power = 0;
      let floorPower = 0;
      for (let i = 0; i < band.length; i++) {
        band[i] = dbToPower(spectrum[lo + i]);
        power += band[i];
        floorPower += floor[i];
        ratio[i] = band[i] / Math.max(floor[i], 1e-16); // floor is 0 only before the first tick
      }
      power /= band.length;
      floorPower /= band.length;
      const calibrating = now - opened < CALIBRATE_MS;
      const loud = !calibrating && isSpeech(power, floorPower, flatness(ratio), sensitivity());
      // The analyser's smoothing starts from silence: its first 200 ms understate the room, so they only
      // seed the floor; the minimum starts from the first tick after them.
      const settled = now - opened >= 200;
      updateFloor(floor, band, !calibrating ? (speaking ? 0.002 : 0.05) : settled && minimum ? 'min' : 'seed');
      if (settled) minimum = true;
      if (loud) {
        lastLoud = now;
        if (!speaking) { speaking = true; start = now; on.speaking(true); }
      }
      if (speaking && (now - lastLoud > END_SILENCE_MS || now - start > MAX_SPEECH_MS)) {
        speaking = false;
        on.speaking(false);
        cut(lastLoud - start >= MIN_SPEECH_MS, { from: start, to: now }); // a click or a cough is not a command
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
