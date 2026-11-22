/**
 * A tenant who went quiet under the homes is the line's to follow up (2026-11-22; it was one nudge, then a feed
 * line "your call: write to them yourself"). Between 11-05 and 11-13, six of eight WhatsApp chats ended right
 * after the homes went out. A person selling homes would write again — so the line does, by itself, at most
 * twice, spaced, each short and useful:
 *
 *   1st, ≥ FIRST_AFTER_MS after the tenant's last word — a new matching home they have not seen (searched from
 *       their own brief), or, when none fits, the one question that unblocks the search (budget or area);
 *   2nd, ≥ SECOND_AFTER_MS after it, and ≥ MIN_GAP_MS after the first — a soft close: "I'll keep an eye out; say
 *       the word anytime".
 *
 * Never more than FOLLOW_UP_MAX per chat; never after STOP, never while a person is typing in the chat
 * (HUMAN_HOLD_MS), never in a personal chat or to a team number; and a chat that picked a home is the broker
 * loop's, not this. The feed to Mkan's person is an FYI of what the line did, never a task.
 * Pure: the sweep is quiet-nudge.ts.
 */
import { HUMAN_HOLD_MS } from "../../../scripts/wa/tenant-pure";
import { offerHomeLine, type ConfirmLang, type OfferHome } from "./deal-pure";
import { zoneLabel } from "@/lib/geo/kigali-zones";
import type { AgentMessage, ShortlistItem } from "./types";

const HOUR_MS = 3_600_000;
/** The first follow-up, after the tenant's last word. */
export const FIRST_AFTER_MS = 20 * HOUR_MS;
/** The second (soft close), after the tenant's last word — about three days. */
export const SECOND_AFTER_MS = 72 * HOUR_MS;
/** …and never sooner than this after the first. */
export const MIN_GAP_MS = 24 * HOUR_MS;
/** After this long the search is cold: nothing more is sent. */
export const QUIET_MAX_MS = 10 * 24 * HOUR_MS;
/** Never more than two, whatever happens. */
export const FOLLOW_UP_MAX = 2;
/** The outbox label, and how /monetize counts it. */
export const QUIET_LABEL = "tenant-quiet-nudge";
export const quietKey = (taskId: string) => `quiet:${taskId}`;

/** On unless MKAN_QUIET_NUDGE=off. */
export const quietNudgeOn = (env: string | undefined = process.env.MKAN_QUIET_NUDGE) => env?.trim().toLowerCase() !== "off";

/** What the sweep remembers per chat (WaState `quiet:<taskId>`). The one-nudge days wrote only `at`: that is one sent. */
export type QuietState = { at?: string; n?: number };
export const sentCount = (s: QuietState | null | undefined): number => Math.min(FOLLOW_UP_MAX, s?.n ?? (s?.at ? 1 : 0));

export type QuietVerdict = "first" | "second" | "not-homes" | "picked" | "too-soon" | "cold" | "done" | "quiet-hours";

/**
 * `lastActivity`: the tenant's last word in the chat — a message that ran a turn, or one answered under the
 * homes (those leave only a trace row). `sent` / `lastSentAt`: the follow-ups already sent, from the state.
 */
export function quietVerdict(i: {
  messages: readonly AgentMessage[];
  shortlist: readonly Pick<ShortlistItem, "availability">[];
  lastActivity: Date | null;
  now: Date;
  sent: number;
  lastSentAt: Date | null;
  inWindow: boolean;
}): QuietVerdict {
  const last = [...i.messages].reverse().find((m) => m.role === "agent");
  // Only a chat that ends on homes: a question waiting on the tenant, an answer or an error is not this.
  if (!last || last.kind !== "shortlist" || i.shortlist.length === 0 || !i.lastActivity) return "not-homes";
  // A home asked about, confirmed or taken: the broker loop, the deal sheet and the 48-hour rule own that chat.
  if (i.shortlist.some((s) => s.availability !== "unconfirmed")) return "picked";
  if (i.sent >= FOLLOW_UP_MAX) return "done";
  const since = i.now.getTime() - i.lastActivity.getTime();
  if (since >= QUIET_MAX_MS) return "cold";
  if (i.sent === 0) {
    if (since < FIRST_AFTER_MS) return "too-soon";
    return i.inWindow ? "first" : "quiet-hours";
  }
  if (since < SECOND_AFTER_MS || (i.lastSentAt && i.now.getTime() - i.lastSentAt.getTime() < MIN_GAP_MS)) return "too-soon";
  return i.inWindow ? "second" : "quiet-hours";
}

