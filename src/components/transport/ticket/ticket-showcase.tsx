'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Download, Send } from 'lucide-react';
import QRCode from 'qrcode';

import { Button } from '@/components/ui/button';

interface TicketShowcaseProps {
  lang: string;
}

const DEMO_DATA = {
  en: {
    route: 'Khartoum → Port Sudan',
    name: 'Ahmed',
    seat: 'A12',
    time: '5:00 AM',
    date: '15 March 2026',
    place: 'Souq Al-Arabi, Khartoum',
    scanLabel: 'Scan this QR code or show this ticket at boarding',
    ticketId: 'MKN-32212',
    nameLabel: 'Name',
    seatLabel: 'Seat',
    timeLabel: 'Time',
    dateLabel: 'Date',
    placeLabel: 'Boarding Point',
    share: 'Share',
    download: 'Download Ticket',
  },
  ar: {
    route: 'الخرطوم → بورتسودان',
    name: 'أحمد',
    seat: 'A12',
    time: '5:00 ص',
    date: '15 مارس 2026',
    place: 'سوق العربي، الخرطوم',
    scanLabel: 'امسح رمز QR أو أظهر هذه التذكرة عند الصعود',
    ticketId: 'MKN-32212',
    nameLabel: 'الاسم',
    seatLabel: 'المقعد',
    timeLabel: 'الوقت',
    dateLabel: 'التاريخ',
    placeLabel: 'نقطة التجمع',
    share: 'مشاركة',
    download: 'تحميل التذكرة',
  },
};

export function TicketShowcase({ lang }: TicketShowcaseProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const d = lang === 'ar' ? DEMO_DATA.ar : DEMO_DATA.en;

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(
      JSON.stringify({ ref: 'MKN-32212', passenger: 'Ahmed', seat: 'A12' }),
      { width: 140, margin: 2, color: { dark: '#000000', light: '#ffffff' } }
    ).then((url) => {
      if (mounted) setQrCodeUrl(url);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="max-w-sm md:max-w-3xl mx-auto">
      <div className="bg-card rounded-2xl shadow-lg border flex flex-col md:flex-row">
        {/* Banner Image — top on mobile, left column on desktop */}
        <div className="relative aspect-[5/3] md:aspect-auto md:w-[240px] shrink-0 overflow-hidden rounded-t-2xl md:rounded-t-none md:rounded-s-2xl">
          <Image
            src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&q=80"
            alt="Bus transport"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 240px"
          />
        </div>

        {/* Info Section — title, grid, place */}
        <div className="flex-1 min-w-0 px-5 pt-5 pb-4 md:py-5">
          <h3 className="text-xl font-bold leading-tight">{d.route}</h3>

          <div className="mt-3 grid grid-cols-2 gap-y-3 gap-x-4">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {d.nameLabel}
              </p>
              <p className="font-semibold text-sm mt-0.5">{d.name}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {d.seatLabel}
              </p>
              <p className="font-semibold text-sm mt-0.5">{d.seat}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {d.timeLabel}
              </p>
              <p className="font-semibold text-sm mt-0.5">{d.time}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {d.dateLabel}
              </p>
              <p className="font-semibold text-sm mt-0.5">{d.date}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {d.placeLabel}
              </p>
              <p className="font-semibold text-sm mt-0.5">{d.place}</p>
            </div>
          </div>
        </div>

        {/* Tear-Off Separator — horizontal on mobile, vertical on desktop */}
        {/* Mobile: horizontal dashed line with left/right cutouts */}
        <div className="relative md:hidden h-6 shrink-0">
          <div className="absolute inset-x-6 top-1/2 border-t-2 border-dashed border-muted-foreground/40" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-muted rounded-full" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-6 h-6 bg-muted rounded-full" />
        </div>

        {/* Desktop: vertical dashed line with top/bottom cutouts */}
        <div className="hidden md:block relative self-stretch w-6 shrink-0">
          <div className="absolute top-6 bottom-6 left-1/2 -translate-x-px border-s-2 border-dashed border-muted-foreground/40" />
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-muted rounded-full z-10" />
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-muted rounded-full z-10" />
        </div>

        {/* QR + Actions — bottom on mobile, right column on desktop */}
        <div className="px-5 pt-4 pb-5 md:py-5 md:w-[220px] shrink-0 flex flex-col">
          <div className="bg-primary/5 rounded-xl p-4 flex items-center gap-4 md:flex-col md:items-center md:gap-3 flex-1">
            {qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt="QR Code"
                className="w-[72px] h-[72px] md:w-[108px] md:h-[108px] rounded-lg shrink-0"
              />
            ) : (
              <div className="w-[72px] h-[72px] md:w-[108px] md:h-[108px] bg-muted animate-pulse rounded-lg shrink-0" />
            )}
            <div className="flex-1 min-w-0 md:text-center">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {d.scanLabel}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Ticket ID{' '}
                <span className="font-mono font-bold text-foreground">
                  {d.ticketId}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3">
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-xl h-9 w-9"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">{d.share}</span>
            </Button>
            <Button size="sm" className="flex-1 gap-2 rounded-xl">
              <Download className="h-4 w-4" />
              {d.download}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
