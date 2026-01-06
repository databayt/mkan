'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  Ticket,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Header from '@/components/Header';
import Loading from '@/components/Loading';
import { getAuthUser } from '@/lib/actions/user-actions';
import {
  getMyTransportOffices,
  getOfficeBookings,
  updateBookingStatus,
} from '@/lib/actions/transport-actions';

interface Booking {
  id: number;
  bookingReference: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string | null;
  totalAmount: number;
  status: 'Pending' | 'Confirmed' | 'Cancelled' | 'Completed' | 'NoShow';
  bookedAt: Date;
  trip: {
    departureDate: Date;
    departureTime: string;
    route: {
      origin: { name: string; city: string };
      destination: { name: string; city: string };
    };
  };
  seats: Array<{ seatNumber: string }>;
}

const statusColors: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Confirmed: 'bg-green-100 text-green-800',
  Cancelled: 'bg-red-100 text-red-800',
  Completed: 'bg-blue-100 text-blue-800',
  NoShow: 'bg-gray-100 text-gray-800',
};

const BookingsPage = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const user = await getAuthUser();

        if (user?.id) {
          const myOffices = await getMyTransportOffices();
          setOffices(myOffices);

          const firstOffice = myOffices[0];
          if (firstOffice) {
            setSelectedOfficeId(firstOffice.id);
            const response = await getOfficeBookings(firstOffice.id);
            const officeBookings = response.bookings as unknown as Booking[];
            setBookings(officeBookings);
            setFilteredBookings(officeBookings);
          }
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Error loading bookings');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    let filtered = bookings;

    if (searchQuery) {
      filtered = filtered.filter(
        (b) =>
          b.bookingReference.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.passengerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.passengerPhone.includes(searchQuery)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((b) => b.status === statusFilter);
    }

    setFilteredBookings(filtered);
  }, [searchQuery, statusFilter, bookings]);

  const handleOfficeChange = async (officeId: number) => {
    setSelectedOfficeId(officeId);
    try {
      const response = await getOfficeBookings(officeId);
      const officeBookings = response.bookings as unknown as Booking[];
      setBookings(officeBookings);
      setFilteredBookings(officeBookings);
    } catch (err) {
      console.error('Error loading bookings:', err);
    }
  };

  const handleStatusChange = async (bookingId: number, newStatus: string) => {
    try {
      await updateBookingStatus(bookingId, newStatus as any);
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId ? { ...b, status: newStatus as any } : b
        )
      );
      setSelectedBooking(null);
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  if (isLoading) return <Loading />;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <div className="dashboard-container">
      <Header title="Bookings" subtitle="Manage passenger bookings" />

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

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by reference, name, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Confirmed">Confirmed</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
            <SelectItem value="NoShow">No Show</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredBookings.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Passenger</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookings.map((booking) => (
                <TableRow
                  key={booking.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedBooking(booking)}
                >
                  <TableCell className="font-mono font-medium">
                    {booking.bookingReference}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{booking.passengerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {booking.passengerPhone}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <span>{booking.trip.route.origin.city}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{booking.trip.route.destination.city}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{booking.trip.departureTime}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(booking.trip.departureDate), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {booking.seats.map((s) => s.seatNumber).join(', ')}
                  </TableCell>
                  <TableCell className="font-medium">
                    {booking.totalAmount.toLocaleString()} SDG
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[booking.status]}>
                      {booking.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-16 border rounded-lg">
          <Ticket className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No bookings found</p>
        </div>
      )}

      <Dialog
        open={!!selectedBooking}
        onOpenChange={() => setSelectedBooking(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Booking Details</DialogTitle>
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Reference</p>
                <p className="text-xl font-mono font-bold">
                  {selectedBooking.bookingReference}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Passenger</p>
                    <p className="font-medium">{selectedBooking.passengerName}</p>
                    <p className="text-sm">{selectedBooking.passengerPhone}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Route</p>
                    <p className="font-medium">
                      {selectedBooking.trip.route.origin.city} →{' '}
                      {selectedBooking.trip.route.destination.city}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Departure</p>
                    <p className="font-medium">
                      {selectedBooking.trip.departureTime} •{' '}
                      {format(
                        new Date(selectedBooking.trip.departureDate),
                        'EEEE, MMMM d, yyyy'
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Seats: {selectedBooking.seats.map((s) => s.seatNumber).join(', ')}
                    </p>
                    <p className="font-bold">
                      {selectedBooking.totalAmount.toLocaleString()} SDG
                    </p>
                  </div>
                  <Badge className={statusColors[selectedBooking.status]}>
                    {selectedBooking.status}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                {selectedBooking.status === 'Pending' && (
                  <>
                    <Button
                      className="flex-1"
                      onClick={() =>
                        handleStatusChange(selectedBooking.id, 'Confirmed')
                      }
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Confirm
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleStatusChange(selectedBooking.id, 'Cancelled')
                      }
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </>
                )}
                {selectedBooking.status === 'Confirmed' && (
                  <>
                    <Button
                      className="flex-1"
                      onClick={() =>
                        handleStatusChange(selectedBooking.id, 'Completed')
                      }
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark Complete
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleStatusChange(selectedBooking.id, 'NoShow')
                      }
                    >
                      No Show
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookingsPage;
