import { useId, useState } from "react";
import { MAX_GLOW_COLORS, parseHex, sameColor, toHex } from "../tool/colors";
import type { RGB } from "../tool/mask";

type Props = {
  colors: RGB[];
  /** Colors the picture itself suggested; the ones not chosen can be added back. */
  suggested: RGB[];
  onAdd: (color: RGB) => void;
  onRemove: (color: RGB) => void;
};

/** The chosen glow colors, and the two keyboard ways to add one: a hex code, or a found color. */
export function GlowColors({ colors, suggested, onAdd, onRemove }: Props) {
  const id = useId();
  const [hexInput, setHexInput] = useState("");
  const [hexError, setHexError] = useState<string | null>(null);

  const notChosen = suggested.filter((s) => !colors.some((c) => sameColor(c, s)));

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
    onAdd(color);
    setHexInput("");
    setHexError(null);
  };

  return (
    <div className="field">
      <span>Glowing colors</span>
      <ul className="chips">
        {colors.map((color) => (
          <li key={toHex(color)}>
            <button
              type="button"
              className="chip"
              aria-label={`Remove ${toHex(color)}`}
              onClick={() => onRemove(color)}
            >
              <span className="chip__swatch" style={{ background: toHex(color) }} />
              <code>{toHex(color)}</code>
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
        <label className="sr-only" htmlFor={`${id}-hex`}>
          Add a color by hex code
        </label>
        <input
          id={`${id}-hex`}
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

      {notChosen.length > 0 ? (
        <div className="hex-add__suggested">
          <span>Found in the image:</span>
          <ul className="chips">
            {notChosen.map((color) => (
              <li key={toHex(color)}>
                <button type="button" className="chip" onClick={() => onAdd(color)}>
                  <span className="chip__swatch" style={{ background: toHex(color) }} />
                  <code>{toHex(color)}</code>
                  <span aria-hidden="true">+</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
