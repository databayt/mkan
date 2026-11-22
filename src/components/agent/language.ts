/**
 * Which language a person writes in — rules first, no model, no network (2026-11-22).
 *
 * The line gets English, Kinyarwanda, French, Arabic and Swahili, often in one message
 * ("Iyo apartment ya 120k ndayishaka", "J'aimerais savoir si c'est meublé ?"). Each language has a
 * lexicon of strong markers (a word only that language has) and weak ones (short function words);
 * the language with the most weight wins, English last on a tie (an English noun in a Kinyarwanda
 * sentence — "apartment" — must not flip it). A message with no evidence ("kimironko, remera",
 * "150k", "K6823", "ok") keeps `prev`, the chat's language.
 *
 * `waLang` (whatsapp-format.ts) delegates here and maps fr / sw to "en" until its callers have
 * French and Swahili strings. `replyLang` picks the language to answer in.
 */

export type Lang = "en" | "rw" | "fr" | "ar" | "sw";

export interface LangRead {
  lang: Lang;
  /** A second language carries real weight in the same message (code-switching). */
  mixed: boolean;
  /** No language evidence in the text: `lang` is `prev` (or English), not read from the words. */
  neutral: boolean;
}

export const LANG_NAMES: Record<Lang, string> = { en: "English", rw: "Kinyarwanda", fr: "French", ar: "Arabic", sw: "Swahili" };
export const isLang = (v: unknown): v is Lang => v === "en" || v === "rw" || v === "fr" || v === "ar" || v === "sw";

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

// ── Kinyarwanda ──────────────────────────────────────────────────────────────

const RW_STRONG = words(`
  muraho mwaramutse mwiriwe murakoze murabeho mugire amakuru muraho muraho yego oya ntago ntabwo ntakibazo
  ndashaka ndayishaka ndayibona nashakaga nshaka nkeneye ndakeneye turashaka turakeneye ushaka murashaka
  inzu inzu icyumba ibyumba icyumba ubwiherero igikoni amazi umuriro ubukode gukodesha kodesha kukodesha
  amafaranga ukwezi ibihumbi ibihumbi ijana magana miliyoni itarengeje irenze irahenze ihenze bihenze
  yaboneka yafashwe iracyahari irahari ntihari kubamo kuhatuye kureba gusura kubona kwishyura
  iyo hafi aho aha hano ahandi ngo kandi ariko cyangwa kuko ubwo rero ibiciro igiciro ikiguzi
  mfite dufite ndi turi ndabona ndabizi ndabaza nibaza mumpe mumbwire mumfashe mwambwira mwampa mwanyereka
  wampa wambwira ushobora murashobora murakaza neza mbega mbese nonaha ejo ejobundi uyu uyumunsi ibishya
  munsi cyane none ubu yanjye yawe yayo ryanjye rwanjye imbere hanze kimwe kabiri gatatu kane gatanu
  abiri icumi mwiza nziza mubi ubwiza imbonerahamwe ibikoresho inzira kuri kuva
  ndagusaba ndabisaba mwakoze mwarakoze komeza komeza nyuma mbere ahubwo
  nibyo ibi ibyo uko nikoko ngaho agaciro
  akazi umukozi nyirinzu umucuruzi abandi benshi gake bwije bwacya ejo
`);
const RW_WEAK = words("ni na ku mu ya wa ba ko se ese bite ubu salon");
/** Verb forms with the speaker's prefix: ndash-, ndayish-, nash-, nkenye-, ntab-... */
const RW_STEM = /^(?:ndash|ndayish|nayish|nash|nkeneye|ndakeneye|ndabon|ndabaz|nibaz|nabon|nzaz|nzagu|ntaba|ntaki|ntiha|tuzaj|turash|turakey|mwamb|mwamp|mwany|mumb|mump|mumf)\p{L}*$/u;

// ── French ───────────────────────────────────────────────────────────────────

