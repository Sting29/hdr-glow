import { useEffect, useRef, useState } from "react";
import { buildSwatch, MAX_SWATCH_BOOST, MIN_SWATCH_BOOST } from "./tool/swatch";

/**
 * Lets a visitor pick their own intensity for the background-clip: text swatch,
 * instead of only the fixed 7.5x file. A 64x64 JPEG encodes fast enough to just
 * rebuild it on every slider move, no debounce or worker needed.
 */
export function SwatchGenerator() {
  const [boost, setBoost] = useState(MAX_SWATCH_BOOST);
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

  const fileName = `hdr-glow-swatch-${boost.toFixed(1)}x.jpg`;

  return (
    <div className="swatch-gen">
      <p className="swatch-gen__hint">
        This tiny image is what the CSS above cuts the letters out of. Lower the strength for a
        subtler glow.
      </p>
      <label className="field">
        <span>
          Glow strength: {boost.toFixed(1)}× brighter than white (+{Math.log2(boost).toFixed(1)}{" "}
          stops)
        </span>
        <input
          type="range"
          min={MIN_SWATCH_BOOST}
          max={MAX_SWATCH_BOOST}
          step="0.1"
          value={boost}
          onChange={(event) => setBoost(Number(event.target.value))}
        />
      </label>
      {file ? (
        <a className="button" href={file.url} download={fileName}>
          Download glow image ({Math.round(file.size / 1024)} KB)
        </a>
      ) : null}
    </div>
  );
}
