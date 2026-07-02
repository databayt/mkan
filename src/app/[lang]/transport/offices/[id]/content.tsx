// Server component — pure render of data fetched in page.tsx (mirror pattern).
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Phone,
  Mail,
  Star,
  Bus,
  Route,
  Clock,
  CheckCircle,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';

import type {
  getTransportOffice,
  getOfficeTrips,
} from '@/lib/actions/transport-actions';
import type { Dictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';
import { formatCurrency, formatNumber } from '@/lib/i18n/formatters';
import { busAmenityIcon, busAmenityLabel } from '@/components/transport/amenity-icons';
import { cityLabel } from '@/components/transport/city-names';

type OfficeDetails = Awaited<ReturnType<typeof getTransportOffice>>;
type Trips = Awaited<ReturnType<typeof getOfficeTrips>>;

interface OfficeContentProps {
  office: OfficeDetails | null;
  trips: Trips;
  lang: Locale;
  dictionary: Dictionary;
}

export function OfficeContent({ office, trips, lang, dictionary }: OfficeContentProps) {
  const t = dictionary.transport;
  const dateLocale = lang === 'ar' ? ar : enUS;
  const amenityLabels = t?.host?.amenityLabels as Partial<Record<string, string>> | undefined;

  if (!office) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">{t.office.notFound}</h1>
        <Button asChild className="mt-4">
          <Link href={`/${lang}/transport/offices`}>{t.office.backToOffices}</Link>
        </Button>
      </div>
    );
  }

  const officeName = lang === 'ar' && office.nameAr ? office.nameAr : office.name;
  const officeDescription =
    lang === 'ar' && office.descriptionAr ? office.descriptionAr : office.description;

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Logo */}
            {office.logoUrl ? (
              <Image
                src={office.logoUrl}
                alt={officeName}
                width={96}
                height={96}
                className="w-24 h-24 rounded-xl object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bus className="h-12 w-12 text-primary" />
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold">{officeName}</h1>
                {office.isVerified && (
                  <Badge className="gap-1 bg-blue-100 text-blue-800">
                    <CheckCircle className="h-3 w-3" />
                    {t.office.verified}
                  </Badge>
                )}
              </div>

              {office.rating !== null && office.rating > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  <span className="font-medium text-lg">
                    {formatNumber(office.rating, lang, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    ({formatNumber(office.reviewCount, lang)} {t.office.reviews})
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {office.assemblyPoint && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {cityLabel(office.assemblyPoint.city, lang)} -{' '}
                    {lang === 'ar' && office.assemblyPoint.nameAr
                      ? office.assemblyPoint.nameAr
                      : office.assemblyPoint.name}
                  </div>
                )}
                {office.phone && (
                  <a
                    href={`tel:${office.phone}`}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    dir="ltr"
                  >
                    <Phone className="h-4 w-4" />
                    {office.phone}
                  </a>
                )}
                {office.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {office.email}
                  </div>
                )}
              </div>

              {officeDescription && (
                <p className="mt-4 text-muted-foreground">{officeDescription}</p>
              )}

              {/* Contact-first CTA — Port Sudan phase-1 pattern (mirrors homes "Call host") */}
              {office.phone && (
                <Button asChild size="lg" className="mt-4">
                  <a href={`tel:${office.phone}`}>
                    <Phone className="h-4 w-4" />
                    {t.office.callOffice}
                  </a>
                </Button>
              )}
            </div>

            {/* Stats */}
            <div className="flex md:flex-col gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{formatNumber(office.buses.length, lang)}</div>
                <div className="text-sm text-muted-foreground">{t.office.buses}</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{formatNumber(office.routes.length, lang)}</div>
                <div className="text-sm text-muted-foreground">{t.office.routes}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Routes */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Route className="h-5 w-5" />
                {t.office.availableRoutes}
              </CardTitle>
              <CardDescription>
                {t.office.routesOperated} {officeName}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {office.routes.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {t.office.noRoutes}
                </p>
              ) : (
                <div className="space-y-4">
                  {office.routes.map((route) => (
                    <div
                      key={route.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="font-medium">{cityLabel(route.origin.city, lang)}</div>
                          <div className="text-xs text-muted-foreground">
                            {lang === 'ar' && route.origin.nameAr
                              ? route.origin.nameAr
                              : route.origin.name}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                        <div className="text-center">
                          <div className="font-medium">{cityLabel(route.destination.city, lang)}</div>
                          <div className="text-xs text-muted-foreground">
                            {lang === 'ar' && route.destination.nameAr
                              ? route.destination.nameAr
                              : route.destination.name}
                          </div>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="font-bold text-primary">
                          {formatCurrency(route.basePrice, lang)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatNumber(route.duration, lang)} {t.office.hours}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Trips */}
          {trips.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {t.office.upcomingTrips}
                </CardTitle>
                <CardDescription>{t.office.next7Days}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {trips.slice(0, 5).map((trip) => (
                    <Link
                      key={trip.id}
                      href={`/${lang}/transport/trips/${trip.id}`}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <div className="font-medium flex items-center gap-1.5">
                          <span>{cityLabel(trip.route.origin.city, lang)}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" />
                          <span>{cityLabel(trip.route.destination.city, lang)}</span>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(trip.departureDate), 'EEE, MMM d', { locale: dateLocale })}
                          <Clock className="h-3 w-3 ms-2" />
                          {trip.departureTime}
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="font-bold">{formatCurrency(trip.price, lang)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatNumber(trip.availableSeats, lang)} {t.office.seatsLeft}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          {/* Fleet */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bus className="h-5 w-5" />
                {t.office.ourFleet}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {office.buses.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  {t.office.noBuses}
                </p>
              ) : (
                <div className="space-y-3">
                  {office.buses.map((bus) => (
                    <div key={bus.id} className="p-3 border rounded-lg">
                      <div className="font-medium">
                        {bus.model || t.trip.bus} - {bus.plateNumber}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatNumber(bus.capacity, lang)} {t.office.seats}
                      </div>
                      {bus.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {bus.amenities.slice(0, 3).map((amenity) => {
                            const Icon = busAmenityIcon(amenity);
                            return (
                              <Badge key={amenity} variant="secondary" className="text-xs gap-1">
                                <Icon className="h-3 w-3" />
                                {busAmenityLabel(amenityLabels, amenity)}
                              </Badge>
                            );
                          })}
                          {bus.amenities.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{formatNumber(bus.amenities.length - 3, lang)}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Location */}
          {office.assemblyPoint && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {t.office.location}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="font-medium">
                    {lang === 'ar' && office.assemblyPoint.nameAr
                      ? office.assemblyPoint.nameAr
                      : office.assemblyPoint.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {office.assemblyPoint.address}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {cityLabel(office.assemblyPoint.city, lang)}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
