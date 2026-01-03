'use client';

import { memo, useMemo, useCallback } from 'react';
import { Clock, MapPin, Users, Wifi, Wind, Armchair } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';

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

// Memoized amenity icons - defined outside component to prevent recreation
const amenityIcons: Record<BusAmenity, React.ReactNode> = {
  AirConditioning: <Wind className="h-4 w-4" />,
  WiFi: <Wifi className="h-4 w-4" />,
  USB: <span className="text-xs font-bold">USB</span>,
  LegRoom: <Armchair className="h-4 w-4" />,
  Toilet: <span className="text-xs">WC</span>,
  Refreshments: <span className="text-xs">🥤</span>,
  Entertainment: <span className="text-xs">🎬</span>,
  Luggage: <span className="text-xs">🧳</span>,
  Reclining: <span className="text-xs">💺</span>,
};

// Memoized amenity label formatter
const formatAmenityLabel = (amenity: BusAmenity): string => {
  return amenity.replace(/([A-Z])/g, ' $1').trim();
};

// Memoized AmenityBadge component
const AmenityBadge = memo(function AmenityBadge({ amenity }: { amenity: BusAmenity }) {
  return (
    <Badge variant="outline" className="text-xs gap-1">
      {amenityIcons[amenity]}
      <span className="hidden sm:inline">{formatAmenityLabel(amenity)}</span>
    </Badge>
  );
});

export const TripCard = memo(function TripCard({
  trip,
  lang = 'en',
  dictionary = {
    selectSeats: 'Select Seats',
    seatsAvailable: 'seats available',
    duration: 'Duration',
    verified: 'Verified',
  },
}: TripCardProps) {
  // Memoize formatDuration function
  const formatDuration = useCallback((minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }, []);

  // Memoize displayed amenities
  const displayedAmenities = useMemo(() => {
    return trip.bus.amenities.slice(0, 5);
  }, [trip.bus.amenities]);

  // Memoize remaining amenities count
  const remainingAmenitiesCount = useMemo(() => {
    return trip.bus.amenities.length > 5 ? trip.bus.amenities.length - 5 : 0;
  }, [trip.bus.amenities.length]);

  // Memoize formatted duration
  const formattedDuration = useMemo(() => {
    return formatDuration(trip.route.duration);
  }, [trip.route.duration, formatDuration]);

  // Memoize formatted price
  const formattedPrice = useMemo(() => {
    return trip.price.toLocaleString();
  }, [trip.price]);

  // Memoize seats warning class
  const seatsClassName = useMemo(() => {
    return trip.availableSeats < 10
      ? 'text-amber-600 font-medium'
      : 'text-muted-foreground';
  }, [trip.availableSeats]);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg">
              {trip.route.office.name}
            </span>
            {trip.route.office.isVerified && (
              <Badge variant="secondary" className="text-xs">
                ✓ {dictionary.verified}
              </Badge>
            )}
          </div>
          {trip.route.office.rating && (
            <div className="flex items-center gap-1 text-sm">
              <span className="text-yellow-500">★</span>
              <span>{trip.route.office.rating.toFixed(1)}</span>
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
            <p className="text-2xl font-bold">{trip.departureTime}</p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{trip.route.origin.city}</span>
            </div>
          </div>

          {/* Duration */}
          <div className="flex-1 px-4">
            <div className="relative">
              <div className="border-t border-dashed border-muted-foreground/30" />
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background px-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formattedDuration}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Arrival */}
          <div className="text-center">
            <p className="text-2xl font-bold">
              {trip.arrivalTime || '--:--'}
            </p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{trip.route.destination.city}</span>
            </div>
          </div>
        </div>

        {/* Amenities */}
        {displayedAmenities.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {displayedAmenities.map((amenity) => (
              <AmenityBadge key={amenity} amenity={amenity} />
            ))}
            {remainingAmenitiesCount > 0 && (
              <Badge variant="outline" className="text-xs">
                +{remainingAmenitiesCount}
              </Badge>
            )}
          </div>
        )}

        {/* Available Seats */}
        <div className="flex items-center gap-1 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className={seatsClassName}>
            {trip.availableSeats} {dictionary.seatsAvailable}
          </span>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-3 border-t">
        <div>
          <p className="text-2xl font-bold">
            {formattedPrice} <span className="text-sm">SDG</span>
          </p>
          <p className="text-xs text-muted-foreground">per seat</p>
        </div>
        <Link href={`/${lang}/transport/trips/${trip.id}`}>
          <Button>{dictionary.selectSeats}</Button>
        </Link>
      </CardFooter>
    </Card>
  );
});
