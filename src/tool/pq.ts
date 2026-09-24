// PQ (SMPTE ST 2084) pictures for LinkedIn: the same glow as the gain-map JPEG,
// but written as absolute brightness, with an ICC profile that says so.
//
// Only erasable TypeScript here: tools/check runs this file straight in Node.

const M1 = 2610 / 16384;
const M2 = (2523 / 4096) * 128;
const C1 = 3424 / 4096;
const C2 = (2413 / 4096) * 32;
const C3 = (2392 / 4096) * 32;

/** Brightness of "SDR white" in a PQ picture, per ITU-R BT.2408. */
const REFERENCE_WHITE_NITS = 203;

/** PQ signal (0 to 1) for a brightness in nits. */
export function pqEncode(nits: number): number {
  const y = Math.pow(Math.max(0, nits) / 10000, M1);
  return Math.pow((C1 + C2 * y) / (1 + C3 * y), M2);
}

/** Brightness in nits for a PQ signal (0 to 1). */
export function pqDecode(signal: number): number {
  const e = Math.pow(Math.min(1, Math.max(0, signal)), 1 / M2);
  return 10000 * Math.pow(Math.max(0, e - C1) / (C2 - C3 * e), 1 / M1);
}

const SRGB_TO_LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// Linear Rec.709 / sRGB primaries to linear Rec.2020 primaries (ITU-R BT.2087).
const R = [0.6274039, 0.329283, 0.0433131];
const G = [0.0690973, 0.9195404, 0.0113623];
const B = [0.0163914, 0.0880133, 0.8955953];

/**
 * The picture as 8-bit Rec.2020 PQ, three bytes per pixel.
 * Every pixel keeps the brightness it has in sRGB, with SDR white at
 * `whiteNits`, and glowing pixels are multiplied by up to 2^stops like a gain
 * map would: `mask` 0 is no boost, 255 is the full boost.
 */
export function encodePq(
  rgba: Uint8ClampedArray,
  mask: Uint8Array,
  stops: number,
  whiteNits = REFERENCE_WHITE_NITS,
): Uint8Array {
  const pixels = mask.length;
  const gains = new Float64Array(256);
  for (let i = 0; i < 256; i++) gains[i] = 2 ** ((stops * i) / 255) * whiteNits;

  const out = new Uint8Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    const r = SRGB_TO_LINEAR[rgba[i * 4]];
    const g = SRGB_TO_LINEAR[rgba[i * 4 + 1]];
    const b = SRGB_TO_LINEAR[rgba[i * 4 + 2]];
    const gain = gains[mask[i]];
    out[i * 3] = Math.round(pqEncode(gain * (R[0] * r + R[1] * g + R[2] * b)) * 255);
    out[i * 3 + 1] = Math.round(pqEncode(gain * (G[0] * r + G[1] * g + G[2] * b)) * 255);
    out[i * 3 + 2] = Math.round(pqEncode(gain * (B[0] * r + B[1] * g + B[2] * b)) * 255);
  }
  return out;
}

const CURVE_ENTRIES = 4096;

// s15Fixed16 numbers as ICC writes them.
const s15 = (value: number) => Math.round(value * 65536);

const D50 = [63190 / 65536, 1, 54061 / 65536]; // the ICC connection space white
// Bradford adaptation D65 to D50.
const BRADFORD = [
  1.0478112, 0.0228866, -0.050127, 0.0295424, 0.9904844, -0.0170491, -0.0092345, 0.0150436,
  0.7521316,
];
// Linear Rec.2020 to XYZ under D65.
const REC2020_D65 = [
  0.636958, 0.1446169, 0.168881, 0.2627002, 0.6779981, 0.0593017, 0, 0.0280727, 1.0609851,
];

function multiply(a: number[], b: number[]): number[] {
  const out: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      out.push(
        a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column],
      );
    }
  }
  return out;
}

/** Red, green and blue of Rec.2020 as XYZ under D50. */
export function rec2020Colorants(): number[][] {
  const m = multiply(BRADFORD, REC2020_D65);
  return [0, 1, 2].map((column) => [m[column], m[3 + column], m[6 + column]]);
}

