/**
 * The generator registry — which tool renders a run, and how we recognise its
 * output afterwards.
 *
 * The pipeline used to hardcode one lane ("Nano Banana in the Gemini web app").
 * That was never a real constraint: any image model that takes an image plus a
 * prompt can do this work, they leapfrog each other every few months, and the
 * operator should be able to pick per run — `--model=chatgpt-image` for a photo
 * that needs a steadier hand with architecture, `--model=nano-banana-2` when
 * it's better on interiors that week.
 *
 * Unknown ids are ACCEPTED, not rejected: `--model=whatever-ships-next` records
 * itself faithfully and simply has no web app to open. A registry that refuses
 * new tools would be the same hardcoding wearing a lookup table.
 *
 * `match` closes the loop the other way. A run's model is a plan recorded at
 * queue time; the file the human returns is the fact. When a returned filename
 * clearly comes from a different family than the plan, `done` records what
 * actually made the picture (this is not hypothetical — run kbbvvatd was queued
 * for Gemini and returned by Codex, and the record had to be corrected by hand).
 */

export interface MasteringModel {
  /** Stored verbatim in MasteringRun.model. */
  id: string;
  /** Human name — Slack task text, CLI output. */
  label: string;
  /**
   * Vendor family. Detection only overrides the recorded model ACROSS families:
   * a filename can prove "this came from OpenAI, not Google", but it cannot
   * tell Nano Banana from Nano Banana 2 — there the operator's declaration is
   * the more specific truth and stands.
   */
  family: string;
  /** Web app `master:prep` opens. Empty when there is nothing to open. */
  url: string;
  /**
   * macOS app `master:prep` opens in preference to `url`, when it is actually
   * installed. The desktop app keeps the drag inside one window and remembers
   * the save folder; the URL stays the fallback for a Mac without it.
   */
  app?: string;
  /** Download-filename signatures for detection. */
  match: RegExp[];
  note?: string;
}

export const MODELS: MasteringModel[] = [
  {
    id: "nano-banana",
    label: "Nano Banana (Gemini)",
    family: "google",
    url: "https://gemini.google.com/app",
    match: [/^Gemini_Generated_Image/i, /^nano[-_ ]?banana/i],
    note: "covered by the Google AI Pro subscription — no API spend",
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2 (Gemini)",
    family: "google",
    url: "https://gemini.google.com/app",
    match: [/^Gemini_Generated_Image/i],
    note: "same web app — pick the model inside Gemini",
  },
  {
    id: "chatgpt-image",
    label: "ChatGPT Image",
    family: "openai",
    url: "https://chatgpt.com",
    app: "ChatGPT",
    match: [/^ChatGPT Image/i, /^DALL[·.]?E/i],
    note: "covered by the ChatGPT subscription",
  },
  {
    id: "chatgpt-image-2",
    label: "ChatGPT Image 2.0",
    family: "openai",
    url: "https://chatgpt.com",
    app: "ChatGPT",
    // Same download name as its predecessor — which is exactly why the version
    // is its own id and detection never overrides within a family.
    match: [/^ChatGPT Image/i],
    note: "covered by the ChatGPT subscription — pick the model inside ChatGPT",
  },
  {
    id: "codex",
    label: "Codex",
    family: "openai",
    url: "https://chatgpt.com/codex",
    app: "ChatGPT",
    match: [/^Codex Image/i],
  },
];

/** Shorthands the operator is likely to type. */
const ALIASES: Record<string, string> = {
  // Every row queued before the registry existed carries this literal. Without
  // the alias it reads as an unregistered family, prep has no app to open, and
  // any return would be "corrected" across a family boundary that isn't real.
  "nano-banana-web": "nano-banana",
  gemini: "nano-banana",
  "nano-banana-1": "nano-banana",
  banana: "nano-banana",
  banana2: "nano-banana-2",
  nb2: "nano-banana-2",
  chatgpt: "chatgpt-image",
  "chatgpt-image-2.0": "chatgpt-image-2",
  "chatgpt-2": "chatgpt-image-2",
  "gpt-image-2": "chatgpt-image-2",
  gpt: "chatgpt-image",
  "gpt-image": "chatgpt-image",
  openai: "chatgpt-image",
  dalle: "chatgpt-image",
};

export const DEFAULT_MODEL_ID = process.env.MASTERING_MODEL?.trim() || "nano-banana";

/**
 * Registry entry for an id — or a faithful stand-in for one we've never heard
 * of, so a new tool needs no code change to be used, only to be *recognised*.
 */
export function resolveModel(idOrAlias: string | null | undefined): MasteringModel {
  const raw = (idOrAlias ?? "").trim();
  if (!raw) return resolveModel(DEFAULT_MODEL_ID);
  const id = ALIASES[raw.toLowerCase()] ?? raw;
  const hit = MODELS.find((m) => m.id.toLowerCase() === id.toLowerCase());
  return hit ?? { id, label: id, family: `unregistered:${id}`, url: "", match: [] };
}

/** The model a returned file's name points at, if any. */
export function detectModel(filename: string): MasteringModel | null {
  const base = filename.replace(/^.*\//, "");
  return MODELS.find((m) => m.match.some((re) => re.test(base))) ?? null;
}

/**
 * What to record for a run, given what was planned and what came back. Returns
 * null when the plan stands.
 */
export function correctedModel(recordedId: string, filename: string): MasteringModel | null {
  const detected = detectModel(filename);
  if (!detected) return null;
  const recorded = resolveModel(recordedId);
  return detected.family === recorded.family ? null : detected;
}

/** One-line summary for `--help`-ish output. */
export const modelList = (): string => MODELS.map((m) => m.id).join(", ");
