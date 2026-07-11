/**
 * Scan src/ for hardcoded user-facing strings in JSX — the "no string skips
 * the dictionary" guard. AST-based (TypeScript compiler API), so it flags:
 *
 *   1. JSXText nodes containing words (Latin or Arabic)
 *   2. String literals in user-facing JSX attributes
 *      (placeholder, alt, title, aria-label, label, …)
 *   3. Plain string literals inside JSX expression containers: {"Hi"}
 *   4. Template/conditional/binary expressions in JSX that embed word literals
 *
 * It does NOT flag strings outside JSX (object literals, function args), so
 * inline bilingual maps (`{ en: {...}, ar: {...} }`) and toast(dict.x) pass.
 *
 * Exemptions:
 *   - `// i18n-exempt` or `{/* i18n-exempt *​/}` on the same or previous line
 *   - ALLOWLIST below (brand names / locale-neutral tokens)
 *   - EXEMPT_DIRS (dev-only pages, email templates rendered off-app)
 *
 * Usage:
 *   tsx scripts/i18n-scan-hardcoded.ts             # report + exit 1 on violations
 *   tsx scripts/i18n-scan-hardcoded.ts --update-baseline
 *   tsx scripts/i18n-scan-hardcoded.ts --all       # ignore baseline, show everything
 *
 * Baseline: scripts/i18n-hardcoded-baseline.json holds grandfathered
 * violations (file → count). The gate fails when a file EXCEEDS its baseline
 * count (new hardcoded strings) — burning down is always allowed and shrinks
 * the baseline automatically on --update-baseline. Target: empty baseline.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs"
import { join, relative } from "path"
import ts from "typescript"

/** Dependency-free recursive *.tsx collector. */
function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectTsx(full, out)
    else if (entry.name.endsWith(".tsx")) out.push(full)
  }
  return out
}

const ROOT = process.cwd()
const SRC = join(ROOT, "src")
const BASELINE_PATH = join(ROOT, "scripts", "i18n-hardcoded-baseline.json")

const args = process.argv.slice(2)
const UPDATE_BASELINE = args.includes("--update-baseline")
const SHOW_ALL = args.includes("--all")

/** Directories (relative to src/) whose UI is not end-user-facing. */
const EXEMPT_DIRS: string[] = [
  "app/[lang]/dev/", // dev-only credential listings etc.
]

/** Attributes whose string values reach the user (visually or via a11y). */
const USER_FACING_ATTRS = new Set([
  "placeholder",
  "alt",
  "title",
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "label",
  "description",
  "emptyMessage",
  "emptyText",
  "loadingText",
  "srLabel",
  "tooltip",
  "caption",
  "heading",
  "subheading",
  "subtitle",
  "text",
  "message",
  "confirmText",
  "cancelText",
])

/** Locale-neutral tokens that are fine to hardcode. */
const ALLOWLIST = new Set(
  [
    "mkan",
    "Mkan",
    "Airbnb",
    "airbnb",
    "WhatsApp",
    "Google",
    "Facebook",
    "Apple",
    "GitHub",
    "Mapbox",
    "Stripe",
    "Visa",
    "Mastercard",
    "OK",
    "iOS",
    "Android",
    "RTL",
    "LTR",
    "EN",
    "AR",
    "en",
    "ar",
    "USD",
    "SDG",
    "×",
    "+",
    "-",
    "–",
    "—",
    "·",
    "•",
    "…",
    "★",
    "☆",
    "%",
    "/",
    ":",
    ",",
    ".",
    "!",
    "?",
    "(",
    ")",
  ].map((s) => s.toLowerCase())
)

/** Does this text contain actual words a user would read? */
function hasWords(text: string): boolean {
  const cleaned = text
    .replace(/&\w+;|&#\d+;/g, " ") // HTML entities
    .trim()
  if (!cleaned) return false
  if (ALLOWLIST.has(cleaned.toLowerCase())) return false
  // Two-plus letters in a row (Latin) or any Arabic letter = a word.
  return /[A-Za-z]{2,}|[؀-ۿ]/.test(cleaned)
}

interface Violation {
  file: string
  line: number
  kind: string
  text: string
}

/** `a`, `a.b`, `a?.b?.c`, `a[b].c` — a value lookup, e.g. a dictionary chain. */
function isAccessChain(n: ts.Expression): boolean {
  let cur: ts.Expression = n
  while (
    ts.isPropertyAccessExpression(cur) ||
    ts.isElementAccessExpression(cur) ||
    ts.isNonNullExpression(cur) ||
    ts.isParenthesizedExpression(cur)
  ) {
    cur = cur.expression
  }
  return ts.isIdentifier(cur)
}

/** All string-literal text inside a ternary branch (for bilingual detection). */
function branchText(n: ts.Node): string {
  const parts: string[] = []
  const visit = (x: ts.Node) => {
    if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
      parts.push(x.text)
    } else if (ts.isTemplateExpression(x)) {
      parts.push(x.head.text, ...x.templateSpans.map((s) => s.literal.text))
    }
    x.forEachChild(visit)
  }
  visit(n)
  return parts.join(" ")
}

