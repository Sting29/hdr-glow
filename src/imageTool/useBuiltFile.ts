import { useEffect, useRef, useState, type RefObject } from "react";
import { logError } from "../log";
import type { ImageWorker } from "../tool/imageWorker";
import type { MaskParams } from "../tool/mask";

export type Result = { url: string; size: number };

export type BuildInputs = {
  ready: boolean;
  /** Changes whenever the worker's pixels change. */
  version: number;
  params: MaskParams;
  boost: number;
};

/**
 * Builds a file in the worker whenever the inputs settle, and keeps its object
 * URL until the next one replaces it.
 */
export function useBuiltFile(
  workerRef: RefObject<ImageWorker | null>,
  method: "build" | "buildPq",
  delay: number,
  { ready, version, params, boost }: BuildInputs,
  onError: () => void,
) {
  const urlRef = useRef<string | null>(null);
  const [file, setFile] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const { colors, tolerance, softness } = params;

  const publish = (jpeg: Uint8Array<ArrayBuffer> | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    if (!jpeg) {
      setFile(null);
      return;
    }
    urlRef.current = URL.createObjectURL(new Blob([jpeg], { type: "image/jpeg" }));
    setFile({ url: urlRef.current, size: jpeg.length });
  };

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!ready || colors.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const built = await workerRef.current?.[method](
          { colors, tolerance, softness },
          Math.log2(boost),
        );
        if (cancelled || !built) return;
        publish(built.jpeg);
      } catch (caught) {
        logError(`building the ${method === "build" ? "HDR" : "PQ"} JPEG failed`, caught);
        if (!cancelled) onError();
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // publish and onError only touch state setters and refs, so they are left out on purpose.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, version, colors, tolerance, softness, boost, method, delay]);

  // With no colors chosen there is nothing to offer, whatever was built before.
  return { file: colors.length === 0 ? null : file, busy, clear: () => publish(null) };
}
