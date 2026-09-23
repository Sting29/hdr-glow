import { useState, type ReactNode } from "react";

type Props = {
  /** Width divided by height of the two pictures. */
  aspect: number;
  before: ReactNode;
  after: ReactNode;
  beforeLabel: string;
  afterLabel: string;
  sliderLabel: string;
};

/** Two pictures on top of each other with a draggable edge between them. */
export function Compare({ aspect, before, after, beforeLabel, afterLabel, sliderLabel }: Props) {
  const [position, setPosition] = useState(50);

  return (
    <div className="compare" style={{ aspectRatio: aspect }}>
      <div className="compare__layer">{before}</div>
      <div className="compare__layer" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
        {after}
      </div>
      <span className="compare__tag compare__tag--before">{beforeLabel}</span>
      <span className="compare__tag compare__tag--after">{afterLabel}</span>
      <span className="compare__handle" style={{ left: `${position}%` }} aria-hidden="true" />
      <input
        className="compare__range"
        type="range"
        min="0"
        max="100"
        step="0.5"
        value={position}
        aria-label={sliderLabel}
        onChange={(event) => setPosition(Number(event.target.value))}
      />
    </div>
  );
}