export type QuietBlock = "test" | "stopped" | "human" | "personal";

/** The holds, before anything is looked up: a team number, STOP, a person typing there, a personal chat. */
export function followUpBlock(i: { test: boolean; stopped: boolean; humanAt: Date | null; personal: boolean; now: Date }): QuietBlock | null {
  if (i.test) return "test";
  if (i.stopped) return "stopped";
  if (i.humanAt && i.now.getTime() - i.humanAt.getTime() < HUMAN_HOLD_MS) return "human";
  if (i.personal) return "personal";
  return null;
}

/** What a follow-up says: a new home, the one question, or the soft close. */
export type FollowUpPlan = { kind: "homes"; homes: OfferHome[] } | { kind: "ask"; ask: "budget" | "area" } | { kind: "close" };

/** The brief's facts a question is chosen from. */
export type BriefFacts = { maxPrice?: number | null; area?: boolean };

/** The first follow-up is a new home when one fits, else the question; the second is always the soft close. */
export function planFollowUp(step: "first" | "second", homes: readonly OfferHome[], brief: BriefFacts = {}): FollowUpPlan {
  if (step === "second") return { kind: "close" };
  if (homes.length > 0) return { kind: "homes", homes: homes.slice(0, 2) };
  // A budget named: could they stretch? None named: where, then? — the one thing that most changes the search.
  return { kind: "ask", ask: brief.maxPrice ? "budget" : brief.area ? "area" : "budget" };
}

const HI: Record<ConfirmLang, string> = {
  en: "Hi, it's Mkan.",
  ar: "مرحباً، معك مكان.",
  rw: "Muraho, ni Mkan.",
  fr: "Bonjour, c'est Mkan.",
  sw: "Habari, ni Mkan.",
};

/**
 * The words, in the tenant's language (rw, fr and sw are machine-written: native review sheet). Short, human,
 * and no promise of a person: every "I" is the line.
 */
