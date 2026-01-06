'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { getTransportOffice, getOfficeTrips } from '@/lib/actions/transport-actions';
import { format, addDays } from 'date-fns';

interface OfficeDetails {
  id: number;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  logoUrl: string | null;
  phone: string;
  email: string;
  rating: number | null;
  reviewCount: number;
  isVerified: boolean;
  assemblyPoint: {
    name: string;
    city: string;
    address: string;
  } | null;
  buses: {
    id: number;
    plateNumber: string;
    model: string | null;
    capacity: number;
    amenities: string[];
  }[];
  routes: {
    id: number;
    basePrice: number;
    duration: number;
    origin: { name: string; city: string };
    destination: { name: string; city: string };
  }[];
}

interface Trip {
  id: number;
  departureDate: Date;
  departureTime: string;
  price: number;
  availableSeats: number;
  route: {
    origin: { city: string };
    destination: { city: string };
  };
}

export default function OfficeDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const officeId = Number(params.id);

  const [office, setOffice] = useState<OfficeDetails | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [officeData, tripsData] = await Promise.all([
          getTransportOffice(officeId),
          getOfficeTrips(officeId, new Date(), addDays(new Date(), 7)),
        ]);
        setOffice(officeData);
        setTrips(tripsData || []);
      } catch (error) {
        console.error('Failed to fetch office:', error);
      } finally {
        setLoading(false);
      }
    };

    if (officeId) {
      fetchData();
    }
  }, [officeId]);

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!office) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">Office not found</h1>
        <Button onClick={() => router.push('/transport/offices')} className="mt-4">
          Back to Offices
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Logo */}
            {office.logoUrl ? (
              <img
                src={office.logoUrl}
                alt={office.name}
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
                <h1 className="text-2xl font-bold">{office.name}</h1>
                {office.isVerified && (
                  <Badge className="gap-1 bg-blue-100 text-blue-800">
                    <CheckCircle className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
              </div>

              {office.rating !== null && office.rating > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  <span className="font-medium text-lg">{office.rating.toFixed(1)}</span>
                  <span className="text-muted-foreground">
                    ({office.reviewCount} reviews)
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {office.assemblyPoint && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {office.assemblyPoint.city} - {office.assemblyPoint.name}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {office.phone}
                </div>
                <div className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {office.email}
                </div>
              </div>

              {office.description && (
                <p className="mt-4 text-muted-foreground">{office.description}</p>
              )}
            </div>

            {/* Stats */}
            <div className="flex md:flex-col gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{office.buses.length}</div>
                <div className="text-sm text-muted-foreground">Buses</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{office.routes.length}</div>
                <div className="text-sm text-muted-foreground">Routes</div>
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
                Available Routes
              </CardTitle>
              <CardDescription>
                Routes operated by {office.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {office.routes.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No routes available
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
                          <div className="font-medium">{route.origin.city}</div>
                          <div className="text-xs text-muted-foreground">{route.origin.name}</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="text-center">
                          <div className="font-medium">{route.destination.city}</div>
                          <div className="text-xs text-muted-foreground">{route.destination.name}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary">
                          SDG {route.basePrice.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {route.duration} hours
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
                  Upcoming Trips
                </CardTitle>
                <CardDescription>Next 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {trips.slice(0, 5).map((trip) => (
                    <Link
                      key={trip.id}
                      href={`/transport/trips/${trip.id}`}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <div className="font-medium">
                          {trip.route.origin.city} → {trip.route.destination.city}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(trip.departureDate), 'EEE, MMM d')}
                          <Clock className="h-3 w-3 ml-2" />
                          {trip.departureTime}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">SDG {trip.price.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                          {trip.availableSeats} seats left
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
                Our Fleet
              </CardTitle>
            </CardHeader>
            <CardContent>
              {office.buses.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No buses listed
                </p>
              ) : (
                <div className="space-y-3">
                  {office.buses.map((bus) => (
                    <div key={bus.id} className="p-3 border rounded-lg">
                      <div className="font-medium">
                        {bus.model || 'Bus'} - {bus.plateNumber}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {bus.capacity} seats
                      </div>
                      {bus.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {bus.amenities.slice(0, 3).map((amenity) => (
                            <Badge key={amenity} variant="secondary" className="text-xs">
                              {amenity.replace(/([A-Z])/g, ' $1').trim()}
                            </Badge>
                          ))}
                          {bus.amenities.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{bus.amenities.length - 3}
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
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="font-medium">{office.assemblyPoint.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {office.assemblyPoint.address}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {office.assemblyPoint.city}
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
