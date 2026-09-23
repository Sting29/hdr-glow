import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Compare } from "./Compare";
import { drawOriginal, drawSimulated } from "./preview";
import { isSvg, rasterizeSvg } from "./rasterize";
import { makeSample, SAMPLES, type SampleId } from "./samples";
import { HDR_CLASS } from "./snippets";
import { describeSupport, type HdrSupport } from "./useHdrDisplay";
import { addGlowColor, MAX_GLOW_COLORS, parseHex, sameColor } from "./tool/colors";
import { ImageWorker } from "./tool/imageWorker";
import type { MaskParams, RGB } from "./tool/mask";
import { MAX_SIDE } from "./tool/protocol";

const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB
const MAX_SVG_BYTES = 5 * 1024 * 1024; // SVG is text; this big usually means embedded images
const MAX_MEGAPIXELS = 100; // guards the browser's own decode, before our MAX_SIDE downscale ever runs
const MIN_TOLERANCE = 0.02;
const MAX_TOLERANCE = 0.5;
const DEFAULT_TOLERANCE = 0.12;
const DEFAULT_SOFTNESS = 0.5;
const MAX_BOOST = 7.5; // the same peak as the swatch, +2.9 stops
const PREVIEW_DELAY = 60;
const BUILD_DELAY = 400;
const PQ_BUILD_DELAY = 600;
const BACKGROUND_DELAY = 150;

type Result = { url: string; size: number };
type Mode = "live" | "simulated";

const hex = ({ r, g, b }: RGB) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

