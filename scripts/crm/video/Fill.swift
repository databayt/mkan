// mkan-video fill — removes what was added on top of a broker's video, without blur.
//
// The plan (JSON, from tiktok-v2-pure.ts cleanPlan) lists rectangles to clear and the frames they
// are on. For each frame, in order:
//  1. real pixels: the same scene point in another frame of the same shot where no overlay was over
//     it — a caption fixed on the screen while the camera moves hides a different part of the room
//     in every frame, and a slow pan uncovers it seconds later, so the whole shot is searched,
//     nearest frames first (registration: one Vision homography per consecutive pair on
//     half-resolution grey with the overlays flattened out, composed, checked on unmasked points);
//  2. the frame before, already cleaned — only its clean pixels, never an overlay it could not clear
//     (keeps a still shot's fill steady, so nothing flickers);
//  3. specks smoothed in from their edge; bigger leftovers painted by LaMa (Core ML) only while under
//     the plan's cap on generated area (Abdout, 2026-11-09: small areas only, no AI label), with
//     fine grain matched to the picture.
// The edge of every fill is feathered into the band the plan dilated around the text. A frame whose
// holes cannot be filled within the cap is counted as unfilled: the caller skips the video then.
import Foundation
import ImageIO
import simd

struct FillOpts {
  var w = 0, h = 0
  var plan = ""
  var model: String? = nil
  var report: String? = nil
}

struct MaskSpan {
  let f0: Int, f1: Int
  let rects: [Rect]
}

struct FillPlan {
  var spans: [MaskSpan] = []
  var dilate = 4
  var maxGenFrac = 0.06
  var window = 90
  var cuts: [Int] = []
}

func loadPlan(_ path: String) throws -> FillPlan {
  let data = try Data(contentsOf: URL(fileURLWithPath: path))
  guard let j = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ToolError("plan is not a JSON object") }
  var p = FillPlan()
  p.dilate = j["dilate"] as? Int ?? 4
  p.maxGenFrac = j["maxGenFrac"] as? Double ?? 0.06
  p.window = j["window"] as? Int ?? 90
  p.cuts = (j["cuts"] as? [Int]) ?? []
  for m in (j["masks"] as? [[String: Any]]) ?? [] {
    let rects = ((m["rects"] as? [[Int]]) ?? []).compactMap { $0.count == 4 ? Rect(x: $0[0], y: $0[1], w: $0[2], h: $0[3]) : nil }
    p.spans.append(MaskSpan(f0: m["f0"] as? Int ?? 0, f1: m["f1"] as? Int ?? 0, rects: rects))
  }
  return p
}

/// xorshift: the grain is deterministic, so a re-render gives the same video.
struct Rng {
  var s: UInt64
  mutating func next() -> Double {
    s ^= s << 13; s ^= s >> 7; s ^= s << 17
    return Double(s % 1_000_000) / 1_000_000
  }
  mutating func gauss() -> Double {
    let u = max(1e-9, next()), v = next()
    return (-2 * log(u)).squareRoot() * cos(2 * .pi * v)
  }
}

/// The whole video's frames, kept as JPEG (≈0.1 MB each) and decoded on demand: any frame of a shot
/// can lend its pixels — a slow pan uncovers what a big caption hid only seconds later.
final class FrameStore {
  let w: Int, h: Int
  private var jpegs: [Data] = []
  private var cache: [Int: [UInt8]] = [:]
  private var order: [Int] = []
  init(w: Int, h: Int) { self.w = w; self.h = h }
  var count: Int { jpegs.count }
  func append(_ bgra: [UInt8]) {
    let data = NSMutableData()
    guard let dest = CGImageDestinationCreateWithData(data as CFMutableData, "public.jpeg" as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(dest, cgImage(bgra: bgra, w: w, h: h), [kCGImageDestinationLossyCompressionQuality: 0.95] as CFDictionary)
    CGImageDestinationFinalize(dest)
    jpegs.append(data as Data)
  }
  func frame(_ i: Int) -> [UInt8] {
    if let f = cache[i] { return f }
    var buf = [UInt8](repeating: 0, count: w * h * 4)
    if let src = CGImageSourceCreateWithData(jpegs[i] as CFData, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) {
      let info = CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.noneSkipFirst.rawValue)
      buf.withUnsafeMutableBytes { p in
        let ctx = CGContext(data: p.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: info.rawValue)!
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
      }
    }
    cache[i] = buf
    order.append(i)
    if order.count > 48 { cache[order.removeFirst()] = nil }
    return buf
  }
}

