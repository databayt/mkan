'use client';

import { memo, useMemo } from 'react';
import { ArrowRight, BadgeCheck, Star, Bus, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/components/internationalization/use-locale';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { formatCurrency, formatNumber } from '@/lib/i18n/formatters';
import { busAmenityIcon, busAmenityLabel } from '@/components/travel/amenity-icons';

type BusAmenity =
  | 'AirConditioning'
  | 'WiFi'
  | 'USB'
  | 'LegRoom'
  | 'Toilet'
  | 'Refreshments'
  | 'Entertainment'
  | 'Luggage'
  | 'Reclining';

interface Trip {
  id: number;
  departureDate: Date;
  departureTime: string;
  arrivalTime: string | null;
  price: number;
  availableSeats: number;
  route: {
    origin: {
      name: string;
      nameAr?: string | null;
      city: string;
    };
    destination: {
      name: string;
      nameAr?: string | null;
      city: string;
    };
    duration: number;
    office: {
      name: string;
      nameAr?: string | null;
      rating: number | null;
      isVerified: boolean;
      logoUrl?: string | null;
    };
  };
  bus: {
    model: string | null;
    amenities: BusAmenity[];
  };
}

interface TripCardProps {
  trip: Trip;
  lang?: string;
  isFastest?: boolean;
  dictionary?: {
    selectSeats: string;
    seatsAvailable: string;
    duration: string;
    verified: string;
    viewStops?: string;
  };
}

/** How many amenity glyphs to show inline before collapsing to "+N". */
const MAX_AMENITY_ICONS = 6;
/** At or below this many seats we surface the trip.com-style scarcity pill. */
const LOW_SEAT_THRESHOLD = 5;

export const TripCard = memo(function TripCard({
  trip,
  lang = 'ar',
  isFastest = false,
  dictionary,
}: TripCardProps) {
  const { locale } = useLocale();
  const dict = useDictionary();
  const tt = dict?.travel?.trip;
  const amenityLabels = dict?.travel?.host?.amenityLabels as
    | Partial<Record<string, string>>
    | undefined;

  const verifiedLabel =
    dictionary?.verified ?? dict?.travel?.office?.verified ?? 'Verified';
  const perSeatLabel = tt?.perSeat ?? 'per seat';
  const directLabel = tt?.direct ?? 'Direct';
  const viewStopsLabel =
    dictionary?.viewStops ?? tt?.viewStops ?? 'View stops';

  // "5h 30m" / "٥س ٣٠د" — localized digits + unit suffixes from the dictionary
  const formattedDuration = useMemo(() => {
    const hours = Math.floor(trip.route.duration / 60);
    const mins = trip.route.duration % 60;
    const h = `${formatNumber(hours, locale)}${tt?.hoursShort ?? 'h'}`;
    const m = `${formatNumber(mins, locale)}${tt?.minutesShort ?? 'm'}`;
    return mins > 0 ? `${h} ${m}` : h;
  }, [trip.route.duration, locale, tt?.hoursShort, tt?.minutesShort]);

  const displayedAmenities = useMemo(
    () => trip.bus.amenities.slice(0, MAX_AMENITY_ICONS),
    [trip.bus.amenities],
  );
  const remainingAmenitiesCount =
    trip.bus.amenities.length > MAX_AMENITY_ICONS
      ? trip.bus.amenities.length - MAX_AMENITY_ICONS
      : 0;

  const formattedPrice = useMemo(
    () => formatCurrency(trip.price, locale),
    [trip.price, locale],
  );

  const isAr = lang === 'ar';
  const officeName =
    isAr && trip.route.office.nameAr
      ? trip.route.office.nameAr
      : trip.route.office.name;
  const originStation =
    isAr && trip.route.origin.nameAr
      ? trip.route.origin.nameAr
      : trip.route.origin.name;
  const destinationStation =
    isAr && trip.route.destination.nameAr
      ? trip.route.destination.nameAr
      : trip.route.destination.name;

  const rating = trip.route.office.rating;
  const hasRating = rating != null && rating > 0;
  const lowSeats = trip.availableSeats <= LOW_SEAT_THRESHOLD;
  const seatsLeftLabel = (tt?.seatsLeft ?? 'Only {count} left').replace(
    '{count}',
    formatNumber(trip.availableSeats, locale),
  );

  // Parse departure time
  const departureParsed = useMemo(() => {
    const [h, m] = trip.departureTime.split(':').map(Number);
    const ampm = (h ?? 0) >= 12 ? 'PM' : 'AM';
    const displayH = (h ?? 0) % 12 === 0 ? 12 : (h ?? 0) % 12;
    return {
      time: `${displayH}:${String(m ?? 0).padStart(2, '0')}`,
      ampm,
    };
  }, [trip.departureTime]);

  // Parse arrival time
  const arrivalParsed = useMemo(() => {
    if (!trip.arrivalTime) return null;
    const [h, m] = trip.arrivalTime.split(':').map(Number);
    const ampm = (h ?? 0) >= 12 ? 'PM' : 'AM';
    const displayH = (h ?? 0) % 12 === 0 ? 12 : (h ?? 0) % 12;
    return {
      time: `${displayH}:${String(m ?? 0).padStart(2, '0')}`,
      ampm,
    };
  }, [trip.arrivalTime]);

  // Calculate if the route duration crosses days
  const daysCrossed = useMemo(() => {
    const [depH, depM] = trip.departureTime.split(':').map(Number);
    const durationMinutes = trip.route.duration;
    const totalMinutes = (depH ?? 0) * 60 + (depM ?? 0) + durationMinutes;
    return Math.floor(totalMinutes / (24 * 60));
  }, [trip.departureTime, trip.route.duration]);

  return (
    <Link
      href={`/${lang}/travel/trips/${trip.id}`}
      aria-label={`${officeName} · ${trip.departureTime} → ${trip.arrivalTime ?? ''} · ${formattedPrice}`}
      className="w-full block transition-transform duration-100 active:scale-[0.99] focus-visible:outline-none"
    >
      <div className="uk-jour-card rounded-[10px] md:rounded-lg mb-2 last:mb-0 bg-white dark:bg-card border-0 md:border md:border-solid md:border-border transition-all duration-200">
        <div className="JourneyCard_container rounded-[10px] md:rounded-lg relative overflow-hidden">
          
          {/* Mobile Badges Row: aligned with card padding in X, 0 padding from top, sharp bg, four sharp corners */}
          <div className="flex flex-row items-center gap-1 md:hidden absolute top-0 start-[24px] z-20">
            {isFastest ? (
              <div className="flex items-center rounded-none bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white leading-none">
                {/* i18n-exempt */}
                <span>Fastest</span>
              </div>
            ) : lowSeats ? (
              <div className="flex items-center rounded-none bg-red-600 px-2 py-1 text-[11px] font-bold text-white leading-none">
                <span>{seatsLeftLabel}</span>
              </div>
            ) : null}
          </div>
          
          <div className="transition md:p-4 md:pb-4 relative cursor-pointer CardHover">
            <div className="pb-[6px] md:pb-0 p-[12px] md:p-0 pt-[24px] md:pt-0">
              
              {/* Header Row: Scarcity badge / Operator */}
              <div className="flex justify-between items-center mx-[12px] md:mx-0">
                {/* Desktop Operator logo & name */}
                <div className="hidden md:flex items-center gap-2">
                  {trip.route.office.logoUrl ? (
                    <img
                      className="h-6 w-auto max-w-[80px] object-contain dark:invert"
                      src={trip.route.office.logoUrl}
                      alt={officeName}
                    />
                  ) : null}
                  <span className="text-sm font-semibold text-foreground">{officeName}</span>
                </div>
                
                {/* Badges container */}
                <div className="hidden md:flex flex-none md:left-auto justify-between text-xs font-semibold ml-auto md:ml-0">
                  <div className="flex flex-row items-center gap-1.5">
                    {isFastest ? (
                      <div className="flex items-center rounded bg-emerald-600 px-[6px] h-[20px] text-[11px] font-bold text-white leading-none">
                        {/* i18n-exempt */}
                        <span>Fastest</span>
                      </div>
                    ) : lowSeats ? (
                      <div className="flex items-center rounded bg-red-600 px-[6px] h-[20px] text-[11px] font-bold text-white leading-none">
                        <span>{seatsLeftLabel}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              
              {/* Middle Row: Times, stations, price */}
              <div className="flex items-baseline relative pt-[12px] md:pt-[10px] mx-[12px] md:mx-0 justify-between">
                <div className="flex flex-1 min-w-0">
                  {/* 2x2 grid for times and stations */}
                  <div className="grid grid-cols-[auto_1fr] md:grid-cols-[134px_1fr] text-foreground flex-1 min-w-0">
                    {/* Departure time + path connector */}
                    <div className="flex items-center gap-1.5 pr-1.5 flex-none">
                      <div className="text-[17px] md:text-[20px] leading-none flex items-baseline font-bold text-slate-900 dark:text-white">
                        <span className="whitespace-nowrap font-mono">{departureParsed.time}</span>
                        <span className="whitespace-nowrap pl-1 text-[13px] md:text-[16px] font-bold">{departureParsed.ampm}</span>
                      </div>
                      
                      {/* Path line icons */}
                      <div className="flex items-center justify-center flex-none">
                        <img 
                          className="md:hidden w-[22px] h-[5px] opacity-80 brightness-[0.3] dark:brightness-100 dark:invert object-fill" 
                          src="https://ak-d.tripcdn.com/images/1op4d12000dxd9xgx2479.webp" 
                          alt="" 
                        />
                        <img 
                          className="hidden md:block w-20 h-6 opacity-40 dark:invert" 
                          src="https://ak-d.tripcdn.com/images/1op1v12000e0dofvsD8DE.webp" 
                          alt="" 
                        />
                      </div>
                    </div>
                    
                    {/* Arrival time */}
                    <div className="text-[17px] md:text-[20px] leading-none pl-1.5 flex items-baseline font-bold text-slate-900 dark:text-white">
                      <span className="whitespace-nowrap font-mono">{arrivalParsed?.time ?? '--:--'}</span>
                      <span className="whitespace-nowrap pl-1 text-[13px] md:text-[16px] font-bold">{arrivalParsed?.ampm ?? ''}</span>
                      {daysCrossed > 0 && (
                        <small className="text-[11px] text-[#ff5b00] font-bold pl-0.5 align-top">+{daysCrossed}</small>
                      )}
                    </div>
                    
                    {/* Origin station */}
                    <div className="max-w-[90px] md:max-w-[80px] w-full pr-2">
                      <p className="text-[11px] md:text-xs font-normal text-muted-foreground/80 leading-normal mt-1 md:mt-2" title={originStation}>
                        {originStation}
                      </p>
                    </div>
                    
                    {/* Destination station */}
                    <div className="max-w-[90px] md:max-w-[80px] w-full">
                      <p className="text-[11px] md:text-xs font-normal text-muted-foreground/80 leading-normal mt-1 md:mt-2" title={destinationStation}>
                        {destinationStation}
                      </p>
                    </div>
                  </div>
                  
                  {/* Desktop Duration + Amenities */}
                  <div className="hidden md:flex flex-col text-center justify-center md:ml-[30px] lg:ml-[60px] xl:ml-[72px]">
                    <div className="flex text-xs text-foreground font-medium">
                      <div className="border-b border-dashed border-muted-foreground/45 pb-0.5 hover:text-primary hover:border-primary transition-colors">
                        {formattedDuration}, {directLabel}
                      </div>
                    </div>
                    
                    {/* Amenities on desktop */}
                    {displayedAmenities.length > 0 && (
                      <div className="flex items-center mt-3 gap-1.5 text-muted-foreground">
                        {displayedAmenities.map((amenity) => {
                          const Icon = busAmenityIcon(amenity);
                          return (
                            <Icon
                              key={amenity}
                              className="h-3.5 w-3.5"
                              aria-label={busAmenityLabel(amenityLabels, amenity)}
                            />
                          );
                        })}
                        {remainingAmenitiesCount > 0 && (
                          <span className="text-[10px] font-bold">
                            +{remainingAmenitiesCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Price block */}
                <div className="flex justify-end flex-none ml-4 self-start">
                  <div className="text-right">
                    <div className="text-[17px] md:text-[20px] font-semibold text-slate-900 dark:text-white font-mono leading-none">
                      {formattedPrice}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 hidden md:block">
                      {perSeatLabel}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Mobile View Carrier Row & Footer */}
              <div className="pt-[32px] md:hidden mx-[12px]">
                <div className="flex flex-col gap-2 pb-[12px]">
                  {/* Carrier info */}
                  <div className="flex items-center">
                    {trip.route.office.logoUrl ? (
                      <img
                        className="h-[14px] w-auto max-w-[80px] object-contain dark:invert"
                        src={trip.route.office.logoUrl}
                        alt={officeName}
                      />
                    ) : (
                      <span className="text-[11px] font-semibold text-foreground">{officeName}</span>
                    )}
                  </div>
                  
                  {/* Amenities */}
                  {displayedAmenities.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground self-end">
                      {displayedAmenities.slice(0, 2).map((amenity) => {
                        const Icon = busAmenityIcon(amenity);
                        return (
                          <Icon
                            key={amenity}
                            className="h-4 w-4"
                            aria-label={busAmenityLabel(amenityLabels, amenity)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
                
                {/* Divider line and duration/stops */}
                <div className="flex justify-between pt-[14px] pb-[4px] items-center relative border-t border-solid border-border/40 text-[11px] font-medium font-sans">
                  <div className="flex items-center relative z-10">
                    <span className="text-[11px] leading-normal text-slate-800 dark:text-slate-200">
                      {formattedDuration}, {directLabel}
                    </span>
                  </div>
                  <div className="flex items-center relative z-10 text-slate-800 dark:text-slate-200 hover:underline">
                    <span className="text-[11px] leading-normal">
                      {viewStopsLabel}
                    </span>
                    <ChevronRight className="ms-1 h-3 w-3 opacity-70 rtl:rotate-180" />
                  </div>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
});
