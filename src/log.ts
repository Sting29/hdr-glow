/** Keeps the real cause in the console; the page only shows a short message. */
export function logError(what: string, error: unknown): void {
  console.error(`[hdr-glow] ${what}`, error);
}