func fill(_ o: FillOpts) throws {
  let plan = try loadPlan(o.plan)
  let W = o.w, H = o.h, N = W * H
  let lama: Lama? = try o.model.flatMap { FileManager.default.fileExists(atPath: $0) ? try Lama(path: $0) : nil }
  let reader = RawReader(w: W, h: H)
  // Frames go out on a private copy of stdout; fd 1 itself is pointed at stderr, so a log line from
  // Vision or Core ML can never land in the frame stream (11-09: 1,036 stray bytes reached ffmpeg).
  let frameFD = dup(1)
  dup2(2, 1)
  let writer = RawWriter(fh: FileHandle(fileDescriptor: frameFD, closeOnDealloc: true))
  let started = Date()
  let store = FrameStore(w: W, h: H)

  // Report.
  var maskedFrames = 0, holePx = 0, realPx = 0, prevPx = 0, smoothPx = 0, lamaPx = 0, unfilledPx = 0, lamaCalls = 0
  var maxGen = 0.0
  var seams: [Double] = [], flickers: [Double] = []
  var unfilledFrames: [Int] = []

  let shotOf = { (f: Int) -> Int in plan.cuts.filter { $0 <= f }.count }
  func rectsAt(_ f: Int) -> [Rect] {
    plan.spans.filter { f >= $0.f0 && f <= $0.f1 }.flatMap { $0.rects }.map { $0.grown(plan.dilate).clamped(W, H) }
  }
  var masks: [Int: [UInt8]] = [:]
  func maskAt(_ f: Int) -> [UInt8] {
    if let m = masks[f] { return m }
    var m = [UInt8](repeating: 0, count: N)
    for r in rectsAt(f) { for y in r.y..<(r.y + r.h) { for x in r.x..<(r.x + r.w) { m[y * W + x] = 1 } } }
    if masks.count > 64 { masks.removeAll(keepingCapacity: true) }
    masks[f] = m
    return m
  }
  /// Half-res grey for registration, every overlay rectangle flattened (it must not pull the fit).
  var grays: [Int: Gray] = [:]
  func regGray(_ f: Int, _ frame: [UInt8]) -> Gray {
    if let g = grays[f] { return g }
    var g = grayOf(frame, w: W, h: H, factor: 2)
    let mean = g.px.reduce(0, +) / Float(max(1, g.px.count))
    for r in rectsAt(f) {
      let hr = r.scaled(0.5).grown(2).clamped(g.w, g.h)
      for y in hr.y..<(hr.y + hr.h) { for x in hr.x..<(hr.x + hr.w) { g.px[y * g.w + x] = mean } }
    }
    if grays.count > 64 { grays.removeAll(keepingCapacity: true) }
    grays[f] = g
    return g
  }

  // Pass 1: every frame in, and one registration per consecutive pair (half resolution).
  var steps: [Hom?] = []
  var last: Gray? = nil
  while let fr = reader.next() {
    let f = store.count
    store.append(fr)
    let g = regGray(f, fr)
    if let p = last { steps.append(register(from: p, to: g)) }
    last = g
  }
  let total = store.count

  /// t → s by composing the consecutive registrations (half resolution); nil across a gap.
  func chained(_ t: Int, _ s: Int) -> Hom? {
    var h = identityHom
    if s > t {
      for f in t..<s { guard f < steps.count, let st = steps[f] else { return nil }; h = st * h }
    } else if s < t {
      for f in stride(from: t - 1, through: s, by: -1) { guard f < steps.count, let st = steps[f] else { return nil }; h = st.inverse * h }
    }
    return h
  }
  func linesUp(_ hh: Hom, _ gt: Gray, _ gs: Gray, maskT: [UInt8]) -> Bool {
    var rng = Rng(s: 0x9E3779B97F4A7C15)
    var diff = 0.0, n = 0
    for _ in 0..<500 {
      let x = Int(rng.next() * Double(gt.w - 1)), y = Int(rng.next() * Double(gt.h - 1))
      if maskT[min(H - 1, y * 2) * W + min(W - 1, x * 2)] != 0 { continue }
      guard let q = apply(hh, Double(x), Double(y)), let v = gs.sample(q.0, q.1) else { continue }
      diff += Double(abs(gt.at(x, y) - v)); n += 1
    }
    return n >= 80 && diff / Double(n) < 14
  }
  /// A full-resolution homography t → s that lines up the unmasked picture: the chain, else one direct registration.
  func fit(_ t: Int, _ s: Int, _ gt: Gray, _ gs: Gray, maskT: [UInt8]) -> Hom? {
    if let c = chained(t, s), linesUp(c, gt, gs, maskT: maskT) { return rescale(c, by: 0.5) }
    if abs(s - t) > 120 { return nil } // far apart: a direct fit is not worth its cost
    guard let hh = register(from: gt, to: gs), linesUp(hh, gt, gs, maskT: maskT) else { return nil }
    return rescale(hh, by: 0.5)
  }
  @inline(__always) func lum(_ p: [UInt8], _ i: Int) -> Double { 0.114 * Double(p[i * 4]) + 0.587 * Double(p[i * 4 + 1]) + 0.299 * Double(p[i * 4 + 2]) }

  // Pass 2: each frame in order.
  var prevOut: [UInt8]? = nil
  var prevValid: [UInt8]? = nil // 1 where the previous output is clean (room, or filled)
  var prevF = -1
  // Nearest first, both ways, out to the whole shot.
  let offsets: [Int] = [6, 12, 20, 30, 45, 60, 90, 120, 160, 210, 270, 340, 420, 510, 610, 720, 850, 1000, 1200].flatMap { (d: Int) -> [Int] in [d, -d] }
  for t in 0..<total {
    let orig = store.frame(t)
    let rects = rectsAt(t)
    if rects.isEmpty {
      writer.write(orig)
      prevOut = orig; prevValid = [UInt8](repeating: 1, count: N); prevF = t
      continue
    }
    maskedFrames += 1
    var out = orig
    let m = maskAt(t)
    var hole = m
    var count = 0
    for v in hole where v != 0 { count += 1 }
    holePx += count
    var src = [UInt8](repeating: 0, count: N) // 1 real, 2 previous frame, 3 smoothed, 4 LaMa
    let gt = regGray(t, orig)
    let samePrev = prevF == t - 1 && prevOut != nil && shotOf(prevF) == shotOf(t)

    // 1) Real pixels: the same scene point where no overlay was over it, nearest frames first.
    var tries = 0, idle = 0
    let maxTries = samePrev ? 8 : 16
    for k in offsets where count > 0 && tries < maxTries && idle < 5 {
      let s = t + k
      guard s >= 0, s < total, shotOf(s) == shotOf(t) else { continue }
      let fs = store.frame(s)
      let ms = maskAt(s)
      guard let h = fit(t, s, gt, regGray(s, fs), maskT: m) else { idle += 1; continue }
      tries += 1
      var gain = 0
      for r in rects {
        // The picture just around this region must line up after the warp, or this frame's pixels
        // would land misplaced (parallax, a door swinging): checked per region, on the ring.
        guard ringLinesUp(orig, fs, h, r: r, maskT: m, maskS: ms, W: W, H: H) else { continue }
        for y in r.y..<(r.y + r.h) {
          for x in r.x..<(r.x + r.w) {
            let i = y * W + x
            guard hole[i] != 0, let q = apply(h, Double(x), Double(y)) else { continue }
            let qx = Int(q.0.rounded(.down)), qy = Int(q.1.rounded(.down))
            guard qx >= 0, qy >= 0, qx + 1 < W, qy + 1 < H else { continue }
            if ms[qy * W + qx] != 0 || ms[qy * W + qx + 1] != 0 || ms[(qy + 1) * W + qx] != 0 || ms[(qy + 1) * W + qx + 1] != 0 { continue }
            let tx = q.0 - Double(qx), ty = q.1 - Double(qy)
            for c in 0..<3 {
              let a = Double(fs[(qy * W + qx) * 4 + c]) * (1 - tx) + Double(fs[(qy * W + qx + 1) * 4 + c]) * tx
              let b = Double(fs[((qy + 1) * W + qx) * 4 + c]) * (1 - tx) + Double(fs[((qy + 1) * W + qx + 1) * 4 + c]) * tx
              out[i * 4 + c] = UInt8(max(0, min(255, (a * (1 - ty) + b * ty).rounded())))
            }
            hole[i] = 0; src[i] = 1; gain += 1
          }
        }
      }
      count -= gain; realPx += gain
      idle = gain == 0 ? idle + 1 : 0
    }

    // 2) The cleaned frame before — only its clean pixels (never an overlay it could not clear).
    var hPrev: Hom? = nil
    if samePrev, let p = prevOut, let pv = prevValid {
      hPrev = fit(t, prevF, gt, regGray(prevF, p), maskT: m)
      if count > 0, let h = hPrev {
        for r in rects {
          for y in r.y..<(r.y + r.h) {
            for x in r.x..<(r.x + r.w) {
              let i = y * W + x
              guard hole[i] != 0, let q = apply(h, Double(x), Double(y)) else { continue }
              let qx = Int(q.0.rounded()), qy = Int(q.1.rounded())
              guard qx >= 0, qy >= 0, qx < W, qy < H, pv[qy * W + qx] != 0 else { continue }
              for c in 0..<3 { out[i * 4 + c] = p[(qy * W + qx) * 4 + c] }
              hole[i] = 0; src[i] = 2; count -= 1; prevPx += 1
            }
          }
        }
      }
    }

    // 3) What is left: specks smoothed in from their edge; bigger holes painted by LaMa within the cap.
    if count > 0 {
      var x0 = W, y0 = H, x1 = 0, y1 = 0
      for r in rects {
        for y in r.y..<(r.y + r.h) { for x in r.x..<(r.x + r.w) where hole[y * W + x] != 0 { x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y) } }
      }
      let frac = Double(count) / Double(N)
      if count <= 1500 {
        smoothFill(&out, hole: hole, W: W, H: H, box: (x0, y0, x1, y1))
        for y in y0...y1 { for x in x0...x1 where hole[y * W + x] != 0 { src[y * W + x] = 3; hole[y * W + x] = 0 } }
        smoothPx += count
        count = 0
      } else if let lama, frac <= plan.maxGenFrac {
        let side = max(256, min(min(W, H), max(x1 - x0, y1 - y0) * 2 + 48))
        let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
        let ox = max(0, min(W - side, cx - side / 2)), oy = max(0, min(H - side, cy - side / 2))
        var crop = [UInt8](repeating: 255, count: side * side * 4)
        var cm = [UInt8](repeating: 0, count: side * side)
        for y in 0..<side {
          for x in 0..<side {
            let i = (oy + y) * W + (ox + x)
            for c in 0..<4 { crop[(y * side + x) * 4 + c] = out[i * 4 + c] }
            cm[y * side + x] = hole[i] != 0 ? 255 : 0
          }
        }
        let n = Lama.side
        var bm = resize(cm, side, side, to: n, n, channels: 1)
        for i in 0..<bm.count { bm[i] = bm[i] > 20 ? 255 : 0 }
        if let painted = try? lama.paint(bgra: resize(crop, side, side, to: n, n, channels: 4), mask: bm) {
          lamaCalls += 1
          let back = resize(painted, n, n, to: side, side, channels: 4)
          var rng = Rng(s: UInt64(0xA5A5_0000) &+ UInt64(t))
          let sigma = grainSigma(orig, W, H, rects: rects, mask: m)
          for y in 0..<side {
            for x in 0..<side {
              let i = (oy + y) * W + (ox + x)
              guard hole[i] != 0 else { continue }
              let g = rng.gauss() * sigma
              for c in 0..<3 { out[i * 4 + c] = UInt8(max(0, min(255, (Double(back[(y * side + x) * 4 + c]) + g).rounded()))) }
              hole[i] = 0; src[i] = 4; lamaPx += 1
            }
          }
          count = 0
          maxGen = max(maxGen, frac)
        }
      }
      if count > 0 { unfilledPx += count; unfilledFrames.append(t) }
    }

    // Feather: the outer three pixels of the (dilated) mask blend into the original, which is room there.
    for r in rects {
      for y in r.y..<(r.y + r.h) {
        for x in r.x..<(r.x + r.w) {
          let i = y * W + x
          guard src[i] != 0 else { continue }
          var d = 3
          outer: for k in 1...3 {
            for (dx, dy) in [(k, 0), (-k, 0), (0, k), (0, -k)] {
              let nx = x + dx, ny = y + dy
              if nx < 0 || ny < 0 || nx >= W || ny >= H || m[ny * W + nx] == 0 { d = k - 1; break outer }
            }
          }
          guard d < 3 else { continue }
          let a = Double(d + 1) / 4
          for c in 0..<3 { out[i * 4 + c] = UInt8((a * Double(out[i * 4 + c]) + (1 - a) * Double(orig[i * 4 + c])).rounded()) }
        }
      }
    }

    // Quality: the seam at the fill's edge, and the flicker inside it, against the room around it.
    var seam = 0.0, seamN = 0, ring = 0.0, ringN = 0
    for r in rects {
      for y in max(1, r.y - 6)..<min(H - 1, r.y + r.h + 6) {
        for x in max(1, r.x - 6)..<min(W - 1, r.x + r.w + 6) {
          let i = y * W + x, j = i + 1
          let dv = abs(lum(out, i) - lum(out, j))
          if (m[i] != 0) != (m[j] != 0) { seam += dv; seamN += 1 } else if m[i] == 0 && m[j] == 0 { ring += dv; ringN += 1 }
        }
      }
    }
    if seamN > 0 && ringN > 0 { seams.append((seam / Double(seamN)) / (ring / Double(ringN) + 1)) }
    if let p = prevOut, let h = hPrev {
      var inD = 0.0, inN = 0, outD = 0.0, outN = 0
      for r in rects {
        for y in stride(from: max(0, r.y - 8), to: min(H, r.y + r.h + 8), by: 2) {
          for x in stride(from: max(0, r.x - 8), to: min(W, r.x + r.w + 8), by: 2) {
            guard let q = apply(h, Double(x), Double(y)) else { continue }
            let qx = Int(q.0.rounded()), qy = Int(q.1.rounded())
            guard qx >= 0, qy >= 0, qx < W, qy < H else { continue }
            let dv = abs(lum(out, y * W + x) - lum(p, qy * W + qx))
            if m[y * W + x] != 0 { inD += dv; inN += 1 } else { outD += dv; outN += 1 }
          }
        }
      }
      if inN > 0 && outN > 0 { flickers.append((inD / Double(inN)) / (outD / Double(outN) + 1)) }
    }

    writer.write(out)
    var valid = [UInt8](repeating: 1, count: N)
    for i in 0..<N where m[i] != 0 && src[i] == 0 { valid[i] = 0 }
    prevOut = out; prevValid = valid; prevF = t
  }

  func p95(_ a: [Double]) -> Double { a.isEmpty ? 0 : a.sorted()[min(a.count - 1, Int(Double(a.count) * 0.95))] }
  try writeJSON([
    "frames": total, "maskedFrames": maskedFrames, "holePx": holePx, "realPx": realPx, "prevPx": prevPx, "smoothPx": smoothPx, "lamaPx": lamaPx,
    "unfilledPx": unfilledPx, "unfilledFrames": Array(unfilledFrames.prefix(50)), "lamaCalls": lamaCalls, "lama": lama != nil,
    "maxGenFrac": r3(maxGen), "seamP95": r3(p95(seams)), "flickerP95": r3(p95(flickers)),
    "seconds": r3(Date().timeIntervalSince(started)),
  ], to: o.report ?? "/dev/stderr")
}

