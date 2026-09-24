// Run: npm run check
// Checks the pure image modules in Node (no browser, no build step).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addGlowColor, MAX_GLOW_COLORS, parseHex, sameColor } from "../../src/tool/colors.ts";
import { assembleGainMapJpeg, embedIccProfile } from "../../src/tool/container.ts";
import { encodeGrayJpeg, encodeRgbJpeg } from "../../src/tool/jpeg.ts";
import { computeMask, suggestColors, toOklab } from "../../src/tool/mask.ts";
import { detectBrowser } from "../../src/browserSupport.ts";
import {
  createPqProfile,
  encodePq,
  pqDecode,
  pqEncode,
  rec2020Colorants,
} from "../../src/tool/pq.ts";

let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log("ok   ", name);
  } catch (error) {
    failed++;
    console.log("FAIL ", name, "\n     ", error.message);
  }
};

// ---- container: must reproduce the libultrahdr swatch byte for byte ----
const reference = new Uint8Array(
  readFileSync(new URL("../../public/hdr-glow-swatch-7.5x.jpg", import.meta.url)),
);
const cut =
  reference.findIndex(
    (_, i) =>
      reference[i] === 0xff &&
      reference[i + 1] === 0xd9 &&
      reference[i + 2] === 0xff &&
      reference[i + 3] === 0xd8,
  ) + 2;

test("container: hdr-glow-swatch-7.5x.jpg is rebuilt byte for byte", () => {
  const rebuilt = assembleGainMapJpeg({
    base: reference.subarray(0, cut),
    gainMap: reference.subarray(cut),
    maxBoost: 7.5,
  });
  assert.equal(rebuilt.length, reference.length);
  assert.ok(Buffer.from(rebuilt).equals(Buffer.from(reference)), "bytes differ");
});

test("container: other boosts change only the numbers", () => {
  const rebuilt = assembleGainMapJpeg({
    base: reference.subarray(0, cut),
    gainMap: reference.subarray(cut),
    maxBoost: 4,
  });
  const text = Buffer.from(rebuilt).toString("latin1");
  assert.ok(text.includes('hdrgm:GainMapMax="2"'));
  assert.ok(text.includes('hdrgm:HDRCapacityMax="2"'));
  assert.equal(rebuilt.length, reference.length - 12); // "2.90689" -> "2" is 6 characters shorter, twice
});

test("container: rejects a boost that would not brighten anything", () => {
  assert.throws(() =>
    assembleGainMapJpeg({
      base: reference.subarray(0, cut),
      gainMap: reference.subarray(cut),
      maxBoost: 1,
    }),
  );
});

// ---- gray JPEG: structure (decoding is checked separately against the OS decoder) ----
test("gray jpeg: one component, right size, ends with EOI", () => {
  const width = 37;
  const height = 21;
  const pixels = new Uint8Array(width * height).map((_, i) => (i * 7) % 256);
  const jpeg = encodeGrayJpeg(pixels, width, height, 95);
  assert.deepEqual([jpeg[0], jpeg[1]], [0xff, 0xd8]);
  assert.deepEqual([jpeg[jpeg.length - 2], jpeg[jpeg.length - 1]], [0xff, 0xd9]);
  const sof = jpeg.findIndex((_, i) => jpeg[i] === 0xff && jpeg[i + 1] === 0xc0);
  assert.equal(jpeg[sof + 9], 1, "component count");
  assert.equal((jpeg[sof + 5] << 8) | jpeg[sof + 6], height);
  assert.equal((jpeg[sof + 7] << 8) | jpeg[sof + 8], width);
});

test("rgb jpeg: three components with 1x1 sampling, right size, ends with EOI", () => {
  const width = 19;
  const height = 11;
  const jpeg = encodeRgbJpeg(
    new Uint8Array(width * height * 3).map((_, i) => (i * 5) % 256),
    width,
    height,
    98,
  );
  assert.deepEqual([jpeg[0], jpeg[1]], [0xff, 0xd8]);
  assert.deepEqual([jpeg[jpeg.length - 2], jpeg[jpeg.length - 1]], [0xff, 0xd9]);
  const sof = jpeg.findIndex((_, i) => jpeg[i] === 0xff && jpeg[i + 1] === 0xc0);
  assert.equal(jpeg[sof + 9], 3, "component count");
  assert.deepEqual([jpeg[sof + 11], jpeg[sof + 14], jpeg[sof + 17]], [0x11, 0x11, 0x11]);
  assert.equal((jpeg[sof + 5] << 8) | jpeg[sof + 6], height);
  assert.equal((jpeg[sof + 7] << 8) | jpeg[sof + 8], width);
});

