import { useEffect, useRef, useState } from "react";
import { assembleGainMapJpeg } from "./tool/container";
import { encodeGrayJpeg, encodeRgbJpeg } from "./tool/jpeg";

const SIZE = 64;
const MIN_BOOST = 1.5;
const MAX_BOOST = 7.5; // the same peak as the built-in swatch

/** A flat white square with a uniform gain map, the same shape as the built-in swatch. */
function buildSwatch(boost: number): Uint8Array {
  const white = new Uint8Array(SIZE * SIZE * 3).fill(255);
  const base = encodeRgbJpeg(white, SIZE, SIZE, 100);
  const full = new Uint8Array(SIZE * SIZE).fill(255);
  const gainMap = encodeGrayJpeg(full, SIZE, SIZE, 95);
  return assembleGainMapJpeg({ base, gainMap, maxBoost: boost });
}

/**
 * Lets a visitor pick their own intensity for the background-clip: text swatch,
 * instead of only the fixed 7.5x file. A 64x64 JPEG encodes fast enough to just
 * rebuild it on every slider move, no debounce or worker needed.
 */
export function SwatchGenerator() {
  const [boost, setBoost] = useState(MAX_BOOST);
  const urlRef = useRef<string | null>(null);
  const [file, setFile] = useState<{ url: string; size: number } | null>(null);

  useEffect(() => {
    const jpeg = buildSwatch(boost) as Uint8Array<ArrayBuffer>;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(new Blob([jpeg], { type: "image/jpeg" }));
    urlRef.current = url;
    setFile({ url, size: jpeg.length });
  }, [boost]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const fileName = `swatch-${boost.toFixed(1)}x.jpg`;

  return (
    <div className="swatch-gen">
      <label className="field">
        <span>
          Or make your own: {boost.toFixed(1)}× brighter (+{Math.log2(boost).toFixed(1)} stops)
        </span>
        <input
          type="range"
          min={MIN_BOOST}
          max={MAX_BOOST}
          step="0.1"
          value={boost}
          onChange={(event) => setBoost(Number(event.target.value))}
        />
      </label>
      {file ? (
        <a className="button" href={file.url} download={fileName}>
          Download {fileName} ({Math.round(file.size / 1024)} KB)
        </a>
      ) : null}
    </div>
  );
}
