"use client";

import { useState } from "react";
import { ChevronDown, Tent } from "lucide-react";
import MenuPageHeader from "@/components/menu-pages/page-header";
import SiteFooter from "@/components/template/footer/site-footer";
import { useLocale } from "@/components/internationalization/use-locale";

const t = {
  en: {
    redeem: "Redeem",
    buyNow: "Buy now",
    title1: "Mkan",
    title2: "gift cards",
    subtitle: "Homes. Experiences. Services. There's even more Mkan to give.",
    giveHeading: "You give. They go.",
    giveBody:
      "Bring the world of Mkan to friends and family. Celebrate holidays, recognize important moments, and inspire travel. Help them go wherever, whenever, since gift cards never expire.",
    business: "Purchasing for business?",
    buyBulk: "Buy gift cards in bulk",
    pickDesign: "Pick your design",
    feat1: "What they want",
    feat1Desc:
      "You choose the design, message, and gift amount. They choose the home, experience, or service.",
    feat2: "Easy to send",
    feat2Desc:
      "Delivers in minutes via text or email. You'll receive a confirmation once it's been received.",
    feat3: "Never expires",
    feat3Desc:
      "Gift credit is available to use whenever they're ready to pack their bags.",
    bizHeading: "Gift cards for business",
    bizBody:
      "Show your appreciation for employees and customers with a gift that's easy to give for any occasion.",
    bizOrders: "For orders SDG 100,000 or more,",
    contactSales: "contact sales.",
    getStarted: "Get started",
    faqTitle: "Frequently asked questions",
    faqMore: "For more questions visit the",
    helpCenter: "Help Center",
  },
  ar: {
    redeem: "استرداد",
    buyNow: "اشترِ الآن",
    title1: "مكان",
    title2: "بطاقات الهدايا",
    subtitle: "منازل. تجارب. خدمات. هناك المزيد من مكان لتقدمه.",
    giveHeading: "أنت تهدي. وهم ينطلقون.",
    giveBody:
      "قدّم عالم مكان لأصدقائك وعائلتك. احتفِ بالمناسبات، وأحيِ اللحظات المهمة، وألهم السفر. ساعدهم على الذهاب أينما وكلما شاؤوا، فبطاقات الهدايا لا تنتهي صلاحيتها.",
    business: "هل تشتري لعملك؟",
    buyBulk: "اشترِ بطاقات الهدايا بالجملة",
    pickDesign: "اختر تصميمك",
    feat1: "ما يريدونه",
    feat1Desc:
      "أنت تختار التصميم والرسالة وقيمة الهدية. وهم يختارون المنزل أو التجربة أو الخدمة.",
    feat2: "سهلة الإرسال",
    feat2Desc:
      "تصل في دقائق عبر الرسائل النصية أو البريد الإلكتروني. ستتلقى تأكيداً بمجرد استلامها.",
    feat3: "لا تنتهي صلاحيتها",
    feat3Desc: "رصيد الهدية متاح للاستخدام متى استعدوا لحزم حقائبهم.",
    bizHeading: "بطاقات الهدايا للأعمال",
    bizBody:
      "أظهر تقديرك للموظفين والعملاء بهدية سهلة التقديم في أي مناسبة.",
    bizOrders: "للطلبات بقيمة ج.س 100,000 أو أكثر،",
    contactSales: "تواصل مع المبيعات.",
    getStarted: "ابدأ",
    faqTitle: "الأسئلة الشائعة",
    faqMore: "لمزيد من الأسئلة قم بزيارة",
    helpCenter: "مركز المساعدة",
  },
} as const;

const FAQ_EN = [
  {
    q: "Are gift cards physical or digital?",
    a: "Mkan gift cards are digital and delivered by email or text — there's no physical card.",
  },
  {
    q: "Where can I buy a physical gift card?",
    a: "We currently offer digital gift cards only, which arrive within minutes of purchase.",
  },
  {
    q: "Do gift cards expire?",
    a: "No. Mkan gift card credit never expires and can be used whenever the recipient is ready.",
  },
  {
    q: "Where are gift cards available?",
    a: "Gift cards are available in eligible regions. Availability is shown at checkout.",
  },
  {
    q: "Can I send a gift card to someone who lives in a different country?",
    a: "Yes, as long as the recipient's region supports redeeming Mkan gift cards.",
  },
  {
    q: "How can I check my gift card balance?",
    a: "Sign in and visit your account's payments section to see your current gift credit.",
  },
];

