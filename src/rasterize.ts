import { logError } from "./log";
import { MAX_SIDE } from "./tool/protocol";

export const isSvg = (file: File) => file.type === "image/svg+xml" || /\.svg$/i.test(file.name);

const NO_SIZE = "This SVG has no size. Add a viewBox, or a width and a height.";

async function decode(svgText: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch (caught) {
    logError("decoding the SVG failed", caught);
    throw new Error("This SVG could not be read.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Draws an SVG at the working size, so its edges stay sharp. Chrome can't hand
 * an SVG straight to createImageBitmap, so it goes through an <img> and a
 * canvas. An <img> also keeps any script inside the SVG from running, and it
 * doesn't load fonts or pictures the SVG links to.
 * Rejects with a message that is fit to show.
 */
export async function rasterizeSvg(file: File): Promise<ImageBitmap> {
  let text = await file.text();
  const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.querySelector("parsererror")) {
    throw new Error("This SVG could not be read.");
  }

  let image = await decode(text);

  // Without a viewBox the drawing does not grow with the canvas: it stays at its
  // own pixel size in the corner. A viewBox made from the width and height fixes that.
  if (!root.hasAttribute("viewBox")) {
    const width = root.getAttribute("width");
    const height = root.getAttribute("height");
    if (!width || !height || width.endsWith("%") || height.endsWith("%")) throw new Error(NO_SIZE);
    root.setAttribute("viewBox", `0 0 ${image.naturalWidth} ${image.naturalHeight}`);
    text = new XMLSerializer().serializeToString(root);
    image = await decode(text);
  }

  if (image.naturalWidth === 0 || image.naturalHeight === 0) throw new Error(NO_SIZE);
  const scale = MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return createImageBitmap(canvas);
}