/** toast("..."), toast.error("..."), alert("...") — user-facing outside JSX. */
const TOAST_CALLEES = /^(toast(\.(success|error|info|warning|message|loading))?|alert)$/

function isExemptByComment(source: string, node: ts.Node, sf: ts.SourceFile): boolean {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
  const lines = source.split("\n")
  const current = lines[line] ?? ""
  const prev = lines[line - 1] ?? ""
  return current.includes("i18n-exempt") || prev.includes("i18n-exempt")
}

function scanFile(filePath: string): {
  violations: Violation[]
  bilingualInline: Violation[]
} {
  const source = readFileSync(filePath, "utf-8")
  if (source.includes("i18n-exempt-file")) return { violations: [], bilingualInline: [] }
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const violations: Violation[] = []
  const bilingualInline: Violation[] = []
  const rel = relative(ROOT, filePath)

  const push = (node: ts.Node, kind: string, text: string) => {
    if (!hasWords(text)) return
    if (isExemptByComment(source, node, sf)) return
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    violations.push({
      file: rel,
      line: line + 1,
      kind,
      text: text.trim().replace(/\s+/g, " ").slice(0, 80),
    })
  }

  /** Literal words inside an expression that sits in JSX (ternaries, || chains, templates). */
  const scanJsxExpression = (expr: ts.Expression) => {
    const visit = (n: ts.Node) => {
      // Don't descend into nested functions/objects/calls — event handlers,
      // props objects, cn(...) — nor nested JSX: the main walker owns those
      // (their text/attrs get their own visits).
      if (
        ts.isObjectLiteralExpression(n) ||
        ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n) ||
        ts.isCallExpression(n) ||
        ts.isJsxElement(n) ||
        ts.isJsxSelfClosingElement(n) ||
        ts.isJsxFragment(n)
      )
        return
      // String operands of comparisons are control flow, not copy.
      if (
        ts.isBinaryExpression(n) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsToken,
        ].includes(n.operatorToken.kind)
      )
        return
      // House pattern: `dict?.a?.b ?? "fallback"` — the fallback is defensive
      // copy behind a dictionary chain, endorsed by ~/.claude/rules/i18n.md.
      // Skip the right operand when the left is a property/identifier chain.
      if (
        ts.isBinaryExpression(n) &&
        (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
          n.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
        isAccessChain(n.left)
      ) {
        visit(n.left)
        return
      }
      // Inline-bilingual ternary: one branch Arabic, the other Latin —
      // internationalized (both languages present), tolerated as info-tier.
      if (ts.isConditionalExpression(n)) {
        const a = branchText(n.whenTrue)
        const b = branchText(n.whenFalse)
        const arabic = /[؀-ۿ]/
        const latin = /[A-Za-z]{2,}/
        if (
          (arabic.test(a) && latin.test(b) && !arabic.test(b)) ||
          (arabic.test(b) && latin.test(a) && !arabic.test(a))
        ) {
          bilingualInline.push({
            file: rel,
            line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
            kind: "bilingual-ternary",
            text: `${a.trim().slice(0, 30)} / ${b.trim().slice(0, 30)}`,
          })
          return
        }
      }
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        push(n, "jsx-expression", n.text)
        return
      }
      if (ts.isTemplateExpression(n)) {
        const staticText = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(" ")
        if (hasWords(staticText)) push(n, "jsx-template", staticText)
        return
      }
      n.forEachChild(visit)
    }
    visit(expr)
  }

  const walk = (node: ts.Node) => {
    // 1. Raw text between tags: <p>Hello</p>
    if (ts.isJsxText(node)) {
      push(node, "jsx-text", node.text)
    }

    // 2 + 3 + 4. Attributes and expression containers.
    if (ts.isJsxAttribute(node) && node.initializer) {
      const attrName = node.name.getText(sf)
      if (USER_FACING_ATTRS.has(attrName)) {
        if (ts.isStringLiteral(node.initializer)) {
          push(node.initializer, `attr:${attrName}`, node.initializer.text)
        } else if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression
        ) {
          scanJsxExpression(node.initializer.expression)
        }
      }
    }

    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      node.parent &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      scanJsxExpression(node.expression)
    }

    // toast("Saved!") / toast.error("Failed") / alert("...") — user-facing
    // strings that live outside JSX.
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf).replace(/\s/g, "")
      if (TOAST_CALLEES.test(callee)) {
        for (const arg of node.arguments) {
          if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
            push(arg, `call:${callee}`, arg.text)
          } else if (ts.isTemplateExpression(arg)) {
            const staticText = [arg.head.text, ...arg.templateSpans.map((s) => s.literal.text)].join(" ")
            if (hasWords(staticText)) push(arg, `call:${callee}`, staticText)
          } else if (ts.isObjectLiteralExpression(arg)) {
            for (const prop of arg.properties) {
              if (
                ts.isPropertyAssignment(prop) &&
                ["title", "description"].includes(prop.name.getText(sf)) &&
                (ts.isStringLiteral(prop.initializer) ||
                  ts.isNoSubstitutionTemplateLiteral(prop.initializer))
              ) {
                push(prop.initializer, `call:${callee}`, prop.initializer.text)
              }
            }
          }
        }
      }
    }

    node.forEachChild(walk)
  }

  walk(sf)
  return { violations, bilingualInline }
}

