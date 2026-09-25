# hdr-glow

**Live: [glow.bereg.dev](https://glow.bereg.dev)**

Make colors brighter than white on HDR screens, in the browser, with no backend:

- **Image tool**: upload a logo (PNG, JPEG, WebP, AVIF or SVG), pick which colors should glow,
  and download an HDR JPEG (gain map, for the web and Apple Photos) and a Rec.2100 PQ JPEG
  (for LinkedIn). A few built-in samples let you try it without a file at hand.
- **Text demo**: `background-clip: text` over a gain-map JPEG, with the exact HTML and CSS to copy.

Everything, including the JPEG encoder, the gain-map container and the ICC profile, is written
from scratch in TypeScript and runs in a Web Worker. Nothing is uploaded anywhere.

The hosted site at glow.bereg.dev counts visits with Cloudflare Web Analytics (no cookies, no
personal data). Your images are never sent anywhere, and the code in this repository has no
analytics of its own.

    npm install
    npm run dev        # http://localhost:5180
    npm run dev:lan    # same, reachable from a phone on your Wi-Fi
    npm run check      # tests for the image modules (Vitest, no browser needed)
    npm run lint       # oxlint
    npm run format     # Prettier (format:check only verifies)
    npm run build      # type check + production build in dist/

CI runs lint, format:check, check and build on every pull request. Node 22 (see `.nvmrc`).

Check on an HDR screen (Chrome 137+, Safari 26 / iOS 26): the glowing parts should look brighter
than white. On other screens and browsers the files still look like normal pictures.
