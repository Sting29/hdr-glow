import { useState, type DragEvent } from "react";

type Props = { hasImage: boolean; onFile: (file: File) => void };

export function DropZone({ hasImage, onFile }: Props) {
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <>
      {/* Dropping is an extra; the file input inside is the keyboard path. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
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
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
        <span className="drop__title">
          {hasImage
            ? "Drag another image in, or click to browse"
            : "Drag a logo in, or click to browse"}
        </span>
        <span className="drop__hint">
          PNG, JPEG, WebP, AVIF or SVG. Processed in your browser, nothing is uploaded.
        </span>
      </label>
    </>
  );
}