/// Whether frame `s`, warped by `h`, matches frame `t` on the ring just outside region `r` (both
/// unmasked there): mean luminance difference under 12 on at least 60 sampled points.
func ringLinesUp(_ t: [UInt8], _ s: [UInt8], _ h: Hom, r: Rect, maskT: [UInt8], maskS: [UInt8], W: Int, H: Int) -> Bool {
  let ring = r.grown(14).clamped(W, H)
  var diff = 0.0, n = 0
  for y in stride(from: ring.y, to: ring.y + ring.h, by: 3) {
    for x in stride(from: ring.x, to: ring.x + ring.w, by: 3) {
      if r.contains(x, y) || maskT[y * W + x] != 0 { continue }
      guard let q = apply(h, Double(x), Double(y)) else { continue }
      let qx = Int(q.0.rounded()), qy = Int(q.1.rounded())
      guard qx >= 0, qy >= 0, qx < W, qy < H, maskS[qy * W + qx] == 0 else { continue }
      let i = (y * W + x) * 4, j = (qy * W + qx) * 4
      let a = 0.114 * Double(t[i]) + 0.587 * Double(t[i + 1]) + 0.299 * Double(t[i + 2])
      let b = 0.114 * Double(s[j]) + 0.587 * Double(s[j + 1]) + 0.299 * Double(s[j + 2])
      diff += abs(a - b); n += 1
    }
  }
  return n >= 60 && diff / Double(n) < 12
}

