import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * One-tap decisions (2026-11-07): the money path stops waiting for a session. An unattended run that has
 * prepared a step only Abdout may take ends blocked with a typed action — a kind from this allowlist and
 * params zod checks — never a command line. /monetize shows the effect in plain words with Yes / No; the
 * Worker signs the answer; the Mac's loop (scripts/sprint/act.ts) verifies the signature and runs the
 * kind's own argv, with no shell, once.
 *
 * Text a tenant, broker or caption wrote can reach a session; it can never become a command here: the
 * argv is built from validated fields, and a forged "yes" fails the signature (its key is derived from
 * MKAN_WA_BRIDGE_SECRET, which lives on the Worker and in the Mac's Keychain, never in .env).
 */

const cuid = z.string().regex(/^[a-z0-9]{20,32}$/, "an id");
const money = z.number().int().min(0).max(100_000_000);
const yesNo = z.enum(["yes", "no"]);
const at = z.string().regex(/^(\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?Z?)?)$/, "YYYY-MM-DD HH:MM (Kigali) or ISO");

export const ACTIONS = {
  /** pnpm deal:book — the three-party viewing, the tenant messaged on WhatsApp. */
  "deal.book": z
    .object({
      task: cuid,
      listing: z.number().int().positive(),
      at,
      place: z.string().min(2).max(120).optional(),
      rent: money.optional(),
      advance: z.number().int().min(0).max(12).optional(),
      deposit: z.number().min(0).max(12).optional(),
      commission: z.number().min(0).max(100).optional(),
      fee: money.optional(),
      water: yesNo.optional(),
      power: yesNo.optional(),
      lease: z.number().int().min(1).max(60).optional(),
      moveIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      /** Mkan's share, the choice a Yes carries: the agreed % of the broker's commission, a flat RWF a lease, or none for this deal. */
      sharePct: z.number().gt(0).max(100).optional(),
      shareRwf: z.number().int().min(1).max(100_000_000).optional(),
      noShare: z.literal(true).optional(),
    })
    .strict()
    .refine((p) => [p.sharePct, p.shareRwf, p.noShare].filter((v) => v !== undefined).length <= 1, { message: "one share choice: sharePct, shareRwf or noShare", path: ["sharePct"] }),
  /** pnpm deal:status — how a booked deal ended; PAID with a share writes Mkan's COMMISSION. */
  "deal.status": z
    .object({
      deal: cuid,
      status: z.enum(["viewed", "signed", "paid", "lost"]),
      share: money.optional(),
      note: z.string().max(140).optional(),
    })
    .strict(),
  /** pnpm wa:brokers gated — broker asks on, for WhatsApp tenants who picked a home. */
  "brokers.gated": z.object({}).strict(),
} as const;

export type ActionKind = keyof typeof ACTIONS;
export const ACTION_KINDS = Object.keys(ACTIONS) as ActionKind[];
export type ActionParams = Record<string, string | number | boolean>;

export function parseAction(kind: string, params: unknown): { ok: true; kind: ActionKind; params: ActionParams } | { ok: false; error: string } {
  if (!(ACTION_KINDS as string[]).includes(kind)) return { ok: false, error: `kind must be one of ${ACTION_KINDS.join(", ")}` };
  const r = ACTIONS[kind as ActionKind].safeParse(params ?? {});
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "params"}: ${i.message}`).join("; ") };
  return { ok: true, kind: kind as ActionKind, params: r.data as ActionParams };
}

const flag = (name: string, v: string | number | boolean | undefined) => (v === undefined ? [] : [`--${name}=${v}`]);

/** The pnpm script and its arguments — an argv, never a shell string. */
export function actionArgv(kind: ActionKind, p: ActionParams): string[] {
  switch (kind) {
    case "deal.book":
      return [
        "deal:book",
        `--task=${p.task}`,
        `--listing=${p.listing}`,
        `--at=${p.at}`,
        ...flag("place", p.place),
        ...flag("rent", p.rent),
        ...flag("advance", p.advance),
        ...flag("deposit", p.deposit),
        ...flag("commission", p.commission),
        ...flag("fee", p.fee),
        ...flag("water", p.water),
        ...flag("power", p.power),
        ...flag("lease", p.lease),
        ...flag("move-in", p.moveIn),
        ...flag("share-pct", p.sharePct),
        ...flag("share-rwf", p.shareRwf),
        ...(p.noShare ? ["--no-share"] : []),
        "--by=Mkan loop (Abdout's yes)",
      ];
    case "deal.status":
      return ["deal:status", `--deal=${p.deal}`, `--status=${p.status}`, ...flag("share", p.share), ...flag("note", p.note)];
    case "brokers.gated":
      return ["wa:brokers", "gated"];
  }
}

/** Mkan's share as a Yes will record it — said plainly, because it is the choice on the card. */
function shareWords(p: ActionParams): string | null {
  if (p.sharePct != null) return `Mkan's share ${p.sharePct}% of the broker's commission`;
  if (p.shareRwf != null) return `Mkan's share ${Number(p.shareRwf).toLocaleString("en-US")} RWF a lease`;
  if (p.noShare) return "no share for this deal";
  return null;
}

