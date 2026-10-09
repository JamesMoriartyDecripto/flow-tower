import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
// @ts-expect-error troika-three-text ships no type declarations
import { BatchedText, Text } from 'troika-three-text';
import type { ColorRepresentation, Object3D } from 'three';

export interface TextItem {
  text: string;
  position: [number, number, number];
  fontSize: number;
  color: ColorRepresentation;
  opacity: number;
  anchorX?: 'left' | 'center' | 'right';
  maxWidth?: number;
  letterSpacing?: number;
  /** Lay the text flat on the plate (readable from above). */
  flat?: boolean;
  /** Hard right edge (world units from the anchor): text never draws past it (e.g. a node's border). */
  clip?: number;
}

type TroikaText = Object3D & Record<string, unknown> & { sync(cb?: () => void): void; dispose(): void };

/**
 * Renders many texts sharing one font in a single draw call (troika BatchedText).
 * Members are reconciled in place, so changing colors or opacity costs no re-layout.
 */
export function TextBatch({ items, font, outline }: { items: TextItem[]; font: string; outline?: string }) {
  const invalidate = useThree((s) => s.invalidate);
  const batch = useMemo(() => new BatchedText() as TroikaText, []);
  const members = useRef<TroikaText[]>([]);

  useEffect(() => {
    const list = members.current;
    while (list.length < items.length) {
      const t = new Text() as TroikaText;
      list.push(t);
      batch.add(t);
    }
    while (list.length > items.length) {
      const t = list.pop()!;
      batch.remove(t);
      t.dispose();
    }
    items.forEach((it, i) => {
      const t = list[i];
      // Assign only what changed: re-setting layout props (text, font…) makes troika re-typeset,
      // which is expensive when opacity alone changes several times a second (live spotlight).
      const props: Record<string, unknown> = {
        text: it.text,
        font,
        fontSize: it.fontSize,
        color: it.color,
        fillOpacity: it.opacity,
        anchorX: it.anchorX ?? 'left',
        anchorY: 'middle',
        maxWidth: it.maxWidth ?? Infinity,
        whiteSpace: 'nowrap',
        overflowWrap: 'normal',
        letterSpacing: it.letterSpacing ?? 0,
        outlineWidth: outline ? '12%' : 0,
        outlineColor: outline ?? 0,
        outlineOpacity: it.opacity * 0.9,
      };
      for (const k in props) if (t[k] !== props[k]) t[k] = props[k];
      // clipRect is an array: compare by value so unchanged items are not touched.
      const clip = it.clip === undefined ? null : [-1, -2, it.clip, 2];
      const cur = t.clipRect as number[] | null;
      if ((cur?.[2] ?? null) !== (clip?.[2] ?? null)) t.clipRect = clip;
      t.position.set(...it.position);
      t.rotation.set(it.flat === false ? 0 : -Math.PI / 2, 0, 0);
    });
    batch.sync(invalidate);
  }, [items, font, outline, batch, invalidate]);

  useEffect(() => () => {
    members.current.forEach((t) => t.dispose());
    batch.dispose();
  }, [batch]);

  return <primitive object={batch} />;
}
