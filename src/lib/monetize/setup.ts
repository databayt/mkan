/**
 * Mkan's business setup (Abdout, 2026-11-07): Databayt Ltd → a business number → WhatsApp on it →
 * mkan.rw → @mkan.rw as a verified TikTok Business page with the Website link → MoMo Pay → the MoMo
 * API. The guide is kun.databayt.org/en/docs/mkan-setup; the state is WaState `mkan-setup`, ticked by
 * Abdout on /monetize. The sprint cycle keeps one waiting prompt per step that is next (its steps
 * before are ticked), resumed by the tick (`setup.<key> == 1`), so the loop does each step's code work
 * the moment he has done his part — and a closed week never drops one. Pure.
 */
export const SETUP_KEYS = ["company", "number", "whatsapp", "domain", "tiktokBusiness", "bioLink", "momoPay", "momoApi"] as const;
export type SetupKey = (typeof SETUP_KEYS)[number];

export const SETUP_STATE_KEY = "mkan-setup";
export const SETUP_DOC = "https://kun.databayt.org/en/docs/mkan-setup";
/** The task the cycle files the setup prompts under, in each week's sprint. */
export const SETUP_TASK_TITLE = "Mkan business setup (kun docs: mkan-setup)";

export type SetupState = Partial<Record<SetupKey, { at: string; by?: string }>>;

export interface SetupStep {
  key: SetupKey;
  title: string;
  /** Steps that come first (the doc's diagram). */
  after: SetupKey[];
  /** Abdout's part, in one line: the "needs you" the live card shows. */
  ask: string;
  /** The loop's code work once he ticks the step. Never a gated command, never a send. */
  followUp: string;
  doneWhen: string;
}

export const SETUP_STEPS: SetupStep[] = [
  {
    key: "company",
    title: "Databayt Ltd registered",
    after: [],
    ask: "Review RDB draft REG-2026-383583 on urs.rdb.rw (complete, waiting on Preview & submission), press Submit, then tick “Company registered” on /monetize when the certificate arrives.",
    followUp:
      "Databayt Ltd is registered. Add “Mkan is a product of Databayt Ltd” with its TIN (from the private RDB packet in ~/kun/jobs/packets/rdb; print nothing else from it) to the site footer in en, ar and rw, and to the TikTok end card's trust line.",
    doneWhen: "the footer and the end card both show it, with tests",
  },
  {
    key: "number",
    title: "Business number",
    after: ["company"],
    ask: "Buy an MTN SIM for Mkan (in Databayt Ltd's name), put it in ~/mkan/.env as MKAN_KIGALI_WHATSAPP, then tick “Business number”.",
    followUp:
      "The business number is in .env (MKAN_KIGALI_WHATSAPP). Make Mkan's WhatsApp number one setting used everywhere — the “Continue on WhatsApp” links (src/components/agent/wa-link.ts MKAN_WA_NUMBER), the TikTok captions and end card, and the broker messages — still on today's line, so moving is one change later. Do not switch yet.",
    doneWhen: "one setting drives every place the number appears, with a test",
  },
  {
    key: "whatsapp",
    title: "WhatsApp on the business number",
    after: ["number"],
    ask: "Set up WhatsApp Business on the new number and re-pair Mkan's WhatsApp bridge to it in a session, then tick “WhatsApp on the business number”.",
    followUp:
      "Mkan's bot now answers on the business number. Switch the one number setting to it, check every link, caption, end card and broker message uses it, and add a 30-day “Mkan has moved to …” reply for tenants who still write to the old line.",
    doneWhen: "the pages and the next TikTok caption carry the new number, and the moved-reply has a test",
  },
  {
    key: "domain",
    title: "mkan.rw on Cloudflare",
    after: ["company"],
    ask: "Buy mkan.rw at a .rw registrar, add it as a zone in Cloudflare and set its nameservers there, then tick “mkan.rw on Cloudflare”.",
    followUp:
      "mkan.rw is on Cloudflare. Add mkan.rw as a custom domain of the mkan Worker in wrangler.jsonc and make its home page the TikTok bio page (/[lang]/tt), with the host handled in the proxy. wrangler.jsonc is a held path: commit it ready on main, then report blocked asking Abdout to deploy mkan in a session.",
    doneWhen: "the change is on main with the host handling tested, and the deploy is asked for",
  },
  {
    key: "tiktokBusiness",
    title: "TikTok Business page",
    after: ["company"],
    ask: "Switch @mkan.rw to a Business account (real estate), create Databayt's TikTok Business Center with country Rwanda and verify it with the RDB certificate, then tick “TikTok Business page”.",
    followUp:
      "@mkan.rw is a verified Business page. Update docs/tiktok-playbook.md with what Business unlocks (analytics, the Commercial Music Library, the Website field), and check the daily TikTok stats still read the page.",
    doneWhen: "the playbook says what changed and the next stats run reads the page",
  },
  {
    key: "bioLink",
    title: "TikTok Website link",
    after: ["domain", "tiktokBusiness"],
    ask: "Set the TikTok profile's Website to https://mkan.rw (Edit profile), then tick “TikTok Website link”.",
    followUp:
      "The TikTok profile links to mkan.rw. Make the daily TikTok stats read the profile's bio link and, when shown, its profile views into the post snapshot, and show the chats that came through the link (tagged tiktok_bio) on the TikTok tile.",
    doneWhen: "the snapshot carries the link and the tile shows the link's chats",
  },
  {
    key: "momoPay",
    title: "MoMo Pay merchant code",
    after: ["company", "number"],
    ask: "Get the MoMo Pay merchant code at an MTN business centre (RDB certificate, TIN, ID, lease), store it in the Keychain as cf-mkan-MKAN_PAYOUT_MOMO, then tick “MoMo Pay”.",
    followUp:
      "The MoMo Pay code is in the Keychain. Make sure the next deploy carries the payout setting so every share request says “Pay with MoMo …”, show the code on the Deals card, and drop the “no pay number” warning there.",
    doneWhen: "a share request's text carries the pay line in a test, and the warning is gone",
  },
  {
    key: "momoApi",
    title: "MoMo API live",
    after: ["momoPay"],
    ask: "Go live on momodeveloper.mtn.co.rw (contracting + KYC with the RDB certificate), store the production keys in the Keychain (cf-mkan-MOMO_*), then tick “MoMo API live”.",
    followUp:
      "MoMo production keys are in the Keychain. Make the request-to-pay pick production when its keys are present and the sandbox otherwise, and add an admin-only “test 100 RWF to my phone” button on /monetize for Abdout's own proof — he presses it, never the loop.",
    doneWhen: "production is chosen by the keys, with tests, and the test button is on the admin page",
  },
];