class Writer {
  bytes: number[] = [];
  u16(value: number) {
    this.bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  u32(value: number) {
    this.bytes.push(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    );
  }
  s32(value: number) {
    this.u32(value | 0);
  }
  ascii(value: string) {
    for (let i = 0; i < value.length; i++) this.bytes.push(value.charCodeAt(i));
  }
  pad() {
    while (this.bytes.length % 4 !== 0) this.bytes.push(0);
  }
}

const xyzTag = (values: number[]) => {
  const w = new Writer();
  w.ascii("XYZ ");
  w.u32(0);
  values.forEach((v) => w.s32(s15(v)));
  return w.bytes;
};

const textTag = (text: string) => {
  const w = new Writer();
  w.ascii("mluc");
  w.u32(0);
  w.u32(1); // one record
  w.u32(12);
  w.ascii("enUS");
  w.u32(text.length * 2);
  w.u32(28);
  for (let i = 0; i < text.length; i++) w.u16(text.charCodeAt(i));
  return w.bytes;
};

const cicpTag = () => {
  const w = new Writer();
  w.ascii("cicp");
  w.u32(0);
  w.bytes.push(9, 16, 0, 1); // BT.2020 primaries, PQ, RGB, full range
  return w.bytes;
};

const chadTag = () => {
  const w = new Writer();
  w.ascii("sf32");
  w.u32(0);
  BRADFORD.forEach((v) => w.s32(s15(v)));
  return w.bytes;
};

// The curve is for software that ignores the cicp tag: it shows the picture as
// an ordinary SDR one, with everything above SDR white clipped. Software that
// reads the tag uses PQ instead and never looks at this.
function curveTag() {
  const w = new Writer();
  w.ascii("curv");
  w.u32(0);
  w.u32(CURVE_ENTRIES);
  for (let i = 0; i < CURVE_ENTRIES; i++) {
    const nits = pqDecode(i / (CURVE_ENTRIES - 1));
    w.u16(Math.round(Math.min(1, nits / REFERENCE_WHITE_NITS) * 65535));
  }
  return w.bytes;
}

/** ICC profile for Rec.2020 primaries and PQ, with the cicp tag HDR-aware software looks for. */
export function createPqProfile(): Uint8Array {
  const [red, green, blue] = rec2020Colorants();
  const curve = curveTag();
  const tags: [string, number[]][] = [
    ["desc", textTag("Rec. 2020 PQ")],
    ["cprt", textTag("No copyright, use freely")],
    ["wtpt", xyzTag(D50)],
    ["rXYZ", xyzTag(red)],
    ["gXYZ", xyzTag(green)],
    ["bXYZ", xyzTag(blue)],
    ["rTRC", curve],
    ["gTRC", curve],
    ["bTRC", curve],
    ["chad", chadTag()],
    ["cicp", cicpTag()],
  ];

  // Tag data, four-byte aligned; the three curves share one copy.
  const table = new Writer();
  const data = new Writer();
  const firstOffset = 128 + 4 + tags.length * 12;
  const seen = new Map<number[], number>();
  for (const [signature, body] of tags) {
    let offset = seen.get(body);
    if (offset === undefined) {
      offset = firstOffset + data.bytes.length;
      seen.set(body, offset);
      data.bytes.push(...body);
      data.pad();
    }
    table.ascii(signature);
    table.u32(offset);
    table.u32(body.length);
  }

  const header = new Writer();
  header.u32(firstOffset + data.bytes.length); // profile size
  header.ascii("\0\0\0\0"); // no preferred CMM
  header.u32(0x04300000); // version 4.3
  header.ascii("mntr");
  header.ascii("RGB ");
  header.ascii("XYZ ");
  [2026, 1, 1, 0, 0, 0].forEach((v) => header.u16(v)); // creation date
  header.ascii("acsp");
  header.ascii("\0\0\0\0"); // platform
  header.u32(0); // flags
  header.u32(0); // manufacturer
  header.u32(0); // model
  header.u32(0); // attributes, first half
  header.u32(0); // attributes, second half
  header.u32(0); // rendering intent: perceptual
  D50.forEach((v) => header.s32(s15(v)));
  header.ascii("\0\0\0\0"); // creator
  while (header.bytes.length < 128) header.bytes.push(0);

  const count = new Writer();
  count.u32(tags.length);
  return new Uint8Array([...header.bytes, ...count.bytes, ...table.bytes, ...data.bytes]);
}
