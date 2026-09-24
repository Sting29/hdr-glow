// Canvas drawing for the page: the original picture, and a simulated glow for
// screens or browsers that can't show the real one.

const DISPLAY_SIDE = 900;

/** The size every preview canvas uses. The worker's mask preview has the same. */
export function displaySize(bitmap: ImageBitmap): { width: number; height: number } {
  const scale = Math.min(1, DISPLAY_SIDE / Math.max(bitmap.width, bitmap.height));
  return {
    width: Math.max(1, Math.round(bitmap.width * scale)),
    height: Math.max(1, Math.round(bitmap.height * scale)),
  };
}

/** The picture on its background, the way the tool sees it. */
export function drawOriginal(canvas: HTMLCanvasElement, bitmap: ImageBitmap, background: string) {
  const { width, height } = displaySize(bitmap);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
}

/**
 * The picture with the glowing parts pushed to their brightest, keeping their
 * color, plus a soft halo around them. An SDR screen can't show more than white,
 * so this only suggests the effect; the real glow is brighter.
 */
export function drawSimulated(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  background: string,
  mask: HTMLCanvasElement,
  boost: number,
) {
  drawOriginal(canvas, bitmap, background);
  const { width, height } = canvas;
  const context = canvas.getContext("2d")!;
  const strength = Math.min(1, Math.max(0, (boost - 1) / 6.5));

  // The picture kept only where the mask is on, each color scaled up until its
  // brightest channel is full. Scaling all channels together keeps the hue.
  const glow = document.createElement("canvas");
  glow.width = width;
  glow.height = height;
  const glowContext = glow.getContext("2d", { willReadFrequently: true })!;
  glowContext.drawImage(bitmap, 0, 0, width, height);
  const pixels = glowContext.getImageData(0, 0, width, height);
  const maskPixels = mask.getContext("2d")!.getImageData(0, 0, mask.width, mask.height);
  const lift = 0.4 + 0.6 * strength;
  for (let y = 0; y < height; y++) {
    const maskRow = Math.min(mask.height - 1, Math.floor((y * mask.height) / height)) * mask.width;
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const strengthHere =
        maskPixels.data[
          (maskRow + Math.min(mask.width - 1, Math.floor((x * mask.width) / width))) * 4
        ];
      const brightest = Math.max(
        pixels.data[offset],
        pixels.data[offset + 1],
        pixels.data[offset + 2],
      );
      const scale = brightest > 0 ? 1 + (255 / brightest - 1) * lift : 1;
      pixels.data[offset] = Math.min(255, pixels.data[offset] * scale);
      pixels.data[offset + 1] = Math.min(255, pixels.data[offset + 1] * scale);
      pixels.data[offset + 2] = Math.min(255, pixels.data[offset + 2] * scale);
      pixels.data[offset + 3] = (pixels.data[offset + 3] * strengthHere) / 255;
    }
  }
  glowContext.putImageData(pixels, 0, 0);

  context.drawImage(glow, 0, 0);
  if ("filter" in context) {
    context.globalCompositeOperation = "lighter";
    context.filter = `blur(${Math.max(2, width / 70)}px)`;
    context.globalAlpha = 0.35 + 0.55 * strength;
    context.drawImage(glow, 0, 0);
    context.filter = "none";
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
  }
}