function main() {
  const files = collectTsx(SRC).filter((f) => {
    const rel = relative(SRC, f).replace(/\\/g, "/")
    return !EXEMPT_DIRS.some((d) => rel.startsWith(d))
  })

  const all: Violation[] = []
  const bilingual: Violation[] = []
  for (const f of files) {
    try {
      const result = scanFile(f)
      all.push(...result.violations)
      bilingual.push(...result.bilingualInline)
    } catch (e) {
      console.error(`  ⚠ parse failed: ${relative(ROOT, f)} — ${String(e)}`)
    }
  }

  const byFile = new Map<string, Violation[]>()
  for (const v of all) {
    const list = byFile.get(v.file) ?? []
    list.push(v)
    byFile.set(v.file, list)
  }

  if (UPDATE_BASELINE) {
    const baseline: Record<string, number> = {}
    for (const [file, list] of [...byFile.entries()].sort()) {
      baseline[file] = list.length
    }
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n")
    console.log(
      `Baseline updated: ${byFile.size} file(s), ${all.length} grandfathered string(s).`
    )
    process.exit(0)
  }

  const baseline: Record<string, number> = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, "utf-8"))
    : {}

  let newViolations = 0
  const report: string[] = []
  for (const [file, list] of [...byFile.entries()].sort()) {
    const allowed = SHOW_ALL ? 0 : (baseline[file] ?? 0)
    if (list.length > allowed) {
      newViolations += list.length - allowed
      report.push(`\n  ${file} — ${list.length} hardcoded (baseline ${allowed}):`)
      for (const v of list.slice(0, 25)) {
        report.push(`    L${v.line} [${v.kind}] "${v.text}"`)
      }
      if (list.length > 25) report.push(`    … +${list.length - 25} more`)
    }
  }

  console.log("hardcoded-string scan — user-facing literals in JSX")
  console.log(`  files scanned: ${files.length}`)
  console.log(`  total hardcoded strings: ${all.length} in ${byFile.size} file(s)`)
  if (bilingual.length > 0) {
    console.log(
      `  inline-bilingual ternaries (tolerated, prefer dictionary): ${bilingual.length}`
    )
  }

  if (newViolations > 0) {
    console.log(`\n✗ ${newViolations} hardcoded string(s) above baseline:`)
    report.forEach((l) => console.log(l))
    console.log(
      "\nFix: move the string into src/components/internationalization/{en,ar}.json and render via the dictionary."
    )
    console.log(
      "Genuine exceptions (brand names, locale-neutral tokens): add `// i18n-exempt` on the line above, or extend ALLOWLIST."
    )
    process.exit(1)
  }

  const grandfathered = Object.values(baseline).reduce((a, b) => a + b, 0)
  if (grandfathered > 0) {
    console.log(`✓ no new hardcoded strings (${grandfathered} grandfathered — burn them down).`)
  } else {
    console.log("✓ zero hardcoded user-facing strings.")
  }
  process.exit(0)
}

main()
