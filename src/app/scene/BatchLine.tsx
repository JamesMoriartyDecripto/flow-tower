import { useEffect, useLayoutEffect, useMemo, useRef, type Ref } from 'react';
import { useThree } from '@react-three/fiber';
import type { Color, InterleavedBufferAttribute, Vector3 } from 'three';
import { LineMaterial, LineSegments2, LineSegmentsGeometry } from 'three-stdlib';

interface Props {
  /** Segment end points in pairs (see toSegments). */
  points: Vector3[];
  /** One rgb triple per point; omit to use `color`. */
  vertexColors?: [number, number, number][];
  color?: Color;
  lineWidth?: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
  transparent?: boolean;
  opacity?: number;
  toneMapped?: boolean;
  ref?: Ref<LineSegments2>;
}

/**
 * A long-lived LineSegments2 batch. drei's <Line> builds a new geometry and disposes its material
 * whenever points or colors change, so hovering one node made every batch of every layer release
 * the shared line shader at once and three relinked it. Here the material lives as long as the
 * component; a color-only change (hover, select, search) rewrites the color buffer in place, and
 * only a change of shape replaces the geometry.
 */
export function BatchLine({ points, vertexColors, color, lineWidth = 1, dashed = false, dashSize = 1, gapSize = 1, transparent = false, opacity = 1, toneMapped = true, ref }: Props) {
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const line = useMemo(() => new LineSegments2(), []);
  const material = useMemo(() => new LineMaterial(), []);
  const shape = useRef<Float32Array>(undefined);

  const positions = useMemo(() => {
    const out = new Float32Array(points.length * 3);
    points.forEach((p, i) => out.set([p.x, p.y, p.z], i * 3));
    return out;
  }, [points]);
  const colors = useMemo(() => (vertexColors ? new Float32Array(vertexColors.flat()) : undefined), [vertexColors]);

  useLayoutEffect(() => {
    const prev = shape.current;
    const same = prev !== undefined && prev.length === positions.length && prev.every((v, i) => v === positions[i]);
    const attr = line.geometry.getAttribute('instanceColorStart') as InterleavedBufferAttribute | undefined;
    if (same && !colors) {
      // Nothing changed on the GPU side (single-color lines take their color from the material).
    } else if (same && colors && attr && attr.data.array.length === colors.length) {
      (attr.data.array as Float32Array).set(colors);
      attr.data.needsUpdate = true;
    } else {
      const geom = new LineSegmentsGeometry();
      geom.setPositions(positions);
      if (colors) geom.setColors(colors);
      const old = line.geometry;
      line.geometry = geom;
      old.dispose();
      line.computeLineDistances();
      shape.current = positions;
    }
    invalidate();
  }, [line, positions, colors, invalidate]);

  useLayoutEffect(() => {
    if (dashed !== 'USE_DASH' in material.defines) {
      if (dashed) material.defines.USE_DASH = '';
      else delete material.defines.USE_DASH;
      material.needsUpdate = true;
    }
    material.color.set(colors ? 0xffffff : (color ?? 0xffffff));
    material.vertexColors = !!colors;
    material.linewidth = lineWidth;
    material.dashed = dashed;
    material.dashSize = dashSize;
    material.gapSize = gapSize;
    material.transparent = transparent;
    material.opacity = opacity;
    material.toneMapped = toneMapped;
    material.resolution.set(size.width, size.height);
    line.material = material;
    invalidate();
  });

  useEffect(() => () => {
    line.geometry.dispose();
    material.dispose();
  }, [line, material]);

  return <primitive object={line} ref={ref} />;
}
