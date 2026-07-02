import { cdn } from "@/lib/cdn";
import { Suspense } from 'react';
import { MapPin, Clock, Shield, Ticket, Building2, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';

import TransportBigSearch from '@/components/transport/search/transport-big-search';
import TransportHostHero from '@/components/transport/transport-host-hero';
import { TicketShowcase } from '@/components/transport/ticket/ticket-showcase';
import { LogoCarousel } from '@/components/transport/logo-carousel';
import { TransportTestimonials } from '@/components/transport/transport-testimonials';
import { TransportMap } from '@/components/transport/transport-map';
import Footer from '@/components/site/footer';
import { getAssemblyPoints, getPopularRoutes } from '@/lib/actions/transport-actions';
import Link from 'next/link';
import { format } from 'date-fns';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';
import { createMetadata } from '@/lib/metadata';
import { formatCurrency } from '@/lib/i18n/formatters';
import { PHASE1 } from '@/config/phase-flags';

// ISR: Revalidate every 10 minutes (assembly points rarely change)
export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.transport;
  return createMetadata({
    title: t?.meta?.title ?? "Bus Transport",
    description: t?.meta?.description ?? "Book intercity bus trips across Sudan",
    locale: lang,
    path: "/transport",
  });
}

interface TransportPageProps {
  params: Promise<{ lang: Locale }>;
}

