// mkan-video — shared pieces: raw frames on stdin/stdout, grey images, NCC, homographies, Vision helpers.
//
// Frames arrive from ffmpeg as raw BGRA (`-f rawvideo -pix_fmt bgra -`), width × height × 4 bytes
// each, top-left origin. Every geometry in this tool is in pixels with a top-left origin; Vision's
// lower-left, normalised conventions are converted at the edges (visionToTopLeft, registration).
import CoreGraphics
import Foundation
import Vision
import simd

// MARK: - errors and output

struct ToolError: Error, CustomStringConvertible {
  let description: String
  init(_ s: String) { description = s }
}

func warn(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }

func writeJSON(_ object: Any, to path: String?) throws {
  let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  if let path { try data.write(to: URL(fileURLWithPath: path)) } else {
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
  }
}

let r3 = { (v: Double) -> Double in (v * 1000).rounded() / 1000 }

// MARK: - raw frame IO

/// Reads fixed-size BGRA frames from a file handle (stdin).
final class RawReader {
  let w: Int, h: Int
  let size: Int
  private let fh: FileHandle
  init(w: Int, h: Int, fh: FileHandle = .standardInput) { self.w = w; self.h = h; size = w * h * 4; self.fh = fh }
  /// The next frame, or nil at the end of the stream.
  func next() -> [UInt8]? {
    var buf = [UInt8]()
    buf.reserveCapacity(size)
    while buf.count < size {
      let chunk = fh.readData(ofLength: size - buf.count)
      if chunk.isEmpty { return buf.isEmpty ? nil : nil }
      buf.append(contentsOf: chunk)
    }
    return buf
  }
}

final class RawWriter {
  private let fh: FileHandle
  init(fh: FileHandle = .standardOutput) { self.fh = fh }
  func write(_ frame: [UInt8]) { frame.withUnsafeBufferPointer { fh.write(Data(buffer: $0)) } }
}

// MARK: - grey images

struct Gray {
  let w: Int, h: Int
  var px: [Float]
  init(w: Int, h: Int, px: [Float]) { self.w = w; self.h = h; self.px = px }
  init(w: Int, h: Int) { self.init(w: w, h: h, px: [Float](repeating: 0, count: w * h)) }
  @inline(__always) func at(_ x: Int, _ y: Int) -> Float { px[y * w + x] }
  /// Bilinear sample; nil outside.
  @inline(__always) func sample(_ x: Double, _ y: Double) -> Float? {
    if x < 0 || y < 0 || x > Double(w - 1) || y > Double(h - 1) { return nil }
    let x0 = Int(x), y0 = Int(y)
    let x1 = min(x0 + 1, w - 1), y1 = min(y0 + 1, h - 1)
    let fx = Float(x - Double(x0)), fy = Float(y - Double(y0))
    let a = at(x0, y0) * (1 - fx) + at(x1, y0) * fx
    let b = at(x0, y1) * (1 - fx) + at(x1, y1) * fx
    return a * (1 - fy) + b * fy
  }
}

/// BGRA → grey (Rec. 601 luma), downscaled by an integer factor (box average).
func grayOf(_ bgra: [UInt8], w: Int, h: Int, factor f: Int) -> Gray {
  let gw = w / f, gh = h / f
  var g = Gray(w: gw, h: gh)
  let inv = 1 / Float(f * f)
  bgra.withUnsafeBufferPointer { p in
    for gy in 0..<gh {
      for gx in 0..<gw {
        var s: Float = 0
        for dy in 0..<f {
          let row = (gy * f + dy) * w
          for dx in 0..<f {
            let i = (row + gx * f + dx) * 4
            s += 0.114 * Float(p[i]) + 0.587 * Float(p[i + 1]) + 0.299 * Float(p[i + 2])
          }
        }
        g.px[gy * gw + gx] = s * inv
      }
    }
  }
  return g
}

struct Rect {
  var x: Int, y: Int, w: Int, h: Int
  var cx: Double { Double(x) + Double(w) / 2 }
  var cy: Double { Double(y) + Double(h) / 2 }
  func clamped(_ W: Int, _ H: Int) -> Rect {
    let x0 = max(0, min(W - 1, x)), y0 = max(0, min(H - 1, y))
    let x1 = max(x0 + 1, min(W, x + w)), y1 = max(y0 + 1, min(H, y + h))
    return Rect(x: x0, y: y0, w: x1 - x0, h: y1 - y0)
  }
  func grown(_ m: Int) -> Rect { Rect(x: x - m, y: y - m, w: w + 2 * m, h: h + 2 * m) }
  func scaled(_ s: Double) -> Rect { Rect(x: Int((Double(x) * s).rounded(.down)), y: Int((Double(y) * s).rounded(.down)), w: max(1, Int((Double(w) * s).rounded(.up))), h: max(1, Int((Double(h) * s).rounded(.up)))) }
  func contains(_ px: Int, _ py: Int) -> Bool { px >= x && py >= y && px < x + w && py < y + h }
}

