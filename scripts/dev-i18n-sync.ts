/**
 * Sync / verify i18n translation-key parity between en.json and ar.json.
 *
 *   tsx scripts/dev-i18n-sync.ts --verify   # report drift, exit 1 if any (CI gate)
 *   tsx scripts/dev-i18n-sync.ts --fix       # inject [EN]/[AR] placeholders for missing keys
 *
 * Dependency-free (no chalk/commander/ora) so it runs with just `tsx`.
 * Mkan uses a single dictionary file per locale, so this compares exactly those
 * two files (unlike the hogwarts original, which walks feature-split dirs).
 */

import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

const I18N_DIR = join(
  process.cwd(),
  "src",
  "components",
  "internationalization"
)
const EN_PATH = join(I18N_DIR, "en.json")
const AR_PATH = join(I18N_DIR, "ar.json")
const SCHEMA_PATH = join(process.cwd(), "prisma", "schema.prisma")

const args = process.argv.slice(2)
const FIX = args.includes("--fix")

type Json = Record<string, unknown>

/**
 * Prisma enums that render as user-facing labels, each paired with the
 * dictionary map that must carry a label for EVERY value in BOTH locales. This
 * is the "once and for good" contract: add an enum value and forget the label,
 * and CI fails here instead of shipping a raw enum string on /ar or /en.
 */
const ENUM_LABEL_MAPS: Array<{ enum: string; path: string }> = [
  { enum: "Amenity", path: "rental.property.amenities" },
  { enum: "Highlight", path: "rental.property.highlights" },
  { enum: "PropertyType", path: "rental.property.types" },
  { enum: "CancellationPolicy", path: "rental.property.cancellation" },
  { enum: "CheckInMethod", path: "rental.property.checkIn" },
  { enum: "BusAmenity", path: "transport.host.amenityLabels" },
]

/** Extract an enum's member names from schema.prisma (dependency-free). */
function parseEnumValues(schema: string, name: string): string[] {
  const block = schema.match(new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`))
  if (!block) return []
  return block[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => l.length > 0 && /^[A-Za-z]/.test(l))
}

/** Deep-flatten an object to dotted leaf paths (arrays are treated as leaves). */
function getAllKeys(obj: unknown, prefix = ""): string[] {
  const keys: string[] = []
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return keys
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

function getNestedValue(obj: Json, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Json)[key]
          : undefined,
      obj
    )
}

function setNestedValue(obj: Json, path: string, value: unknown): void {
  const keys = path.split(".")
  const lastKey = keys.pop()!
  const target = keys.reduce<Json>((current, key) => {
    if (typeof current[key] !== "object" || current[key] === null) {
      current[key] = {}
    }
    return current[key] as Json
  }, obj)
  target[lastKey] = value
}

function main() {
  const en = JSON.parse(readFileSync(EN_PATH, "utf-8")) as Json
  const ar = JSON.parse(readFileSync(AR_PATH, "utf-8")) as Json

  const enKeys = new Set(getAllKeys(en))
  const arKeys = new Set(getAllKeys(ar))

  const missingInEn = [...arKeys].filter((k) => !enKeys.has(k)).sort()
  const missingInAr = [...enKeys].filter((k) => !arKeys.has(k)).sort()

  console.log("i18n parity check — en.json vs ar.json")
  console.log(`  en keys: ${enKeys.size}`)
  console.log(`  ar keys: ${arKeys.size}`)

  let parityOk = missingInEn.length === 0 && missingInAr.length === 0
  if (parityOk) {
    console.log("✓ All keys are in sync.")
  } else {
    if (missingInEn.length > 0) {
      console.log(`\nMissing in en.json (${missingInEn.length}):`)
      missingInEn.forEach((k) => console.log(`  - ${k}`))
    }
    if (missingInAr.length > 0) {
      console.log(`\nMissing in ar.json (${missingInAr.length}):`)
      missingInAr.forEach((k) => console.log(`  - ${k}`))
    }
    if (FIX) {
      for (const key of missingInEn) {
        setNestedValue(en, key, `[EN] ${String(getNestedValue(ar, key))}`)
      }
      for (const key of missingInAr) {
        setNestedValue(ar, key, `[AR] ${String(getNestedValue(en, key))}`)
      }
      writeFileSync(EN_PATH, JSON.stringify(en, null, 2) + "\n")
      writeFileSync(AR_PATH, JSON.stringify(ar, null, 2) + "\n")
      console.log(
        `\nAdded ${missingInEn.length + missingInAr.length} placeholder(s). Replace the [EN]/[AR] markers with real translations.`
      )
      parityOk = true // placeholders injected — re-run after translating
    }
  }

  // --- Enum-label coverage: every Prisma enum value has a label in both locales ---
  console.log("\nenum-label coverage — schema.prisma vs dict")
  let enumOk = true
  let schema = ""
  try {
    schema = readFileSync(SCHEMA_PATH, "utf-8")
  } catch {
    console.log("  ⚠ could not read schema.prisma — skipping enum check")
  }
  if (schema) {
    for (const { enum: enumName, path } of ENUM_LABEL_MAPS) {
      const values = parseEnumValues(schema, enumName)
      if (values.length === 0) {
        console.log(`  ⚠ enum ${enumName} not found in schema — skipping`)
        continue
      }
      const enMap = getNestedValue(en, path)
      const arMap = getNestedValue(ar, path)
      const missing: string[] = []
      for (const v of values) {
        if (!(enMap && typeof enMap === "object" && (enMap as Json)[v] != null)) missing.push(`en ${path}.${v}`)
        if (!(arMap && typeof arMap === "object" && (arMap as Json)[v] != null)) missing.push(`ar ${path}.${v}`)
      }
      if (missing.length > 0) {
        enumOk = false
        console.log(`  ✗ ${enumName} → ${path} — ${missing.length} missing label(s):`)
        missing.forEach((m) => console.log(`      - ${m}`))
      } else {
        console.log(`  ✓ ${enumName} → ${path} (${values.length} values)`)
      }
    }
  }

  if (parityOk && enumOk) {
    console.log("\n✓ i18n guard passed.")
    process.exit(0)
  }
  if (!parityOk) console.log("\nRun `pnpm i18n:sync` to add placeholder keys, then translate them.")
  if (!enumOk) console.log("Add the missing enum labels to BOTH en.json and ar.json.")
  process.exit(1)
}

main()
