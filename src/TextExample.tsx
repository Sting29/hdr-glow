import { useId, useState, type ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";
import { htmlFor } from "./snippets";

type Props = {
  title: string;
  method: string;
  inputLabel: string;
  className: string;
  css: string;
  defaultText: string;
  note?: ReactNode;
};

export function TextExample({
  title,
  method,
  inputLabel,
  className,
  css,
  defaultText,
  note,
}: Props) {
  const [text, setText] = useState(defaultText);
  const inputId = useId();

  return (
    <section className="example" aria-labelledby={`${inputId}-title`}>
      <div className="example__demo">
        <header className="example__head">
          <h2 id={`${inputId}-title`}>{title}</h2>
          <p>{method}</p>
        </header>

        <label className="field" htmlFor={inputId}>
          <span>{inputLabel}</span>
          <input
            id={inputId}
            type="text"
            value={text}
            maxLength={80}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <div className="stage" aria-live="off">
          {text.trim() ? (
            <span className={`stage__text ${className}`}>{text}</span>
          ) : (
            <span className="stage__empty">Type something above</span>
          )}
        </div>
      </div>

      <div className="example__code">
        <CodeBlock label="HTML" code={htmlFor(className, text)} />
        <CodeBlock label="CSS" code={css} />
        {note ? <p className="example__note">{note}</p> : null}
      </div>
    </section>
  );
}