/// Mean and standard deviation of a region (optionally excluding an inner rectangle: a ring).
func stats(_ g: Gray, _ r: Rect, excluding inner: Rect? = nil) -> (mean: Float, std: Float, n: Int) {
  let rr = r.clamped(g.w, g.h)
  var s: Double = 0, s2: Double = 0, n = 0
  for y in rr.y..<(rr.y + rr.h) {
    for x in rr.x..<(rr.x + rr.w) {
      if let i = inner, i.contains(x, y) { continue }
      let v = Double(g.at(x, y))
      s += v; s2 += v * v; n += 1
    }
  }
  guard n > 0 else { return (0, 0, 0) }
  let m = s / Double(n)
  return (Float(m), Float(max(0, s2 / Double(n) - m * m).squareRoot()), n)
}

/// Normalised cross-correlation between region `a` of g1 and the same-size region of g2 shifted by
/// (dx, dy) — sub-pixel shifts are bilinear. Pixels inside `skip` (in g1's coordinates) are left out,
/// so a ring can be compared without its hole. Nil when too little of it is inside both frames.
func ncc(_ g1: Gray, _ a: Rect, _ g2: Gray, dx: Double, dy: Double, skip: Rect? = nil) -> Float? {
  let r = a.clamped(g1.w, g1.h)
  var s1: Double = 0, s2: Double = 0, s11: Double = 0, s22: Double = 0, s12: Double = 0
  var n = 0, total = 0
  for y in r.y..<(r.y + r.h) {
    for x in r.x..<(r.x + r.w) {
      if let k = skip, k.contains(x, y) { continue }
      total += 1
      guard let v2 = g2.sample(Double(x) + dx, Double(y) + dy) else { continue }
      let v1 = Double(g1.at(x, y)), w2 = Double(v2)
      s1 += v1; s2 += w2; s11 += v1 * v1; s22 += w2 * w2; s12 += v1 * w2; n += 1
    }
  }
  guard n >= max(16, total / 2) else { return nil }
  let nn = Double(n)
  let cov = s12 / nn - (s1 / nn) * (s2 / nn)
  let v1 = s11 / nn - (s1 / nn) * (s1 / nn), v2 = s22 / nn - (s2 / nn) * (s2 / nn)
  guard v1 > 1, v2 > 1 else { return nil } // flat: correlation means nothing
  return Float(cov / (v1 * v2).squareRoot())
}

/// The shift (around `start`, within ±radius) at which region `a` of g1 best matches g2 (integer grid, then ±0.5 refine).
func bestShift(_ g1: Gray, _ a: Rect, _ g2: Gray, start: (Double, Double), radius: Int, skip: Rect? = nil) -> (dx: Double, dy: Double, score: Float)? {
  var best: (Double, Double, Float)? = nil
  for oy in -radius...radius {
    for ox in -radius...radius {
      let dx = start.0 + Double(ox), dy = start.1 + Double(oy)
      if let s = ncc(g1, a, g2, dx: dx, dy: dy, skip: skip), s > (best?.2 ?? -2) { best = (dx, dy, s) }
    }
  }
  guard let b = best else { return nil }
  var out = b
  for oy in stride(from: -0.5, through: 0.5, by: 0.5) {
    for ox in stride(from: -0.5, through: 0.5, by: 0.5) where ox != 0 || oy != 0 {
      if let s = ncc(g1, a, g2, dx: b.0 + ox, dy: b.1 + oy, skip: skip), s > out.2 { out = (b.0 + ox, b.1 + oy, s) }
    }
  }
  return (out.0, out.1, out.2)
}

/// Variance of the Laplacian over a region — how sharp it is.
func sharpness(_ g: Gray, _ r: Rect, excluding inner: Rect? = nil) -> Float {
  let rr = r.clamped(g.w, g.h)
  var s: Double = 0, s2: Double = 0, n = 0
  for y in max(1, rr.y)..<min(g.h - 1, rr.y + rr.h) {
    for x in max(1, rr.x)..<min(g.w - 1, rr.x + rr.w) {
      if let i = inner, i.contains(x, y) { continue }
      let l = Double(4 * g.at(x, y) - g.at(x - 1, y) - g.at(x + 1, y) - g.at(x, y - 1) - g.at(x, y + 1))
      s += l; s2 += l * l; n += 1
    }
  }
  guard n > 0 else { return 0 }
  let m = s / Double(n)
  return Float(max(0, s2 / Double(n) - m * m))
}

// MARK: - CGImage

