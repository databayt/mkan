'use client';

import { memo, useMemo } from 'react';
import { Clock, MapPin, Users, BadgeCheck, Star } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { useLocale } from '@/components/internationalization/use-locale';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { formatCurrency, formatNumber } from '@/lib/i18n/formatters';
import { busAmenityIcon, busAmenityLabel } from '@/components/transport/amenity-icons';
import { cityLabel } from '@/components/transport/city-names';

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
      city: string;
    };
    destination: {
      name: string;
      city: string;
    };
    duration: number;
    office: {
      name: string;
      nameAr?: string | null;
      rating: number | null;
      isVerified: boolean;
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
  dictionary?: {
    selectSeats: string;
    seatsAvailable: string;
    duration: string;
    verified: string;
  };
}

const AmenityBadge = memo(function AmenityBadge({
  amenity,
  label,
}: {
  amenity: BusAmenity;
  label: string;
}) {
  const Icon = busAmenityIcon(amenity);
  return (
    <Badge variant="outline" className="text-xs gap-1 font-normal text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </Badge>
  );
});

export const TripCard = memo(function TripCard({
  trip,
  lang = 'ar',
  dictionary,
}: TripCardProps) {
  const { locale } = useLocale();
  const dict = useDictionary();
  const tt = dict?.transport?.trip;
  const amenityLabels = dict?.transport?.host?.amenityLabels as
    | Partial<Record<string, string>>
    | undefined;

  const labels = dictionary ?? {
    selectSeats: tt?.selectSeats ?? 'Select Seats',
    seatsAvailable: tt?.seatsAvailable ?? 'seats available',
    duration: tt?.duration ?? 'Duration',
    verified: dict?.transport?.office?.verified ?? 'Verified',
  };

  // "5h 30m" / "٥س ٣٠د" — localized digits + unit suffixes from the dictionary
  const formattedDuration = useMemo(() => {
    const hours = Math.floor(trip.route.duration / 60);
    const mins = trip.route.duration % 60;
    const h = `${formatNumber(hours, locale)}${tt?.hoursShort ?? 'h'}`;
    const m = `${formatNumber(mins, locale)}${tt?.minutesShort ?? 'm'}`;
    return mins > 0 ? `${h} ${m}` : h;
  }, [trip.route.duration, locale, tt?.hoursShort, tt?.minutesShort]);

  const displayedAmenities = useMemo(
    () => trip.bus.amenities.slice(0, 5),
    [trip.bus.amenities],
  );
  const remainingAmenitiesCount =
    trip.bus.amenities.length > 5 ? trip.bus.amenities.length - 5 : 0;

  const formattedPrice = useMemo(
    () => formatCurrency(trip.price, locale),
    [trip.price, locale],
  );

  const officeName =
    lang === 'ar' && trip.route.office.nameAr
      ? trip.route.office.nameAr
      : trip.route.office.name;

  const lowSeats = trip.availableSeats < 10;

  return (
    <Card className="transition-all duration-200 hover:shadow-lg hover:border-foreground/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-lg truncate">{officeName}</span>
            {trip.route.office.isVerified && (
              <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                <BadgeCheck className="h-3.5 w-3.5" />
                {labels.verified}
              </Badge>
            )}
          </div>
          {/* Rating renders only when a REAL rating exists — never a fabricated fallback */}
          {trip.route.office.rating != null && trip.route.office.rating > 0 && (
            <div className="flex items-center gap-1 text-sm shrink-0">
              <Star className="h-3.5 w-3.5 fill-current" />
              <span>
                {formatNumber(trip.route.office.rating, locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
            </div>
          )}
        </div>
        {trip.bus.model && (
          <p className="text-sm text-muted-foreground">{trip.bus.model}</p>
        )}
      </CardHeader>

      <CardContent className="pb-3">
        <div className="flex items-center justify-between mb-4">
          {/* Departure */}
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">{trip.departureTime}</p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{cityLabel(trip.route.origin.city, lang)}</span>
            </div>
          </div>

          {/* Duration — timeline label centered on the dashed line (RTL-safe centering) */}
          <div className="flex-1 px-4">
            <div className="relative">
              <div className="border-t border-dashed border-muted-foreground/30" />
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-card px-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                  <Clock className="h-3 w-3" />
                  <span>{formattedDuration}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Arrival */}
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">
              {trip.arrivalTime || '--:--'}
            </p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{cityLabel(trip.route.destination.city, lang)}</span>
            </div>
          </div>
        </div>

        {/* Amenities */}
        {displayedAmenities.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {displayedAmenities.map((amenity) => (
              <AmenityBadge
                key={amenity}
                amenity={amenity}
                label={busAmenityLabel(amenityLabels, amenity)}
              />
            ))}
            {remainingAmenitiesCount > 0 && (
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                +{formatNumber(remainingAmenitiesCount, locale)}
              </Badge>
            )}
          </div>
        )}

        {/* Available Seats */}
        <div className="flex items-center gap-1 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className={lowSeats ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
            {formatNumber(trip.availableSeats, locale)} {labels.seatsAvailable}
          </span>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-3 border-t">
        <div>
          <p className="text-2xl font-bold">{formattedPrice}</p>
          <p className="text-xs text-muted-foreground">{tt?.perSeat ?? 'per seat'}</p>
        </div>
        <Link href={`/${lang}/transport/trips/${trip.id}`}>
          <Button>{labels.selectSeats}</Button>
        </Link>
      </CardFooter>
    </Card>
  );
});
