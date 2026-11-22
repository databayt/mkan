import "server-only";

/**
 * First-contact classifier: who is writing to the Mkan line (rules and the label's meaning: contact-kind-pure.ts).
 *
 * `contactKind(phone, lid, lines)` reads, cheapest first: a label already kept (WaState `kind:<address>`, under the
 * phone and the lid), a manual override, the broker directory, the personal list, our own surfaces, a home the
 * agent showed — then, only when those do not settle it, the chat's earlier lines on BOTH addresses (Evolution,
 * at most HISTORY_LINES, text only; Abdout's own typing included) and the rules over them, then one Claude Haiku
 * call for what is still ambiguous (lane "agent-classify", under the agent cap, hard timeout, never throws).
 * What is stored is `{ kind, why, at, source }` — a label and a reason code, never a word of the chat.
 *
 * Labels stick (tenant, broker, landlord, personal, vendor) until `pnpm wa:personal set` / `remove`. `unknown` —
 * a bare greeting with no history — is read again the next time the person writes more than a greeting. A
 * surface of ours (a K-code, `ref:`, ` s:`, the mkan.sd page) turns any non-manual label into tenant.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { findChatMessages } from "@/lib/whatsapp/evolution";
import { messageText, phoneKey } from "../../../scripts/wa/outbox-pure";
import { textHash, type Sent } from "../../../scripts/wa/tenant-pure";
import { AGENT_MODEL, canSpend, claudeClient, noteFailure, priceOf, recordSpend, strictOutputFormat } from "./claude";
import {
  CONTACT_KINDS,
  HISTORY_LINES,
  LINE_CHARS,
  cheapKind,
  decideKind,
  isContactKind,
  kindKey,
  looksLikeBotLine,
  safeWhy,
  worthRereading,
  type ContactKind,
  type HistoryLine,
  type KindInput,
  type KindRead,
} from "./contact-kind-pure";
import { isPersonal } from "./personal";
import { readState, writeState } from "./wa-state";

export * from "./contact-kind-pure";

const MODEL_TIMEOUT_MS = 4_000;

type Stored = { kind: ContactKind; why: string; at: string; source: string };

export interface ContactKindOptions {
  /** Message ids of this burst — left out of the history. */
  excludeIds?: string[];
  /** Read only: nothing is written to WaState (the backtest). */
  dry?: boolean;
  /** Earlier lines already loaded (the backtest); skips the Evolution read. */
  history?: HistoryLine[];
  /** Overrides for what the database would say (the backtest, tests). */
  broker?: boolean;
  agentShowedHomes?: boolean;
  /** The model call is not made: an ambiguous chat stays `unknown` (the backtest's rules-only count). */
  noModel?: boolean;
  now?: Date;
  /** Ignore labels already kept (the backtest judges the classifier, not its cache). */
  fresh?: boolean;
  /** Ignore the personal list (the backtest shows what the classifier would say without it). */
  skipList?: boolean;
  /** Called with the dollars one model call cost. */
  onSpend?: (usd: number, calls: number) => void;
}

// ── what the database says ───────────────────────────────────────────────────────────────────────

let brokerSet: { at: number; phones: Set<string> } = { at: 0, phones: new Set() };
/** Broker.phones and whoever posted a home we ask about — the hook's own list (route.ts isBroker), refreshed every 10 minutes. */
export async function isKnownBroker(phone: string): Promise<boolean> {
  if (Date.now() - brokerSet.at > 10 * 60_000) {
    const [rows, posters] = await Promise.all([
      db.broker.findMany({ select: { phones: true } }),
      db.listingBroker.findMany({ select: { user: { select: { phoneNumber: true } } } }),
    ]);
    const all = [...rows.flatMap((b) => b.phones), ...posters.map((p) => p.user.phoneNumber ?? "")].filter(Boolean);
    brokerSet = { at: Date.now(), phones: new Set(all.map(phoneKey)) };
  }
  return brokerSet.phones.has(phoneKey(phone));
}

/** Forget the cached broker numbers (tests; a directory change within 10 minutes). */
export const forgetBrokers = () => void (brokerSet = { at: 0, phones: new Set() });

/** Did the agent already show this person homes? A chat past that point is a tenant's, whatever they write next. */
async function agentShowedHomesTo(phone: string): Promise<boolean> {
  const tasks = await db.agentTask.findMany({ where: { profile: { waPhone: `+${phone}` } }, orderBy: { updatedAt: "desc" }, take: 3, select: { messages: true } }).catch(() => []);
  return tasks.some((t) => ((t.messages as unknown as { role?: string; kind?: string }[]) ?? []).some((m) => m?.role === "agent" && m.kind === "shortlist"));
}

