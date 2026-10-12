/**
 * Crops a snapshot PNG to the tower: the bounding box of every pixel that differs from the background, plus a
 * small margin. The snapshot page is a fixed 1600×1000 frame, so the tower alone would sit in the middle of a
 * dark field; cropping lets it fill the figure width. The background is read from the corner pixel, so the
 * result does not depend on the scene's colours.
 */

const MARGIN = 0.03; // share of the cropped size kept around the tower, so its edges are not cut
const TOLERANCE = 12; // per channel: anti-aliased edges and faint haze count as background, not as tower

/** The PNG data URL cropped to the tower. Resolves with the input unchanged when nothing differs from the background. */
export async function cropToContent(png: string): Promise<string> {
  const img = await loadImage(png);
  const { width, height } = img;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2D canvas for the crop');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);

  const bg = [data[0], data[1], data[2]];
  const box = contentBox(data, width, height, bg);
  if (!box) return png;

  const mx = Math.round((box.maxX - box.minX + 1) * MARGIN);
  const my = Math.round((box.maxY - box.minY + 1) * MARGIN);
  const x = Math.max(0, box.minX - mx);
  const y = Math.max(0, box.minY - my);
  const w = Math.min(width, box.maxX + mx + 1) - x;
  const h = Math.min(height, box.maxY + my + 1) - y;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('no 2D canvas for the crop');
  octx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return out.toDataURL('image/png');
}

/** The bounding box of the pixels that differ from the background, or undefined when there are none. */
function contentBox(data: Uint8ClampedArray, width: number, height: number, bg: number[]) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        Math.abs(data[i] - bg[0]) <= TOLERANCE &&
        Math.abs(data[i + 1] - bg[1]) <= TOLERANCE &&
        Math.abs(data[i + 2] - bg[2]) <= TOLERANCE
      ) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? undefined : { minX, minY, maxX, maxY };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('could not decode the snapshot PNG'));
    img.src = src;
  });
}
