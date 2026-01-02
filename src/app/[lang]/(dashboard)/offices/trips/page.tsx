'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import {
  Calendar,
  Plus,
  Bus,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Header from '@/components/Header';
import Loading from '@/components/Loading';
import { getAuthUser } from '@/lib/actions/user-actions';
import {
  getMyTransportOffices,
  getTripsByOffice,
  getRoutesByOffice,
  getBusesByOffice,
  createTrip,
  deleteTrip,
} from '@/lib/actions/transport-actions';

interface Trip {
  id: number;
  departureDate: Date;
  departureTime: string;
  arrivalTime: string | null;
  price: number;
  availableSeats: number;
  isCancelled: boolean;
  route: {
    origin: { name: string; city: string };
    destination: { name: string; city: string };
    duration: number;
  };
  bus: {
    plateNumber: string;
    model: string | null;
    capacity: number;
  };
  _count?: {
    bookings: number;
  };
}

interface RouteData {
  id: number;
  basePrice: number;
  duration: number;
  origin: { name: string; city: string };
  destination: { name: string; city: string };
}

interface BusData {
  id: number;
  plateNumber: string;
  model: string | null;
  capacity: number;
}

const TripsPage = () => {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [buses, setBuses] = useState<BusData[]>([]);
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [newTrip, setNewTrip] = useState({
    routeId: '',
    busId: '',
    departureDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    departureTime: '05:00',
    price: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const user = await getAuthUser();

        if (user?.id) {
          const myOffices = await getMyTransportOffices();
          setOffices(myOffices);

          if (myOffices.length > 0) {
            const firstOffice = myOffices[0];
            setSelectedOfficeId(firstOffice.id);
            await loadOfficeData(firstOffice.id);
          }
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Error loading trips');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const loadOfficeData = async (officeId: number) => {
    const [officeTrips, officeRoutes, officeBuses] = await Promise.all([
      getTripsByOffice(officeId),
      getRoutesByOffice(officeId),
      getBusesByOffice(officeId),
    ]);
    setTrips(officeTrips as Trip[]);
    setRoutes(officeRoutes as RouteData[]);
    setBuses(officeBuses as BusData[]);
  };

  const handleOfficeChange = async (officeId: number) => {
    setSelectedOfficeId(officeId);
    try {
      await loadOfficeData(officeId);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  const handleDateChange = (days: number) => {
    setSelectedDate((prev) => addDays(prev, days));
  };

  const filteredTrips = trips.filter((trip) =>
    isSameDay(new Date(trip.departureDate), selectedDate)
  );

  const calculateArrivalTime = (
    departureTime: string,
    durationMinutes: number
  ) => {
    const [hours, minutes] = departureTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const arrivalHours = Math.floor(totalMinutes / 60) % 24;
    const arrivalMins = totalMinutes % 60;
    return `${arrivalHours.toString().padStart(2, '0')}:${arrivalMins
      .toString()
      .padStart(2, '0')}`;
  };

  const handleCreateTrip = async () => {
    if (!selectedOfficeId) return;

    const route = routes.find((r) => r.id === parseInt(newTrip.routeId));
    const bus = buses.find((b) => b.id === parseInt(newTrip.busId));
    if (!route || !bus) return;

    try {
      const tripData = {
        routeId: parseInt(newTrip.routeId),
        busId: parseInt(newTrip.busId),
        departureDate: new Date(newTrip.departureDate),
        departureTime: newTrip.departureTime,
        arrivalTime: calculateArrivalTime(newTrip.departureTime, route.duration),
        price: newTrip.price || route.basePrice,
        availableSeats: bus.capacity,
      };

      const created = await createTrip(tripData);
      if (created) {
        setTrips((prev) => [...prev, created as Trip]);
      }

      setIsDialogOpen(false);
      setNewTrip({
        routeId: '',
        busId: '',
        departureDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
        departureTime: '05:00',
        price: 0,
      });
    } catch (err) {
      console.error('Error creating trip:', err);
    }
  };

  const handleDeleteTrip = async (tripId: number) => {
    try {
      await deleteTrip(tripId);
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
    } catch (err) {
      console.error('Error deleting trip:', err);
    }
  };

  if (isLoading) return <Loading />;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(selectedDate, i - 3));

  return (
    <div className="dashboard-container">
      <Header title="Trip Schedule" subtitle="Manage your trip schedule" />

      {offices.length > 1 && (
        <div className="mb-6 flex gap-2 flex-wrap">
          {offices.map((office) => (
            <Button
              key={office.id}
              variant={selectedOfficeId === office.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleOfficeChange(office.id)}
            >
              {office.name}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => handleDateChange(-7)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex gap-1">
            {weekDays.map((date) => (
              <Button
                key={date.toISOString()}
                variant={isSameDay(date, selectedDate) ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDate(date)}
                className="min-w-[60px]"
              >
                <div className="text-center">
                  <div className="text-xs">{format(date, 'EEE')}</div>
                  <div className="font-bold">{format(date, 'd')}</div>
                </div>
              </Button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => handleDateChange(7)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Trip
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Trip</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Route</Label>
                <Select
                  value={newTrip.routeId}
                  onValueChange={(value) => {
                    const route = routes.find((r) => r.id === parseInt(value));
                    setNewTrip((prev) => ({
                      ...prev,
                      routeId: value,
                      price: route?.basePrice || 0,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent>
                    {routes.map((route) => (
                      <SelectItem key={route.id} value={route.id.toString()}>
                        {route.origin.city} → {route.destination.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Bus</Label>
                <Select
                  value={newTrip.busId}
                  onValueChange={(value) =>
                    setNewTrip((prev) => ({ ...prev, busId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bus" />
                  </SelectTrigger>
                  <SelectContent>
                    {buses.map((bus) => (
                      <SelectItem key={bus.id} value={bus.id.toString()}>
                        {bus.plateNumber} ({bus.capacity} seats)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={newTrip.departureDate}
                    onChange={(e) =>
                      setNewTrip((prev) => ({
                        ...prev,
                        departureDate: e.target.value,
                      }))
                    }
                    min={format(new Date(), 'yyyy-MM-dd')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input
                    type="time"
                    value={newTrip.departureTime}
                    onChange={(e) =>
                      setNewTrip((prev) => ({
                        ...prev,
                        departureTime: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Price (SDG)</Label>
                <Input
                  type="number"
                  value={newTrip.price}
                  onChange={(e) =>
                    setNewTrip((prev) => ({
                      ...prev,
                      price: parseInt(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateTrip}
                  className="flex-1"
                  disabled={!newTrip.routeId || !newTrip.busId}
                >
                  Add Trip
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          {format(selectedDate, 'EEEE, MMMM d, yyyy')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {filteredTrips.length} trip{filteredTrips.length !== 1 ? 's' : ''} scheduled
        </p>
      </div>

      {filteredTrips.length > 0 ? (
        <div className="space-y-4">
          {filteredTrips
            .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
            .map((trip) => (
              <div
                key={trip.id}
                className={`p-4 rounded-lg border ${
                  trip.isCancelled ? 'bg-muted/50 opacity-60' : 'bg-background'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-bold text-lg">
                          {trip.departureTime}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-muted-foreground">
                          {trip.arrivalTime || '--:--'}
                        </span>
                      </div>
                      {trip.isCancelled && (
                        <Badge variant="destructive">Cancelled</Badge>
                      )}
                    </div>

                    <p className="font-medium">
                      {trip.route.origin.city} → {trip.route.destination.city}
                    </p>

                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Bus className="h-4 w-4" />
                        {trip.bus.plateNumber}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {trip.availableSeats}/{trip.bus.capacity} available
                      </span>
                      <span className="font-medium text-primary">
                        {trip.price.toLocaleString()} SDG
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {trip._count && trip._count.bookings > 0 && (
                      <Badge variant="secondary">
                        {trip._count.bookings} booking
                        {trip._count.bookings !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteTrip(trip.id)}
                      disabled={trip._count && trip._count.bookings > 0}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="text-center py-16 border rounded-lg">
          <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No trips scheduled for this day</p>
          <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Trip
          </Button>
        </div>
      )}
    </div>
  );
};

export default TripsPage;