export default async function TransportPage({ params }: TransportPageProps) {
  const { lang } = await params;

  // Parallelize independent data fetches
  const [dictionary, assemblyPoints, popularRoutes] = await Promise.all([
    getDictionary(lang),
    getAssemblyPoints(),
    getPopularRoutes(),
  ]);
  const t = dictionary?.transport;
  const todayIso = format(new Date(), 'yyyy-MM-dd');

  const features = [
    {
      icon: <MapPin className="h-8 w-8" />,
      title: t?.features?.items?.destinations?.title ?? "Multiple Destinations",
      description: t?.features?.items?.destinations?.description ?? "Book tickets to cities across Sudan from major assembly points.",
    },
    {
      icon: <Clock className="h-8 w-8" />,
      title: t?.features?.items?.departures?.title ?? "Daily Departures",
      description: t?.features?.items?.departures?.description ?? "Regular morning departures at 5:00 AM, 7 days a week.",
    },
    {
      icon: <Ticket className="h-8 w-8" />,
      title: t?.features?.items?.etickets?.title ?? "E-Tickets",
      description: t?.features?.items?.etickets?.description ?? "Receive your ticket instantly via PDF with QR code for easy boarding.",
    },
    {
      icon: <Shield className="h-8 w-8" />,
      title: t?.features?.items?.verified?.title ?? "Verified Offices",
      description: t?.features?.items?.verified?.description ?? "All transport offices are verified for your safety and comfort.",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section with Video Background */}
      <section className="relative min-h-screen flex flex-col">
        {/* Video Background - full screen on mobile, half screen on desktop */}
        <div className="absolute inset-x-0 top-0 h-screen md:h-[50vh] z-0 overflow-hidden bg-[#1a1a2e]">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={cdn.product("videos/hero-bg-poster.jpg")}
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src={cdn.product("videos/hero-bg-720.mp4")} type="video/mp4" />
          </video>
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Content overlay - on top of video */}
        <div className="relative z-20 h-screen md:h-[50vh] flex flex-col items-center justify-center pt-16 px-4">
          {/* Hero Text */}
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white">
              <span className="block">{t?.hero?.titleLine1 ?? "Travel Between"}</span>
              <span className="block">{t?.hero?.titleLine2 ?? "Cities in Sudan"}</span>
            </h1>
          </div>

          {/* BigSearch Component - at very bottom of video */}
          <div className="w-full max-w-4xl">
            <Suspense
              fallback={
                <div className="h-16 bg-white/20 animate-pulse rounded-full max-w-4xl mx-auto" />
              }
            >
              <TransportBigSearch
                assemblyPoints={assemblyPoints}
                lang={lang}
                dictionary={{
                  from: t?.search?.from ?? "From",
                  to: t?.search?.to ?? "To",
                  date: t?.search?.date ?? "Travel Date",
                  search: t?.search?.search ?? "Search Trips",
                  selectCity: dictionary?.common?.search ?? "Search",
                  selectDate: t?.search?.date ?? "Travel Date",
                }}
              />
            </Suspense>
          </div>
        </div>

        {/* Rest of content below video */}
        <div className="relative z-10 bg-background">
        </div>
      </section>

      {/* Logo Carousel — gated: shown brands are not onboarded operators (see phase-flags) */}
      {PHASE1.showTransportOperatorLogos && (
        <section className="py-12 px-4 md:px-8 bg-background">
          <div className="max-w-6xl mx-auto">
            <p className="text-center text-sm text-muted-foreground mb-8">
              {t?.home?.operatorsCaption ?? "Trusted transport operators on our platform"}
            </p>
            <div className="flex justify-center">
              <LogoCarousel />
            </div>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="py-16 px-4 md:px-8 bg-background">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">{t?.howItWorks?.title ?? "How It Works"}</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: 1,
                title: t?.howItWorks?.step1?.title ?? "Search",
                description: t?.howItWorks?.step1?.description ?? "Enter your origin, destination, and travel date",
              },
              {
                step: 2,
                title: t?.howItWorks?.step2?.title ?? "Select",
                description: t?.howItWorks?.step2?.description ?? "Choose your preferred bus and select your seats",
              },
              {
                step: 3,
                title: t?.howItWorks?.step3?.title ?? "Pay",
                description: t?.howItWorks?.step3?.description ?? "Pay securely with mobile money, card, or cash on arrival",
              },
              {
                step: 4,
                title: t?.howItWorks?.step4?.title ?? "Travel",
                description: t?.howItWorks?.step4?.description ?? "Show your e-ticket at the assembly point and board",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Assembly Points Map */}
      <section className="py-16 px-4 md:px-8 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-3">
            {t?.home?.assemblyPointsTitle ?? "Assembly Points"}
          </h2>
          <p className="text-muted-foreground text-center mb-10 max-w-xl mx-auto">
            {t?.home?.assemblyPointsSubtitle ?? "All major bus stations across Sudan"}
          </p>
          <Suspense fallback={<div className="h-[400px] md:h-[450px] bg-muted animate-pulse rounded-xl" />}>
            <TransportMap assemblyPoints={assemblyPoints} lang={lang} />
          </Suspense>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 md:px-8 bg-background">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t?.features?.title ?? "Why Book With Us"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-background rounded-xl p-6 shadow-sm border"
              >
                <div className="text-primary mb-4">{feature.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ticket Showcase */}
      <section className="py-16 px-4 md:px-8 bg-background">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-3">{t?.ticket?.showcaseTitle ?? "Your Digital Ticket"}</h2>
          <p className="text-muted-foreground mb-10 max-w-xl mx-auto">
            {t?.ticket?.showcaseSubtitle ?? "Book online and receive your e-ticket instantly with QR code for easy boarding."}
          </p>
          <TicketShowcase lang={lang} />
        </div>
      </section>

      {/* Testimonials — gated: fabricated reviewers (see phase-flags) */}
      {PHASE1.showTransportTestimonials && <TransportTestimonials lang={lang} />}

      {/* Popular Routes */}
      <section className="py-16 px-4 md:px-8 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-3xl font-bold">
              {t?.routes?.title ?? "Popular Routes"}
            </h2>
            <Link
              href={`/${lang}/transport/offices`}
              className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Building2 className="h-4 w-4" />
              {t?.home?.browseOffices ?? "Browse Offices"}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {popularRoutes.map((route) => {
              const fromLabel = lang === 'ar' ? (route.origin.nameAr ?? route.origin.city) : route.origin.city;
              const toLabel = lang === 'ar' ? (route.destination.nameAr ?? route.destination.city) : route.destination.city;
              const hours = Math.round(route.duration / 60);
              const query = new URLSearchParams({
                originId: String(route.originId),
                destinationId: String(route.destinationId),
                origin: route.origin.city,
                destination: route.destination.city,
                date: todayIso,
              });
              return (
                <Link
                  key={route.id}
                  href={`/${lang}/transport/search?${query.toString()}`}
                  className="bg-muted/30 rounded-xl p-4 hover:bg-muted/50 transition-colors cursor-pointer border block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{fromLabel}</span>
                    <div className="flex-1 mx-3 border-t border-dashed border-muted-foreground/30" />
                    <span className="font-medium">{toLabel}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {(t?.home?.hoursSuffix ?? "{hours}h").replace('{hours}', String(hours))}
                    </span>
                    <span className="font-medium text-primary">
                      {t?.routes?.pricePrefix ?? "From"} {formatCurrency(route.basePrice, lang)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Mobile Browse Offices link */}
          <div className="mt-8 text-center sm:hidden">
            <Link
              href={`/${lang}/transport/offices`}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Building2 className="h-4 w-4" />
              {t?.home?.browseAllOffices ?? "Browse all offices"}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA - Become a Transport Host */}
      <TransportHostHero lang={lang} dictionary={t?.cta} />

      {/* Footer */}
      <Footer />
    </div>
  );
}
