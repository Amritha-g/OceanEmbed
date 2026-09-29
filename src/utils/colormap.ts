import { ProductGrid } from './api';

// Sequential ramp (low → high); same stops as the server bulletin
const RAMP: Array<[number, number, number]> = [
  [247, 251, 255], [198, 219, 239], [107, 174, 214], [33, 113, 181],
  [253, 174, 97], [244, 109, 67], [215, 48, 39], [165, 0, 38],
];

export const RAMP_CSS = `linear-gradient(90deg, ${RAMP.map(([r, g, b]) => `rgb(${r},${g},${b})`).join(', ')})`;

/** Default colour range per product, so maps are comparable across days. */
export const PRODUCT_RANGE: Record<ProductGrid['var'], [number, number]> = {
  tchp: [0, 120], d26: [0, 150], mld: [0, 80], sld: [0, 100], sigma100: [0, 1.5],
};

function rampColor(v: number, lo: number, hi: number): [number, number, number] {
  const f = hi <= lo ? 0 : Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return RAMP[Math.min(RAMP.length - 1, Math.floor(f * RAMP.length))];
}

/** Render a product grid to a PNG data URL (north up), transparent on land. */
export function gridToDataUrl(grid: ProductGrid, lo: number, hi: number): string {
  const H = grid.lat.length;
  const W = grid.lon.length;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < H; i++) {
    const row = H - 1 - i; // lat ascends, image rows go down
    for (let j = 0; j < W; j++) {
      const v = grid.values[i][j];
      const k = (row * W + j) * 4;
      if (v === null) continue;
      const [r, g, b] = rampColor(v, lo, hi);
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = 190;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
