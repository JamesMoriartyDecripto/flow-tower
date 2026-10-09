import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, Matrix4, OctahedronGeometry, Quaternion, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry, type InstancedMesh } from 'three';
import { COLORS, type Glyph } from '../theme';

/** Shared unit geometries: instanced meshes scale them per node. */
export const UNIT_BOX = new BoxGeometry(1, 1, 1);
export const CONE = new ConeGeometry(0.12, 0.3, 10);

export const GLYPHS: Record<Glyph, BufferGeometry> = {
  ring: new TorusGeometry(0.2, 0.045, 8, 32).rotateX(-Math.PI / 2),
  disc: new CylinderGeometry(0.22, 0.22, 0.06, 32),
  hex: new CylinderGeometry(0.26, 0.26, 0.14, 6),
  box: new BoxGeometry(0.34, 0.14, 0.34),
  diamond: new BoxGeometry(0.3, 0.14, 0.3).rotateY(Math.PI / 4),
  octa: new OctahedronGeometry(0.26),
  ico: new IcosahedronGeometry(0.26, 0),
  cylinder: new CylinderGeometry(0.18, 0.18, 0.3, 24),
  sphere: new SphereGeometry(0.21, 12, 8),
  shield: new CylinderGeometry(0.24, 0.24, 0.12, 8),
  torus: new TorusGeometry(0.17, 0.045, 8, 24, Math.PI * 1.5).rotateX(-Math.PI / 2),
};
export const WIRE_GLYPHS = new Set<Glyph>(['octa', 'ico', 'sphere']);

const BG = new Color(COLORS.bg);
const m = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const s = new Vector3();

/** Dims a color toward the background: on a dark scene this reads as transparency. */
export const fadeTo = (c: Color, f: number) => BG.clone().lerp(c, f);
export const scaled = (c: Color, f: number) => c.clone().multiplyScalar(f);

export function setInstance(mesh: InstancedMesh, i: number, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot?: Quaternion) {
  m.compose(p.set(...pos), rot ?? q.identity(), s.set(...scale));
  mesh.setMatrixAt(i, m);
}

export function commit(mesh: InstancedMesh) {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
}

/** Flattens polylines into LineSegments2 point pairs with matching per-vertex colors. */
export function toSegments(lines: { points: Vector3[]; color: Color }[]) {
  const points: Vector3[] = [];
  const colors: [number, number, number][] = [];
  for (const l of lines) {
    for (let i = 1; i < l.points.length; i++) {
      points.push(l.points[i - 1], l.points[i]);
      colors.push([l.color.r, l.color.g, l.color.b], [l.color.r, l.color.g, l.color.b]);
    }
  }
  return { points, colors };
}
