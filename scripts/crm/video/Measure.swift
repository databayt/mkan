// mkan-video measure — what is on a broker's video, for the TypeScript side to decide what to remove.
//
//   ffmpeg -i norm.mp4 -f rawvideo -pix_fmt bgra - | mkan-video measure --w=576 --h=1024 --fps=30 --out=m.json
//
// For every line Vision reads (OCR every `ocrStep` frames, full resolution) it records the evidence
// that tells text ADDED in editing from text IN the scene:
//  • votes — 0.2 s and 0.4 s later, did the line stay where it was on the screen while the room
//    around it moved (added), or move with the room (scene)? Measured on half-resolution grey:
//    the camera's motion is Vision's homography, refined on the ring around the line by NCC.
//  • presence — with the camera still, did the line appear or vanish while the room did not change
//    (added: a caption popping on), or not?
//  • looks — sharpness against its surroundings, how plain the plate behind it is, how skewed its quad.
// Plus the camera's motion over time, shot cuts, and a coarse "fixed on the screen while the scene
// moves" map (logos, stickers, watermarks) per second.
import Foundation

/// The caption's plate: Vision's box hugs the letters, but a broker's caption often sits on a plain
/// coloured plate (pink, white, blue) that must go with it. From each side of the box, rows/columns
/// are added while they stay one plain colour (the plate's, read just outside the box); nil when the
/// box has no plate (letters straight on the picture). Never more than 0.8 × the line's height out.
func plateRect(_ px: [UInt8], w W: Int, h H: Int, box: Rect) -> Rect? {
  let b = box.clamped(W, H)
  let maxOut = max(4, Int(Double(b.h) * 0.8))
  /// Mean colour and spread of a strip.
  func strip(_ r: Rect) -> (c: (Double, Double, Double), spread: Double)? {
    let rr = r.clamped(W, H)
    guard rr.w > 0, rr.h > 0 else { return nil }
    var s = (0.0, 0.0, 0.0), s2 = 0.0, n = 0.0
    for y in rr.y..<(rr.y + rr.h) {
      for x in rr.x..<(rr.x + rr.w) {
        let i = (y * W + x) * 4
        let v = (Double(px[i + 2]), Double(px[i + 1]), Double(px[i]))
        s.0 += v.0; s.1 += v.1; s.2 += v.2; s2 += v.0 * v.0 + v.1 * v.1 + v.2 * v.2; n += 1
      }
    }
    let m = (s.0 / n, s.1 / n, s.2 / n)
    let spread = max(0, s2 / n - (m.0 * m.0 + m.1 * m.1 + m.2 * m.2)).squareRoot()
    return (m, spread)
  }
  // The plate's colour: the 3-px band just outside the box, if it is plain.
  guard let band = strip(Rect(x: b.x - 3, y: b.y - 3, w: b.w + 6, h: 3)), let band2 = strip(Rect(x: b.x - 3, y: b.y + b.h, w: b.w + 6, h: 3)) else { return nil }
  let close = { (a: (Double, Double, Double), c: (Double, Double, Double)) -> Bool in abs(a.0 - c.0) + abs(a.1 - c.1) + abs(a.2 - c.2) < 36 }
  guard band.spread < 22, band2.spread < 22, close(band.c, band2.c) else { return nil }
  let plate = band.c
  var r = b
  // Grow each side one line at a time while the new line is the plate's plain colour.
  var grew = true
  while grew {
    grew = false
    if r.y > 0, b.y - r.y < maxOut, let s = strip(Rect(x: r.x, y: r.y - 1, w: r.w, h: 1)), s.spread < 26, close(s.c, plate) { r.y -= 1; r.h += 1; grew = true }
    if r.y + r.h < H, r.y + r.h - (b.y + b.h) < maxOut, let s = strip(Rect(x: r.x, y: r.y + r.h, w: r.w, h: 1)), s.spread < 26, close(s.c, plate) { r.h += 1; grew = true }
    if r.x > 0, b.x - r.x < maxOut, let s = strip(Rect(x: r.x - 1, y: r.y, w: 1, h: r.h)), s.spread < 26, close(s.c, plate) { r.x -= 1; r.w += 1; grew = true }
    if r.x + r.w < W, r.x + r.w - (b.x + b.w) < maxOut, let s = strip(Rect(x: r.x + r.w, y: r.y, w: 1, h: r.h)), s.spread < 26, close(s.c, plate) { r.w += 1; grew = true }
  }
  return r.w > b.w + 2 || r.h > b.h + 2 ? r : nil
}

struct MeasureOpts {
  var w = 0, h = 0
  var fps = 30.0
  var ocrStep = 10 // 3 a second at 30 fps
  var regStep = 2 // 15 a second
  var voteK = [6, 12]
  var presenceD = [6, 15, 30]
  var cellDiv = 8 // the static map's cell: 1/8 of the frame side
  var out: String? = nil
}

private struct Sighting {
  let f: Int
  let line: TextLine
}

