import { assembleGainMapJpeg } from "./container";
import { encodeGrayJpeg, encodeRgbJpeg } from "./jpeg";

export const SWATCH_SIZE = 64;
export const MIN_SWATCH_BOOST = 1.5;
export const MAX_SWATCH_BOOST = 7.5; // the same peak as the built-in swatch

/** A flat white square with a uniform gain map, the same shape as the built-in swatch. */
export function buildSwatch(boost: number): Uint8Array {
  const white = new Uint8Array(SWATCH_SIZE * SWATCH_SIZE * 3).fill(255);
  const base = encodeRgbJpeg(white, SWATCH_SIZE, SWATCH_SIZE, 100);
  const full = new Uint8Array(SWATCH_SIZE * SWATCH_SIZE).fill(255);
  const gainMap = encodeGrayJpeg(full, SWATCH_SIZE, SWATCH_SIZE, 95);
  return assembleGainMapJpeg({ base, gainMap, maxBoost: boost });
}
