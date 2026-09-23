# How public/hdr-glow-swatch-7.5x.jpg was made

A 64x64 white JPEG (base) + a 64x64 grayscale JPEG (gain map, value 255) combined into
one Ultra HDR / ISO 21496-1 file with google/libultrahdr (API-4: compressed base + compressed gain map + metadata).

1. Build libultrahdr: `cmake -G Ninja -DUHDR_WRITE_XMP=1 -DUHDR_WRITE_ISO=1 -DUHDR_ENABLE_HEIF=OFF ..`
   (needs libjpeg dev headers; XMP is off by default, ISO is on)
2. Make the two JPEGs with Pillow: base = RGB white, gain = "L" 255, both quality 100.
3. `g++ mk.cpp -I libultrahdr -L libultrahdr/build -luhdr -o mk`
4. `./mk base.jpg gain.jpg 7.5 hdr-glow-swatch-7.5x.jpg` (third argument = max boost, linear)
5. Check with `chk.cpp`: decodes the file and prints the first pixel (expected 7.5 7.5 7.5 1.0).

Result: max_content_boost 7.5 (+2.9 stops), offsets 0, gamma 1, both XMP (hdrgm) and ISO 21496-1 metadata present.