func measure(_ o: MeasureOpts) throws {
  let reader = RawReader(w: o.w, h: o.h)
  let half = 2
  let started = Date()
  var grays: [Int: Gray] = [:] // half-resolution grey of the recent frames
  var tiny: [Int: Gray] = [:] // 1/cellDiv grey for the static map and cuts
  var full: [Int: [UInt8]] = [:] // full BGRA of OCR frames, until their looks are measured
  var pending: [Sighting] = []
  var lines: [[String: Any]] = []
  var motion: [[String: Any]] = []
  var cuts: [Int] = []
  // The static map: per 1-second window, how often each cell held still while the scene moved.
  let cw = o.w / o.cellDiv, ch = o.h / o.cellDiv
  var winHits = [Int](repeating: 0, count: cw * ch)
  var winPairs = 0
  var windows: [[String: Any]] = []
  var winStart = 0
  var lastReg: Int? = nil
  var count = 0
  let keep = max(o.presenceD.max()! + 2, o.voteK.max()! + 2) * 2

  func flushWindow(until f: Int) {
    if winPairs > 0 {
      var cells = [UInt8](repeating: 0, count: cw * ch)
      for i in 0..<cells.count { cells[i] = UInt8(min(255, (winHits[i] * 255) / winPairs)) }
      windows.append(["f0": winStart, "f1": f, "pairs": winPairs, "cells": Data(cells).base64EncodedString()])
    }
    winHits = [Int](repeating: 0, count: cw * ch)
    winPairs = 0
    winStart = f
  }

  // One registration per frame pair, shared by every line read on that frame.
  var regCache: [Int: Hom] = [:]
  var regMiss: Set<Int> = []
  func cachedRegister(_ f: Int, _ k: Int, _ a: Gray, _ b: Gray) -> Hom? {
    let key = f * 1000 + k
    if let h = regCache[key] { return h }
    if regMiss.contains(key) { return nil }
    guard let h = register(from: a, to: b) else { regMiss.insert(key); return nil }
    regCache[key] = h
    return h
  }

  /// Evidence for one sighting, once the frames it needs are in.
  func evaluate(_ s: Sighting, last: Int) {
    let f = s.f
    guard let g0 = grays[f] else { return }
    let sb = s.line.box.scaled(1.0 / Double(half)).clamped(g0.w, g0.h)
    let m = max(6, Int(Double(sb.h) * 0.8))
    let ring = sb.grown(m).clamped(g0.w, g0.h)
    let tex = stats(g0, ring, excluding: sb).std
    var votes: [[String: Any]] = []
    for k in o.voteK where f + k <= last {
      guard let g1 = grays[f + k] else { continue }
      // Where the scene at the line's centre went, by the camera's homography (f → f+k).
      var pred = (0.0, 0.0)
      if let h = cachedRegister(f, k, g0, g1), let p = apply(h, sb.cx, sb.cy) { pred = (p.0 - sb.cx, p.1 - sb.cy) }
      let shift = bestShift(g0, ring, g1, start: pred, radius: 6, skip: sb)
      let d = shift.map { ($0.dx, $0.dy) } ?? pred
      let nS = ncc(g0, sb, g1, dx: 0, dy: 0) ?? -1
      let nF = ncc(g0, sb, g1, dx: d.0, dy: d.1) ?? -1
      let moved = (d.0 * d.0 + d.1 * d.1).squareRoot()
      var v = "none"
      if moved >= 3 && tex >= 6 {
        if nS >= 0.75 && nS >= nF + 0.08 { v = "fixed" }
        else if nF >= 0.75 && nF >= nS + 0.08 { v = "follows" }
        else { v = "mixed" }
      }
      votes.append(["k": k, "d": [r3(d.0 * Double(half)), r3(d.1 * Double(half))], "pred": [r3(pred.0 * Double(half)), r3(pred.1 * Double(half))], "ringNcc": r3(Double(shift?.score ?? -1)), "nS": r3(Double(nS)), "nF": r3(Double(nF)), "v": v])
    }
    var presence: [[String: Any]] = []
    for d in o.presenceD {
      for (dir, g) in [("prev", grays[f - d]), ("next", f + d <= last ? grays[f + d] : nil)] {
        guard let g else { continue }
        let nb = ncc(g0, sb, g, dx: 0, dy: 0) ?? -1
        let nr = ncc(g0, ring, g, dx: 0, dy: 0, skip: sb) ?? -1
        presence.append(["d": d, "dir": dir, "box": r3(Double(nb)), "ring": r3(Double(nr))])
      }
    }
    // Looks, at full resolution on the OCR frame.
    var looks: [String: Any] = [:]
    if let bgra = full[f] {
      let gf = grayOf(bgra, w: o.w, h: o.h, factor: 1)
      let b = s.line.box.clamped(o.w, o.h)
      let fm = max(4, Int(Double(b.h) * 0.6))
      let fr = b.grown(fm).clamped(o.w, o.h)
      let inS = stats(gf, b), ringS = stats(gf, fr, excluding: b)
      looks = ["sharpIn": r3(Double(sharpness(gf, b))), "sharpRing": r3(Double(sharpness(gf, fr, excluding: b))), "boxMean": r3(Double(inS.mean)), "boxStd": r3(Double(inS.std)), "ringMean": r3(Double(ringS.mean)), "ringStd": r3(Double(ringS.std))]
      if let p = plateRect(bgra, w: o.w, h: o.h, box: b) { looks["plate"] = [p.x, p.y, p.w, p.h] }
    }
    let q = s.line.quad
    let topAngle = atan2(q[1].1 - q[0].1, q[1].0 - q[0].0) * 180 / .pi
    let topLen = hypot(q[1].0 - q[0].0, q[1].1 - q[0].1), botLen = hypot(q[2].0 - q[3].0, q[2].1 - q[3].1)
    let trap = max(topLen, botLen) > 0 ? abs(topLen - botLen) / max(topLen, botLen) : 0
    let b = s.line.box
    lines.append([
      "f": f, "t": r3(Double(f) / o.fps), "text": s.line.text, "conf": r3(s.line.conf),
      "box": [b.x, b.y, b.w, b.h], "quad": q.map { [r3($0.0), r3($0.1)] }, "angle": r3(topAngle), "trap": r3(trap),
      "ringTex": r3(Double(tex)), "votes": votes, "presence": presence, "looks": looks,
    ])
  }

  var ocrFrames = 0, ocrFailures = 0
  var f = 0
  while let frame = reader.next() {
    let g = grayOf(frame, w: o.w, h: o.h, factor: half)
    grays[f] = g
    let t = grayOf(frame, w: o.w, h: o.h, factor: o.cellDiv)
    // Shot cut: the whole (tiny) picture stops correlating with the frame before.
    if let prev = tiny[f - 1], let c = ncc(prev, Rect(x: 0, y: 0, w: t.w, h: t.h), t, dx: 0, dy: 0), c < 0.35 { cuts.append(f) }
    tiny[f] = t
    if f % o.ocrStep == 0 {
      full[f] = frame
      ocrFrames += 1
      // Vision can fail to start under load (an AI upscale, another Vision job: e5rt error 13). One
      // unread frame only thins the evidence; too many fail the measure (the caller retries later).
      do {
        for line in try readText(cgImage(bgra: frame, w: o.w, h: o.h)) { pending.append(Sighting(f: f, line: line)) }
      } catch {
        ocrFailures += 1
        warn("measure: frame \(f) unread (\(error))")
      }
    }
    if f % o.regStep == 0 {
      if let lr = lastReg, let a = grays[lr], let h = register(from: a, to: g) {
        let c = apply(h, Double(g.w) / 2, Double(g.h) / 2) ?? (Double(g.w) / 2, Double(g.h) / 2)
        let mag = hypot(c.0 - Double(g.w) / 2, c.1 - Double(g.h) / 2) * Double(half)
        motion.append(["f": f, "mag": r3(mag), "h": homJSON(rescale(h, by: 1.0 / Double(half)))])
        // Static map: where the picture stayed the same at the same place while the scene moved.
        if mag >= 4, let ta = tiny[lr] {
          winPairs += 1
          let s = Double(o.cellDiv) / Double(half)
          for cy in 0..<ch {
            for cx in 0..<cw {
              let plain = abs(t.at(cx, cy) - ta.at(cx, cy))
              // Where this cell's scene point was in the earlier frame (half-res homography, inverted).
              let hx = (Double(cx) + 0.5) * s, hy = (Double(cy) + 0.5) * s
              guard let back = apply(h.inverse, hx, hy) else { continue }
              guard let was = ta.sample(back.0 / s - 0.5, back.1 / s - 0.5) else { continue }
              let warped = abs(t.at(cx, cy) - was)
              if plain < 6 && warped > 14 { winHits[cy * cw + cx] += 1 }
            }
          }
        }
      }
      lastReg = f
    }
    if (f - winStart) >= Int(o.fps) { flushWindow(until: f) }
    // Sightings whose frames are all in.
    let ready = pending.filter { $0.f + o.presenceD.max()! <= f }
    if !ready.isEmpty {
      for s in ready { evaluate(s, last: f) }
      pending.removeAll { $0.f + o.presenceD.max()! <= f }
    }
    // Forget what no sighting can need any more.
    for k in grays.keys where k < f - keep { grays[k] = nil }
    for k in tiny.keys where k < f - 2 { tiny[k] = nil }
    for k in full.keys where k < f - keep && !pending.contains(where: { $0.f == k }) { full[k] = nil }
    f += 1
    count = f
  }
  for s in pending { evaluate(s, last: count - 1) }
  flushWindow(until: count)
  if ocrFailures > max(3, ocrFrames / 5) { throw ToolError("text read failed on \(ocrFailures) of \(ocrFrames) frames") }
  try writeJSON([
    "w": o.w, "h": o.h, "fps": o.fps, "frames": count, "ocrStep": o.ocrStep, "regStep": o.regStep,
    "cell": ["div": o.cellDiv, "w": cw, "h": ch],
    "lines": lines, "motion": motion, "cuts": cuts, "staticWindows": windows, "ocrFrames": ocrFrames, "ocrFailures": ocrFailures,
    "seconds": r3(Date().timeIntervalSince(started)),
  ], to: o.out)
}