async function readKinds(addresses: string[]): Promise<{ manual: Stored | null; kept: Stored | null; unknown: Stored | null }> {
  const rows = await db.waState.findMany({ where: { key: { in: addresses.map(kindKey) } }, select: { value: true } }).catch(() => []);
  const all = rows.map((r) => r.value as Partial<Stored> | null).filter((v): v is Stored => !!v && isContactKind(v.kind));
  const manual = all.find((v) => v.source === "manual") ?? null;
  const kept = all.find((v) => v.source !== "manual" && v.kind !== "unknown") ?? null;
  const unknown = all.find((v) => v.kind === "unknown") ?? null;
  return { manual, kept, unknown };
}

/** Keep a label under every address of the person. A write that fails costs nothing but a second read next time. */
async function keep(addresses: string[], read: KindRead, now: Date): Promise<void> {
  const value: Stored = { kind: read.kind, why: read.why, at: now.toISOString(), source: read.source };
  for (const a of addresses) await writeState(kindKey(a), value).catch(() => {});
}

// ── the chat's earlier lines ─────────────────────────────────────────────────────────────────────

type EvoLike = { key?: { id?: string; fromMe?: boolean }; message?: Record<string, unknown> | null; messageTimestamp?: number | string };
type Marks = { ids: Set<string>; hashes: Set<string> };

/** One Evolution message → a text-only line (null when it has no words), the line's own replies flagged. */
export function toLine(m: EvoLike, marks: Marks): HistoryLine | null {
  const text = messageText(m.message).trim();
  if (!text) return null;
  const id = m.key?.id;
  const fromMe = !!m.key?.fromMe;
  const bot = fromMe && ((!!id && marks.ids.has(id)) || marks.hashes.has(textHash(text)) || looksLikeBotLine(text));
  return { id, fromMe, text: text.slice(0, LINE_CHARS), at: Number(m.messageTimestamp ?? 0) * 1000, bot };
}

/** Evolution messages → the last HISTORY_LINES text-only lines, oldest first, the burst's own ids left out. */
export function historyOf(messages: EvoLike[], marks: Marks, excludeIds: readonly string[] = []): HistoryLine[] {
  const skip = new Set(excludeIds);
  const out: HistoryLine[] = [];
  for (const m of messages) {
    if (m.key?.id && skip.has(m.key.id)) continue;
    const line = toLine(m, marks);
    if (line) out.push(line);
  }
  return out.sort((a, b) => a.at - b.at).slice(-HISTORY_LINES);
}

/** The agent's own message ids and the hashes of what it said (WaState `tenant-sent`): those lines are Mkan's, not Abdout's. */
export async function botMarks(): Promise<Marks> {
  const sent = await readState<Sent>("tenant-sent", []).catch(() => [] as Sent);
  return { ids: new Set(sent.map((s) => s.id).filter(Boolean)), hashes: new Set(sent.map((s) => s.h).filter((h): h is string => !!h)) };
}

/** Both addresses' stored lines, merged; null when the bridge could not be read (then nothing is judged from history). */
async function loadHistory(phone: string, lid: string | null, excludeIds: string[]): Promise<HistoryLine[] | null> {
  const jids = [`${phone}@s.whatsapp.net`, lid].filter((j): j is string => !!j);
  const [marks, ...chats] = await Promise.all([botMarks(), ...jids.map((j) => findChatMessages(j, HISTORY_LINES).catch(() => null))]);
  if (chats.every((c) => c === null)) return null;
  return historyOf(chats.flat().filter((m): m is NonNullable<typeof m> => !!m), marks, excludeIds);
}

// ── the model, for what the rules cannot settle ──────────────────────────────────────────────────

const REASONS = ["asks-for-home", "wants-to-view", "offers-home", "lists-homes", "private-chat", "selling", "promo-template", "greeting-only", "other-topic", "unclear"] as const;
const ModelOut = z.object({ kind: z.enum(CONTACT_KINDS), reason: z.enum(REASONS) });

const SYSTEM = `You label who is writing to a phone line. The line belongs to a Kigali rental marketplace (Mkan) AND is its owner's personal phone, so people write to it about everything.

Labels:
- tenant: wants to rent or see a home, or asks about a listing, a price, an area, a viewing.
- landlord: owns a home and offers it for rent.
- broker: an agent or agency that lists homes for others.
- personal: a friend, family member, date or colleague of the owner talking about everyday private things.
- vendor: sells goods or services, a promotion, a business message template, an automatic message.
- unknown: you cannot tell from what is given.

You see the new message(s) and, when there are any, the chat's earlier lines (oldest first): "them" is the contact, "owner" is the phone's owner typing by hand, "bot" is Mkan's own automatic reply. A chat where the owner talks by hand about everyday things is personal. A bare greeting with nothing else is unknown. Choose tenant only when the person plainly wants housing; when torn between tenant and anything else, choose the other label.

Answer with the label and one reason code from the list. Never repeat or quote the messages.`;