export const isSetupKey = (k: string): k is SetupKey => (SETUP_KEYS as readonly string[]).includes(k);
export const stepDone = (state: SetupState | null | undefined, key: SetupKey) => !!state?.[key]?.at;

/** For the loop: `setup.<key>` is 1 once ticked, and `setup.done` counts them. */
export function setupMetrics(state: SetupState | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of SETUP_KEYS) out[`setup.${k}`] = stepDone(state, k) ? 1 : 0;
  out["setup.done"] = SETUP_KEYS.filter((k) => stepDone(state, k)).length;
  return out;
}

/**
 * The steps that want a prompt now: every step whose steps before it are ticked, and every ticked
 * step (its follow-up still runs when he did things out of order). `followedUp` = steps whose
 * follow-up prompt already finished; they want nothing more.
 */
export function stepsDue(state: SetupState | null | undefined, followedUp: ReadonlySet<SetupKey>): { step: SetupStep; ticked: boolean }[] {
  return SETUP_STEPS.filter((s) => !followedUp.has(s.key))
    .filter((s) => stepDone(state, s.key) || s.after.every((a) => stepDone(state, a)))
    .map((s) => ({ step: s, ticked: stepDone(state, s.key) }));
}

const TAG = "— setup step:";
export const setupTag = (key: SetupKey) => `${TAG} ${key}`;
export function setupOf(text: string): SetupKey | null {
  const k = text.match(/— setup step: (\S+)\s*$/)?.[1];
  return k && isSetupKey(k) ? k : null;
}

/** The prompt a step's tick resumes: the follow-up, its done-when, and how to report it. */
export function setupPromptText(step: SetupStep): string {
  return (
    `In ~/mkan (business setup · ${step.title} — guide ${SETUP_DOC}): ${step.followUp} Done when ${step.doneWhen}. ` +
    `Report what changed, then run pnpm sprint:done <this prompt's id> --metric=setup.done --lesson="what this step unlocked".\n\n${setupTag(step.key)}`
  );
}
