import type { Locale } from "@/components/internationalization/config";
import type { Dictionary } from "@/components/internationalization/dictionaries";
import { districtName } from "@/lib/geo/rwanda-places";
import { longStayCost, shortStayCost, typicalMoveInMultiple } from "./cost";
import { DISTRICT_CODES, type ClarifyField } from "./fields";
import { fill } from "./format";
import type { Requirements } from "./requirements";
import type { QuestionAnswer } from "./types";

/**
 * The questions the agent's card asks (question-card.tsx), as data: the guided
 * search (where · home · budget), the agent's clarify (home · furnishing ·
 * purpose) and the single asks (stay, budget). Every option sets requirement
 * fields exactly — nothing is parsed — and a picked card becomes one message:
 * its words, its fields, and the answers the tenant's turn is drawn from.
 */

type AgentDict = Dictionary["agent"] | undefined;

export const QUESTION_IDS = ["where", "homeType", "furnished", "purpose", "maxPrice", "stay"] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];
export const isQuestionId = (v: unknown): v is QuestionId => typeof v === "string" && (QUESTION_IDS as readonly string[]).includes(v);

export interface QuestionOption {
  /** Lowercase letters and digits — what `answers` stores (`a`). */
  key: string;
  label: string;
  hint?: string;
  /** The usual answer, marked "(Recommended)" — never set where the answer is the tenant's own. */
  recommended?: boolean;
  filters: Partial<Requirements>;
}

export interface Question {
  id: QuestionId;
  title: string;
  options: QuestionOption[];
  /** A last "Other" row the tenant types into. */
  other: boolean;
}

/** One answer per question: a picked option's key, or the words typed under "Other". */
export type QuestionPicks = Partial<Record<QuestionId, { key?: string; text?: string }>>;

export interface QuestionContext {
  a: AgentDict;
  locale: Locale;
  money: (n: number) => string;
  /** The search so far — the single budget ask prices nights or months by it. */
  requirements?: Partial<Requirements> | null;
}

export const MONTH_BUDGETS = [150_000, 300_000, 500_000, 1_000_000] as const;
export const NIGHT_BUDGETS = [30_000, 60_000, 100_000, 150_000] as const;
/** What a typed "Other" answer may hold. */
export const MAX_ANSWER_TEXT = 80;

/** Each clarify question's options, the usual answer first. A studio is a bedroom count as well as a type. */
const CHOICES: Record<ClarifyField, { key: string; filters: Partial<Requirements> }[]> = {
  homeType: [
    { key: "apartment", filters: { homeType: "apartment" } },
    { key: "house", filters: { homeType: "house" } },
    { key: "room", filters: { homeType: "room" } },
    { key: "studio", filters: { homeType: "studio", bedrooms: 0 } },
  ],
  furnished: [
    { key: "no", filters: { furnished: false } },
    { key: "yes", filters: { furnished: true } },
  ],
  purpose: [
    { key: "family", filters: { purpose: "family" } },
    { key: "study", filters: { purpose: "study" } },
    { key: "business", filters: { purpose: "business" } },
  ],
};

/** Kigali's usual answer. Purpose has none: it is the tenant's own. */
const RECOMMENDED: Partial<Record<ClarifyField, string>> = {
  homeType: "apartment",
  // Kigali's monthly homes are mostly unfurnished.
  furnished: "no",
};

/** "Up to RWF 300,000 a month" — a budget option's words, from its key (`m300000` / `n60000`). */
function budgetOption(key: string, ctx: QuestionContext): QuestionOption | null {
  const match = /^([mn])(\d{3,9})$/.exec(key);
  if (!match) return null;
  const nightly = match[1] === "n";
  const n = Number(match[2]);
  const q = ctx.a?.question;
  const nights = ctx.requirements?.nights ?? 1;
  const cost = nightly
    ? shortStayCost({ rentPeriod: "NIGHTLY", pricePerNight: n, priceMonth: null, monthlyDiscount: null, cleaningFee: null }, nights)
    : longStayCost({ rentPeriod: "MONTHLY", pricePerNight: null, priceMonth: n, monthlyDiscount: null, cleaningFee: null });
  return {
    key,
    label: fill((nightly ? q?.upToNight : q?.upToMonth) ?? "Up to {price}", { price: ctx.money(n) }),
    hint: cost
      ? nightly
        ? fill(q?.stayTotal ?? "About {total} for {nights} nights, with the service fee", { total: ctx.money(cost.total), nights })
        : fill(q?.moveIn ?? "About {total} to move in: 3 months, deposit and fees", { total: ctx.money(cost.total) })
      : undefined,
    filters: { maxPrice: n, pricePeriod: nightly ? "night" : "month", stay: nightly ? "short" : "long" },
  };
}