func cgImage(gray g: Gray) -> CGImage {
  var bytes = [UInt8](repeating: 0, count: g.w * g.h)
  for i in 0..<bytes.count { bytes[i] = UInt8(max(0, min(255, g.px[i].rounded()))) }
  let provider = CGDataProvider(data: Data(bytes) as CFData)!
  return CGImage(width: g.w, height: g.h, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: g.w, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
}

func cgImage(bgra: [UInt8], w: Int, h: Int) -> CGImage {
  let provider = CGDataProvider(data: Data(bgra) as CFData)!
  let info = CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.noneSkipFirst.rawValue)
  return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: info, provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
}

// MARK: - homographies (3×3, top-left pixel coordinates)

typealias Hom = simd_double3x3

let identityHom = Hom(diagonal: SIMD3<Double>(1, 1, 1))

@inline(__always) func apply(_ m: Hom, _ x: Double, _ y: Double) -> (Double, Double)? {
  let v = m * SIMD3<Double>(x, y, 1)
  guard abs(v.z) > 1e-9 else { return nil }
  return (v.x / v.z, v.y / v.z)
}

/// Registration: the homography that maps a point in `from` (top-left pixels) to where the same scene
/// point is in `to`. Vision returns the warp that brings its "floating" image onto the reference in a
/// lower-left frame; that is converted here (flip y on both sides). Nil when Vision cannot register.
func register(from: Gray, to: Gray) -> Hom? {
  let req = VNHomographicImageRegistrationRequest(targetedCGImage: cgImage(gray: from), options: [:])
  let handler = VNImageRequestHandler(cgImage: cgImage(gray: to), options: [:])
  do { try handler.perform([req]) } catch { return nil }
  guard let obs = req.results?.first as? VNImageHomographicAlignmentObservation else { return nil }
  let m = obs.warpTransform // float3x3, column-major; maps floating (from) → reference (to), lower-left origin
  var w = Hom()
  for c in 0..<3 { for r in 0..<3 { w[c][r] = Double(m[c][r]) } }
  // Flip: y_ll = H − y_tl. F = [[1,0,0],[0,−1,H],[0,0,1]] (its own inverse).
  let Hf = Double(from.h), Ht = Double(to.h)
  let Ffrom = Hom(rows: [SIMD3(1, 0, 0), SIMD3(0, -1, Hf), SIMD3(0, 0, 1)])
  let Fto = Hom(rows: [SIMD3(1, 0, 0), SIMD3(0, -1, Ht), SIMD3(0, 0, 1)])
  return Fto * w * Ffrom
}

/// Scales a homography computed on images downscaled by `s` (e.g. 0.5) back to full-resolution pixels.
func rescale(_ h: Hom, by s: Double) -> Hom {
  let S = Hom(rows: [SIMD3(s, 0, 0), SIMD3(0, s, 0), SIMD3(0, 0, 1)])
  let Si = Hom(rows: [SIMD3(1 / s, 0, 0), SIMD3(0, 1 / s, 0), SIMD3(0, 0, 1)])
  return Si * h * S
}

func homJSON(_ h: Hom) -> [Double] { [h[0][0], h[1][0], h[2][0], h[0][1], h[1][1], h[2][1], h[0][2], h[1][2], h[2][2]].map { ($0 * 1e6).rounded() / 1e6 } }

// MARK: - Vision text

struct TextLine {
  let text: String
  let conf: Double
  /// Top-left pixel rectangle on the full frame.
  let box: Rect
  /// Quad corners (top-left pixels): tl, tr, br, bl.
  let quad: [(Double, Double)]
}

/// Every line Vision reads on a frame, down to 1/120 of the frame tall. Vision's first read in a new
/// process is slow and can fail under load (CRImageReaderError): retried for about a minute, then thrown.
func readText(_ img: CGImage) throws -> [TextLine] {
  let W = Double(img.width), H = Double(img.height)
  let waits: [Double] = [2, 5, 10, 20, 30]
  var lastError: Error? = nil
  for attempt in 0...waits.count {
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["en-US", "fr-FR"]
    req.usesLanguageCorrection = false
    req.minimumTextHeight = 1.0 / 120
    do {
      try VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
      return (req.results ?? []).compactMap { obs in
        guard let top = obs.topCandidates(1).first else { return nil }
        let b = obs.boundingBox
        let box = Rect(x: Int((b.minX * W).rounded(.down)), y: Int(((1 - b.maxY) * H).rounded(.down)), w: max(1, Int((b.width * W).rounded(.up))), h: max(1, Int((b.height * H).rounded(.up))))
        let q = [obs.topLeft, obs.topRight, obs.bottomRight, obs.bottomLeft].map { (Double($0.x) * W, (1 - Double($0.y)) * H) }
        return TextLine(text: top.string, conf: Double(top.confidence), box: box, quad: q)
      }
    } catch {
      lastError = error
      if attempt == waits.count { break }
      Thread.sleep(forTimeInterval: waits[attempt])
    }
  }
  throw ToolError("text read failed: \(lastError.map { "\($0)" } ?? "unknown")")
}
