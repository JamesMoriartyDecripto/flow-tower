import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { Vector2 } from 'three';
import { useStore } from '../store';

const ABERRATION = new Vector2(0.0005, 0.0005);

/** Holographic look. `high`: full stack; `balanced`: bloom + vignette; `low`: no post-processing. */
export function Effects() {
  const quality = useStore((s) => s.quality);
  if (quality === 'low') return null;
  if (quality === 'balanced') {
    return (
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.8} luminanceThreshold={0.6} luminanceSmoothing={0.2} radius={0.6} levels={5} />
        <Vignette offset={0.25} darkness={0.7} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.6} luminanceSmoothing={0.2} radius={0.7} />
      <ChromaticAberration offset={ABERRATION} />
      <Noise opacity={0.025} />
      <Vignette offset={0.25} darkness={0.75} />
    </EffectComposer>
  );
}