/// Fills a few holes (specks, a leftover rim) from their edge inward: each hole pixel becomes the mean
/// of its known neighbours, repeated until settled — no structure invented, nothing blurred around it.
func smoothFill(_ out: inout [UInt8], hole: [UInt8], W: Int, H: Int, box: (Int, Int, Int, Int)) {
  let (x0, y0, x1, y1) = box
  var known = [UInt8](repeating: 1, count: W * H)
  for y in y0...y1 { for x in x0...x1 where hole[y * W + x] != 0 { known[y * W + x] = 0 } }
  for _ in 0..<64 {
    var changed = false
    for y in y0...y1 {
      for x in x0...x1 {
        let i = y * W + x
        guard hole[i] != 0 else { continue }
        var s = [0.0, 0.0, 0.0], n = 0.0
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
          let nx = x + dx, ny = y + dy
          guard nx >= 0, ny >= 0, nx < W, ny < H, known[ny * W + nx] != 0 else { continue }
          for c in 0..<3 { s[c] += Double(out[(ny * W + nx) * 4 + c]) }
          n += 1
        }
        guard n > 0 else { continue }
        for c in 0..<3 { out[i * 4 + c] = UInt8((s[c] / n).rounded()) }
        if known[i] == 0 { known[i] = 1; changed = true }
      }
    }
    if !changed { break }
  }
}

