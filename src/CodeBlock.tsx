import { useEffect, useRef, useState } from "react";
import { copyText } from "./copyText";

type Props = {
  label: string;
  code: string;
};

export function CodeBlock({ label, code }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = async () => {
    const ok = await copyText(code);
    setState(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1800);
  };

  return (
    <figure className="code">
      <figcaption className="code__bar">
        <span>{label}</span>
        <button type="button" className="code__copy" onClick={onCopy}>
          {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
        </button>
      </figcaption>
      <pre className="code__body" tabIndex={0}>
        <code>{code}</code>
      </pre>
      <span className="sr-only" role="status">
        {state === "copied" ? `${label} copied` : ""}
      </span>
    </figure>
  );
}