/** One question, in the tenant's language. */
export function buildQuestion(id: QuestionId, ctx: QuestionContext): Question {
  const a = ctx.a;
  if (id === "where") {
    const where = a?.wizard?.options?.where as Record<string, { label?: string; hint?: string }> | undefined;
    return {
      id,
      title: a?.wizard?.q?.where ?? "Where in Kigali?",
      options: [
        ...DISTRICT_CODES.map((code) => ({
          key: code.toLowerCase(),
          label: districtName(code, ctx.locale),
          hint: where?.[code.toLowerCase()]?.hint,
          filters: { district: code } as Partial<Requirements>,
        })),
        { key: "anywhere", label: where?.anywhere?.label ?? "Anywhere in Kigali", hint: where?.anywhere?.hint, filters: {} },
      ],
      other: true,
    };
  }
  if (id === "maxPrice") {
    const nightly = ctx.requirements?.stay === "short";
    return {
      id,
      title: a?.wizard?.q?.budget ?? "What's your budget?",
      options: (nightly ? NIGHT_BUDGETS : MONTH_BUDGETS).map((n) => budgetOption(`${nightly ? "n" : "m"}${n}`, ctx)!),
      other: true,
    };
  }
  if (id === "stay") {
    const q = a?.question;
    return {
      id,
      title: a?.ask?.stay ?? "A few nights, or monthly rent?",
      options: [
        {
          key: "long",
          label: q?.months ?? "Months",
          hint: fill(q?.monthsHint ?? "", { x: typicalMoveInMultiple().toLocaleString(ctx.locale === "ar" ? "ar" : "en") }) || undefined,
          filters: { stay: "long" },
        },
        { key: "short", label: q?.nights ?? "Nights", hint: q?.nightsHint || undefined, filters: { stay: "short" } },
      ],
      other: true,
    };
  }
  const k = a?.clarify;
  const texts = (k?.options as Record<string, Record<string, { label: string; hint: string }>> | undefined)?.[id];
  const rec = RECOMMENDED[id];
  const list = CHOICES[id];
  const ordered = rec ? [...list.filter((c) => c.key === rec), ...list.filter((c) => c.key !== rec)] : list;
  return {
    id,
    title: (k?.q as Record<string, string> | undefined)?.[id] ?? id,
    options: ordered.map((c) => ({
      key: c.key,
      label: texts?.[c.key]?.label ?? c.key,
      hint: texts?.[c.key]?.hint || undefined,
      recommended: c.key === rec,
      filters: c.filters,
    })),
    other: true,
  };
}

/** The guided search: where, what home, what budget — every pick a monthly search. */
export function wizardQuestions(ctx: QuestionContext): Question[] {
  return (["where", "homeType", "maxPrice"] as const).map((id) => buildQuestion(id, { ...ctx, requirements: null }));
}

/** The agent's clarify card, in the order run.ts asked (most result-changing first). */
export function clarifyQuestions(fields: readonly ClarifyField[], ctx: QuestionContext): Question[] {
  return fields.map((f) => buildQuestion(f, ctx));
}

/** "، " in Arabic, ", " elsewhere — how picked words join into one message. */
export const joiner = (locale: Locale) => (locale === "ar" ? "، " : ", ");

/**
 * A finished card as one message: the picked words (or the typed ones) in
 * order, the exact fields they set over `base` (the agent covers monthly
 * rentals only, so a card search is a monthly one), and the answers the
 * tenant's turn is drawn from. A skipped question sets nothing.
 */
export function toMessage(
  questions: readonly Question[],
  picks: QuestionPicks,
  sep: string,
  base: Partial<Requirements> = { stay: "long" },
): { text: string; filters: Partial<Requirements>; answers: QuestionAnswer[] } {
  const filters: Partial<Requirements> = { ...base };
  const words: string[] = [];
  const answers: QuestionAnswer[] = [];
  for (const q of questions) {
    const pick = picks[q.id];
    const option = pick?.key ? q.options.find((o) => o.key === pick.key) : undefined;
    const typed = pick?.text?.trim().slice(0, MAX_ANSWER_TEXT);
    if (option) {
      Object.assign(filters, option.filters);
      words.push(option.label);
      answers.push({ q: q.id, a: option.key });
    } else if (typed) {
      words.push(typed);
      answers.push({ q: q.id, text: typed });
    }
  }
  return { text: words.join(sep), filters, answers };
}

/** A sent card's answers as the tenant's turn shows them: each question, then its answer. */
export function describeAnswers(answers: readonly QuestionAnswer[] | undefined, ctx: QuestionContext): { question: string; answer: string }[] {
  return (answers ?? []).flatMap((ans) => {
    if (!isQuestionId(ans.q)) return [];
    const question = buildQuestion(ans.q, ctx);
    const answer = ans.a ? (question.options.find((o) => o.key === ans.a) ?? (ans.q === "maxPrice" ? budgetOption(ans.a, ctx) : null))?.label : ans.text;
    return answer ? [{ question: question.title, answer }] : [];
  });
}

/** What the server keeps of a card's answers: at most four, known questions, keys or short typed words. */
export function coerceAnswers(input: unknown): QuestionAnswer[] {
  if (!Array.isArray(input)) return [];
  const out: QuestionAnswer[] = [];
  for (const raw of input.slice(0, 4)) {
    if (!raw || typeof raw !== "object") continue;
    const { q, a, text } = raw as Record<string, unknown>;
    if (!isQuestionId(q)) continue;
    if (typeof a === "string" && /^[a-z0-9]{1,24}$/.test(a)) out.push({ q, a });
    else if (typeof text === "string") {
      const words = text.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_ANSWER_TEXT);
      if (words) out.push({ q, text: words });
    }
  }
  return out;
}
