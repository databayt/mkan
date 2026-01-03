import { Suspense } from 'react';
import { Bus, MapPin, Clock, Shield, Ticket } from 'lucide-react';

import TransportBigSearch from '@/components/transport/search/transport-big-search';
import { getAssemblyPoints } from '@/lib/actions/transport-actions';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';

interface TransportPageProps {
  params: Promise<{ lang: Locale }>;
}

export default async function TransportPage({ params }: TransportPageProps) {
  const { lang } = await params;
  const dictionary = await getDictionary(lang);
  const assemblyPoints = await getAssemblyPoints();

  const features = [
    {
      icon: <MapPin className="h-8 w-8" />,
      title: 'Multiple Destinations',
      description:
        'Book tickets to cities across Sudan from major assembly points.',
    },
    {
      icon: <Clock className="h-8 w-8" />,
      title: 'Daily Departures',
      description: 'Regular morning departures at 5:00 AM, 7 days a week.',
    },
    {
      icon: <Ticket className="h-8 w-8" />,
      title: 'E-Tickets',
      description:
        'Receive your ticket instantly via PDF with QR code for easy boarding.',
    },
    {
      icon: <Shield className="h-8 w-8" />,
      title: 'Verified Offices',
      description:
        'All transport offices are verified for your safety and comfort.',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      {/* Hero Section */}
      <section className="relative py-20 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6">
              <Bus className="h-5 w-5" />
              <span className="text-sm font-medium">
                Intercity Bus Booking
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Travel Between Cities in Sudan
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Book your bus tickets online. Choose your seat, pay securely, and
              receive your e-ticket instantly.
            </p>
          </div>

          {/* Search Widget */}
          <Suspense
            fallback={
              <div className="h-16 bg-muted animate-pulse rounded-full max-w-4xl mx-auto" />
            }
          >
            <TransportBigSearch
              assemblyPoints={assemblyPoints}
              lang={lang}
              dictionary={{
                from: 'From',
                to: 'To',
                date: 'Travel Date',
                search: 'Search',
                swap: 'Swap cities',
                selectCity: 'Select city',
                selectDate: 'Select date',
              }}
            />
          </Suspense>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 md:px-8 bg-background">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: 1,
                title: 'Search',
                description: 'Enter your origin, destination, and travel date',
              },
              {
                step: 2,
                title: 'Select',
                description: 'Choose your preferred bus and select your seats',
              },
              {
                step: 3,
                title: 'Pay',
                description:
                  'Pay securely with mobile money, card, or cash on arrival',
              },
              {
                step: 4,
                title: 'Travel',
                description:
                  'Show your e-ticket at the assembly point and board',
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
            Why Book With Us
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

      {/* Popular Routes */}
      <section className="py-16 px-4 md:px-8 bg-background">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Popular Routes
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                from: 'Khartoum',
                to: 'Port Sudan',
                duration: '12h',
                price: 'From 5,000 SDG',
              },
              {
                from: 'Khartoum',
                to: 'Kassala',
                duration: '8h',
                price: 'From 3,500 SDG',
              },
              {
                from: 'Khartoum',
                to: 'Wad Madani',
                duration: '3h',
                price: 'From 1,500 SDG',
              },
              {
                from: 'Omdurman',
                to: 'Dongola',
                duration: '6h',
                price: 'From 2,500 SDG',
              },
              {
                from: 'Khartoum',
                to: 'Atbara',
                duration: '5h',
                price: 'From 2,000 SDG',
              },
              {
                from: 'Port Sudan',
                to: 'Kassala',
                duration: '6h',
                price: 'From 2,500 SDG',
              },
            ].map((route) => (
              <div
                key={`${route.from}-${route.to}`}
                className="bg-muted/30 rounded-xl p-4 hover:bg-muted/50 transition-colors cursor-pointer border"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{route.from}</span>
                  <div className="flex-1 mx-3 border-t border-dashed border-muted-foreground/30" />
                  <span className="font-medium">{route.to}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {route.duration}
                  </span>
                  <span className="font-medium text-primary">
                    {route.price}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA - Become a Transport Host */}
      <section className="py-16 px-4 md:px-8 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Own a Transport Office?
          </h2>
          <p className="text-lg opacity-90 mb-8">
            Join Mkan to reach more customers and manage your bookings online.
            Start accepting online reservations today.
          </p>
          <a
            href={`/${lang}/transport-host`}
            className="inline-flex items-center gap-2 bg-background text-foreground px-8 py-3 rounded-lg font-semibold hover:bg-background/90 transition-colors"
          >
            <Bus className="h-5 w-5" />
            Register Your Office
          </a>
        </div>
      </section>
    </div>
  );
}