// ---- PQ ----
test("pq: matches the ST 2084 and BT.2408 reference points", () => {
  assert.ok(pqEncode(0) < 1e-5, "ST 2084 gives 7e-7 for zero, which is code 0 in 8 bits");
  assert.ok(Math.abs(pqEncode(10000) - 1) < 1e-9);
  assert.ok(Math.abs(pqEncode(203) - 0.5807) < 5e-4, "203 nits is about 58%");
  assert.ok(Math.abs(pqEncode(1000) - 0.7518) < 5e-4, "1000 nits is about 75%");
  for (const nits of [0.1, 5, 100, 203, 1522, 9000]) {
    assert.ok(Math.abs(pqDecode(pqEncode(nits)) / nits - 1) < 1e-9, `round trip ${nits}`);
  }
});

test("pq: SDR white is 203 nits, glowing white is 7.5 times that, black stays black", () => {
  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
  const out = encodePq(rgba, new Uint8Array([0, 255, 255]), Math.log2(7.5));
  const nits = (i) => pqDecode(out[i * 3] / 255);
  assert.ok(Math.abs(nits(0) / 203 - 1) < 0.01, `SDR white ${nits(0)}`);
  assert.ok(Math.abs(nits(1) / 1522.5 - 1) < 0.02, `glowing white ${nits(1)}`);
  assert.equal(out[6], 0, "black stays black even where the mask is on");
});

test("pq: a partial mask boosts less, in stops", () => {
  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
  const out = encodePq(rgba, new Uint8Array([0, 128]), 2);
  const ratio = pqDecode(out[3] / 255) / pqDecode(out[0] / 255);
  assert.ok(
    Math.abs(Math.log2(ratio) - (2 * 128) / 255) < 0.03,
    `half mask is ${Math.log2(ratio)} stops`,
  );
});

test("icc: valid header, tag table inside the file, cicp says BT.2020 + PQ, colorants add up to D50", () => {
  const profile = createPqProfile();
  const view = new DataView(profile.buffer);
  assert.equal(view.getUint32(0), profile.length, "size field");
  assert.equal(Buffer.from(profile.subarray(36, 40)).toString(), "acsp");
  assert.equal(Buffer.from(profile.subarray(16, 24)).toString(), "RGB XYZ ");
  const tags = {};
  for (let i = 0; i < view.getUint32(128); i++) {
    const at = 132 + i * 12;
    const [offset, size] = [view.getUint32(at + 4), view.getUint32(at + 8)];
    assert.ok(offset % 4 === 0 && offset + size <= profile.length, "tag inside the file");
    tags[Buffer.from(profile.subarray(at, at + 4)).toString()] = offset;
  }
  for (const name of [
    "desc",
    "cprt",
    "wtpt",
    "rXYZ",
    "gXYZ",
    "bXYZ",
    "rTRC",
    "gTRC",
    "bTRC",
    "chad",
    "cicp",
  ]) {
    assert.ok(name in tags, `${name} present`);
  }
  assert.deepEqual(Array.from(profile.subarray(tags.cicp + 8, tags.cicp + 12)), [9, 16, 0, 1]);
  const sum = [0, 1, 2].map((axis) => rec2020Colorants().reduce((total, c) => total + c[axis], 0));
  assert.ok(
    Math.abs(sum[0] - 0.9642) < 1e-3 &&
      Math.abs(sum[1] - 1) < 1e-3 &&
      Math.abs(sum[2] - 0.8249) < 1e-3,
    sum.join(" "),
  );
  // the fallback curve for software that ignores cicp: clipped at SDR white
  const curve = tags.rTRC + 12;
  const last = view.getUint16(curve + 2 * 4095);
  assert.equal(last, 65535, "clipped at the top");
  assert.ok(
    view.getUint16(curve + 2 * 100) < view.getUint16(curve + 2 * 2000),
    "rises with the signal",
  );
});

