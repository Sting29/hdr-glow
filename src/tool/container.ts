// Builds an Ultra HDR / ISO 21496-1 JPEG from a plain base JPEG and a plain
// grayscale gain-map JPEG. The layout is copied from public/hdr-glow-swatch-7.5x.jpg,
// which libultrahdr wrote (see tools/make-swatch), and checked byte for byte
// by tools/check/check.mjs.
//
// Only erasable TypeScript here: tools/check runs this file straight in Node.

// 588-byte sRGB profile, the one libultrahdr embeds in its base image.
const SRGB_ICC_BASE64 =
  "AAACTAAAAAAEMAAAbW50clJHQiBYWVogAAAAAAAAAAAAAAAAYWNzcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAPbWAAEAAAAA0y0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJZGVzYwAAAPAAAABYclhZWgAAAUgAAAAUZ1hZWgAAAVwAAAAUYlhZWgAAAXAAAAAUd3RwdAAAAYQAAAAUclRSQwAAAZgAAAAoZ1RSQwAAAcAAAAAoYlRSQwAAAegAAAAoY3BydAAAAhAAAAA8bWx1YwAAAAAAAAABAAAADGVuVVMAAAA6AAAAHABzAFIARwBCACAARwBhAG0AdQB0ACAAdwBpAHQAaAAgAHMAUgBHAEIAIABUAHIAYQBuAHMAZgBlAHIAAFhZWiAAAAAAAABvogAAOPUAAAOQWFlaIAAAAAAAAGKZAAC3hQAAGNpYWVogAAAAAAAAJKAAAA+EAAC2z1hZWiAAAAAAAAD21gABAAAAANMtcGFyYQAAAAAABAAAAAJmZgAA8qcAAA1ZAAAT0AAAClsAAAAAAAAAAHBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABwYXJhAAAAAAAEAAAAAmZmAADypwAADVkAABPQAAAKWwAAAAAAAAAAbWx1YwAAAAAAAAABAAAADGVuVVMAAAAgAAAAHABHAG8AbwBnAGwAZQAgAEkAbgBjAC4AIAAyADAAMgAy";

const XMP_NAMESPACE = "http://ns.adobe.com/xap/1.0/\0";
const ISO_NAMESPACE = "urn:iso:std:iso:ts:21496:-1\0";
const ICC_IDENTIFIER = "ICC_PROFILE\0";

const MARKER_SOS = 0xda;
const MARKER_APP0 = 0xe0;
const MARKER_APP1 = 0xe1;
const MARKER_APP2 = 0xe2;

// Gain values are written as num / 2^22, the way the reference file does.
const ISO_DENOMINATOR = 2 ** 22;
const ISO_PRIMARY_PAYLOAD_LENGTH = 4;
const ISO_GAIN_PAYLOAD_LENGTH = 61;
const MPF_BODY_LENGTH = 86;

const encoder = new TextEncoder();

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

type Segment = { marker: number; start: number; end: number };

/** Marker segments up to and including the first SOS, which runs to the end of the data. */
function readSegments(jpeg: Uint8Array): Segment[] {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("Not a JPEG");
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  const segments: Segment[] = [];
  let position = 2;
  for (;;) {
    if (position + 4 > jpeg.length || jpeg[position] !== 0xff) throw new Error("Broken JPEG");
    const marker = jpeg[position + 1];
    if (marker === MARKER_SOS) {
      segments.push({ marker, start: position, end: jpeg.length });
      return segments;
    }
    const end = position + 2 + view.getUint16(position + 2);
    if (end > jpeg.length) throw new Error("Broken JPEG");
    segments.push({ marker, start: position, end });
    position = end;
  }
}

/** The JPEG without APP1 (Exif, XMP) and APP2 (ICC, MPF) segments. */
function stripMetadata(jpeg: Uint8Array): Uint8Array {
  const parts = [jpeg.subarray(0, 2)];
  for (const segment of readSegments(jpeg)) {
    if (segment.marker === MARKER_APP1 || segment.marker === MARKER_APP2) continue;
    parts.push(jpeg.subarray(segment.start, segment.end));
  }
  return concat(parts);
}

