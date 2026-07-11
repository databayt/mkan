'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface Testimonial {
  name: string;
  location: string;
  route: string;
  content: string;
  rating: number;
}

const FALLBACK_TESTIMONIALS: Testimonial[] = [
  {
    name: 'Ahmed Babiker',
    location: 'Port Sudan',
    route: 'Port Sudan → Atbara',
    content: 'I used to queue for hours at the terminal. Now I book my seat from home, pick exactly where I want to sit, and just show the QR code at boarding. Saved me a whole morning.',
    rating: 5,
  },
  {
    name: 'Mona Hassan',
    location: 'Khartoum',
    route: 'Khartoum → Wad Madani',
    content: 'The mobile money payment worked instantly. I booked for my mother who doesn\'t use smartphones — just forwarded her the ticket PDF. She boarded without any issues.',
    rating: 5,
  },
  {
    name: 'Khaled Nour',
    location: 'Kassala',
    route: 'Kassala → Port Sudan',
    content: 'As someone who travels between Kassala and Port Sudan every other week, this platform has been a game-changer. I can see which buses have WiFi and USB chargers before booking.',
    rating: 4,
  },
  {
    name: 'Fatima Al-Tayeb',
    location: 'Atbara',
    route: 'Atbara → Dongola',
    content: 'The seat picker shows exactly which seats are free. I always book the front row. No more arriving at 4 AM to get a good seat.',
    rating: 5,
  },
];

export function TransportTestimonials({ lang = 'ar' }: { lang?: string }) {
  void lang;
  const dict = useDictionary();
  const td = dict?.travel?.testimonials;
  const testimonials: Testimonial[] = (td?.items as Testimonial[] | undefined) ?? FALLBACK_TESTIMONIALS;

  const [current, setCurrent] = useState(0);
  const safeIndex = current % testimonials.length;
  const t = testimonials[safeIndex]!;

  const next = () => setCurrent((p) => (p + 1) % testimonials.length);
  const prev = () => setCurrent((p) => (p - 1 + testimonials.length) % testimonials.length);

  return (
    <section className="py-16 px-4 md:px-8 bg-background">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-3">
          {td?.title ?? "What Travelers Say"}
        </h2>
        <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
          {td?.subtitle ?? "Thousands of travelers trust Mkan for their bus bookings"}
        </p>

        <div className="max-w-3xl mx-auto">
          <div className="relative bg-muted/30 rounded-2xl p-8 md:p-12 border">
            <div className="flex items-center gap-1 mb-4">
              {Array.from({ length: t.rating }, (_, i) => (
                <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              ))}
            </div>

            <blockquote className="text-lg md:text-xl leading-relaxed mb-6">
              &ldquo;{t.content}&rdquo;
            </blockquote>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="text-sm text-muted-foreground">
                  {t.route} &middot; {t.location}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={prev}
                  className="w-9 h-9 rounded-full border hover:bg-muted flex items-center justify-center transition-colors"
                  aria-label={td?.previous ?? "Previous testimonial"}
                >
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                </button>
                <button
                  onClick={next}
                  className="w-9 h-9 rounded-full border hover:bg-muted flex items-center justify-center transition-colors"
                  aria-label={td?.next ?? "Next testimonial"}
                >
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                </button>
              </div>
            </div>

            {/* Dots */}
            <div className="flex items-center justify-center gap-2 mt-6">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={cn(
                    'w-2 h-2 rounded-full transition-all',
                    i === current ? 'bg-primary w-6' : 'bg-muted-foreground/30'
                  )}
                  aria-label={(td?.goTo ?? "Go to testimonial {number}").replace(
                    "{number}",
                    String(i + 1)
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
