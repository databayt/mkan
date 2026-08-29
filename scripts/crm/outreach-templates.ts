/**
 * Outreach message templates (Epic G1.6) — pure, AR-primary / EN.
 *
 * The exact copy from docs/growth.md §5.4, parameterized. Short, honest, and
 * never implies Airbnb affiliation. OpenClaw drafts these; a human sends the
 * first touch by default, follow-ups may be automated.
 */
import { cityNameAr, cityNameEn, type CityCode } from './sudan-places';

export type MsgType = 'first-touch' | 'handover' | 'follow-up';
export type Lang = 'AR' | 'EN';

export interface DraftParams {
  type: MsgType;
  lang: Lang;
  name: string;
  city?: string; // mkan city enum (PORT_SUDAN, KHARTOUM, …)
  homeCount?: number;
  /**
   * The claim link handed to a host taking over their pre-provisioned account.
   *
   * There is no password to send: the bootstrap one was printed once during the
   * import and never stored, and the account is a bare number (`1004`) with no
   * mailbox behind it (the `@mkan.org` suffix was dropped 2026-08-26). `claimUrl`
   * is the only credential that exists, so `draftMessage` throws rather than emit
   * a handover message without one — the previous fallback put a literal
   * `<from provisioning>` into text a human was about to send to a stranger.
   * Site-provisioned accounts (0001+, shared password) are a different model —
   * `host-handover.ts` compiles that message.
   */
  account?: { number: string; claimUrl: string };
}

// City names come from the gazetteer — the same 50 places the scraper and the
// CRM use — so a host in Kassala is not greeted as being in "Sudan" because a
// five-entry lookup table never grew.
const cityName = (lang: Lang, city?: string): string => {
  const fallback = lang === 'AR' ? 'السودان' : 'Sudan';
  if (!city || city === 'OTHER') return fallback;
  return (lang === 'AR' ? cityNameAr(city as CityCode) : cityNameEn(city as CityCode)) || fallback;
};

export function draftMessage(p: DraftParams): string {
  const cityStr = cityName(p.lang, p.city);
  const acct = p.account;

  // A handover message without a claim link is unsendable — there is nothing to
  // hand over. Failing loudly here beats a human pasting a placeholder.
  if (p.type === 'handover' && !acct?.claimUrl) {
    throw new Error(
      `handover message for "${p.name}" has no claimUrl — mint one with \`pnpm crm:claim-token --host=<id> --apply\` first`,
    );
  }

  if (p.lang === 'AR') {
    switch (p.type) {
      case 'first-touch':
        return `السلام عليكم ${p.name} 👋
لقينا إعلان بيتك الجميل في ${cityStr} على Airbnb.
احنا منصة مكان (mkan) — سوق تأجير سوداني. جهّزنا ليك حساب فيه إعلاناتك جاهزة، تقدر تديرها بنفسك وتوصل ضيوف من داخل السودان بدون عمولات المنصات العالمية. تحب نوريك كيف؟`;
      case 'handover':
        return `تمام ${p.name}! حسابك جاهز على mkan.
افتح الرابط دا وحدد كلمة السر البتحبها، والحساب بقى ليك:
${acct!.claimUrl}
جوا "استضافة" بتلقى إعلاناتك زي ما هي. راجع الأسعار والصور، وما بننشر أي إعلان قبل ما توافق أنت.
(الرابط بينتهي بعد أسبوع ويشتغل مرة واحدة بس — لو خلص كلمنا ونرسل ليك واحد جديد.)`;
      case 'follow-up':
        return `${p.name}، بس نتأكد وصلتك رسالتنا 🙂 حساب mkan جاهز بإعلاناتك — بدون التزام، تحب نوريك؟`;
    }
  }
  // EN
  switch (p.type) {
    case 'first-touch':
      return `Hello ${p.name} 👋
We found your lovely ${cityStr} place on Airbnb. We're mkan — a Sudanese rentals marketplace. We've set up an account with your listings already loaded, so you can manage them yourself and reach guests inside Sudan without the global platform fees. Can we show you how?`;
    case 'handover':
      return `Great, ${p.name}! Your mkan account is ready.
Open this link and choose your own password — the account is then yours:
${acct!.claimUrl}
Your listings are already under "Hosting", exactly as they are. Review the prices and photos; nothing is published until you approve it.
(The link expires in a week and works once — tell us if you need a fresh one.)`;
    case 'follow-up':
      return `${p.name}, just checking our message reached you 🙂 Your mkan account is ready with your listings — no commitment, want us to show you?`;
  }
}
