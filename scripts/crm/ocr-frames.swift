// On-screen text from TikTok frames, read on the Mac by Apple Vision — free,
// offline, no quota. Brokers burn the price, rooms, place and phone into the
// video; reading it here turns most vision reads into text reads.
//
//   swift scripts/crm/ocr-frames.swift a.jpg b.jpg …
//   → {"a.jpg":"line | line","b.jpg":""}
//
// --boxes says where the text is, so the TikTok page's remaster can wipe a
// broker's captions and phone number before mkan's own prints go on
// (tiktok-post.ts stripText):
//
//   ocr-frames --boxes a.jpg b.jpg …
//   → {"a.jpg":[{"text":"0788 000 000","conf":0.98,"x":0.1,"y":0.62,"w":0.5,"h":0.04}],"b.jpg":[]}
//
// x/y/w/h are fractions of the frame from its top-left corner. Every line
// Vision finds is listed with its confidence (the caller decides what is
// noise), down to text 1/120 of the frame tall. A frame that cannot be read
// fails the whole run (exit 1): a wipe must never pass a frame it did not see.
//
// Kinyarwanda has no Vision model, but it is Latin script: the en/fr models
// read its words letter by letter well enough for names, prices and phones.
import Foundation
import Vision

let args = Array(CommandLine.arguments.dropFirst())
let wantBoxes = args.first == "--boxes"

func recognize(_ path: String, minimumTextHeight: Float? = nil) throws -> [VNRecognizedTextObservation] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["en-US", "fr-FR"]
  request.usesLanguageCorrection = false
  if let m = minimumTextHeight { request.minimumTextHeight = m }
  let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:])
  try handler.perform([request])
  return request.results ?? []
}

func emit(_ object: Any) throws {
  let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

let r4 = { (v: CGFloat) -> Double in (Double(v) * 10_000).rounded() / 10_000 }

if wantBoxes {
  var out: [String: [[String: Any]]] = [:]
  for path in args.dropFirst() {
    guard FileManager.default.isReadableFile(atPath: path) else {
      FileHandle.standardError.write("ocr-frames: cannot read \(path)\n".data(using: .utf8)!)
      exit(1)
    }
    // The first frame a newly built binary reads takes Vision ~40 s (it prepares
    // its model for this binary), and under load — an AI upscale, another Vision
    // job — that start can fail (CRImageReaderError). Retry for about a minute,
    // then give up. The CPU path is no way round: ~70 s a frame.
    var observations: [VNRecognizedTextObservation]? = nil
    let waits: [Double] = [2, 5, 10, 20, 30]
    for attempt in 0...waits.count {
      do {
        observations = try recognize(path, minimumTextHeight: 1.0 / 120)
        break
      } catch {
        if attempt == waits.count {
          FileHandle.standardError.write("ocr-frames: \(path): \(error.localizedDescription)\n".data(using: .utf8)!)
          exit(1)
        }
        Thread.sleep(forTimeInterval: waits[attempt])
      }
    }
    out[path] = (observations ?? []).compactMap { obs in
      guard let top = obs.topCandidates(1).first else { return nil }
      let b = obs.boundingBox // normalised, origin bottom-left
      return ["text": top.string, "conf": r4(CGFloat(top.confidence)), "x": r4(b.minX), "y": r4(1 - b.maxY), "w": r4(b.width), "h": r4(b.height)]
    }
  }
  try emit(out)
} else {
  var out: [String: String] = [:]
  for path in args {
    do {
      let lines = try recognize(path)
        // Top to bottom, as a viewer reads the card.
        .sorted { $0.boundingBox.minY > $1.boundingBox.minY }
        .compactMap { $0.topCandidates(1).first }
        .filter { $0.confidence >= 0.4 }
        .map { $0.string.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }
      out[path] = lines.joined(separator: " | ")
    } catch {
      out[path] = ""
    }
  }
  try emit(out)
}
