import { useEffect, useState } from "react";
import { detectBrowser, type BrowserInfo } from "./browserSupport";

const QUERY = "(dynamic-range: high)";

/** True when the screen the window is on reports HDR capability. */
export function useHdrDisplay(): boolean {
  const [hdr, setHdr] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setHdr(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return hdr;
}

export type HdrSupport = {
  /** The screen reports HDR. */
  screen: boolean;
  browser: BrowserInfo;
  /** The screen is HDR and the browser shows it, so what is on the page is the real glow. */
  live: boolean;
};

const browser = detectBrowser(navigator.userAgent);

export function useHdrSupport(): HdrSupport {
  const screen = useHdrDisplay();
  return { screen, browser, live: screen && browser.showsHdr };
}

export function describeSupport({ screen, browser, live }: HdrSupport): string {
  const who = browser.version > 0 ? `${browser.name} ${browser.version}` : browser.name;
  if (live) {
    return `Your screen and ${who} both support HDR, so the glow on this page is real.`;
  }
  if (screen) {
    return `Your screen supports HDR, but ${who} does not render it yet (Chrome 137+ and Safari 26 do), so this is only a preview.`;
  }
  return "Your screen reports SDR, so this is only a preview.";
}
