// Baseline JPEG encoder: one channel for the gain map, three for the PQ picture.
// Canvas can't be trusted with either. It only writes three-component JPEGs
// (the reference gain map in public/hdr-glow-swatch-7.5x.jpg has one), and it may color
// manage the pixels, which would change the PQ values. This writes exactly the
// bytes it is given: standard tables, no subsampling, JFIF header.
//
// Only erasable TypeScript here: tools/check runs this file straight in Node.

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

// Position in zigzag order of each coefficient in natural order.
const ZIGZAG_POSITION = new Array<number>(64);
ZIGZAG.forEach((natural, position) => {
  ZIGZAG_POSITION[natural] = position;
});

// Annex K luminance quantization table, natural order.
const BASE_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

// Annex K luminance Huffman tables: code lengths, then symbols.
const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125];
const AC_VALUES = [
  1, 2, 3, 0, 4, 17, 5, 18, 33, 49, 65, 6, 19, 81, 97, 7, 34, 113, 20, 50, 129, 145, 161, 8, 35, 66,
  177, 193, 21, 82, 209, 240, 36, 51, 98, 114, 130, 9, 10, 22, 23, 24, 25, 26, 37, 38, 39, 40, 41,
  42, 52, 53, 54, 55, 56, 57, 58, 67, 68, 69, 70, 71, 72, 73, 74, 83, 84, 85, 86, 87, 88, 89, 90,
  99, 100, 101, 102, 103, 104, 105, 106, 115, 116, 117, 118, 119, 120, 121, 122, 131, 132, 133, 134,
  135, 136, 137, 138, 146, 147, 148, 149, 150, 151, 152, 153, 154, 162, 163, 164, 165, 166, 167,
  168, 169, 170, 178, 179, 180, 181, 182, 183, 184, 185, 186, 194, 195, 196, 197, 198, 199, 200,
  201, 202, 210, 211, 212, 213, 214, 215, 216, 217, 218, 225, 226, 227, 228, 229, 230, 231, 232,
  233, 234, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250,
];

type HuffmanTable = { codes: Uint16Array; sizes: Uint8Array };

function huffmanTable(bits: number[], values: number[]): HuffmanTable {
  const codes = new Uint16Array(256);
  const sizes = new Uint8Array(256);
  let code = 0;
  let index = 0;
  for (let length = 1; length <= 16; length++) {
    for (let i = 0; i < bits[length - 1]; i++) {
      codes[values[index]] = code;
      sizes[values[index]] = length;
      index++;
      code++;
    }
    code <<= 1;
  }
  return { codes, sizes };
}

class BitWriter {
  private bytes = new Uint8Array(1 << 16);
  private length = 0;
  private accumulator = 0;
  private bitCount = 0;

  private push(byte: number) {
    if (this.length === this.bytes.length) {
      const bigger = new Uint8Array(this.bytes.length * 2);
      bigger.set(this.bytes);
      this.bytes = bigger;
    }
    this.bytes[this.length++] = byte;
  }

  write(code: number, size: number) {
    if (size === 0) return;
    this.accumulator = (this.accumulator << size) | (code & ((1 << size) - 1));
    this.bitCount += size;
    while (this.bitCount >= 8) {
      this.bitCount -= 8;
      const byte = (this.accumulator >> this.bitCount) & 0xff;
      this.push(byte);
      if (byte === 0xff) this.push(0); // byte stuffing
    }
    this.accumulator &= (1 << this.bitCount) - 1;
  }

  finish(): Uint8Array {
    if (this.bitCount > 0) this.write((1 << (8 - this.bitCount)) - 1, 8 - this.bitCount);
    return this.bytes.subarray(0, this.length);
  }
}

