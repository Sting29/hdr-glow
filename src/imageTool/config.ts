export const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB
export const MAX_SVG_BYTES = 5 * 1024 * 1024; // SVG is text; this big usually means embedded images
export const MAX_MEGAPIXELS = 100; // guards the browser's own decode, before our MAX_SIDE downscale ever runs
export const MIN_TOLERANCE = 0.02;
export const MAX_TOLERANCE = 0.5;
export const DEFAULT_TOLERANCE = 0.12;
export const DEFAULT_SOFTNESS = 0.5;
export const MAX_BOOST = 7.5; // the same peak as the swatch, +2.9 stops
export const PREVIEW_DELAY = 60;
export const BUILD_DELAY = 400;
export const PQ_BUILD_DELAY = 600;
export const BACKGROUND_DELAY = 150;

export const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
