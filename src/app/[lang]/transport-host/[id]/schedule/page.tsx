'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Calendar, Plus, Trash2, Clock, Bus as BusIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTransportHostValidation } from '@/context/onboarding-validation-context';
import { useTransportOffice } from '@/context/transport-office-context';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import {
  createTrip,
  deleteTrip,
  getTripsByOffice,
  getRoutesByOffice,
  getBusesByOffice,
} from '@/lib/actions/transport-actions';
import { format, addDays } from 'date-fns';
import HostStepLayout from '@/components/host/host-step-layout';

const tripSchema = z.object({
  routeId: z.number().min(1, 'Route is required'),
  busId: z.number().min(1, 'Bus is required'),
  departureDate: z.string().min(1, 'Date is required'),
  departureTime: z.string().min(1, 'Time is required'),
  price: z.number().min(1, 'Price is required'),
});

type TripFormData = z.infer<typeof tripSchema>;

type RouteData = Awaited<ReturnType<typeof getRoutesByOffice>>[number];
type BusData = Awaited<ReturnType<typeof getBusesByOffice>>[number];
type TripData = Awaited<ReturnType<typeof getTripsByOffice>>[number];

const SchedulePage = () => {
  const { enableNext } = useTransportHostValidation();
  const { office } = useTransportOffice();
  const dict = useDictionary();
  const t = dict.transport.host;
  const [trips, setTrips] = useState<TripData[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [buses, setBuses] = useState<BusData[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TripFormData>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      departureTime: '05:00',
      departureDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    },
  });

  const selectedRouteId = watch('routeId');
  const selectedRoute = routes.find((r) => r.id === selectedRouteId);

  useEffect(() => {
    async function loadData() {
      if (!office?.id) return;
      try {
        const [officeRoutes, officeBuses, officeTrips] = await Promise.all([
          getRoutesByOffice(office.id),
          getBusesByOffice(office.id),
          getTripsByOffice(office.id),
        ]);
        setRoutes(officeRoutes);
        setBuses(officeBuses);
        setTrips(officeTrips);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [office?.id]);

  useEffect(() => {
    enableNext();
  }, [enableNext]);

  useEffect(() => {
    if (selectedRoute) {
      setValue('price', selectedRoute.basePrice);
    }
  }, [selectedRoute, setValue]);

  const calculateArrivalTime = (departureTime: string, durationMinutes: number) => {
    const parts = departureTime.split(':').map(Number);
    const hours = parts[0] ?? 0;
    const minutes = parts[1] ?? 0;
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const arrivalHours = Math.floor(totalMinutes / 60) % 24;
    const arrivalMins = totalMinutes % 60;
    return `${arrivalHours.toString().padStart(2, '0')}:${arrivalMins.toString().padStart(2, '0')}`;
  };

  const onSubmit = async (data: TripFormData) => {
    if (!office?.id) return;

    const route = routes.find((r) => r.id === data.routeId);
    const bus = buses.find((b) => b.id === data.busId);
    if (!route || !bus) return;

    try {
      const tripData = {
        routeId: data.routeId,
        busId: data.busId,
        departureDate: new Date(data.departureDate),
        departureTime: data.departureTime,
        arrivalTime: calculateArrivalTime(data.departureTime, route.duration),
        price: data.price,
        availableSeats: bus.capacity,
      };

      const created = (await createTrip(tripData)) as TripData | null;
      if (created) {
        setTrips((prev) => [...prev, created]);
      }

      setIsDialogOpen(false);
      reset({
        departureTime: '05:00',
        departureDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      });
    } catch (error) {
      console.error('Error creating trip:', error);
    }
  };

  const handleDelete = async (tripId: number) => {
    try {
      await deleteTrip(tripId);
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
    } catch (error) {
      console.error('Error deleting trip:', error);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    reset({
      departureTime: '05:00',
      departureDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    });
  };

  const groupedTrips = trips.reduce((acc, trip) => {
    const dateKey = format(new Date(trip.departureDate), 'yyyy-MM-dd');
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(trip);
    return acc;
  }, {} as Record<string, TripData[]>);

  return (
    <HostStepLayout
      title={<h3>{t.setupSchedule}</h3>}
      subtitle={
        <div className="space-y-4">
          <p className="text-sm sm:text-base text-muted-foreground">
            {t.scheduleDescription}
          </p>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Tip:</strong> {t.scheduleTip}
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
          {routes.length === 0 || buses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                {routes.length === 0
                  ? t.addRoutesFirst
                  : t.addBusesFirst}
              </p>
            </div>
          ) : (
            <>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" onClick={() => handleDialogClose()}>
                    <Plus className="h-4 w-4 me-2" />
                    {t.addTrip}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{t.addNewTrip}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t.route} *</Label>
                      <Select
                        value={selectedRouteId?.toString()}
                        onValueChange={(value) =>
                          setValue('routeId', parseInt(value))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t.selectRoute} />
                        </SelectTrigger>
                        <SelectContent>
                          {routes.map((route) => (
                            <SelectItem
                              key={route.id}
                              value={route.id.toString()}
                            >
                              {route.origin.city} → {route.destination.city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.routeId && (
                        <p className="text-sm text-destructive">
                          {errors.routeId.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>{t.bus} *</Label>
                      <Select
                        onValueChange={(value) =>
                          setValue('busId', parseInt(value))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t.selectBus} />
                        </SelectTrigger>
                        <SelectContent>
                          {buses.map((bus) => (
                            <SelectItem key={bus.id} value={bus.id.toString()}>
                              {bus.plateNumber}
                              {bus.model && ` - ${bus.model}`} ({bus.capacity}{' '}
                              seats)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.busId && (
                        <p className="text-sm text-destructive">
                          {errors.busId.message}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="departureDate">{t.date} *</Label>
                        <Input
                          id="departureDate"
                          type="date"
                          {...register('departureDate')}
                          min={format(new Date(), 'yyyy-MM-dd')}
                        />
                        {errors.departureDate && (
                          <p className="text-sm text-destructive">
                            {errors.departureDate.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="departureTime">{t.time} *</Label>
                        <Input
                          id="departureTime"
                          type="time"
                          {...register('departureTime')}
                        />
                        {errors.departureTime && (
                          <p className="text-sm text-destructive">
                            {errors.departureTime.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="price">{t.priceSDG} *</Label>
                      <Input
                        id="price"
                        type="number"
                        {...register('price', { valueAsNumber: true })}
                        placeholder="e.g., 3500"
                      />
                      {errors.price && (
                        <p className="text-sm text-destructive">
                          {errors.price.message}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleDialogClose}
                        className="flex-1"
                      >
                        {dict.common.cancel}
                      </Button>
                      <Button type="submit" className="flex-1">
                        {t.addTrip}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-24 bg-muted animate-pulse rounded-lg"
                    />
                  ))}
                </div>
              ) : Object.keys(groupedTrips).length > 0 ? (
                <div className="space-y-6">
                  {Object.entries(groupedTrips)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, dateTrips]) => (
                      <div key={date}>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">
                          {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                        </h3>
                        <div className="space-y-3">
                          {dateTrips.map((trip) => (
                            <div
                              key={trip.id}
                              className="p-4 rounded-lg border bg-background"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">
                                      {trip.departureTime}
                                    </span>
                                    <span className="text-muted-foreground">
                                      →
                                    </span>
                                    <span className="text-muted-foreground">
                                      {trip.arrivalTime || '--:--'}
                                    </span>
                                  </div>
                                  <p className="text-sm mt-1">
                                    {trip.route.origin.city} →{' '}
                                    {trip.route.destination.city}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="outline" className="text-xs">
                                      <BusIcon className="h-3 w-3 me-1" />
                                      {trip.bus.plateNumber}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                      {trip.availableSeats} {t.seats}
                                    </Badge>
                                    <span className="text-sm font-medium text-primary">
                                      {trip.price.toLocaleString()} SDG
                                    </span>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(trip.id)}
                                  aria-label="Delete trip"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t.noTripsYet}</p>
                  <p className="text-sm mt-1">
                    {t.addTripsLater}
                  </p>
                </div>
              )}
            </>
          )}
      </div>
    </HostStepLayout>
  );
};

export default SchedulePage;
