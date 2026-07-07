import { Suspense } from 'react';
import Image from 'next/image';
import { MapPin, Clock, Shield, Ticket } from 'lucide-react';
import type { Metadata } from 'next';

import SiteHeader from '@/components/template/header/header';
import TransportBigSearch from '@/components/transport/search/transport-big-search';
import { RouteCarouselSection } from '@/components/transport/home/route-carousel-section';
import { TransportInspiration } from '@/components/transport/home/transport-inspiration';
import { TransportHostBanner } from '@/components/transport/home/host-banner';
import type { PopularRoute } from '@/components/transport/home/route-utils';
import { TicketShowcase } from '@/components/transport/ticket/ticket-showcase';
import { LogoCarousel } from '@/components/transport/logo-carousel';
import { TransportTestimonials } from '@/components/transport/transport-testimonials';
import { TransportMap } from '@/components/transport/transport-map';
import Footer from '@/components/site/footer';
import { getAssemblyPoints, getPopularRoutes } from '@/lib/actions/transport-actions';
import { format } from 'date-fns';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';
import { createMetadata } from '@/lib/metadata';
import { PHASE1 } from '@/config/phase-flags';
import { cityLabel } from '@/components/transport/city-names';

// Rendered on-demand: this page queries the DB (assembly points / popular
// routes) at render time, and the CI build environment has no reachable
// database, so it must not be prerendered/ISR-generated at build time.
export const dynamic = 'force-dynamic';

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

  // Several operators run the same city pair — the cards name no operator,
  // so show each pair once (most-trips-first order), split into the homes
  // landing's carousel rhythm: a "from Khartoum" rail + everything else.
  const dedupedRoutes = popularRoutes.filter(
    (route, i, all) =>
      all.findIndex(
        (r) =>
          r.origin.city === route.origin.city &&
          r.destination.city === route.destination.city,
      ) === i,
  ) as PopularRoute[];
  const khartoumRoutes = dedupedRoutes.filter((r) => r.origin.city === 'Khartoum');
  const otherRoutes = dedupedRoutes.filter((r) => r.origin.city !== 'Khartoum');

  const cardDictionary = {
    pricePrefix: t?.routes?.pricePrefix ?? 'From',
    perSeat: t?.home?.perSeat ?? 'per seat',
    hoursSuffix: t?.home?.hoursSuffix ?? '{hours}h',
    from: t?.search?.from ?? 'From',
  };

  const popularFromTitle = (t?.home?.popularFrom ?? 'Popular routes from {city}').replace(
    '{city}',
    cityLabel('Khartoum', lang),
  );
  const moreRoutesTitle = t?.home?.moreRoutes ?? 'More routes across Sudan';

  const steps = [
    {
      title: t?.howItWorks?.step1?.title ?? 'Search',
      description: t?.howItWorks?.step1?.description ?? 'Enter your origin, destination, and travel date',
    },
    {
      title: t?.howItWorks?.step2?.title ?? 'Select',
      description: t?.howItWorks?.step2?.description ?? 'Choose your preferred bus and select your seats',
    },
    {
      title: t?.howItWorks?.step3?.title ?? 'Pay',
      description: t?.howItWorks?.step3?.description ?? 'Pay securely with mobile money, card, or cash on arrival',
    },
    {
      title: t?.howItWorks?.step4?.title ?? 'Travel',
      description: t?.howItWorks?.step4?.description ?? 'Show your e-ticket at the assembly point and board',
    },
  ];

  const features = [
    {
      icon: <MapPin className="h-6 w-6" />,
      title: t?.features?.items?.destinations?.title ?? "Multiple Destinations",
      description: t?.features?.items?.destinations?.description ?? "Book tickets to cities across Sudan from major assembly points.",
    },
    {
      icon: <Clock className="h-6 w-6" />,
      title: t?.features?.items?.departures?.title ?? "Daily Departures",
      description: t?.features?.items?.departures?.description ?? "Regular morning departures at 5:00 AM, 7 days a week.",
    },
    {
      icon: <Ticket className="h-6 w-6" />,
      title: t?.features?.items?.etickets?.title ?? "E-Tickets",
      description: t?.features?.items?.etickets?.description ?? "Receive your ticket instantly via PDF with QR code for easy boarding.",
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: t?.features?.items?.verified?.title ?? "Verified Offices",
      description: t?.features?.items?.verified?.description ?? "All transport offices are verified for your safety and comfort.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero — homes-landing pattern: transparent SiteHeader overlaid on a
          full-bleed photo (photography-led like the homes hero; the old video's
          poster frame showed VR kids, nothing to do with buses), search anchored
          under the headline. */}
      <section className="relative h-svh md:h-[75vh] md:min-h-[600px] w-full overflow-hidden bg-[#1a1a2e]">
        <Image
          src="https://cdn.databayt.org/mkan/transport/hero-buses-dusk.jpg"
          alt={t?.hero?.title ?? "Travel between cities in Sudan"}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        {/* Dark overlay — heavier at the top where the dusk sky is light,
            so the white header links stay readable */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/25 to-black/35" />

        {/* Transparent navbar overlay — same as the homes hero */}
        <div className="absolute top-0 start-0 w-full z-50">
          <SiteHeader />
        </div>

        {/* Content overlay — homepage hero pattern: a left-anchored white
            search card carrying the title inside it, floating over the photo. */}
        <div className="relative z-20 h-full">
          <div className="absolute top-[52%] md:top-1/2 start-4 md:start-8 -translate-y-1/2 w-[calc(100%-2rem)] md:w-auto">
            <Suspense
              fallback={
                <div className="h-[440px] w-full md:w-[340px] bg-white/20 animate-pulse" />
              }
            >
              <TransportBigSearch
                assemblyPoints={assemblyPoints}
                lang={lang}
                dictionary={{
                  title: `${t?.hero?.titleLine1 ?? "Travel Between"}\n${t?.hero?.titleLine2 ?? "Cities in Sudan"}`,
                  where: t?.search?.where ?? "Where",
                  from: t?.search?.from ?? "From",
                  to: t?.search?.to ?? "To",
                  when: t?.search?.when ?? "When",
                  date: t?.search?.date ?? "Travel Date",
                  search: dictionary?.common?.search ?? "Search",
                  selectCity: t?.search?.selectCity ?? "Add city",
                  selectDate: t?.search?.pickDate ?? "Add date",
                  swap: t?.search?.swap ?? "Swap cities",
                  passengers: t?.search?.passengers ?? "Passengers",
                  addPassengers: t?.search?.addPassengers ?? "Add passengers",
                  adults: t?.search?.adults ?? "Adults",
                  adultsAge: t?.search?.adultsAge ?? "Ages 13+",
                  children: t?.search?.children ?? "Children",
                  childrenAge: t?.search?.childrenAge ?? "Ages 2–12",
                  passenger: t?.search?.passenger ?? "passenger",
                  passengersPlural: t?.search?.passengersPlural ?? "passengers",
                }}
              />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Route rails — Airbnb listing-card carousels over real routes */}
      <div className="layout-container pt-10 pb-2 space-y-12">
        <RouteCarouselSection
          title={khartoumRoutes.length > 0 ? popularFromTitle : (t?.routes?.title ?? 'Popular Routes')}
          href={`/${lang}/transport/offices`}
          routes={khartoumRoutes.length > 0 ? khartoumRoutes : dedupedRoutes}
          lang={lang}
          dateIso={todayIso}
          dictionary={cardDictionary}
        />
        {khartoumRoutes.length > 0 && otherRoutes.length > 0 && (
          <RouteCarouselSection
            title={moreRoutesTitle}
            routes={otherRoutes}
            lang={lang}
            dateIso={todayIso}
            dictionary={cardDictionary}
          />
        )}
      </div>

      {/* Logo Carousel — gated: shown brands are not onboarded operators (see phase-flags) */}
      {PHASE1.showTransportOperatorLogos && (
        <div className="layout-container py-10">
          <p className="text-center text-sm text-muted-foreground mb-8">
            {t?.home?.operatorsCaption ?? "Trusted transport operators on our platform"}
          </p>
          <div className="flex justify-center">
            <LogoCarousel />
          </div>
        </div>
      )}

      {/* Inspiration tiles — original Airbnb destination cards over live routes */}
      <div className="layout-container py-12">
        <TransportInspiration
          routes={dedupedRoutes}
          lang={lang}
          dateIso={todayIso}
          title={dictionary?.home?.inspiration?.title ?? 'Inspiration for your next trip in Sudan'}
          hoursFrom={t?.home?.hoursFrom ?? '{hours}h from {city}'}
        />
      </div>

      {/* Digital ticket + how booking works, one two-column story */}
      <div className="layout-container py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-10 lg:gap-16 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-3">
              {t?.ticket?.showcaseTitle ?? "Your Digital Ticket"}
            </h2>
            <p className="text-muted-foreground mb-8">
              {t?.ticket?.showcaseSubtitle ?? "Book online and receive your e-ticket instantly with QR code for easy boarding."}
            </p>
            <ol className="space-y-5">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="text-sm font-semibold text-muted-foreground w-5 shrink-0 pt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-sm">{step.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <TicketShowcase lang={lang} />
        </div>
      </div>

      {/* Assembly points map */}
      <div className="layout-container py-12">
        <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-2">
          {t?.home?.assemblyPointsTitle ?? "Assembly Points"}
        </h2>
        <p className="text-muted-foreground mb-6">
          {t?.home?.assemblyPointsSubtitle ?? "All major bus stations across Sudan"}
        </p>
        <Suspense fallback={<div className="h-[400px] md:h-[450px] bg-muted animate-pulse rounded-xl" />}>
          <TransportMap assemblyPoints={assemblyPoints} lang={lang} />
        </Suspense>
      </div>

      {/* Value props — flat marketplace strip, not SaaS cards */}
      <div className="layout-container py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 border-t pt-12">
          {features.map((feature) => (
            <div key={feature.title}>
              <div className="text-gray-900">{feature.icon}</div>
              <h3 className="font-medium text-sm mt-4">{feature.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonials — gated: fabricated reviewers (see phase-flags) */}
      {PHASE1.showTransportTestimonials && <TransportTestimonials lang={lang} />}

      {/* CTA - Become a Transport Host (Ask-banner pattern) */}
      <div className="layout-container py-12">
        <TransportHostBanner
          lang={lang}
          title={t?.cta?.hostTitle ?? 'Own a Transport Office?'}
          cta={t?.cta?.registerOffice ?? 'Register Your Office'}
        />
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
