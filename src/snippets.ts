// The exact code that is shown to the user AND injected into the page,
// so what you copy is what you see.

export const SWATCH_FILE = "hdr-glow-swatch-7.5x.jpg";

export const HDR_CLASS = "hdr-glow-text";
export const PLAIN_CLASS = "plain-text";

export const HDR_CSS = `.${HDR_CLASS} {
  color: #fff; /* SDR fallback */
}

@media (dynamic-range: high) {
  @supports (background-clip: text) or (-webkit-background-clip: text) {
    .${HDR_CLASS} {
      background: url("${SWATCH_FILE}") center / cover;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
  }
}`;

export const PLAIN_CSS = `.${PLAIN_CLASS} {
  color: #fff;
}`;

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const htmlFor = (className: string, text: string) =>
  `<p class="${className}">${escapeHtml(text.trim() || "Your text")}</p>`;
