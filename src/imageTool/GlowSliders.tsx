import { MAX_BOOST, MAX_TOLERANCE, MIN_TOLERANCE } from "./config";

type Props = {
  tolerance: number;
  softness: number;
  boost: number;
  background: string;
  onTolerance: (value: number) => void;
  onSoftness: (value: number) => void;
  onBoost: (value: number) => void;
  onBackground: (value: string) => void;
};

export function GlowSliders(props: Props) {
  const { tolerance, softness, boost, background } = props;
  return (
    <>
      <label className="field">
        <span>
          Color range:{" "}
          {Math.round(((tolerance - MIN_TOLERANCE) / (MAX_TOLERANCE - MIN_TOLERANCE)) * 100)}%
        </span>
        <input
          type="range"
          min={MIN_TOLERANCE}
          max={MAX_TOLERANCE}
          step="0.01"
          value={tolerance}
          onChange={(event) => props.onTolerance(Number(event.target.value))}
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
          onChange={(event) => props.onSoftness(Number(event.target.value))}
        />
      </label>

      <label className="field">
        <span>
          Glow strength: {boost.toFixed(1)}× brighter (+{Math.log2(boost).toFixed(1)} stops)
        </span>
        <input
          type="range"
          min="1.5"
          max={MAX_BOOST}
          step="0.5"
          value={boost}
          onChange={(event) => props.onBoost(Number(event.target.value))}
        />
      </label>

      <div className="field">
        <label className="field--inline">
          <span>Background behind transparent areas</span>
          <input
            type="color"
            value={background}
            onChange={(event) => props.onBackground(event.target.value)}
          />
        </label>
        <p className="field__hint">
          JPEG can&apos;t stay transparent, so pick the color that should show through instead, to
          match your page.
        </p>
      </div>
    </>
  );
}