test("icc: embedIccProfile puts one ICC segment right after the JFIF header and drops other metadata", () => {
  const jpeg = encodeRgbJpeg(new Uint8Array(8 * 8 * 3).fill(120), 8, 8, 90);
  const profile = createPqProfile();
  const withProfile = embedIccProfile(embedIccProfile(jpeg, new Uint8Array(200)), profile);
  const text = Buffer.from(withProfile).toString("latin1");
  assert.equal(text.split("ICC_PROFILE").length - 1, 1, "exactly one profile");
  assert.equal(withProfile[2], 0xff);
  assert.equal(withProfile[3], 0xe0, "JFIF first");
  const app2 = 2 + 2 + ((withProfile[4] << 8) | withProfile[5]);
  assert.deepEqual([withProfile[app2], withProfile[app2 + 1]], [0xff, 0xe2]);
  const length = (withProfile[app2 + 2] << 8) | withProfile[app2 + 3];
  assert.equal(length, 2 + 12 + 2 + profile.length);
});

// ---- browser support ----
test("browser: Chrome 137+ and Safari 26+ show HDR, older ones and Firefox do not", () => {
  const mac =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)";
  const cases = [
    [`${mac} Chrome/152.0.0.0 Safari/537.36`, "Chrome", 152, true],
    [`${mac} Chrome/137.0.0.0 Safari/537.36`, "Chrome", 137, true],
    [`${mac} Chrome/136.0.0.0 Safari/537.36`, "Chrome", 136, false],
    [`${mac} Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0`, "Edge", 138, true],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      "Safari",
      26,
      true,
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
      "Safari",
      18,
      false,
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
      "Safari",
      26,
      true,
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/152.0.7977.76 Mobile/15E148 Safari/604.1",
      "Chrome",
      18,
      false,
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/152.0.7977.76 Mobile/15E148 Safari/604.1",
      "Chrome",
      26,
      true,
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
      "Firefox",
      140,
      false,
    ],
    ["SomethingElse/1.0", "Your browser", 0, false],
  ];
  for (const [ua, name, version, showsHdr] of cases) {
    assert.deepEqual(detectBrowser(ua), { name, version, showsHdr }, ua);
  }
});

// ---- mask ----
const pixelsOf = (list) => {
  const rgba = new Uint8ClampedArray(list.length * 4);
  list.forEach(([r, g, b, a = 255], i) => rgba.set([r, g, b, a], i * 4));
  const alpha = new Uint8Array(list.length).map((_, i) => rgba[i * 4 + 3]);
  return { rgba, alpha, lab: toOklab(rgba) };
};
const maskOf = (list, params) => {
  const { lab, alpha } = pixelsOf(list);
  const out = new Uint8Array(list.length);
  computeMask(lab, alpha, params, out);
  return Array.from(out);
};
const WHITE = { r: 255, g: 255, b: 255 };
const GREEN = { r: 0, g: 200, b: 60 };

test("mask: white glows, black does not, nothing chosen means nothing glows", () => {
  const list = [
    [255, 255, 255],
    [0, 0, 0],
    [0, 200, 60],
  ];
  assert.deepEqual(maskOf(list, { colors: [WHITE], tolerance: 0.1, softness: 0 }), [255, 0, 0]);
  assert.deepEqual(maskOf(list, { colors: [], tolerance: 0.1, softness: 0 }), [0, 0, 0]);
});

test("mask: several colors, and the black of a green-on-black logo stays out", () => {
  const list = [
    [255, 255, 255],
    [0, 200, 60],
    [0, 0, 0],
  ];
  assert.deepEqual(
    maskOf(list, { colors: [WHITE, GREEN], tolerance: 0.1, softness: 0 }),
    [255, 255, 0],
  );
});

test("mask: transparent pixels never glow, half-transparent ones glow half", () => {
  const list = [
    [255, 255, 255, 0],
    [255, 255, 255, 128],
    [255, 255, 255, 255],
  ];
  assert.deepEqual(maskOf(list, { colors: [WHITE], tolerance: 0.1, softness: 0 }), [0, 128, 255]);
});

