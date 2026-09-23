import { assembleGainMapJpeg, embedIccProfile } from "./container";
import { encodeGrayJpeg, encodeRgbJpeg } from "./jpeg";
import { computeMask, suggestColors, toOklab, type MaskParams, type RGB } from "./mask";
import { createPqProfile, encodePq } from "./pq";
import { MAX_SIDE, type BuildResult, type LoadResult, type PreviewResult } from "./protocol";

const PREVIEW_SIDE = 900;
// Chrome switches from 4:2:0 to full-resolution color only at quality 1, and
// subsampled color would smear saturated edges away from the mask.
const BASE_QUALITY = 1;
const GAIN_MAP_QUALITY = 95;
const PQ_QUALITY = 98;

type Context = OffscreenCanvasRenderingContext2D;

const contextOf = (canvas: OffscreenCanvas): Context => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available");
  return context;
};

/**
 * Everything about the loaded image, kept in the worker: the picture flattened
 * onto a background, its OKLab copy, its alpha, and the current mask.
 */
export class Pipeline {
  private bitmap: ImageBitmap | null = null;
  private width = 0;
  private height = 0;
  private flat: OffscreenCanvas | null = null;
  private rgba = new Uint8ClampedArray(0);
  private alpha = new Uint8Array(0);
  private lab: Float32Array = new Float32Array(0);
  private mask = new Uint8Array(0);

  load(bitmap: ImageBitmap, background: string): LoadResult {
    this.bitmap?.close();
    this.bitmap = bitmap;
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    this.width = Math.max(1, Math.round(bitmap.width * scale));
    this.height = Math.max(1, Math.round(bitmap.height * scale));

    // Alpha comes from a transparent draw, so that a background color can't hide it.
    const clear = contextOf(new OffscreenCanvas(this.width, this.height));
    clear.drawImage(bitmap, 0, 0, this.width, this.height);
    const { data } = clear.getImageData(0, 0, this.width, this.height);
    this.alpha = new Uint8Array(this.width * this.height);
    for (let i = 0; i < this.alpha.length; i++) this.alpha[i] = data[i * 4 + 3];
    this.mask = new Uint8Array(this.alpha.length);

    this.flatten(background);
    return {
      width: this.width,
      height: this.height,
      suggested: suggestColors(this.lab, this.rgba, this.alpha),
    };
  }

  setBackground(background: string): void {
    this.flatten(background);
  }

  /** Color under a point given as a share of the width and height. */
  pick(x: number, y: number): RGB {
    this.requireImage();
    const column = Math.min(this.width - 1, Math.max(0, Math.floor(x * this.width)));
    const row = Math.min(this.height - 1, Math.max(0, Math.floor(y * this.height)));
    const offset = (row * this.width + column) * 4;
    return { r: this.rgba[offset], g: this.rgba[offset + 1], b: this.rgba[offset + 2] };
  }

  preview(params: MaskParams): PreviewResult {
    this.requireImage();
    computeMask(this.lab, this.alpha, params, this.mask);

    const scale = Math.min(1, PREVIEW_SIDE / Math.max(this.width, this.height));
    const width = Math.max(1, Math.round(this.width * scale));
    const height = Math.max(1, Math.round(this.height * scale));
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const sourceRow = Math.min(this.height - 1, Math.floor(y / scale)) * this.width;
      for (let x = 0; x < width; x++) {
        const value = this.mask[sourceRow + Math.min(this.width - 1, Math.floor(x / scale))];
        const offset = (y * width + x) * 4;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value;
        pixels[offset + 3] = 255;
      }
    }

    let sum = 0;
    for (let i = 0; i < this.mask.length; i++) sum += this.mask[i];
    return { width, height, pixels, coverage: sum / (255 * this.mask.length) };
  }

  /** The finished HDR JPEG: the flattened picture plus a gain map made from the mask. */
  async build(params: MaskParams, stops: number): Promise<BuildResult> {
    this.requireImage();
    computeMask(this.lab, this.alpha, params, this.mask);
    const blob = await this.flat!.convertToBlob({ type: "image/jpeg", quality: BASE_QUALITY });
    const base = new Uint8Array(await blob.arrayBuffer());
    // Gain map 0 = no boost, 255 = full boost, so the mask is the gain map as it is.
    const gainMap = encodeGrayJpeg(this.mask, this.width, this.height, GAIN_MAP_QUALITY);
    const jpeg = assembleGainMapJpeg({ base, gainMap, maxBoost: 2 ** stops });
    return { jpeg: jpeg as Uint8Array<ArrayBuffer> };
  }

  /**
   * The LinkedIn version: the same glow written as Rec.2020 PQ pixels with a
   * profile that says so, instead of a base picture plus a gain map.
   */
  buildPq(params: MaskParams, stops: number): BuildResult {
    this.requireImage();
    computeMask(this.lab, this.alpha, params, this.mask);
    const rgb = encodePq(this.rgba, this.mask, stops);
    const jpeg = embedIccProfile(encodeRgbJpeg(rgb, this.width, this.height, PQ_QUALITY), createPqProfile());
    return { jpeg: jpeg as Uint8Array<ArrayBuffer> };
  }

  private flatten(background: string): void {
    this.requireImage();
    const canvas = new OffscreenCanvas(this.width, this.height);
    const context = contextOf(canvas);
    context.fillStyle = background;
    context.fillRect(0, 0, this.width, this.height);
    context.drawImage(this.bitmap!, 0, 0, this.width, this.height);
    this.flat = canvas;
    this.rgba = context.getImageData(0, 0, this.width, this.height).data;
    this.lab = toOklab(this.rgba);
  }

  private requireImage(): void {
    if (!this.bitmap) throw new Error("No image loaded");
  }
}
