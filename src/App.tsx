import { Explainer } from "./Explainer";
import { Features } from "./Features";
import { Footer } from "./Footer";
import { ImageTool } from "./ImageTool";
import { Nav } from "./Nav";
import { SwatchGenerator } from "./SwatchGenerator";
import { TextExample } from "./TextExample";
import { describeSupport, useHdrSupport } from "./useHdrDisplay";
import {
  HDR_CLASS,
  HDR_CSS,
  PLAIN_CLASS,
  PLAIN_CSS,
  SWATCH_FILE,
} from "./snippets";

export function App() {
  const support = useHdrSupport();

  return (
    <>
      {/* The same CSS strings that are shown and copied below. */}
      <style>{`${HDR_CSS}\n\n${PLAIN_CSS}`}</style>

      <main className="page">
        <header className="intro">
          <h1 className={HDR_CLASS}>hdr-glow</h1>
          <p>
            HDR screens can show colors brighter than <code>#fff</code>. Make an image or a line of
            text use that headroom.
          </p>
          <p className="status" data-hdr={support.live}>
            {describeSupport(support)}
          </p>
        </header>

        <Nav />

        <Features />

        <ImageTool support={support} />

        <section id="text" className="text" aria-labelledby="text-title">
          <h2 id="text-title" className={`section-title ${HDR_CLASS}`}>
            Text
          </h2>
          <p className="section-lede">
            No CSS color goes past <code>#fff</code>, but letters can be cut out of an HDR image
            instead. Type a line in each box and compare.
          </p>

          <TextExample
            title="HDR text"
            method="background-clip: text over a gain-map JPEG"
            inputLabel="Glowing text"
            className={HDR_CLASS}
            css={HDR_CSS}
            defaultText="Glow on HDR screens"
            note={
              <>
                Needs the swatch image next to your CSS:{" "}
                <a href={`/${SWATCH_FILE}`} download>
                  download {SWATCH_FILE}
                </a>{" "}
                (3 KB, up to 7.5× brighter than #fff). Use it for headlines and
                accents, not paragraphs.
              </>
            }
          />

          <SwatchGenerator />

          <TextExample
            title="Plain text"
            method="color: #fff"
            inputLabel="Regular text"
            className={PLAIN_CLASS}
            css={PLAIN_CSS}
            defaultText="Glow on HDR screens"
          />

        </section>

        <Explainer />
      </main>

      <Footer />
    </>
  );
}