const appSegment = (marker: number, body: Uint8Array): Uint8Array => {
  const header = new Uint8Array(4);
  header[0] = 0xff;
  header[1] = marker;
  new DataView(header.buffer).setUint16(2, body.length + 2);
  return concat([header, body]);
};

const xmpSegment = (xmp: string) =>
  appSegment(MARKER_APP1, concat([encoder.encode(XMP_NAMESPACE), encoder.encode(xmp)]));

const iccSegment = (profile: Uint8Array) =>
  appSegment(
    MARKER_APP2,
    concat([encoder.encode(ICC_IDENTIFIER), new Uint8Array([1, 1]), profile]),
  );

const isoSegment = (payload: Uint8Array) =>
  appSegment(MARKER_APP2, concat([encoder.encode(ISO_NAMESPACE), payload]));

/** Same digits libultrahdr prints: 6 significant figures. */
const formatStops = (stops: number) => String(Number(stops.toPrecision(6)));

const primaryXmp = (gainMapLength: number) =>
  `<x:xmpmeta
  xmlns:x="adobe:ns:meta/"
  x:xmptk="Adobe XMP Core 5.1.2">
  <rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:Container="http://ns.google.com/photos/1.0/container/"
      xmlns:Item="http://ns.google.com/photos/1.0/container/item/"
      xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"
      hdrgm:Version="1.0">
      <Container:Directory>
        <rdf:Seq>
          <rdf:li
            rdf:parseType="Resource">
            <Container:Item
              Item:Semantic="Primary"
              Item:Mime="image/jpeg"/>
          </rdf:li>
          <rdf:li
            rdf:parseType="Resource">
            <Container:Item
              Item:Semantic="GainMap"
              Item:Mime="image/jpeg"
              Item:Length="${gainMapLength}"/>
          </rdf:li>
        </rdf:Seq>
      </Container:Directory>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
`;

const gainMapXmp = (stops: number) => {
  const shown = formatStops(stops);
  return `<x:xmpmeta
  xmlns:x="adobe:ns:meta/"
  x:xmptk="Adobe XMP Core 5.1.2">
  <rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      rdf:about=""
      xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"
      hdrgm:Version="1.0"
      hdrgm:GainMapMin="0"
      hdrgm:GainMapMax="${shown}"
      hdrgm:Gamma="1"
      hdrgm:OffsetSDR="0"
      hdrgm:OffsetHDR="0"
      hdrgm:HDRCapacityMin="0"
      hdrgm:HDRCapacityMax="${shown}"
      hdrgm:BaseRenditionIsHDR="False"/>
  </rdf:RDF>
</x:xmpmeta>
`;
};

/** ISO 21496-1 payload of the gain-map image: gain 0..stops, gamma 1, no offsets. */
function isoGainMapPayload(stops: number): Uint8Array {
  const numerator = Math.round(stops * ISO_DENOMINATOR);
  const out = new Uint8Array(ISO_GAIN_PAYLOAD_LENGTH);
  const view = new DataView(out.buffer);
  let offset = 0;
  const u16 = (value: number) => {
    view.setUint16(offset, value);
    offset += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(offset, value);
    offset += 4;
  };
  const i32 = (value: number) => {
    view.setInt32(offset, value);
    offset += 4;
  };
  u16(0); // minimum version
  u16(0); // writer version
  out[offset++] = 0x40; // flags, same value as the reference file
  u32(0); // base headroom, 0 / 1
  u32(1);
  u32(numerator); // alternate headroom
  u32(ISO_DENOMINATOR);
  i32(0); // gain map min, 0 / 1
  u32(1);
  i32(numerator); // gain map max
  u32(ISO_DENOMINATOR);
  u32(1); // gamma 1 / 1
  u32(1);
  i32(0); // base offset 0 / 1
  u32(1);
  i32(0); // alternate offset 0 / 1
  u32(1);
  return out;
}

