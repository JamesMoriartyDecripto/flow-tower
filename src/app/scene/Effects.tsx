import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { Vector2 } from 'three';
import { useStore } from '../store';

const ABERRATION = new Vector2(0.0004, 0.0004);

/**
 * Post-processing per quality. Bloom only catches colors above the threshold: static structure is
 * kept below it on purpose (see GLOW vs HOT in theme.ts), so only selection, focus and live activity
 * glow. `eco` skips post-processing entirely (the cheapest path for busy machines).
 */
export function Effects() {
  const quality = useStore((s) => s.quality);
  if (quality === 'eco') return null;
  if (quality === 'balanced') {
    return (
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.9} luminanceSmoothing={0.15} radius={0.55} levels={4} />
        <Vignette offset={0.25} darkness={0.65} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.9} luminanceSmoothing={0.15} radius={0.65} />
      <ChromaticAberration offset={ABERRATION} />
      <Noise opacity={0.02} />
      <Vignette offset={0.25} darkness={0.7} />
    </EffectComposer>
  );
}
