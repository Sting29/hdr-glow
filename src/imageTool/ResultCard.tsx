import type { ReactNode } from "react";
import { formatSize } from "./config";
import type { Result } from "./useBuiltFile";

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

export function ResultCard({
  title,
  lede,
  file,
  busy,
  downloadName,
  buttonLabel,
  emptyText,
  note,
}: CardProps) {
  return (
    <section className="result">
      <output className="sr-only">
        {file ? `${title} ready, ${formatSize(file.size)}` : busy ? "Building…" : ""}
      </output>
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
