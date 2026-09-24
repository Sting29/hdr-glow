import { useEffect, useRef, useState, type RefObject } from "react";
import { logError } from "../log";
import type { ImageWorker } from "../tool/imageWorker";
import type { MaskParams } from "../tool/mask";
import { PREVIEW_DELAY } from "./config";

type Inputs = {
  workerRef: RefObject<ImageWorker | null>;
  bitmap: ImageBitmap | null;
  pixelsVersion: number;
  params: MaskParams;
  onError: (message: string) => void;
};

/** Draws the glow mask, as gray, into a canvas whenever the colors or sliders settle. */
export function useMaskPreview({ workerRef, bitmap, pixelsVersion, params, onError }: Inputs) {
  const maskCanvas = useRef<HTMLCanvasElement>(null);
  const [coverage, setCoverage] = useState<number | null>(null);
  // Bumped whenever the mask canvas is redrawn, so the simulation follows it.
  const [maskVersion, setMaskVersion] = useState(0);
  const { colors, tolerance, softness } = params;

  useEffect(() => {
    if (!bitmap) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const preview = await workerRef.current?.preview({ colors, tolerance, softness });
        const canvas = maskCanvas.current;
        if (cancelled || !preview || !canvas) return;
        canvas.width = preview.width;
        canvas.height = preview.height;
        canvas
          .getContext("2d")!
          .putImageData(new ImageData(preview.pixels, preview.width, preview.height), 0, 0);
        setCoverage(preview.coverage);
        setMaskVersion((version) => version + 1);
      } catch (caught) {
        logError("computing the mask failed", caught);
        if (!cancelled) onError("Could not compute the glow mask.");
      }
    }, PREVIEW_DELAY);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // workerRef and onError are stable (a ref and a state setter).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, pixelsVersion, colors, tolerance, softness]);

  return { maskCanvas, coverage, maskVersion, resetCoverage: () => setCoverage(null) };
}
