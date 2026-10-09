// AI-label check: decides, per platform variant, which AI disclosure flags the publisher must
// send and whether the caption needs a visible line. Realistic synthetic media is labelled
// everywhere; AI-assisted text reviewed by a person is not (EU AI Act Art. 50(4) exception).

type Media = { kind: 'image' | 'video' | 'audio'; aiGenerated: boolean; realistic: boolean; depictsPerson: boolean };
type Variant = { platform: string; caption: string; media: Media[] };
type Labels = {
  flags: Record<string, boolean>;   // API fields sent with the post
  captionLine?: string;             // visible disclosure
  manualStep?: string;              // what a person must do in the app
  block?: string;                   // never publish
};

const CAPTION_LINE = 'AI-generated imagery.';

export function aiLabels(v: Variant): Labels {
  const synthetic = v.media.filter((m) => m.aiGenerated);
  if (synthetic.some((m) => m.depictsPerson && m.realistic)) {
    return { flags: {}, block: 'Realistic generated person: not allowed by brand policy.' };
  }
  const realistic = synthetic.some((m) => m.realistic);
  const avOrVideo = synthetic.some((m) => m.realistic && (m.kind === 'video' || m.kind === 'audio'));
  if (!synthetic.length) return { flags: {} };

  const labels: Labels = { flags: {} };
  switch (v.platform) {
    case 'instagram':
      labels.flags.is_ai_generated = true;           // set on the carousel container, not children
      break;
    case 'facebook':
    case 'threads':
      // No publish flag documented for these; Meta requires its AI label for photorealistic
      // video or realistic audio, so a person adds it in Meta Business Suite before the slot.
      if (avOrVideo) labels.manualStep = 'Add the AI label in Meta Business Suite.';
      break;
    case 'tiktok':
      labels.flags.is_aigc = true;
      labels.manualStep = 'Turn on "AI-generated content" when finishing the draft.';
      break;
    case 'youtube':
      labels.flags.containsSyntheticMedia = realistic; // only realistic A/S content needs it
      break;
    default:
      break; // LinkedIn, X, Bluesky: no API flag; rely on the caption line
  }
  if (realistic && !v.caption.includes(CAPTION_LINE)) labels.captionLine = CAPTION_LINE;
  return labels;
}
