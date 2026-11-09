// mkan-video — the v2 TikTok render's eyes and hands on this Mac (Apple Vision + Core ML, $0).
//
//   ffmpeg … -f rawvideo -pix_fmt bgra - | mkan-video measure --w= --h= [--fps=30] [--out=m.json]
//   ffmpeg … -f rawvideo -pix_fmt bgra - | mkan-video fill --w= --h= --plan=plan.json [--model=LaMa.mlmodelc] [--report=r.json] | ffmpeg -f rawvideo …
//   mkan-video selftest --gray=frame.gray --gw= --gh= [--model=LaMa.mlmodelc]   registration direction (real frame) + LaMa mask polarity
//
// Built by scripts/crm/tiktok-post.ts (swiftc -O scripts/crm/video/*.swift → .data/bin/mkan-video).
import Foundation

func argValue(_ name: String) -> String? {
  CommandLine.arguments.first { $0.hasPrefix("--\(name)=") }.map { String($0.dropFirst(name.count + 3)) }
}

do {
  let cmd = CommandLine.arguments.dropFirst().first ?? ""
  switch cmd {
  case "measure":
    var o = MeasureOpts()
    o.w = Int(argValue("w") ?? "") ?? 0
    o.h = Int(argValue("h") ?? "") ?? 0
    o.fps = Double(argValue("fps") ?? "30") ?? 30
    o.out = argValue("out")
    guard o.w > 0, o.h > 0 else { throw ToolError("measure needs --w and --h") }
    try measure(o)
  case "fill":
    var o = FillOpts()
    o.w = Int(argValue("w") ?? "") ?? 0
    o.h = Int(argValue("h") ?? "") ?? 0
    o.plan = argValue("plan") ?? ""
    o.model = argValue("model")
    o.report = argValue("report")
    guard o.w > 0, o.h > 0, !o.plan.isEmpty else { throw ToolError("fill needs --w, --h and --plan") }
    try fill(o)
  case "selftest":
    try selftest(model: argValue("model"), gray: argValue("gray"), gw: Int(argValue("gw") ?? "") ?? 0, gh: Int(argValue("gh") ?? "") ?? 0)
  default:
    throw ToolError("usage: mkan-video measure|fill|selftest …")
  }
} catch {
  warn("mkan-video: \(error)")
  exit(1)
}
