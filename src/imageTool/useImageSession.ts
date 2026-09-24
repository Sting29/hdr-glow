import { useEffect, useRef, useState } from "react";
import { logError } from "../log";
import { isSvg, rasterizeSvg } from "../rasterize";
import { makeSample, type SampleId } from "../samples";
import { ImageWorker } from "../tool/imageWorker";
import type { LoadResult } from "../tool/protocol";
import {
  BACKGROUND_DELAY,
  formatSize,
  MAX_FILE_BYTES,
  MAX_MEGAPIXELS,
  MAX_SVG_BYTES,
} from "./config";

/**
 * The loaded picture and everything that follows from it: the worker that holds
 * its pixels, the background it is flattened onto, and the error to show.
 */
export function useImageSession() {
  const workerRef = useRef<ImageWorker | null>(null);
  const appliedBackground = useRef("#000000");
  // Numbers each load, so a slow older one cannot overwrite a newer one that finished first.
  const latestLoad = useRef(0);

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [fileName, setFileName] = useState("logo");
  const [fromSvg, setFromSvg] = useState(false);
  const [background, setBackground] = useState("#000000");
  // Bumped whenever the worker's pixels change, so that previews and builds rerun.
  const [pixelsVersion, setPixelsVersion] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const worker = new ImageWorker();
    workerRef.current = worker;
    return () => {
      worker.dispose();
      workerRef.current = null;
    };
  }, []);

  // A new background color changes the pixels the worker sees.
  useEffect(() => {
    if (!bitmap || background === appliedBackground.current) return;
    const timer = window.setTimeout(() => {
      workerRef.current
        ?.setBackground(background)
        .then(() => {
          appliedBackground.current = background;
          setPixelsVersion((version) => version + 1);
        })
        .catch((caught) => {
          logError("changing the background failed", caught);
          setError("Could not change the background.");
        });
    }, BACKGROUND_DELAY);
    return () => window.clearTimeout(timer);
  }, [bitmap, background]);

  /** `onLoaded` runs in the same tick as the state updates, so they render together. */
  const loadFile = async (file: File, onLoaded: (info: LoadResult) => void) => {
    const worker = workerRef.current;
    if (!worker) return;
    const loadId = ++latestLoad.current;
    const isStale = () => loadId !== latestLoad.current;
    setError("");
    const svg = isSvg(file);
    const sizeLimit = svg ? MAX_SVG_BYTES : MAX_FILE_BYTES;
    if (file.size > sizeLimit) {
      setError(`This file is ${formatSize(file.size)}. Use one under ${formatSize(sizeLimit)}.`);
      return;
    }
    // Until the bitmap is handed to state it belongs to this function, so every
    // early exit and failure has to close it.
    let decoded: ImageBitmap | null = null;
    try {
      decoded = svg ? await rasterizeSvg(file) : await createImageBitmap(file);
      if (isStale()) {
        decoded.close();
        return;
      }
      const { width, height } = decoded;
      if (width * height > MAX_MEGAPIXELS * 1_000_000) {
        setError(
          `This image is ${width}×${height}, too large to process. Use one under ${MAX_MEGAPIXELS} megapixels.`,
        );
        decoded.close();
        return;
      }
      const info = await worker.load(decoded, background);
      if (isStale()) {
        decoded.close();
        return;
      }
      const accepted = decoded;
      decoded = null;
      appliedBackground.current = background;
      setBitmap((previous) => {
        // The old bitmap is released once React has stopped drawing it.
        if (previous) queueMicrotask(() => previous.close());
        return accepted;
      });
      setFileName(file.name.replace(/\.[^.]+$/, "") || "logo");
      setFromSvg(svg);
      setPixelsVersion((version) => version + 1);
      onLoaded(info);
    } catch (caught) {
      logError("reading the image failed", caught);
      decoded?.close();
      setError(
        svg && caught instanceof Error
          ? caught.message
          : "This file could not be read as an image. Use a PNG, JPEG, WebP, AVIF or SVG.",
      );
    }
  };

  const loadSample = async (id: SampleId, onLoaded: (info: LoadResult) => void) => {
    try {
      await loadFile(await makeSample(id), onLoaded);
    } catch (caught) {
      logError("loading the sample failed", caught);
      setError("Could not draw the sample.");
    }
  };

  return {
    workerRef,
    bitmap,
    fileName,
    fromSvg,
    background,
    setBackground,
    pixelsVersion,
    error,
    setError,
    loadFile,
    loadSample,
  };
}
