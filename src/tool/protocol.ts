import type { MaskParams, RGB } from "./mask";

/** Larger images are scaled down to this on their longest side. */
export const MAX_SIDE = 2048;

/** What each request carries, besides its type and id. */
export type Requests = {
  load: { bitmap: ImageBitmap; background: string };
  background: { background: string };
  pick: { x: number; y: number };
  preview: { params: MaskParams };
  build: { params: MaskParams; stops: number };
  buildPq: { params: MaskParams; stops: number };
};

/** Requests where only the newest matters: an older one still queued is skipped. */
export type Skippable = "preview" | "build" | "buildPq";

/** Messages from the page to the worker. `id` pairs a request with its response. */
export type WorkerRequest = {
  [K in keyof Requests]: { id: number; type: K } & Requests[K];
}[keyof Requests];

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

/** What each request resolves to. */
export type Results = {
  load: LoadResult;
  background: void;
  pick: RGB;
  preview: PreviewResult;
  build: BuildResult;
  buildPq: BuildResult;
};

export type WorkerResponse =
  | { id: number; ok: true; skipped?: boolean; result?: unknown }
  | { id: number; ok: false; error: string };