const FR_STRONG = words(`
  bonjour bonsoir salut merci je vous nous est sont suis avec pour dans chez combien quel quelle quels quelles
  meublé meublée meublés meublées chambre chambres appartement appartements logement loyer louer maison
  cherche cherchons voudrais aimerais souhaite disponible disponibles encore svp plait accord beaucoup très tres
  aussi où quand oui quartier prix mois par sur cette ces mon ma mes votre vos qui que quoi pas rien avez avons
  peut puis pouvez visite visiter voir demain aujourd'hui ça pouvoir être avoir faire bien alors donc
  voulez veuillez cordialement une des les du au aux lieu étage salle bain cuisine
  jardin parking gardien électricité eau compris charges caution garantie
`);
const FR_WEAK = words("le la de un et il elle en ou");
const FR_ELISION = /\b(?:j|l|d|qu|n|c|s|m|t)['’](?=\p{L})/giu;
const FR_ACCENT = /[éèêàùçôîâûëï]/i;

// ── Swahili ──────────────────────────────────────────────────────────────────

const SW_STRONG = words(`
  habari nataka nahitaji nyumba chumba vyumba bei ndiyo hapana asante karibu kodi mwezi sawa pesa naomba
  tafadhali unaweza ninatafuta natafuta nina yako wapi gani ngapi sana mzuri nzuri jambo mambo vipi
  shilingi elfu laki mia samani fenicha wiki leo kesho hii huu hiyo poa pole mimi wewe sisi
  ninataka ningependa unapatikana inapatikana bado inapatikana choo jiko maji umeme
`);
const SW_WEAK = words("kwa ya la wa");
const SW_STEM = /^(?:nata|nitaka|ninat|unataka|tunataka|ninahit|nahit|ninge|nina[a-z]{3,})\p{L}*$/u;

// ── English ──────────────────────────────────────────────────────────────────

const EN_GRAMMAR = words(`
  the and you your is are am i i'm im my me for with need want looking please how what can do does this that
  which where when near around any have has there it's its can't dont don't would could should will about
  from at in on of to we us our they them if or but not also just only still too very much many more some
  available still
`);
const EN_NOUN = words("home homes house houses room rooms rent renting rental budget bedroom bedrooms apartment apartments price month monthly furnished unfurnished area cheap bigger smaller viewing");

// ── reading ──────────────────────────────────────────────────────────────────

const K_CODE = /\bk\s?-?\d{3,6}\b/gi;
const ARABIC = /[؀-ۿݐ-ݿ]/g;
const NEUTRAL = words("ok okay okey k yes yeah yep nope no oya yego oui non merci thanks thank thx please pls hi hello hey wow sure good great fine cool bro sir madam amen lol haha");

const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize("NFC")
    .replace(K_CODE, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[’`]/g, "'")
    .replace(/\d+(?:[.,]\d+)*\s*(?:k|m|rwf|frw|usd)?\b/gi, " ")
    .match(/[\p{L}']+/gu)
    ?.map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 1 || t === "i") ?? [];

/** Whether there is no language in the text: only numbers, home codes, emoji, "ok" and the like. */
export function isNeutralText(text: string): boolean {
  const toks = tokens(text).filter((t) => !t.includes("'") || t.length > 1);
  return toks.length === 0 || toks.every((t) => NEUTRAL.has(t));
}

const ORDER: Lang[] = ["rw", "fr", "sw", "ar", "en"];

function score(text: string): Record<Lang, number> {
  const s: Record<Lang, number> = { en: 0, rw: 0, fr: 0, ar: 0, sw: 0 };
  const arabic = text.match(ARABIC)?.length ?? 0;
  if (arabic >= 2) s.ar = 6 + Math.min(arabic / 10, 4);
  const elisions = text.replace(/[’`]/g, "'").match(FR_ELISION)?.length ?? 0;
  s.fr += elisions * 1.5;
  for (const raw of tokens(text)) {
    const parts = raw.includes("'") ? [raw, ...raw.split("'")] : [raw];
    for (const t of parts) {
      if (!t) continue;
      if (RW_STRONG.has(t) || RW_STEM.test(t)) s.rw += 2;
      else if (RW_WEAK.has(t)) s.rw += 0.5;
      if (FR_STRONG.has(t)) s.fr += t.length <= 2 ? 1 : 2;
      else if (FR_WEAK.has(t)) s.fr += 0.5;
      if (SW_STRONG.has(t) || SW_STEM.test(t)) s.sw += 2;
      else if (SW_WEAK.has(t)) s.sw += 0.5;
      if (EN_GRAMMAR.has(t)) s.en += 1;
      else if (EN_NOUN.has(t)) s.en += 0.5;
    }
    if (raw.length > 2 && FR_ACCENT.test(raw) && !FR_STRONG.has(raw)) s.fr += 0.5;
  }
  return s;
}

/**
 * The language of one message. `prev` is the chat's language so far: a message with no evidence (or
 * only a faint one, under 1 point) keeps it.
 */
export function detectLang(text: string, prev?: string | null): LangRead {
  const before: Lang = isLang(prev) ? prev : "en";
  const s = score(text);
  const ranked = [...ORDER].sort((a, b) => s[b] - s[a] || ORDER.indexOf(a) - ORDER.indexOf(b));
  const top = ranked[0]!;
  const topScore = s[top];
  if (topScore === 0 || (isLang(prev) && top !== prev && topScore < 1)) return { lang: before, mixed: false, neutral: true };
  const second = ranked[1]!;
  return { lang: top, mixed: s[second] >= 2 && s[second] >= topScore * 0.35, neutral: false };
}

type Said = string | { text?: string | null; who?: string; role?: string };

/**
 * The language to answer in: that of the person's latest substantive message (one with a language in
 * it: not "ok", not "150k", not a home code). A person's own lines only — pass the chat as strings, or
 * as { text, who|role } where Mkan's own lines (who "mkan", role "agent" / "assistant") are skipped.
 * Oldest first. English when nothing says otherwise.
 */
export function replyLang(history: Said[], fallback: Lang = "en"): Lang {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    const text = typeof m === "string" ? m : (m.text ?? "");
    if (typeof m !== "string" && (m.who === "mkan" || m.role === "agent" || m.role === "assistant")) continue;
    const read = detectLang(text, null);
    if (!read.neutral) return read.lang;
  }
  return fallback;
}