/** Multi-Picture Format index: two images, offsets counted from the "MM" byte-order mark. */
function mpfSegment(primaryLength: number, gainMapLength: number, gainMapOffset: number) {
  const out = new Uint8Array(MPF_BODY_LENGTH);
  const view = new DataView(out.buffer);
  let offset = 0;
  const u16 = (value: number) => {
    view.setUint16(offset, value);
    offset += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(offset, value);
    offset += 4;
  };
  const ascii = (value: string) => {
    for (let i = 0; i < value.length; i++) out[offset++] = value.charCodeAt(i);
  };
  ascii("MPF\0");
  ascii("MM");
  u16(0x2a);
  u32(8); // offset of the first IFD
  u16(3); // three entries
  u16(0xb000); // MP format version
  u16(7);
  u32(4);
  ascii("0100");
  u16(0xb001); // number of images
  u16(4);
  u32(1);
  u32(2);
  u16(0xb002); // MP entries
  u16(7);
  u32(32);
  u32(50);
  u32(0); // no next IFD
  u32(0x00030000); // image 1: primary
  u32(primaryLength);
  u32(0);
  u32(0);
  u32(0); // image 2: gain map
  u32(gainMapLength);
  u32(gainMapOffset);
  u32(0);
  return appSegment(MARKER_APP2, out);
}

/** The JPEG with its metadata replaced by a single ICC profile. */
export function embedIccProfile(jpeg: Uint8Array, profile: Uint8Array): Uint8Array {
  if (profile.length > 65000) throw new Error("Profile is too large for one segment");
  const plain = stripMetadata(jpeg);
  const segments = readSegments(plain);
  const afterApp0 = segments[0].marker === MARKER_APP0 ? segments[0].end : 2;
  return concat([plain.subarray(0, afterApp0), iccSegment(profile), plain.subarray(afterApp0)]);
}

type GainMapJpegInput = {
  /** Plain JPEG of the visible (SDR) image. */
  base: Uint8Array;
  /** Plain grayscale JPEG, same size as base: 0 = no boost, 255 = full boost. */
  gainMap: Uint8Array;
  /** Linear brightness multiplier where the gain map is 255, e.g. 7.5. */
  maxBoost: number;
};

export function assembleGainMapJpeg({ base, gainMap, maxBoost }: GainMapJpegInput): Uint8Array {
  if (!(maxBoost > 1)) throw new Error("maxBoost must be above 1");
  const stops = Math.log2(maxBoost);

  const plainGainMap = stripMetadata(gainMap);
  const secondary = concat([
    plainGainMap.subarray(0, 2),
    xmpSegment(gainMapXmp(stops)),
    isoSegment(isoGainMapPayload(stops)),
    plainGainMap.subarray(2),
  ]);

  const plainBase = stripMetadata(base);
  const segments = readSegments(plainBase);
  const sos = segments[segments.length - 1].start;
  const afterApp0 = segments[0].marker === MARKER_APP0 ? segments[0].end : 2;
  const head = concat([
    plainBase.subarray(0, afterApp0),
    xmpSegment(primaryXmp(secondary.length)),
    iccSegment(fromBase64(SRGB_ICC_BASE64)),
    isoSegment(new Uint8Array(ISO_PRIMARY_PAYLOAD_LENGTH)),
  ]);
  const middle = plainBase.subarray(afterApp0, sos);
  const tail = plainBase.subarray(sos);

  // 4 = marker + length, 8 = the same plus "MPF\0" (the offset base "MM" comes after it)
  const primaryLength = head.length + middle.length + 4 + MPF_BODY_LENGTH + tail.length;
  const byteOrderMark = head.length + middle.length + 8;
  const primary = concat([
    head,
    middle,
    mpfSegment(primaryLength, secondary.length, primaryLength - byteOrderMark),
    tail,
  ]);
  return concat([primary, secondary]);
}