const FAQ_AR = [
  {
    q: "هل بطاقات الهدايا مادية أم رقمية؟",
    a: "بطاقات هدايا مكان رقمية وتُرسل عبر البريد الإلكتروني أو الرسائل النصية — لا توجد بطاقة مادية.",
  },
  {
    q: "أين يمكنني شراء بطاقة هدية مادية؟",
    a: "نقدم حالياً بطاقات هدايا رقمية فقط، تصل خلال دقائق من الشراء.",
  },
  {
    q: "هل تنتهي صلاحية بطاقات الهدايا؟",
    a: "لا. لا ينتهي رصيد بطاقة هدية مكان أبداً ويمكن استخدامه متى استعد المستلم.",
  },
  {
    q: "أين تتوفر بطاقات الهدايا؟",
    a: "تتوفر بطاقات الهدايا في المناطق المؤهلة. يظهر التوفر عند الدفع.",
  },
  {
    q: "هل يمكنني إرسال بطاقة هدية لشخص يعيش في دولة أخرى؟",
    a: "نعم، طالما أن منطقة المستلم تدعم استرداد بطاقات هدايا مكان.",
  },
  {
    q: "كيف يمكنني التحقق من رصيد بطاقة الهدية؟",
    a: "سجّل الدخول وانتقل إلى قسم المدفوعات في حسابك لرؤية رصيد هديتك الحالي.",
  },
];

// Gradient palette for the "Pick your design" gallery — a clone stand-in for
// Airbnb's illustrated card artwork.
const CARD_GRADIENTS = [
  "from-rose-400 via-rose-500 to-rose-600",
  "from-amber-300 via-orange-400 to-rose-500",
  "from-sky-300 via-indigo-400 to-purple-500",
  "from-emerald-300 via-teal-400 to-cyan-500",
  "from-fuchsia-400 via-purple-500 to-indigo-600",
  "from-lime-300 via-emerald-400 to-teal-500",
  "from-orange-300 via-rose-400 to-pink-500",
  "from-slate-400 via-slate-500 to-slate-700",
  "from-yellow-300 via-amber-400 to-orange-500",
];

/**
 * A single Mkan-branded gift-card face — the tent mark + wordmark on a
 * gradient, standing in for Airbnb's illustrated card artwork. Size, rotation,
 * gradient and shadow are supplied by the caller via `className`.
 */
