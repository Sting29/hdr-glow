import { HDR_CLASS } from "./snippets";

export function Explainer() {
  return (
    <>
      <section className="info" aria-labelledby="features-title">
        <h2 id="features-title" className={`section-title ${HDR_CLASS}`}>
          What it does
        </h2>
        <ul>
          <li>Runs entirely in this browser tab: no server, no account, no upload.</li>
          <li>Reads PNG, JPEG, WebP, AVIF and SVG. SVGs are drawn sharp at 2048 px.</li>
          <li>
            Suggests the colors to light up, whites first, and lets you click any other color,
            including brand colors like green or blue.
          </li>
          <li>
            Makes two files from one image: a gain-map JPEG (ISO 21496-1 and Adobe XMP) for the web
            and Apple Photos, and a Rec.2100 PQ JPEG for LinkedIn.
          </li>
          <li>
            Written from scratch in TypeScript: its own JPEG encoder, gain-map container and ICC
            profile, assembled byte by byte. The heavy work runs in a Web Worker.
          </li>
          <li>Shows the real glow where the screen can, and a simulated one everywhere else.</li>
          <li>Makes text on your own site glow with a few lines of CSS.</li>
        </ul>
      </section>

      <section className="info" aria-labelledby="how-title">
        <h2 id="how-title" className={`section-title ${HDR_CLASS}`}>
          How it works
        </h2>
        <ol>
          <li>
            <strong>Mask.</strong> Each pixel gets a score from 0 to 255: how close it is to one of
            your colors.
          </li>
          <li>
            <strong>Gain map.</strong> The score is stored as a small grayscale layer inside the
            JPEG. HDR-aware viewers multiply the pixel by up to 7.5×; everyone else sees the normal
            picture.
          </li>
          <li>
            <strong>LinkedIn.</strong> A second file bakes the boost into the pixels (Rec.2100 PQ,
            SDR white at 203 nits) and labels it with a matching color profile.
          </li>
          <li>
            <strong>Where it runs.</strong> In this tab. The encoder is written from scratch in
            TypeScript, and no image leaves your device.
          </li>
        </ol>
      </section>

      <section className="info" aria-labelledby="limits-title">
        <h2 id="limits-title" className={`section-title ${HDR_CLASS}`}>
          Known limits
        </h2>
        <ul>
          <li>
            You need three things at once: an HDR screen, HDR turned on, and an app that reads gain
            maps or PQ. Tested: Chrome 137+, Safari 26 / iOS 26, Apple Photos, the LinkedIn app. On
            Android the glow is still unconfirmed.
          </li>
          <li>
            Everywhere else the HDR JPEG is an ordinary picture. A PQ file can look dark and flat
            where the color profile is stripped, so use the HDR JPEG there.
          </li>
          <li>
            Black times anything is still black. Deep colors get brighter but read as dim neon; pale
            colors on dark backgrounds are where the effect lands.
          </li>
          <li>The peak is 7.5× (about 1,500 nits); screens scale it to what they can show.</li>
          <li>
            Images larger than 2048 px are scaled down, transparent areas never glow, and the
            picture is saved again as a JPEG.
          </li>
          <li>The simulated preview only suggests the effect.</li>
        </ul>
      </section>
    </>
  );
}
