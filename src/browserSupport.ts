// Which browsers show the glow of an HDR JPEG on an HDR screen:
// Chrome 137+ (and other Chromium browsers of that age) and Safari 26 / iOS 26.
//
// No DOM or React in this file, so tools/check tests it in plain Node.

export type BrowserInfo = {
  name: string;
  /** Major version, or 0 when unknown. */
  version: number;
  showsHdr: boolean;
};

const CHROMIUM_MIN = 137;
const WEBKIT_MIN = 26;

const major = (pattern: RegExp, text: string) => Number(pattern.exec(text)?.[1] ?? 0);

export function detectBrowser(userAgent: string): BrowserInfo {
  // Every browser on iOS draws with WebKit, so the iOS version decides.
  if (/\b(iPhone|iPad|iPod)\b/.test(userAgent)) {
    const version = major(/OS (\d+)[_.]/, userAgent);
    const name = /CriOS/.test(userAgent)
      ? "Chrome"
      : /FxiOS/.test(userAgent)
        ? "Firefox"
        : /EdgiOS/.test(userAgent)
          ? "Edge"
          : "Safari";
    return { name, version, showsHdr: version >= WEBKIT_MIN };
  }

  const chromium = major(/Chrome\/(\d+)/, userAgent);
  if (chromium > 0) {
    const name = /Edg\//.test(userAgent) ? "Edge" : /OPR\//.test(userAgent) ? "Opera" : "Chrome";
    return { name, version: chromium, showsHdr: chromium >= CHROMIUM_MIN };
  }

  const firefox = major(/Firefox\/(\d+)/, userAgent);
  if (firefox > 0) return { name: "Firefox", version: firefox, showsHdr: false };

  if (/Safari\//.test(userAgent)) {
    const version = major(/Version\/(\d+)/, userAgent);
    return { name: "Safari", version, showsHdr: version >= WEBKIT_MIN };
  }

  return { name: "Your browser", version: 0, showsHdr: false };
}