export function followUpMessage(lang: ConfirmLang, plan: FollowUpPlan): string {
  const hi = HI[lang];
  if (plan.kind === "homes") {
    const [a] = plan.homes;
    const one = plan.homes.length === 1;
    const list = plan.homes.map((h) => `• ${offerHomeLine(lang, h)}`).join("\n");
    const code = `K${a!.id}`;
    switch (lang) {
      case "ar":
        return one ? `${hi} وصل للتو منزل جديد يناسب طلبك: ${offerHomeLine(lang, a!)}. أتأكد لك أنه متاح؟ أرسل ${code}.` : `${hi} وصل منزلان جديدان يناسبان طلبك:\n${list}\nأتأكد لك أن أحدهما متاح؟ أرسل رمزه، مثل ${code}.`;
      case "rw":
        return one ? `${hi} Hamaze kuboneka inzu nshya ihuye n'ibyo wasabye: ${offerHomeLine(lang, a!)}. Ndebe ko iracyahari? Ohereza ${code}.` : `${hi} Hamaze kuboneka inzu ebyiri nshya zihuye n'ibyo wasabye:\n${list}\nNdebe ko imwe iracyahari? Ohereza kode yayo, nka ${code}.`;
      case "fr":
        return one ? `${hi} Un nouveau logement correspond à votre demande : ${offerHomeLine(lang, a!)}. Voulez-vous que je vérifie qu'il est toujours disponible ? Envoyez ${code}.` : `${hi} Deux nouveaux logements correspondent à votre demande :\n${list}\nVoulez-vous que je vérifie si l'un des deux est toujours disponible ? Envoyez son code, par exemple ${code}.`;
      case "sw":
        return one ? `${hi} Nyumba mpya imepatikana inayolingana na ulichoomba: ${offerHomeLine(lang, a!)}. Niangalie kama bado ipo? Tuma ${code}.` : `${hi} Nyumba mbili mpya zinalingana na ulichoomba:\n${list}\nNiangalie kama mojawapo bado ipo? Tuma kodi yake, kama ${code}.`;
      default:
        return one ? `${hi} A new one just came in that fits what you asked for: ${offerHomeLine(lang, a!)}. Want me to check it's free? Send ${code}.` : `${hi} Two new ones fit what you asked for:\n${list}\nWant me to check one is free? Send its code, like ${code}.`;
    }
  }
  if (plan.kind === "ask") {
    const budget = plan.ask === "budget";
    switch (lang) {
      case "ar":
        return `${hi} ${budget ? "هل ميزانيتك ثابتة، أم تقدر تزيد قليلاً للمنزل المناسب؟ أخبرني بالرقم وأبحث من جديد." : "هل تقبل بمناطق قريبة أيضاً؟ اذكر واحدة وأبحث فيها."}`;
      case "rw":
        return `${hi} ${budget ? "Amafaranga yawe ni ayo gusa, cyangwa wakongeraho gato ku nzu nziza? Mbwira umubare ndebe bundi bushya." : "Waba wemera n'uduce twegereye? Vuga kimwe ndebe ho."}`;
      case "fr":
        return `${hi} ${budget ? "Votre budget est-il fixe, ou pourriez-vous monter un peu pour le bon logement ? Donnez-moi le chiffre et je relance la recherche." : "Accepteriez-vous aussi des quartiers voisins ? Nommez-en un et je cherche là-bas."}`;
      case "sw":
        return `${hi} ${budget ? "Je, bajeti yako ni kikomo, au unaweza kuongeza kidogo kwa nyumba inayokufaa? Niambie kiasi, nitatafuta tena." : "Je, maeneo ya karibu pia yanakufaa? Taja moja, nitatafuta huko."}`;
      default:
        return `${hi} ${budget ? "Is your budget fixed, or could you stretch a little for the right home? Tell me the number and I'll look again." : "Would you consider nearby areas too? Name one and I'll look there."}`;
    }
  }
  switch (lang) {
    case "ar":
      return `${hi} لا استعجال. سأبقى منتبهاً لأي منزل يناسبك وأكتب لك إن ظهر واحد. أرسل لي متى شئت وأبحث من جديد.`;
    case "rw":
      return `${hi} Nta kwihuta. Nzakomeza kureba inzu ikubereye, nkwandikire niboneye imwe. Umbwire igihe cyose nzongera ndebe.`;
    case "fr":
      return `${hi} Rien ne presse. Je garde l'œil ouvert et je vous écris si un logement correspond. Écrivez-moi quand vous voulez et je relance la recherche.`;
    case "sw":
      return `${hi} Hakuna haraka. Nitaendelea kutafuta nyumba inayokufaa na nitakuandikia ikipatikana. Niambie wakati wowote, nitatafuta tena.`;
    default:
      return `${hi} No rush. I'll keep an eye out for homes that fit and write if one comes up. Say the word anytime and I'll look again.`;
  }
}

/** What the FYI line to Mkan's person says the line did ("followed up with 2 new Kabeza homes"). */
export function followUpNote(step: "first" | "second", plan: FollowUpPlan): string {
  const which = step === "first" ? "first" : "second";
  if (plan.kind === "homes") {
    const area = zoneLabel(plan.homes[0]?.zone, "en");
    return `${which} follow-up sent: ${plan.homes.length} new ${area ? `${area} ` : ""}home${plan.homes.length > 1 ? "s" : ""} (${plan.homes.map((h) => `K${h.id}`).join(", ")}), no reply yet`;
  }
  if (plan.kind === "ask") return `${which} follow-up sent: asked one question (${plan.ask}), no reply yet`;
  return `${which} follow-up sent: a soft close — the line stops here and waits for them to write`;
}
