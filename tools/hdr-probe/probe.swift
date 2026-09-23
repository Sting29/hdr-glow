// probe <file> [x,y ...]
// Decodes a file the way Apple's image stack does (HDR requested) and prints the
// color space and pixel values in extended linear sRGB, where 1.0 is SDR white.
// So a point that reads 7.5 there is glowing at 7.5x, ready to compare against
// what the tool's own intensity slider was set to.
import Foundation
import ImageIO
import CoreGraphics

let args = CommandLine.arguments
guard args.count >= 2 else { print("usage: probe file [x,y ...]"); exit(1) }
let url = URL(fileURLWithPath: args[1]) as CFURL
guard let source = CGImageSourceCreateWithURL(url, nil) else { print("cannot open"); exit(1) }

let options: [CFString: Any] = [kCGImageSourceDecodeRequest: kCGImageSourceDecodeToHDR]
guard let image = CGImageSourceCreateImageAtIndex(source, 0, options as CFDictionary) else {
    print("cannot decode"); exit(1)
}
print("size \(image.width)x\(image.height) bitsPerComponent \(image.bitsPerComponent)")
print("contentHeadroom \(image.contentHeadroom)")
if let space = image.colorSpace {
    print("colorSpace name: \(space.name as String? ?? "(unnamed)")")
    print("isHDR \(space.isHDR)  usesITUR_2100TF \(CGColorSpaceUsesITUR_2100TF(space))  isWideGamutRGB \(space.isWideGamutRGB)")
}

let width = image.width
let height = image.height
let linear = CGColorSpace(name: CGColorSpace.extendedLinearSRGB)!
let info = CGImageAlphaInfo.premultipliedLast.rawValue
    | CGBitmapInfo.floatComponents.rawValue
    | CGBitmapInfo.byteOrder16Little.rawValue
guard let context = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 16,
    bytesPerRow: width * 8, space: linear, bitmapInfo: info
) else { print("no context"); exit(1) }
context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
let base = context.data!.bindMemory(to: Float16.self, capacity: width * height * 4)

for pair in args.dropFirst(2) {
    let parts = pair.split(separator: ",").compactMap { Int($0) }
    guard parts.count == 2, parts[0] < width, parts[1] < height else { continue }
    // CGContext memory is top-down for a bitmap context created this way
    let offset = (parts[1] * width + parts[0]) * 4
    print(String(format: "(%d,%d) linear R %.3f G %.3f B %.3f", parts[0], parts[1],
                 Float(base[offset]), Float(base[offset + 1]), Float(base[offset + 2])))
}
