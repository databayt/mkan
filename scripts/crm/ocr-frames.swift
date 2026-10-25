// On-screen text from TikTok frames, read on the Mac by Apple Vision — free,
// offline, no quota. Brokers burn the price, rooms, place and phone into the
// video; reading it here turns most vision reads into text reads.
//
//   swift scripts/crm/ocr-frames.swift a.jpg b.jpg …
//   → {"a.jpg":"line | line","b.jpg":""}
//
// Kinyarwanda has no Vision model, but it is Latin script: the en/fr models
// read its words letter by letter well enough for names, prices and phones.
import Foundation
import Vision

var out: [String: String] = [:]
for path in CommandLine.arguments.dropFirst() {
  let url = URL(fileURLWithPath: path)
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["en-US", "fr-FR"]
  request.usesLanguageCorrection = false
  let handler = VNImageRequestHandler(url: url, options: [:])
  do {
    try handler.perform([request])
    let lines = (request.results ?? [])
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
let data = try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
