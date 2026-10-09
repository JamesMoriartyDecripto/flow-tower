// Remotion composition for the 9:16 and 1:1 cuts. The editor agent never writes code: it
// writes inputProps that match this schema, so every cut is reproducible from data.
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';

export const timelineSchema = z.object({
  videoId: z.string(),
  clips: z.array(z.object({ src: z.string().url(), from: z.number(), durationInFrames: z.number(), trimStart: z.number().default(0) })),
  voiceover: z.string().url(),
  music: z.string().url(),
  musicVolume: z.number().min(0).max(1).default(0.18), // mix step ducks further under VO
  words: z.array(z.object({ text: z.string(), startMs: z.number(), endMs: z.number() })),
  endCard: z.object({ cta: z.string(), aiLine: z.string() }),
  brand: z.object({ ember: z.string(), slate: z.string(), captionFont: z.string() }),
});
type Timeline = z.infer<typeof timelineSchema>;

const Captions: React.FC<{ words: Timeline['words']; brand: Timeline['brand'] }> = ({ words, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const i = words.findIndex((w) => ms >= w.startMs && ms < w.endMs);
  if (i < 0) return null;
  const start = Math.floor(i / 5) * 5; // show words in groups of five
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '24%' }}>
      <div style={{ fontFamily: brand.captionFont, fontSize: 64, background: `${brand.slate}B3`, padding: '8px 20px', borderRadius: 12, maxWidth: '80%', textAlign: 'center' }}>
        {words.slice(start, start + 5).map((w, k) => (
          <span key={k} style={{ color: start + k === i ? brand.ember : '#F2EFEA' }}>{w.text} </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const ShortVideo: React.FC<Timeline> = ({ clips, voiceover, music, musicVolume, words, endCard, brand }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const endCardFrames = 3 * fps;
  return (
    <AbsoluteFill style={{ backgroundColor: brand.slate }}>
      {clips.map((c, k) => (
        <Sequence key={k} from={c.from} durationInFrames={c.durationInFrames}>
          <OffthreadVideo src={c.src} trimBefore={c.trimStart} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </Sequence>
      ))}
      <Audio src={voiceover} />
      <Audio src={music} volume={musicVolume} />
      <Captions words={words} brand={brand} />
      <Sequence from={durationInFrames - endCardFrames}>
        <AbsoluteFill style={{ backgroundColor: brand.slate, justifyContent: 'center', alignItems: 'center', color: '#F2EFEA', fontFamily: brand.captionFont }}>
          <div style={{ fontSize: 72 }}>{endCard.cta}</div>
          <div style={{ fontSize: 28, marginTop: 40, opacity: 0.8, maxWidth: '80%', textAlign: 'center' }}>{endCard.aiLine}</div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
