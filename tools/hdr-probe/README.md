# hdr-probe

A one-file Swift script that decodes an HDR JPEG (gain map or PQ) the way
macOS itself does, and prints what each pixel's real brightness is. Useful for
checking a downloaded file's actual glow without trusting your eyes on a
screen you're not sure is in HDR mode.

macOS and Xcode's command line tools only, nothing else to install.

    swiftc -O probe.swift -o probe
    ./probe path/to/file.jpg 32,32 100,50

Each `x,y` pair is a pixel coordinate. The script prints, for that pixel, its
brightness as a linear multiple of SDR white: `1.0` is plain white, `7.5` is
glowing at the tool's maximum intensity. It also prints the file's declared
`contentHeadroom` and color space, which tell you whether macOS even
recognized the file as HDR in the first place, before looking at any pixel.

Example, checking the reference swatch:

    ./probe ../../public/hdr-glow-swatch-7.5x.jpg 32,32
    # contentHeadroom 7.5
    # (32,32) linear R 7.496 G 7.496 B 7.496
