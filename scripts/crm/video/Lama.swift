// LaMa (Apache-2.0, advimman/lama) through Core ML: paints what no frame of the video shows behind
// a removed caption. Inputs `image` (RGB 800×800) and `mask` (grey 800×800, white = paint here),
// output `output` (RGB 800×800). Compute units stay `.all` — the configuration it was converted for.
import CoreML
import CoreVideo
import Foundation

final class Lama {
  let model: MLModel
  static let side = 800

  init(path: String) throws {
    let cfg = MLModelConfiguration()
    cfg.computeUnits = .all
    model = try MLModel(contentsOf: URL(fileURLWithPath: path), configuration: cfg)
  }

  /// Paints the masked pixels of an 800×800 BGRA image (mask: 255 = paint). Returns BGRA 800×800.
  func paint(bgra: [UInt8], mask: [UInt8]) throws -> [UInt8] {
    let n = Lama.side
    let img = try pixelBuffer(n, n, kCVPixelFormatType_32BGRA, bytes: bgra, bpp: 4)
    let msk = try pixelBuffer(n, n, kCVPixelFormatType_OneComponent8, bytes: mask, bpp: 1)
    let input = try MLDictionaryFeatureProvider(dictionary: ["image": MLFeatureValue(pixelBuffer: img), "mask": MLFeatureValue(pixelBuffer: msk)])
    let out = try model.prediction(from: input)
    guard let pb = out.featureValue(for: "output")?.imageBufferValue else { throw ToolError("LaMa gave no output image") }
    return try bytesOf(pb, n, n)
  }
}

func pixelBuffer(_ w: Int, _ h: Int, _ format: OSType, bytes: [UInt8], bpp: Int) throws -> CVPixelBuffer {
  var pb: CVPixelBuffer?
  let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
  guard CVPixelBufferCreate(nil, w, h, format, attrs as CFDictionary, &pb) == kCVReturnSuccess, let buf = pb else { throw ToolError("CVPixelBufferCreate failed") }
  CVPixelBufferLockBaseAddress(buf, [])
  defer { CVPixelBufferUnlockBaseAddress(buf, []) }
  let dst = CVPixelBufferGetBaseAddress(buf)!.assumingMemoryBound(to: UInt8.self)
  let stride = CVPixelBufferGetBytesPerRow(buf)
  bytes.withUnsafeBufferPointer { src in
    for y in 0..<h { memcpy(dst + y * stride, src.baseAddress! + y * w * bpp, w * bpp) }
  }
  return buf
}

/// BGRA bytes of an output buffer (converting from whatever 32-bit layout Core ML used).
func bytesOf(_ buf: CVPixelBuffer, _ w: Int, _ h: Int) throws -> [UInt8] {
  CVPixelBufferLockBaseAddress(buf, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buf, .readOnly) }
  let fmt = CVPixelBufferGetPixelFormatType(buf)
  let src = CVPixelBufferGetBaseAddress(buf)!.assumingMemoryBound(to: UInt8.self)
  let stride = CVPixelBufferGetBytesPerRow(buf)
  var out = [UInt8](repeating: 255, count: w * h * 4)
  for y in 0..<h {
    for x in 0..<w {
      let s = y * stride + x * 4, d = (y * w + x) * 4
      switch fmt {
      case kCVPixelFormatType_32BGRA:
        out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]
      case kCVPixelFormatType_32ARGB:
        out[d] = src[s + 3]; out[d + 1] = src[s + 2]; out[d + 2] = src[s + 1]
      case kCVPixelFormatType_32RGBA:
        out[d] = src[s + 2]; out[d + 1] = src[s + 1]; out[d + 2] = src[s]
      default:
        throw ToolError("LaMa output pixel format \(fmt) not handled")
      }
    }
  }
  return out
}

/// Bilinear resize of a BGRA image (or a 1-channel image with channels = 1).
func resize(_ src: [UInt8], _ w: Int, _ h: Int, to W: Int, _ H: Int, channels c: Int) -> [UInt8] {
  var out = [UInt8](repeating: 0, count: W * H * c)
  let sx = Double(w) / Double(W), sy = Double(h) / Double(H)
  src.withUnsafeBufferPointer { p in
    for y in 0..<H {
      let fy = max(0, (Double(y) + 0.5) * sy - 0.5)
      let y0 = min(h - 1, Int(fy)), y1 = min(h - 1, y0 + 1), ty = fy - Double(y0)
      for x in 0..<W {
        let fx = max(0, (Double(x) + 0.5) * sx - 0.5)
        let x0 = min(w - 1, Int(fx)), x1 = min(w - 1, x0 + 1), tx = fx - Double(x0)
        for k in 0..<c {
          let a = Double(p[(y0 * w + x0) * c + k]) * (1 - tx) + Double(p[(y0 * w + x1) * c + k]) * tx
          let b = Double(p[(y1 * w + x0) * c + k]) * (1 - tx) + Double(p[(y1 * w + x1) * c + k]) * tx
          out[(y * W + x) * c + k] = UInt8(max(0, min(255, (a * (1 - ty) + b * ty).rounded())))
        }
      }
    }
  }
  return out
}