function modelMessage(lines: string[], history: HistoryLine[]): string {
  const earlier = history.slice(-HISTORY_LINES).map((h) => `${h.bot ? "bot" : h.fromMe ? "owner" : "them"}: ${h.text.slice(0, LINE_CHARS).replace(/\s+/g, " ")}`);
  return [`New message(s):`, lines.join("\n").slice(0, 800), earlier.length ? `\nEarlier in this chat:\n${earlier.join("\n")}` : `\n(no earlier messages)`].join("\n");
}

/** One Claude Haiku call; null when it cannot or should not spend, times out, refuses or fails. Never throws. */
export async function classifyWithClaude(lines: string[], history: HistoryLine[], onSpend?: ContactKindOptions["onSpend"]): Promise<KindRead | null> {
  try {
    const client = claudeClient();
    if (!client || !(await canSpend())) return null;
    const res = await client.messages.parse(
      {
        model: AGENT_MODEL,
        max_tokens: 100,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: modelMessage(lines, history) }],
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: strictOutputFormat(ModelOut) },
      },
      { timeout: MODEL_TIMEOUT_MS },
    );
    void recordSpend("agent-classify", res.usage, AGENT_MODEL);
    onSpend?.(priceOf(res.usage, AGENT_MODEL), 1);
    if (res.stop_reason === "refusal" || !res.parsed_output) return null;
    return { kind: res.parsed_output.kind, why: safeWhy(res.parsed_output.reason), source: "model" };
  } catch (err) {
    await noteFailure(err).catch(() => {});
    console.warn(`[wa] classify: claude failed — ${(err as Error).message.slice(0, 80)}`);
    return null;
  }
}

// ── the classifier ───────────────────────────────────────────────────────────────────────────────

/**
 * Who is this person? Never throws: anything that fails reads as `unknown` (silent), which the next, longer
 * message from them reads again.
 */
export async function contactKind(phone: string, lid: string | null, lines: string[], opts: ContactKindOptions = {}): Promise<KindRead> {
  const now = opts.now ?? new Date();
  const addresses = [phone, lid].filter((a): a is string => !!a);
  const text = lines.map((l) => l.trim()).filter(Boolean);
  try {
    const stored = opts.fresh ? { manual: null, kept: null, unknown: null } : await readKinds(addresses);
    if (stored.manual) return { kind: stored.manual.kind, why: stored.manual.why, source: "manual" };

    const broker = opts.broker ?? (await isKnownBroker(phone).catch(() => false));
    const listedPersonal = broker || opts.skipList ? false : await isPersonal(phone, lid ? [lid] : []).catch(() => false);
    const input: KindInput = { lines: text, history: [], broker, listedPersonal, agentShowedHomes: false };
    const early = cheapKind(input);
    if (early) {
      // A surface of ours turns any kept label (a vendor, a personal) into tenant: they came through our link.
      if (early.source === "surface" && !opts.dry && stored.kept?.kind !== "tenant") await keep(addresses, early, now);
      return early;
    }

    if (stored.kept) return { kind: stored.kept.kind, why: stored.kept.why, source: "cache" };
    // A cached `unknown` is read again only when they say more than a greeting.
    if (stored.unknown && !worthRereading(text)) return { kind: "unknown", why: stored.unknown.why, source: "cache" };

    const showed = opts.agentShowedHomes ?? (await agentShowedHomesTo(phone));
    const withAgent: KindInput = { ...input, agentShowedHomes: showed };
    const viaAgent = cheapKind(withAgent);
    if (viaAgent) {
      if (!opts.dry) await keep(addresses, viaAgent, now);
      return viaAgent;
    }

    const loaded = opts.history ?? (await loadHistory(phone, lid, opts.excludeIds ?? []));
    const full: KindInput = { ...withAgent, history: loaded ?? [] };
    const ruled = decideKind(full);
    if (ruled) {
      // A label drawn without the chat's history is not final: a friend's "rent" could hide a long private chat.
      if (!opts.dry && (loaded || ruled.kind === "unknown" || ruled.source === "surface")) await keep(addresses, ruled, now);
      return ruled;
    }

    const modelled = opts.noModel ? null : await classifyWithClaude(text, loaded ?? [], opts.onSpend);
    const read: KindRead = modelled ?? { kind: "unknown", why: opts.noModel ? "rules-only" : "unclear", source: "default" };
    if (!opts.dry && modelled && loaded) await keep(addresses, read, now);
    return read;
  } catch (err) {
    console.warn(`[wa] classify failed — ${(err as Error).message.slice(0, 80)}`);
    return { kind: "unknown", why: "error", source: "default" };
  }
}

/** Put a label on a person by hand under every address given (the `pnpm wa:personal set` write, for tests and tools). */
export async function setKind(addresses: string[], kind: ContactKind, now = new Date()): Promise<void> {
  await keep(addresses, { kind, why: "set-by-hand", source: "manual" }, now);
}