// DCT basis, so that coefficients = BASIS * block * BASIS^T.
const BASIS = new Float64Array(64);
for (let u = 0; u < 8; u++) {
  for (let x = 0; x < 8; x++) {
    BASIS[u * 8 + x] =
      (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
}

const bitLength = (value: number) => (value === 0 ? 0 : 32 - Math.clz32(value));

const u16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

/**
 * @param pixels one byte per pixel, row by row
 * @param quality 1 to 100, like libjpeg
 */
export function encodeGrayJpeg(
  pixels: Uint8Array,
  width: number,
  height: number,
  quality = 95,
): Uint8Array {
  if (pixels.length !== width * height) throw new Error("Pixel count does not match size");
  return encodePlanes([pixels], width, height, quality);
}

/**
 * Three channels, full-resolution color (4:4:4).
 * @param rgb three bytes per pixel, row by row
 * @param quality 1 to 100, like libjpeg; 100 keeps every step of the input
 */
export function encodeRgbJpeg(
  rgb: Uint8Array,
  width: number,
  height: number,
  quality = 98,
): Uint8Array {
  const pixels = width * height;
  if (rgb.length !== pixels * 3) throw new Error("Pixel count does not match size");
  const y = new Uint8Array(pixels);
  const cb = new Uint8Array(pixels);
  const cr = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    y[i] = clampByte(0.299 * r + 0.587 * g + 0.114 * b);
    cb[i] = clampByte(-0.168736 * r - 0.331264 * g + 0.5 * b + 128);
    cr[i] = clampByte(0.5 * r - 0.418688 * g - 0.081312 * b + 128);
  }
  return encodePlanes([y, cb, cr], width, height, quality);
}

/** Every plane uses the luminance tables, which the format allows. */
function encodePlanes(planes: Uint8Array[], width: number, height: number, quality: number) {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const scale = q < 50 ? 5000 / q : 200 - q * 2;
  const quant = BASE_QUANT.map((value) =>
    Math.min(255, Math.max(1, Math.floor((value * scale + 50) / 100))),
  );

  const dc = huffmanTable(DC_BITS, DC_VALUES);
  const ac = huffmanTable(AC_BITS, AC_VALUES);
  const bits = new BitWriter();

  const block = new Float64Array(64);
  const rows = new Float64Array(64);
  const zigzagged = new Int32Array(64);
  const previousDc = new Int32Array(planes.length);

  for (let blockY = 0; blockY < height; blockY += 8) {
    for (let blockX = 0; blockX < width; blockX += 8) {
      for (let plane = 0; plane < planes.length; plane++) {
        const pixels = planes[plane];
        // Edge blocks repeat the last row and column.
        for (let y = 0; y < 8; y++) {
          const sourceRow = Math.min(blockY + y, height - 1) * width;
          for (let x = 0; x < 8; x++) {
            block[y * 8 + x] = pixels[sourceRow + Math.min(blockX + x, width - 1)] - 128;
          }
        }
        for (let y = 0; y < 8; y++) {
          for (let u = 0; u < 8; u++) {
            let sum = 0;
            for (let x = 0; x < 8; x++) sum += BASIS[u * 8 + x] * block[y * 8 + x];
            rows[y * 8 + u] = sum;
          }
        }
        for (let v = 0; v < 8; v++) {
          for (let u = 0; u < 8; u++) {
            let sum = 0;
            for (let y = 0; y < 8; y++) sum += BASIS[v * 8 + y] * rows[y * 8 + u];
            const natural = v * 8 + u;
            zigzagged[ZIGZAG_POSITION[natural]] = Math.round(sum / quant[natural]);
          }
        }

        const difference = zigzagged[0] - previousDc[plane];
        previousDc[plane] = zigzagged[0];
        const dcSize = bitLength(Math.abs(difference));
        bits.write(dc.codes[dcSize], dc.sizes[dcSize]);
        bits.write(difference < 0 ? difference - 1 : difference, dcSize);

        let run = 0;
        for (let i = 1; i < 64; i++) {
          const value = zigzagged[i];
          if (value === 0) {
            run++;
            continue;
          }
          while (run > 15) {
            bits.write(ac.codes[0xf0], ac.sizes[0xf0]);
            run -= 16;
          }
          const size = bitLength(Math.abs(value));
          const symbol = (run << 4) | size;
          bits.write(ac.codes[symbol], ac.sizes[symbol]);
          bits.write(value < 0 ? value - 1 : value, size);
          run = 0;
        }
        if (run > 0) bits.write(ac.codes[0x00], ac.sizes[0x00]);
      }
    }
  }

  const count = planes.length;
  const componentIds = planes.map((_, i) => i + 1);
  const header = [
    0xff,
    0xd8,
    // APP0 JFIF 1.01, no density
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    // DQT
    0xff,
    0xdb,
    0x00,
    0x43,
    0x00,
    ...ZIGZAG.map((natural) => quant[natural]),
    // SOF0: 8 bit, 1x1 sampling and quantization table 0 for every component
    0xff,
    0xc0,
    ...u16(8 + 3 * count),
    0x08,
    ...u16(height),
    ...u16(width),
    count,
    ...componentIds.flatMap((id) => [id, 0x11, 0x00]),
    // DHT: DC table 0, then AC table 0
    0xff,
    0xc4,
    0x00,
    0x1f,
    0x00,
    ...DC_BITS,
    ...DC_VALUES,
    0xff,
    0xc4,
    0x00,
    0xb5,
    0x10,
    ...AC_BITS,
    ...AC_VALUES,
    // SOS: every component uses DC table 0 and AC table 0
    0xff,
    0xda,
    ...u16(6 + 2 * count),
    count,
    ...componentIds.flatMap((id) => [id, 0x00]),
    0x00,
    0x3f,
    0x00,
  ];
  const scan = bits.finish();
  const out = new Uint8Array(header.length + scan.length + 2);
  out.set(header);
  out.set(scan, header.length);
  out[out.length - 2] = 0xff;
  out[out.length - 1] = 0xd9;
  return out;
}