type BuildInputs = {
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
function useBuiltFile(
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
    if (!ready) return;
    if (colors.length === 0) {
      publish(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const built = await workerRef.current?.[method]({ colors, tolerance, softness }, Math.log2(boost));
        if (cancelled || !built) return;
        publish(built.jpeg);
      } catch {
        if (!cancelled) onError();
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // publish and onError only touch state setters and refs
  }, [ready, version, colors, tolerance, softness, boost, method, delay]);

  return { file, busy, clear: () => publish(null) };
}

type CardProps = {
  title: string;
  lede: string;
  file: Result | null;
  busy: boolean;
  downloadName: string;
  buttonLabel: string;
  emptyText: string;
  note: ReactNode;
};

function ResultCard({ title, lede, file, busy, downloadName, buttonLabel, emptyText, note }: CardProps) {
  return (
    <section className="result" aria-live="polite">
      <h3 className="result__title">{title}</h3>
      <p className="tool__note">{lede}</p>
      {file ? (
        <>
          <img className="tool__image" src={file.url} alt={`${title}, the file you can download`} />
          <p className="result__size">
            {formatSize(file.size)}
            {busy ? ", updating…" : ""}
          </p>
          <a className="button" href={file.url} download={downloadName}>
            {buttonLabel}
          </a>
          <p className="tool__note">{note}</p>
        </>
      ) : (
        <p className="tool__note">{busy ? "Building…" : emptyText}</p>
      )}
    </section>
  );
}

type Props = { support: HdrSupport };

export function ImageTool({ support }: Props) {
  const ids = useId();
  const workerRef = useRef<ImageWorker | null>(null);
  const sourceCanvas = useRef<HTMLCanvasElement>(null);
  const maskCanvas = useRef<HTMLCanvasElement>(null);
  const beforeCanvas = useRef<HTMLCanvasElement>(null);
  const simulatedCanvas = useRef<HTMLCanvasElement>(null);
  const appliedBackground = useRef("#000000");

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [fileName, setFileName] = useState("logo");
  const [colors, setColors] = useState<RGB[]>([]);
  const [suggestedColors, setSuggestedColors] = useState<RGB[]>([]);
  const [hexInput, setHexInput] = useState("");
  const [hexError, setHexError] = useState<string | null>(null);
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE);
  const [softness, setSoftness] = useState(DEFAULT_SOFTNESS);
  const [boost, setBoost] = useState(MAX_BOOST);
  const [background, setBackground] = useState("#000000");
  // Bumped whenever the worker's pixels change, so that previews and builds rerun.
  const [pixelsVersion, setPixelsVersion] = useState(0);
  const [coverage, setCoverage] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fromSvg, setFromSvg] = useState(false);
  const [mode, setMode] = useState<Mode>(support.live ? "live" : "simulated");
  // Bumped whenever the mask canvas is redrawn, so the simulation follows it.
  const [maskVersion, setMaskVersion] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const worker = new ImageWorker();
    workerRef.current = worker;
    return () => {
      worker.dispose();
      workerRef.current = null;
    };
  }, []);

  const inputs: BuildInputs = {
    ready: bitmap !== null,
    version: pixelsVersion,
    params: { colors, tolerance, softness },
    boost,
  };
  const hdrFile = useBuiltFile(workerRef, "build", BUILD_DELAY, inputs, () =>
    setError("Could not build the HDR JPEG."),
  );
  const pqFile = useBuiltFile(workerRef, "buildPq", PQ_BUILD_DELAY, inputs, () =>
    setError("Could not build the LinkedIn PQ JPEG."),
  );

  const loadFile = async (file: File) => {
    const worker = workerRef.current;
    if (!worker) return;
    setError("");
    const svg = isSvg(file);
    const sizeLimit = svg ? MAX_SVG_BYTES : MAX_FILE_BYTES;
    if (file.size > sizeLimit) {
      setError(`This file is ${formatSize(file.size)}. Use one under ${formatSize(sizeLimit)}.`);
      return;
    }
    try {
      const decoded = svg ? await rasterizeSvg(file) : await createImageBitmap(file);
      if (decoded.width * decoded.height > MAX_MEGAPIXELS * 1_000_000) {
        decoded.close();
        setError(`This image is ${decoded.width}×${decoded.height}, too large to process. Use one under ${MAX_MEGAPIXELS} megapixels.`);
        return;
      }
      const info = await worker.load(decoded, background);
      appliedBackground.current = background;
      setBitmap((previous) => {
        // The old bitmap is released once React has stopped drawing it.
        if (previous) queueMicrotask(() => previous.close());
        return decoded;
      });
      setFileName(file.name.replace(/\.[^.]+$/, "") || "logo");
      setFromSvg(svg);
      setColors(info.suggested);
      setSuggestedColors(info.suggested);
      setCoverage(null);
      hdrFile.clear();
      pqFile.clear();
      setPixelsVersion((version) => version + 1);
    } catch (caught) {
      setError(
        svg && caught instanceof Error
          ? caught.message
          : "This file could not be read as an image. Use a PNG, JPEG, WebP, AVIF or SVG.",
      );
    }
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  // The original, both where the person clicks and as the "before" of the preview.
  useEffect(() => {
    if (!bitmap) return;
    for (const canvas of [sourceCanvas.current, beforeCanvas.current]) {
      if (canvas) drawOriginal(canvas, bitmap, background);
    }
  }, [bitmap, background]);

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
        .catch(() => setError("Could not change the background."));
    }, BACKGROUND_DELAY);
    return () => window.clearTimeout(timer);
  }, [bitmap, background]);

  // The mask, drawn as gray.
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
        canvas.getContext("2d")!.putImageData(
          new ImageData(preview.pixels, preview.width, preview.height),
          0,
          0,
        );
        setCoverage(preview.coverage);
        setMaskVersion((version) => version + 1);
      } catch {
        if (!cancelled) setError("Could not compute the glow mask.");
      }
    }, PREVIEW_DELAY);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bitmap, pixelsVersion, colors, tolerance, softness]);

  // The simulated glow, for when the real one can't be shown.
  useEffect(() => {
    const canvas = simulatedCanvas.current;
    const mask = maskCanvas.current;
    if (!bitmap || mode !== "simulated" || !canvas || !mask || mask.width === 0) return;
    drawSimulated(canvas, bitmap, background, mask, boost);
  }, [bitmap, background, boost, mode, maskVersion]);

  const loadSample = async (id: SampleId) => {
    try {
      await loadFile(await makeSample(id));
    } catch {
      setError("Could not draw the sample.");
    }
  };

  const addColor = (color: RGB) => {
    setColors((list) => addGlowColor(list, color));
  };

  const onPick = async (event: MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    try {
      const color = await workerRef.current?.pick(
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
      );
      if (color) addColor(color);
    } catch {
      setError("Could not read the color there.");
    }
  };

  const addHexColor = () => {
    const color = parseHex(hexInput);
    if (!color) {
      setHexError("Not a color. Use a hex code like #fff or #a86bff.");
      return;
    }
    if (colors.length >= MAX_GLOW_COLORS && !colors.some((c) => sameColor(c, color))) {
      setHexError(`Up to ${MAX_GLOW_COLORS} colors. Remove one first.`);
      return;
    }
    addColor(color);
    setHexInput("");
    setHexError(null);
  };

  return (
    <section id="image" className="tool" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className={`section-title ${HDR_CLASS}`}>
        Image
      </h2>
      <p className="section-lede">
        Pick the colors that should outshine the page. Everything else stays exactly as drawn.
      </p>

      <label
        className="drop"
        data-active={dragging}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,image/svg+xml,.svg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadFile(file);
            event.target.value = "";
          }}
        />
        <span className="drop__title">
          {bitmap ? "Drag another image in, or click to browse" : "Drag a logo in, or click to browse"}
        </span>
        <span className="drop__hint">
          PNG, JPEG, WebP, AVIF or SVG. Processed in your browser, nothing is uploaded.
        </span>
      </label>

      <p className="samples">
        No logo at hand? Try a sample:
        {SAMPLES.map((sample) => (
          <button key={sample.id} type="button" className="samples__button" onClick={() => void loadSample(sample.id)}>
            {sample.label}
          </button>
        ))}
      </p>

      {error ? (
        <p className="tool__error" role="alert">
          {error}
        </p>
      ) : null}

      {bitmap ? (
        <>
          <div className="tool__panes">
            <figure className="pane">
              <figcaption>Click the image to add a color that glows</figcaption>
              <canvas
                ref={sourceCanvas}
                className="pane__canvas pane__canvas--pick"
                onClick={onPick}
                aria-label="Your image. Click a color to make it glow."
              />
            </figure>
            <figure className="pane">
              <figcaption>
                Glow mask
                {coverage === null ? "" : `, ${Math.round(coverage * 100)}% of the image`}
              </figcaption>
              <canvas
                ref={maskCanvas}
                className="pane__canvas"
                aria-label="White where the image will glow."
              />
            </figure>
          </div>

          <div className="tool__controls">
            <div className="field">
              <span>Glowing colors</span>
              <ul className="chips">
                {colors.map((color) => (
                  <li key={hex(color)}>
                    <button
                      type="button"
                      className="chip"
                      aria-label={`Remove ${hex(color)}`}
                      onClick={() =>
                        setColors((list) => list.filter((other) => !sameColor(other, color)))
                      }
                    >
                      <span className="chip__swatch" style={{ background: hex(color) }} />
                      <code>{hex(color)}</code>
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
                {colors.length === 0 ? (
                  <li className="chips__empty">None yet. Click a color in the image.</li>
                ) : null}
              </ul>

              <p className="hex-add__hint">Know the exact color? Type its hex code to add it here.</p>

              <form
                className="hex-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  addHexColor();
                }}
              >
                <label className="sr-only" htmlFor={`${ids}-hex`}>
                  Add a color by hex code
                </label>
                <input
                  id={`${ids}-hex`}
                  className="hex-add__input"
                  type="text"
                  inputMode="text"
                  placeholder="#rrggbb"
                  value={hexInput}
                  aria-invalid={hexError !== null}
                  onChange={(event) => {
                    setHexInput(event.target.value);
                    setHexError(null);
                  }}
                />
                <button type="submit" className="hex-add__button">
                  Add color
                </button>
              </form>
              {hexError ? (
                <p className="hex-add__error" role="alert">
                  {hexError}
                </p>
              ) : null}

              {suggestedColors.some((s) => !colors.some((c) => sameColor(c, s))) ? (
                <div className="hex-add__suggested">
                  <span>Found in the image:</span>
                  <ul className="chips">
                    {suggestedColors
                      .filter((s) => !colors.some((c) => sameColor(c, s)))
                      .map((color) => (
                        <li key={hex(color)}>
                          <button type="button" className="chip" onClick={() => addColor(color)}>
                            <span className="chip__swatch" style={{ background: hex(color) }} />
                            <code>{hex(color)}</code>
                            <span aria-hidden="true">+</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <label className="field">
              <span>Color range: {Math.round(((tolerance - MIN_TOLERANCE) / (MAX_TOLERANCE - MIN_TOLERANCE)) * 100)}%</span>
              <input
                type="range"
                min={MIN_TOLERANCE}
                max={MAX_TOLERANCE}
                step="0.01"
                value={tolerance}
                onChange={(event) => setTolerance(Number(event.target.value))}
              />
            </label>

            <label className="field">
              <span>Edge softness: {Math.round(softness * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={softness}
                onChange={(event) => setSoftness(Number(event.target.value))}
              />
            </label>

            <label className="field">
              <span>
                Intensity: {boost.toFixed(1)}× brighter (+{Math.log2(boost).toFixed(1)} stops)
              </span>
              <input
                type="range"
                min="1.5"
                max={MAX_BOOST}
                step="0.5"
                value={boost}
                onChange={(event) => setBoost(Number(event.target.value))}
              />
            </label>

            <div className="field">
              <label className="field--inline">
                <span>Background behind transparent areas</span>
                <input
                  type="color"
                  value={background}
                  onChange={(event) => setBackground(event.target.value)}
                />
              </label>
              <p className="field__hint">
                JPEG can&apos;t stay transparent, so pick the color that should show through
                instead, to match your page.
              </p>
            </div>
          </div>

          <section className="preview" aria-label="Preview">
            <h3 className="result__title">Preview</h3>
            <div className="mode" role="group" aria-label="Preview mode">
              <button type="button" className="mode__button" aria-pressed={mode === "live"} onClick={() => setMode("live")}>
                Real HDR
              </button>
              <button type="button" className="mode__button" aria-pressed={mode === "simulated"} onClick={() => setMode("simulated")}>
                Preview
              </button>
            </div>
            <p className="tool__note">
              {mode === "live"
                ? support.live
                  ? describeSupport(support)
                  : "This shows the real HDR JPEG, which only glows on an HDR display in Chrome 137+ or Safari 26."
                : "Preview adds light to the glowing parts so you can see the effect on any screen. The real glow is brighter."}
            </p>
            <Compare
              aspect={bitmap.width / bitmap.height}
              beforeLabel="Original"
              afterLabel={mode === "live" ? "HDR" : "Preview"}
              sliderLabel="Drag to compare the original with the glowing version"
              before={<canvas ref={beforeCanvas} className="compare__media" aria-label="Original image" />}
              after={
                mode === "live" ? (
                  hdrFile.file ? (
                    <img className="compare__media" src={hdrFile.file.url} alt="The HDR JPEG" />
                  ) : (
                    <div className="compare__empty">Building the HDR JPEG…</div>
                  )
                ) : (
                  <canvas ref={simulatedCanvas} className="compare__media" aria-label="Simulated glow" />
                )
              }
            />
          </section>

          <div className="tool__results">
            <ResultCard
              title="HDR JPEG"
              lede="For websites and Apple Photos. An ordinary JPEG with a gain map that tells HDR screens where to glow."
              file={hdrFile.file}
              busy={hdrFile.busy}
              downloadName={`${fileName}-hdr.jpg`}
              buttonLabel="Download HDR JPEG"
              emptyText={
                colors.length === 0
                  ? "Choose at least one color to make the HDR JPEG."
                  : "Building the HDR JPEG…"
              }
              note={
                support.live
                  ? "This screen and browser show HDR: the glowing parts should be brighter than white."
                  : "The glow only shows on an HDR display in Chrome 137+ or Safari 26; elsewhere this is a normal JPEG."
              }
            />
            <ResultCard
              title="LinkedIn (PQ JPEG)"
              lede="The glow is written into the pixels as Rec.2100 PQ, with a color profile that says so. Upload this one to LinkedIn."
              file={pqFile.file}
              busy={pqFile.busy}
              downloadName={`${fileName}-linkedin-pq.jpg`}
              buttonLabel="Download for LinkedIn"
              emptyText={
                colors.length === 0
                  ? "Choose at least one color to make the LinkedIn file."
                  : "Building the LinkedIn file…"
              }
              note="Check it in the LinkedIn app on your phone. Where a site strips the color profile this picture looks dark and flat, so use the HDR JPEG there."
            />
          </div>

          <p className="tool__note">
            The picture is saved as a full-quality JPEG, images larger than {MAX_SIDE}px are scaled
            down, and transparent areas never glow.
            {fromSvg
              ? ` An SVG is drawn ${MAX_SIDE}px wide on its long side, and fonts or pictures it links to are not loaded, so turn text into outlines first.`
              : ""}
          </p>
        </>
      ) : null}
    </section>
  );
}