test("mask: softness fades out between the inner radius and the tolerance", () => {
  const grays = [255, 240, 225, 210, 150].map((v) => [v, v, v]);
  const hard = maskOf(grays, { colors: [WHITE], tolerance: 0.15, softness: 0 });
  const soft = maskOf(grays, { colors: [WHITE], tolerance: 0.15, softness: 1 });
  assert.equal(hard[0], 255);
  assert.ok(
    hard.every((v) => v === 0 || v === 255),
    "hard edge has only 0 and 255",
  );
  assert.ok(
    soft.some((v) => v > 0 && v < 255),
    "soft edge has in-between values",
  );
  assert.ok(
    soft.every((v, i) => i === 0 || v <= soft[i - 1]),
    "gets weaker as gray gets darker",
  );
});

test("suggest: picks white on a dark logo, a light non-white color when there is no white, nothing on a plain background", () => {
  const dark = Array.from({ length: 1000 }, (_, i) => (i < 100 ? [255, 255, 255] : [10, 10, 30]));
  const cream = Array.from({ length: 1000 }, (_, i) => (i < 100 ? [245, 233, 200] : [10, 60, 70]));
  const plain = Array.from({ length: 1000 }, () => [255, 255, 255]);
  const suggest = (list) => {
    const { lab, rgba, alpha } = pixelsOf(list);
    return suggestColors(lab, rgba, alpha);
  };
  assert.deepEqual(suggest(dark), [WHITE]);
  const found = suggest(cream);
  assert.equal(found.length, 1);
  assert.ok(
    Math.abs(found[0].r - 245) <= 8 && Math.abs(found[0].b - 200) <= 8,
    JSON.stringify(found),
  );
  assert.deepEqual(suggest(plain), []);
});

test("suggest: a white shape on a transparent background is still white", () => {
  const star = Array.from({ length: 1000 }, (_, i) =>
    i < 300 ? [255, 255, 255, 255] : [0, 0, 0, 0],
  );
  const { lab, rgba, alpha } = pixelsOf(star);
  assert.deepEqual(suggestColors(lab, rgba, alpha), [WHITE]);
});

test("suggest: white comes first even when a green covers more of the image, but both are offered", () => {
  const list = Array.from({ length: 1000 }, (_, i) =>
    i < 100 ? [255, 255, 255] : i < 400 ? [0, 200, 60] : [0, 0, 0],
  );
  const { lab, rgba, alpha } = pixelsOf(list);
  assert.deepEqual(suggestColors(lab, rgba, alpha), [WHITE, GREEN]);
});

test("suggest: a metallic gradient (white fading to gray) offers several shades, not just white", () => {
  // A silver logo like the sample lighthouse: a spread of grays from white down to mid-gray,
  // one band per suggestion slot so full coverage is actually reachable.
  const shades = [255, 230, 205, 185, 165].flatMap((v) =>
    Array.from({ length: 40 }, () => [v, v, v]),
  );
  const background = Array.from({ length: 4000 }, () => [20, 20, 30]);
  const { lab, rgba, alpha } = pixelsOf([...shades, ...background]);
  const found = suggestColors(lab, rgba, alpha);
  assert.ok(found.length > 1, `expected several shades, got ${JSON.stringify(found)}`);
  assert.deepEqual(found[0], WHITE, "white still comes first");
  assert.ok(found.length <= 5, "capped at a handful of suggestions");
  // covering the gradient means computeMask lights up all seven shades at once
  const mask = new Uint8Array(shades.length);
  computeMask(
    toOklab(pixelsOf(shades).rgba),
    pixelsOf(shades).alpha,
    { colors: found, tolerance: 0.12, softness: 0.5 },
    mask,
  );
  const litFraction = mask.reduce((sum, v) => sum + (v > 0 ? 1 : 0), 0) / mask.length;
  assert.ok(
    litFraction > 0.9,
    `expected almost the whole gradient to glow, only ${litFraction * 100}% did`,
  );
});