function GiftCardArt({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl ${className}`}
    >
      <Tent
        size={28}
        strokeWidth={1.6}
        className="text-white opacity-95"
        aria-hidden="true"
      />
      <span className="text-sm font-bold tracking-wide text-white/95">Mkan</span>
    </div>
  );
}

export default function GiftCardsContent() {
  const { locale } = useLocale();
  const labels = t[locale] ?? t.en;
  const faqs = locale === "ar" ? FAQ_AR : FAQ_EN;
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <MenuPageHeader
        actions={
          <>
            <button className="px-3 py-2 text-sm font-semibold text-gray-900 underline-offset-2 hover:underline">
              {labels.redeem}
            </button>
            <button className="rounded-full bg-[#FF385C] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E31C5F]">
              {labels.buyNow}
            </button>
          </>
        }
      />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 pt-12 text-center md:pt-16">
          <h1 className="text-6xl font-semibold leading-[0.95] tracking-tight text-gray-900 md:text-8xl">
            {labels.title1}
            <br />
            {labels.title2}
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base text-gray-600">
            {labels.subtitle}
          </p>
          <button className="mt-7 rounded-full bg-[#FF385C] px-7 py-3 text-base font-semibold text-white transition-colors hover:bg-[#E31C5F]">
            {labels.buyNow}
          </button>

          {/* Hero cards illustration — three Mkan gift cards fanned out */}
          <div className="relative mx-auto mt-14 flex h-64 max-w-md items-center justify-center">
            <GiftCardArt className="absolute h-40 w-64 -rotate-12 -translate-x-12 bg-gradient-to-br from-emerald-300 via-teal-400 to-green-500 shadow-xl" />
            <GiftCardArt className="absolute h-40 w-64 rotate-12 translate-x-12 translate-y-4 bg-gradient-to-br from-sky-300 via-indigo-400 to-purple-500 shadow-xl" />
            <GiftCardArt className="absolute h-40 w-64 rotate-0 -translate-y-2 bg-gradient-to-br from-rose-400 to-rose-600 shadow-2xl" />
          </div>
        </section>

        {/* You give. They go. */}
        <section className="mx-auto max-w-xl px-6 py-12 text-center">
          <h2 className="text-4xl font-semibold text-gray-900 md:text-5xl">
            {labels.giveHeading}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-600">
            {labels.giveBody}
          </p>
          <p className="mt-5 text-sm text-gray-600">{labels.business}</p>
          <button className="text-sm font-semibold text-gray-900 underline">
            {labels.buyBulk}
          </button>
        </section>

        {/* Pick your design */}
        <section className="mx-auto max-w-3xl px-6 py-8">
          <h2 className="text-center text-4xl font-semibold text-gray-900 md:text-5xl">
            {labels.pickDesign}
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {CARD_GRADIENTS.map((g, i) => (
              <GiftCardArt
                key={i}
                className={`aspect-[1.6/1] w-full bg-gradient-to-br shadow-sm transition-transform hover:-translate-y-1 ${g}`}
              />
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-3xl px-6 py-12">
          <div className="grid grid-cols-1 gap-8 text-center md:grid-cols-3">
            {[
              { t: labels.feat1, d: labels.feat1Desc },
              { t: labels.feat2, d: labels.feat2Desc },
              { t: labels.feat3, d: labels.feat3Desc },
            ].map((f) => (
              <div key={f.t}>
                <h3 className="text-base font-semibold text-gray-900">{f.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  {f.d}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Gift cards for business */}
        <section className="mx-auto max-w-3xl px-6 py-8">
          <div className="grid grid-cols-1 items-center gap-6 overflow-hidden rounded-3xl bg-gray-50 p-8 md:grid-cols-2 md:p-12">
            <div>
              <h2 className="text-4xl font-semibold leading-tight text-gray-900 md:text-5xl">
                {labels.bizHeading}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-gray-600">
                {labels.bizBody}
              </p>
              <p className="mt-4 text-sm text-gray-600">
                {labels.bizOrders}{" "}
                <span className="font-semibold text-gray-900 underline">
                  {labels.contactSales}
                </span>
              </p>
              <button className="mt-5 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-black">
                {labels.getStarted}
              </button>
            </div>
            <div className="relative flex h-48 items-center justify-center">
              <div className="absolute h-28 w-48 translate-y-3 rotate-3 rounded-xl bg-gradient-to-br from-sky-300 to-indigo-400 shadow-lg" />
              <div className="absolute h-28 w-48 -rotate-6 rounded-xl bg-gradient-to-br from-rose-400 to-rose-600 shadow-xl" />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-4xl px-6 py-16">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[280px_1fr]">
            <div>
              <h2 className="text-4xl font-semibold leading-tight text-gray-900 md:text-5xl">
                {labels.faqTitle}
              </h2>
              <p className="mt-3 text-sm text-gray-600">
                {labels.faqMore}{" "}
                <span className="font-semibold text-gray-900 underline">
                  {labels.helpCenter}
                </span>
                .
              </p>
            </div>
            <div className="divide-y divide-gray-200 border-t border-gray-200">
              {faqs.map((f, i) => {
                const expanded = open === i;
                return (
                  <div key={i}>
                    <button
                      onClick={() => setOpen(expanded ? null : i)}
                      className="flex w-full items-center justify-between gap-4 py-5 text-start"
                      aria-expanded={expanded}
                    >
                      <span className="text-base text-gray-900">{f.q}</span>
                      <ChevronDown
                        size={20}
                        className={`flex-shrink-0 text-gray-500 transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {expanded && (
                      <p className="pb-5 text-sm leading-relaxed text-gray-600">
                        {f.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
