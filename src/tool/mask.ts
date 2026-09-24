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

// Two floors: plain white/gray only counts as a candidate when it is
// genuinely bright (antialiasing and background noise stay out), but a
// saturated color (a leaf, a logo's brand color) reads as "meant to glow"
// at a noticeably lower raw lightness, so it gets its own, lower floor.
const NEUTRAL_LIGHT = 0.7;
const CHROMA_LIGHT = 0.5;
// Below this OKLab chroma a pixel has no real hue of its own: it is grouped
// with the neutral (white/gray) family instead of a color family.
const CHROMA_MIN = 0.04;
const HUE_BINS = 12; // 30° each
// The neutral family plus at most this many distinct hues, e.g. a logo with
// a white part and two brand colors (a red and a blue wordmark, say).
const MAX_FAMILIES = 3;
// Shades picked from inside one family: enough to cover a metallic gradient
// end to end without reaching so far that a busy dark background's own JPEG
// noise starts looking like one more shade of the same family.
const SHADES_PER_FAMILY = 3;
const MAX_SUGGESTIONS = 6;
const MIN_SHARE = 0.002; // ignore a shade, or a whole family, this rare
const MAX_SHARE = 0.6; // this common is the background (transparent areas count)
const WHITE_DISTANCE = 0.05;
// Two candidates this close in OKLab are the same shade, not two different
// colors, so only the more common one is kept.
const MERGE_DISTANCE = 0.08;

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const NEUTRAL_FAMILY = HUE_BINS; // one slot past the last hue bin

/**
 * The colors most likely meant to glow, most common first. Pixels are first
 * split into color families: white/gray, and up to a dozen hue directions
 * (a red, a green, a blue, ...). White wins the first slot whenever the image
 * has some that is not the background; the rest of the families are then
 * ranked by how much of the image they cover, largest first, and each
 * contributes a few of its own most common shades. That way a shaded or
 * metallic logo glows across its whole gradient without extra clicks, and a
 * logo with a couple of honestly different brand colors gets one of each
 * instead of only the single most common tone.
 */
export function suggestColors(
  lab: Float32Array,
  rgba: Uint8ClampedArray,
  alpha: Uint8Array,
): RGB[] {
  const pixels = alpha.length;
  const counts = new Uint32Array(4096);
  const sums = new Float64Array(4096 * 3);
  // Which family each bucket belongs to; -1 means the bucket never appears.
  const bucketFamily = new Int8Array(4096).fill(-1);
  const familyShare = new Float64Array(HUE_BINS + 1);

  for (let i = 0; i < pixels; i++) {
    if (alpha[i] < 128) continue;
    const L = lab[i * 3];
    const a = lab[i * 3 + 1];
    const b = lab[i * 3 + 2];
    const chroma = Math.hypot(a, b);
    let family: number;
    if (chroma < CHROMA_MIN) {
      if (L < NEUTRAL_LIGHT) continue;
      family = NEUTRAL_FAMILY;
    } else {
      if (L < CHROMA_LIGHT) continue;
      family = Math.floor(((Math.atan2(b, a) + Math.PI) / (2 * Math.PI)) * HUE_BINS) % HUE_BINS;
    }
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const bl = rgba[i * 4 + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4);
    counts[key]++;
    sums[key * 3] += r;
    sums[key * 3 + 1] += g;
    sums[key * 3 + 2] += bl;
    bucketFamily[key] = family;
    familyShare[family] += 1;
  }

  const colorOf = (key: number): RGB => ({
    r: Math.round(sums[key * 3] / counts[key]),
    g: Math.round(sums[key * 3 + 1] / counts[key]),
    b: Math.round(sums[key * 3 + 2] / counts[key]),
  });
  const snapToWhite = (color: RGB): RGB => {
    const [L, a, b] = labOfColors([color]);
    const [wL, wa, wb] = labOfColors([WHITE]);
    return Math.hypot(L - wL, a - wa, b - wb) <= WHITE_DISTANCE ? WHITE : color;
  };

  const chosen: RGB[] = [];
  const chosenLab: number[] = []; // flat L, a, b per chosen color

  const add = (color: RGB): boolean => {
    const [L, a, b] = labOfColors([color]);
    for (let i = 0; i < chosenLab.length; i += 3) {
      if (
        Math.hypot(L - chosenLab[i], a - chosenLab[i + 1], b - chosenLab[i + 2]) < MERGE_DISTANCE
      ) {
        return false;
      }
    }
    chosen.push(color);
    chosenLab.push(L, a, b);
    return true;
  };

  // Rank the families that are neither too rare nor the background, white
  // first whenever it qualifies, the rest by how much of the image they cover.
  const families: number[] = [];
  for (let family = 0; family <= HUE_BINS; family++) {
    const share = familyShare[family] / pixels;
    if (share >= MIN_SHARE && share <= MAX_SHARE) families.push(family);
  }
  const whiteQualifies =
    counts[0xfff] > 0 &&
    bucketFamily[0xfff] === NEUTRAL_FAMILY &&
    families.includes(NEUTRAL_FAMILY);
  families.sort((x, y) => {
    if (whiteQualifies) {
      if (x === NEUTRAL_FAMILY) return -1;
      if (y === NEUTRAL_FAMILY) return 1;
    }
    return familyShare[y] - familyShare[x];
  });

  for (const family of families.slice(0, MAX_FAMILIES)) {
    // That family's own buckets, most common shade first.
    const shades: number[] = [];
    for (let key = 0; key < 4096; key++) {
      if (bucketFamily[key] !== family) continue;
      const share = counts[key] / pixels;
      if (share >= MIN_SHARE && share <= MAX_SHARE) shades.push(key);
    }
    shades.sort((x, y) => counts[y] - counts[x]);

    if (family === NEUTRAL_FAMILY && whiteQualifies) add(WHITE);
    let added = family === NEUTRAL_FAMILY && whiteQualifies ? 1 : 0;
    for (const key of shades) {
      if (added >= SHADES_PER_FAMILY || chosen.length >= MAX_SUGGESTIONS) break;
      if (add(snapToWhite(colorOf(key)))) added++;
    }
    if (chosen.length >= MAX_SUGGESTIONS) break;
  }
  return chosen;
}
