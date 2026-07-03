/**
 * Outreach message templates (Epic G1.6) — pure, AR-primary / EN.
 *
 * The exact copy from docs/growth.md §5.4, parameterized. Short, honest, and
 * never implies Airbnb affiliation. OpenClaw drafts these; a human sends the
 * first touch by default, follow-ups may be automated.
 */
export type MsgType = 'first-touch' | 'handover' | 'follow-up';
export type Lang = 'AR' | 'EN';

export interface DraftParams {
  type: MsgType;
  lang: Lang;
  name: string;
  city?: string; // mkan city enum (PORT_SUDAN, KHARTOUM, …)
  homeCount?: number;
  account?: { number: string; password: string; url: string };
}

const CITY_AR: Record<string, string> = {
  PORT_SUDAN: 'بورتسودان', KHARTOUM: 'الخرطوم', OMDURMAN: 'أم درمان', BAHRI: 'بحري', EAST_NILE: 'شرق النيل', OTHER: 'السودان',
};
const CITY_EN: Record<string, string> = {
  PORT_SUDAN: 'Port Sudan', KHARTOUM: 'Khartoum', OMDURMAN: 'Omdurman', BAHRI: 'Bahri', EAST_NILE: 'East Nile', OTHER: 'Sudan',
};
const cityName = (lang: Lang, city?: string): string =>
  (lang === 'AR' ? CITY_AR : CITY_EN)[city ?? 'OTHER'] ?? (lang === 'AR' ? 'السودان' : 'Sudan');

export function draftMessage(p: DraftParams): string {
  const cityStr = cityName(p.lang, p.city);
  const acct = p.account;

  if (p.lang === 'AR') {
    switch (p.type) {
      case 'first-touch':
        return `السلام عليكم ${p.name} 👋
لقينا إعلان بيتك الجميل في ${cityStr} على Airbnb.
احنا منصة مكان (mkan) — سوق تأجير سوداني. جهّزنا ليك حساب فيه إعلاناتك جاهزة، تقدر تديرها بنفسك وتوصل ضيوف من داخل السودان بدون عمولات المنصات العالمية. تحب نوريك كيف؟`;
      case 'handover':
        return `تمام ${p.name}! حسابك جاهز على mkan:
• الدخول: ${acct?.number ?? '—'}  (أو ${acct?.number ?? '—'}@mkan.org)
• كلمة السر: ${acct?.password ?? '—'}  — غيّرها بعد أول دخول
لقيت إعلاناتك جاهزة جوا "استضافة". راجع الأسعار والصور وأكّد لينا السعر المباشر لكل بيت، وبعدها ننشرها. رابط: ${acct?.url ?? 'https://mkan.databayt.org'}`;
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
      return `Great, ${p.name}! Your mkan account is ready:
• Login: ${acct?.number ?? '—'}  (or ${acct?.number ?? '—'}@mkan.org)
• Password: ${acct?.password ?? '—'}  — change it after first login
Your listings are already under "Hosting". Review the prices and photos and confirm the direct price for each home, then we publish. Link: ${acct?.url ?? 'https://mkan.databayt.org'}`;
    case 'follow-up':
      return `${p.name}, just checking our message reached you 🙂 Your mkan account is ready with your listings — no commitment, want us to show you?`;
  }
}