test("suggest: near-duplicate shades collapse into one suggestion", () => {
  // Two clusters that are practically the same white, just off by JPEG noise, on a dark logo.
  const list = Array.from({ length: 1000 }, (_, i) => {
    if (i < 50) return [255, 255, 255];
    if (i < 100) return [253, 254, 252];
    return [10, 10, 30];
  });
  const { lab, rgba, alpha } = pixelsOf(list);
  assert.deepEqual(suggestColors(lab, rgba, alpha), [WHITE]);
});

// ---- swatch: the user-adjustable background-clip: text swatch ----
// Mirrors buildSwatch() in src/tool/swatch.ts. That file can't be imported here directly:
// it imports container.ts/jpeg.ts by extensionless specifier for Vite, which Node's own
// ESM loader (used to run this file) requires an extension for.
const SWATCH_SIZE = 64;
const buildSwatch = (boost) => {
  const white = new Uint8Array(SWATCH_SIZE * SWATCH_SIZE * 3).fill(255);
  const base = encodeRgbJpeg(white, SWATCH_SIZE, SWATCH_SIZE, 100);
  const full = new Uint8Array(SWATCH_SIZE * SWATCH_SIZE).fill(255);
  const gainMap = encodeGrayJpeg(full, SWATCH_SIZE, SWATCH_SIZE, 95);
  return assembleGainMapJpeg({ base, gainMap, maxBoost: boost });
};

test("swatch: buildSwatch returns a JPEG that starts with SOI and ends with EOI", () => {
  const jpeg = buildSwatch(7.5);
  assert.deepEqual([jpeg[0], jpeg[1]], [0xff, 0xd8]);
  assert.deepEqual([jpeg[jpeg.length - 2], jpeg[jpeg.length - 1]], [0xff, 0xd9]);
});

test("swatch: a higher boost produces different bytes than a lower boost", () => {
  const low = buildSwatch(1.5);
  const high = buildSwatch(7.5);
  assert.notEqual(Buffer.from(low).toString("latin1"), Buffer.from(high).toString("latin1"));
});

// ---- colors: hex parsing and the manual glow-color list ----

test("parseHex: accepts #rgb, rgb, #rrggbb and rrggbb", () => {
  assert.deepEqual(parseHex("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHex("fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHex("#a86bff"), { r: 168, g: 107, b: 255 });
  assert.deepEqual(parseHex("a86bff"), { r: 168, g: 107, b: 255 });
});

test("parseHex: trims whitespace and is case-insensitive", () => {
  assert.deepEqual(parseHex("  #FFF  "), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHex("A86BFF"), { r: 168, g: 107, b: 255 });
});

test("parseHex: rejects anything that isn't 3 or 6 hex digits", () => {
  assert.equal(parseHex("not-a-color"), null);
  assert.equal(parseHex("#ffff"), null); // 4 digits, not a valid short form
  assert.equal(parseHex("#gggggg"), null); // not hex digits
  assert.equal(parseHex(""), null);
});

test("addGlowColor: dedupes by value", () => {
  const list = [{ r: 255, g: 255, b: 255 }];
  const result = addGlowColor(list, { r: 255, g: 255, b: 255 });
  assert.equal(result, list, "should return the same reference, not a new array");
});

test("addGlowColor: adds a genuinely new color", () => {
  const list = [{ r: 255, g: 255, b: 255 }];
  const result = addGlowColor(list, { r: 0, g: 0, b: 0 });
  assert.deepEqual(result, [
    { r: 255, g: 255, b: 255 },
    { r: 0, g: 0, b: 0 },
  ]);
});

test("addGlowColor: stops at MAX_GLOW_COLORS", () => {
  const list = Array.from({ length: MAX_GLOW_COLORS }, (_, i) => ({ r: i, g: 0, b: 0 }));
  const result = addGlowColor(list, { r: 250, g: 0, b: 0 });
  assert.equal(result, list, "a full list should not grow");
  assert.equal(result.length, MAX_GLOW_COLORS);
});

test("sameColor: compares by value, not reference", () => {
  assert.ok(sameColor({ r: 1, g: 2, b: 3 }, { r: 1, g: 2, b: 3 }));
  assert.ok(!sameColor({ r: 1, g: 2, b: 3 }, { r: 1, g: 2, b: 4 }));
});

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
