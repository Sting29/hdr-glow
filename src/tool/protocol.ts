import type { MaskParams, RGB } from "./mask";

/** Larger images are scaled down to this on their longest side. */
export const MAX_SIDE = 2048;

/** Messages from the page to the worker. `id` pairs a request with its response. */
export type WorkerRequest =
  | { id: number; type: "load"; bitmap: ImageBitmap; background: string }
  | { id: number; type: "background"; background: string }
  | { id: number; type: "pick"; x: number; y: number }
  | { id: number; type: "preview"; params: MaskParams }
  | { id: number; type: "build"; params: MaskParams; stops: number }
  | { id: number; type: "buildPq"; params: MaskParams; stops: number };

export type LoadResult = { width: number; height: number; suggested: RGB[] };

export type PreviewResult = {
  width: number;
  height: number;
  /** RGBA, the mask drawn as gray. */
  pixels: Uint8ClampedArray<ArrayBuffer>;
  /** Share of the image that glows, 0 to 1. */
  coverage: number;
};

export type BuildResult = { jpeg: Uint8Array<ArrayBuffer> };

export type WorkerResponse =
  | { id: number; ok: true; skipped?: boolean; result?: unknown }
  | { id: number; ok: false; error: string };