/// The picture's fine grain around the holes (per-pixel deviation from its 3×3 mean), as a sigma.
func grainSigma(_ f: [UInt8], _ W: Int, _ H: Int, rects: [Rect], mask: [UInt8]) -> Double {
  var s2 = 0.0, n = 0
  for r in rects {
    let g = r.grown(10).clamped(W, H)
    for y in stride(from: max(1, g.y), to: min(H - 1, g.y + g.h), by: 2) {
      for x in stride(from: max(1, g.x), to: min(W - 1, g.x + g.w), by: 2) {
        guard mask[y * W + x] == 0 else { continue }
        var mean = 0.0
        for dy in -1...1 { for dx in -1...1 { mean += Double(f[((y + dy) * W + x + dx) * 4 + 1]) } }
        mean /= 9
        let d = Double(f[(y * W + x) * 4 + 1]) - mean
        s2 += d * d; n += 1
      }
    }
  }
  return n > 20 ? min(6, (s2 / Double(n)).squareRoot() * 0.8) : 1.5
}

// MARK: - selftest

/// Checks the two conventions the tool rests on: the registration's direction (a point in `from` maps
/// to where the scene went in `to`) on a real frame (`gray`: raw 8-bit grey, gw × gh — synthetic
/// textures are too poor for Vision's registration), and LaMa's mask polarity (white = paint).
func selftest(model: String?, gray: String?, gw: Int, gh: Int) throws {
  guard let gray, gw >= 400, gh >= 400 else { throw ToolError("selftest needs --gray=<raw grey frame> --gw= --gh= (at least 400×400)") }
  let src = [UInt8](try Data(contentsOf: URL(fileURLWithPath: gray)))
  guard src.count >= gw * gh else { throw ToolError("selftest: the grey frame is smaller than gw × gh") }
  let w = gw / 2, h = gh / 2
  // The same frame seen by a camera that moved: the content shifted right 12 and down 6.
  func view(_ ox: Int, _ oy: Int) -> Gray {
    var g = Gray(w: w, h: h)
    for y in 0..<h { for x in 0..<w { g.px[y * w + x] = Float(src[(y + 40 - oy) * gw + (x + 40 - ox)]) } }
    return g
  }
  let a = view(0, 0), b = view(12, 6)
  guard let hm = register(from: a, to: b), let p = apply(hm, 100, 100) else { throw ToolError("selftest: registration failed") }
  let ok = abs(p.0 - 112) < 1.5 && abs(p.1 - 106) < 1.5
  warn("registration: (100,100) in `from` → (\(r3(p.0)), \(r3(p.1))) in `to` — expected (112, 106): \(ok ? "OK" : "WRONG")")
  if !ok { throw ToolError("selftest: registration direction is not what the tool assumes") }

  if let model {
    let lama = try Lama(path: model)
    let n = Lama.side
    var img = [UInt8](repeating: 255, count: n * n * 4)
    for y in 0..<n { for x in 0..<n {
      let i = (y * n + x) * 4
      img[i] = UInt8(x * 255 / n); img[i + 1] = UInt8(y * 255 / n); img[i + 2] = 128
    } }
    var mask = [UInt8](repeating: 0, count: n * n)
    var withHole = img
    for y in 300..<500 { for x in 300..<500 {
      mask[y * n + x] = 255
      let i = (y * n + x) * 4
      withHole[i] = 0; withHole[i + 1] = 0; withHole[i + 2] = 255 // a red block where the hole is
    } }
    let t0 = Date()
    let out = try lama.paint(bgra: withHole, mask: mask)
    let ms = Date().timeIntervalSince(t0) * 1000
    // Inside the hole the gradient should come back (not red); outside nothing should change much.
    var inErr = 0.0, outErr = 0.0, inN = 0, outN = 0
    for y in stride(from: 0, to: n, by: 4) { for x in stride(from: 0, to: n, by: 4) {
      let i = (y * n + x) * 4
      let e = abs(Double(out[i]) - Double(img[i])) + abs(Double(out[i + 1]) - Double(img[i + 1])) + abs(Double(out[i + 2]) - Double(img[i + 2]))
      if mask[y * n + x] != 0 { inErr += e; inN += 1 } else { outErr += e; outN += 1 }
    } }
    let inside = inErr / Double(inN) / 3, outside = outErr / Double(outN) / 3
    let lamaOK = inside < 40 && outside < 20
    warn("LaMa: \(Int(ms)) ms; mean error inside the hole \(r3(inside)), outside \(r3(outside)) — \(lamaOK ? "OK (white = paint)" : "WRONG")")
    if !lamaOK { throw ToolError("selftest: LaMa did not paint the white mask as expected") }
  }
  warn("selftest passed")
}
