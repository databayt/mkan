import { Suspense } from 'react';
import { MapPin, Clock, Shield, Ticket } from 'lucide-react';
import type { Metadata } from 'next';

import TransportBigSearch from '@/components/transport/search/transport-big-search';
import TransportHostHero from '@/components/transport/transport-host-hero';
import { TicketShowcase } from '@/components/transport/ticket/ticket-showcase';
import { LogoCarousel } from '@/components/transport/logo-carousel';
import Footer from '@/components/site/footer';
import { getAssemblyPoints, getPopularRoutes } from '@/lib/actions/transport-actions';
import Link from 'next/link';
import { format } from 'date-fns';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';
import { createMetadata } from '@/lib/metadata';

// ISR: Revalidate every 10 minutes (assembly points rarely change)
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params;
  const dictionary = await getDictionary(lang);
  return createMetadata({
    title: dictionary.transport.metadataTitle,
    description: dictionary.transport.metadataDescription,
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
  const t = dictionary.transport;
  const todayIso = format(new Date(), 'yyyy-MM-dd');

  const features = [
    {
      icon: <MapPin className="h-8 w-8" />,
      title: t.features.items.destinations.title,
      description: t.features.items.destinations.description,
    },
    {
      icon: <Clock className="h-8 w-8" />,
      title: t.features.items.departures.title,
      description: t.features.items.departures.description,
    },
    {
      icon: <Ticket className="h-8 w-8" />,
      title: t.features.items.etickets.title,
      description: t.features.items.etickets.description,
    },
    {
      icon: <Shield className="h-8 w-8" />,
      title: t.features.items.verified.title,
      description: t.features.items.verified.description,
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
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src="/videos/hero-bg.mp4" type="video/mp4" />
          </video>
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Content overlay - on top of video */}
        <div className="relative z-20 h-screen md:h-[50vh] flex flex-col items-center justify-center pt-16 px-4">
          {/* Hero Text */}
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white">
              <span className="block">{t.hero.titleLine1}</span>
              <span className="block">{t.hero.titleLine2}</span>
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
                  from: t.search.from,
                  to: t.search.to,
                  date: t.search.date,
                  search: t.search.search,
                  selectCity: dictionary.common.search,
                  selectDate: t.search.date,
                }}
              />
            </Suspense>
          </div>
        </div>

        {/* Rest of content below video */}
        <div className="relative z-10 bg-background">
        </div>
      </section>

      {/* Logo Carousel */}
      <section className="py-12 px-4 md:px-8 bg-background">
        <div className="max-w-6xl mx-auto flex justify-center">
          <LogoCarousel />
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 md:px-8 bg-background">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">{t.howItWorks.title}</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: 1,
                title: t.howItWorks.step1.title,
                description: t.howItWorks.step1.description,
              },
              {
                step: 2,
                title: t.howItWorks.step2.title,
                description: t.howItWorks.step2.description,
              },
              {
                step: 3,
                title: t.howItWorks.step3.title,
                description: t.howItWorks.step3.description,
              },
              {
                step: 4,
                title: t.howItWorks.step4.title,
                description: t.howItWorks.step4.description,
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

      {/* Features */}
      <section className="py-16 px-4 md:px-8 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t.features.title}
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
          <h2 className="text-3xl font-bold mb-3">{t.ticket.showcaseTitle}</h2>
          <p className="text-muted-foreground mb-10 max-w-xl mx-auto">
            {t.ticket.showcaseSubtitle}
          </p>
          <TicketShowcase lang={lang} />
        </div>
      </section>

      {/* Popular Routes */}
      <section className="py-16 px-4 md:px-8 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t.routes.title}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {popularRoutes.map((route) => {
              const isArabic = lang === 'ar';
              const fromLabel = isArabic ? (route.origin.nameAr ?? route.origin.city) : route.origin.city;
              const toLabel = isArabic ? (route.destination.nameAr ?? route.destination.city) : route.destination.city;
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
                      {t.routes.hoursFormat.replace('{hours}', String(hours))}
                    </span>
                    <span className="font-medium text-primary">
                      {t.routes.pricePrefix} {route.basePrice.toLocaleString(lang)} {t.routes.currency}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA - Become a Transport Host */}
      <TransportHostHero lang={lang} dictionary={t.cta} />

      {/* Footer */}
      <Footer />
    </div>
  );
}
