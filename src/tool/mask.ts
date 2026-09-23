// The glow mask: for every pixel, how much of the boost it should get (0 to 255).
// A pixel glows when its color is close to one of the chosen colors, measured
// in OKLab so that "close" matches what the eye sees.
//
// Only erasable TypeScript here: tools/check runs this file straight in Node.

export type RGB = { r: number; g: number; b: number };

export type MaskParams = {
  colors: RGB[];
  /** OKLab distance at which a pixel stops glowing. */
  tolerance: number;
  /** 0 = hard edge at the tolerance, 1 = fades out from the chosen color itself. */
  softness: number;
};

const LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function oklab(r: number, g: number, b: number, out: Float32Array | number[], offset: number) {
  const lr = LINEAR[r];
  const lg = LINEAR[g];
  const lb = LINEAR[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  out[offset] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[offset + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[offset + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/** OKLab (L, a, b) of every pixel of an RGBA buffer, three floats per pixel. */
export function toOklab(rgba: Uint8ClampedArray): Float32Array {
  const pixels = rgba.length / 4;
  const lab = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i++) oklab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], lab, i * 3);
  return lab;
}

function labOfColors(colors: RGB[]): Float32Array {
  const lab = new Float32Array(colors.length * 3);
  colors.forEach((color, i) => oklab(color.r, color.g, color.b, lab, i * 3));
  return lab;
}

/**
 * Fills `out` (one byte per pixel) with the mask.
 * Fully transparent pixels never glow: the mask is scaled by `alpha`.
 */
export function computeMask(
  lab: Float32Array,
  alpha: Uint8Array,
  { colors, tolerance, softness }: MaskParams,
  out: Uint8Array,
): void {
  const pixels = out.length;
  if (colors.length === 0) {
    out.fill(0);
    return;
  }
  const targets = labOfColors(colors);
  const inner = tolerance * (1 - softness);
  const span = tolerance - inner;

  for (let i = 0; i < pixels; i++) {
    const L = lab[i * 3];
    const a = lab[i * 3 + 1];
    const b = lab[i * 3 + 2];
    let nearest = Infinity;
    for (let c = 0; c < targets.length; c += 3) {
      const dL = L - targets[c];
      const da = a - targets[c + 1];
      const db = b - targets[c + 2];
      const squared = dL * dL + da * da + db * db;
      if (squared < nearest) nearest = squared;
    }
    const distance = Math.sqrt(nearest);
    let strength: number;
    if (distance <= inner) strength = 1;
    else if (distance >= tolerance) strength = 0;
    else {
      const t = (distance - inner) / span;
      strength = 1 - t * t * (3 - 2 * t);
    }
    out[i] = Math.round(strength * alpha[i]);
  }
}

const LIGHT = 0.7; // OKLab lightness above which a color is a candidate
const MIN_SHARE = 0.002; // ignore colors that cover less of the image
const MAX_SHARE = 0.6; // a color that fills most of the image is the background (transparent areas count)
const WHITE_DISTANCE = 0.05;

/**
 * The color most likely meant to glow. White wins whenever the image has some
 * that is not the background. Otherwise the most common light color that is not
 * the background, snapped to pure white when it is close enough.
 */
export function suggestColors(lab: Float32Array, rgba: Uint8ClampedArray, alpha: Uint8Array): RGB[] {
  const pixels = alpha.length;
  const counts = new Uint32Array(4096);
  const sums = new Float64Array(4096 * 3);

  for (let i = 0; i < pixels; i++) {
    if (alpha[i] < 128 || lab[i * 3] < LIGHT) continue;
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    counts[key]++;
    sums[key * 3] += r;
    sums[key * 3 + 1] += g;
    sums[key * 3 + 2] += b;
  }

  const whiteShare = counts[0xfff] / pixels;
  if (whiteShare >= MIN_SHARE && whiteShare <= MAX_SHARE) return [{ r: 255, g: 255, b: 255 }];

  let best = -1;
  for (let key = 0; key < 4096; key++) {
    const share = counts[key] / pixels;
    if (share < MIN_SHARE || share > MAX_SHARE) continue;
    if (best < 0 || counts[key] > counts[best]) best = key;
  }
  if (best < 0) return [];

  const color: RGB = {
    r: Math.round(sums[best * 3] / counts[best]),
    g: Math.round(sums[best * 3 + 1] / counts[best]),
    b: Math.round(sums[best * 3 + 2] / counts[best]),
  };
  const found = labOfColors([color]);
  const white = labOfColors([{ r: 255, g: 255, b: 255 }]);
  const distance = Math.hypot(found[0] - white[0], found[1] - white[1], found[2] - white[2]);
  return [distance <= WHITE_DISTANCE ? { r: 255, g: 255, b: 255 } : color];
}
