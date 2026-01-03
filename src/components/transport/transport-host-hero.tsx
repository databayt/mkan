import Image from 'next/image';
import Link from 'next/link';
import { Bus, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TransportHostHeroProps {
  lang: string;
  className?: string;
}

const benefits = [
  'Reach more customers with online visibility',
  'Accept bookings 24/7, even when offline',
  'Manage all trips and seats in one dashboard',
  'Get paid securely through multiple payment options',
];

export function TransportHostHero({ lang, className }: TransportHostHeroProps) {
  return (
    <section
      className={cn(
        'py-16 lg:py-24 px-4 md:px-8',
        'bg-gradient-to-br from-background to-muted/30',
        className
      )}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          {/* Text Content */}
          <div className="order-2 lg:order-1 space-y-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full">
              <Bus className="h-5 w-5" />
              <span className="text-sm font-medium">For Transport Businesses</span>
            </div>

            {/* Heading */}
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
              Own a Transport Office?
            </h2>

            {/* Subheading */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-xl">
              Join Mkan to reach more customers and manage your bookings online.
              Start accepting online reservations today.
            </p>

            {/* Benefits List */}
            <ul className="space-y-4 pt-2">
              {benefits.map((benefit, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-base">{benefit}</span>
                </li>
              ))}
            </ul>

            {/* CTA Button */}
            <div className="pt-4">
              <Button size="lg" asChild>
                <Link href={`/${lang}/transport-host`}>
                  <Bus className="h-5 w-5" />
                  Register Your Office
                </Link>
              </Button>
            </div>
          </div>

          {/* Image */}
          <div className="order-1 lg:order-2 relative">
            <div className="relative aspect-[4/3] lg:aspect-square rounded-2xl overflow-hidden shadow-2xl">
              <Image
                src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=1200&h=900&fit=crop"
                alt="Transport office managing bookings on Mkan"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>

            {/* Floating Stats Card */}
            <div className="absolute bottom-4 left-4 right-4 lg:bottom-6 lg:left-6 lg:right-auto lg:max-w-64">
              <div className="bg-background/95 backdrop-blur-sm rounded-xl p-4 shadow-lg border">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Verified Offices</p>
                    <p className="text-xs text-muted-foreground">
                      Join trusted partners
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default TransportHostHero;