const rwf = (v: string | number | boolean | undefined) => (typeof v === "number" ? `${v.toLocaleString("en-US")} RWF` : null);

/** What a Yes does, in plain words, from the validated params only (shown to Abdout beside the buttons). */
export function actionEffect(kind: ActionKind, p: ActionParams): string {
  switch (kind) {
    case "deal.book": {
      const terms = [rwf(p.rent) && `rent ${rwf(p.rent)}`, p.advance != null && `${p.advance} months up front`, p.deposit != null && `deposit ${p.deposit} month(s)`, p.commission != null && `commission ${p.commission}%`, p.moveIn && `move in ${p.moveIn}`, shareWords(p)]
        .filter(Boolean)
        .join(", ");
      return `Book the viewing of K${p.listing} at ${p.at} Kigali time${p.place ? ` (${p.place})` : ""} for chat …${String(p.task).slice(-6)}, and message the tenant on WhatsApp${terms ? ` — ${terms}` : ""}.`;
    }
    case "deal.status":
      return `Mark deal …${String(p.deal).slice(-6)} ${String(p.status).toUpperCase()}${p.status === "paid" && p.share != null ? ` and record Mkan's share, ${rwf(p.share)}` : ""}${p.note ? ` (${p.note})` : ""}.`;
    case "brokers.gated":
      return "Turn broker asks on for WhatsApp tenants who pick a home.";
  }
}

// ── the decision record (WaState `decision:<promptId>`) ─────────────────

export interface DecisionRecord {
  promptId: string;
  ask: string;
  kind: ActionKind;
  params: ActionParams;
  effect: string;
  createdAt: string;
  decision?: "yes" | "no";
  decidedAt?: string;
  decidedBy?: string;
  sig?: string;
  consumedAt?: string;
  outcome?: { ok: boolean; at: string; output: string };
}

export const decisionKey = (promptId: string) => `decision:${promptId}`;
/** A yes older than this is not acted on: the moment it answered has passed. */
export const DECISION_TTL_MS = 24 * 3_600_000;

/** Stable JSON: keys sorted, so the Worker and the Mac sign the same bytes. */
export function canonical(p: ActionParams): string {
  return JSON.stringify(Object.fromEntries(Object.entries(p).sort(([a], [b]) => (a < b ? -1 : 1))));
}

const signingKey = (secret: string | undefined): Buffer | null => {
  const s = secret?.trim();
  return s ? createHash("sha256").update(`sprint-decision:${s}`).digest() : null;
};

/** The Worker's signature on an answer; the same function verifies it on the Mac. Null without the secret. */
export function decisionSig(r: Pick<DecisionRecord, "promptId" | "kind" | "params">, decision: "yes" | "no", decidedAt: string, secret = process.env.MKAN_WA_BRIDGE_SECRET): string | null {
  const k = signingKey(secret);
  return k ? createHmac("sha256", k).update(`${r.promptId}|${decision}|${r.kind}|${canonical(r.params)}|${decidedAt}`).digest("base64url") : null;
}

export function verifyDecision(r: DecisionRecord, secret = process.env.MKAN_WA_BRIDGE_SECRET): boolean {
  if (!r.decision || !r.decidedAt || !r.sig) return false;
  const want = decisionSig(r, r.decision, r.decidedAt, secret);
  if (!want || want.length !== r.sig.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(r.sig));
}
