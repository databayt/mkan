'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  createBooking,
  processPayment,
  confirmBooking,
} from '@/lib/actions/transport-actions';
import type { PaymentMethod } from '@/lib/schemas/transport-schemas';

interface Trip {
  id: number;
  departureDate: Date;
  departureTime: string;
  arrivalTime: string | null;
  price: number;
  availableSeats: number;
  route: {
    origin: { name: string; city: string };
    destination: { name: string; city: string };
    duration: number;
    office: {
      id: number;
      name: string;
      assemblyPoint: { name: string; address: string };
    };
  };
  bus: {
    model: string | null;
    amenities: string[];
  };
}

interface PassengerInfo {
  name: string;
  phone: string;
  email?: string;
}

interface TransportBookingContextType {
  // Trip
  trip: Trip | null;
  setTrip: (trip: Trip | null) => void;

  // Seat Selection
  selectedSeats: string[];
  selectSeat: (seatNumber: string) => void;
  deselectSeat: (seatNumber: string) => void;
  clearSeats: () => void;

  // Passenger Info
  passengerInfo: PassengerInfo | null;
  setPassengerInfo: (info: PassengerInfo) => void;

  // Payment
  paymentMethod: PaymentMethod | null;
  setPaymentMethod: (method: PaymentMethod) => void;

  // Booking
  bookingId: number | null;
  bookingReference: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  createBookingAndPay: () => Promise<{ success: boolean; bookingId?: number }>;
  reset: () => void;

  // Computed
  totalAmount: number;
}

const TransportBookingContext =
  createContext<TransportBookingContextType | null>(null);

export function TransportBookingProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengerInfo, setPassengerInfo] = useState<PassengerInfo | null>(
    null
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null
  );
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [bookingReference, setBookingReference] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectSeat = useCallback((seatNumber: string) => {
    setSelectedSeats((prev) => {
      if (prev.includes(seatNumber)) return prev;
      if (prev.length >= 5) return prev; // Max 5 seats
      return [...prev, seatNumber];
    });
  }, []);

  const deselectSeat = useCallback((seatNumber: string) => {
    setSelectedSeats((prev) => prev.filter((s) => s !== seatNumber));
  }, []);

  const clearSeats = useCallback(() => {
    setSelectedSeats([]);
  }, []);

  const totalAmount = trip ? trip.price * selectedSeats.length : 0;

  const createBookingAndPay = useCallback(async () => {
    if (!trip || selectedSeats.length === 0 || !passengerInfo || !paymentMethod) {
      setError('Missing booking information');
      return { success: false };
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create booking
      const bookingResult = await createBooking({
        tripId: trip.id,
        seatNumbers: selectedSeats,
        passengerName: passengerInfo.name,
        passengerPhone: passengerInfo.phone,
        passengerEmail: passengerInfo.email,
      });

      if (!bookingResult.success || !bookingResult.booking) {
        throw new Error('Failed to create booking');
      }

      setBookingId(bookingResult.booking.id);
      setBookingReference(bookingResult.booking.bookingReference);

      // Process payment
      const paymentResult = await processPayment(bookingResult.booking.id, {
        method: paymentMethod,
      });

      if (!paymentResult.success) {
        throw new Error('Payment failed');
      }

      // Confirm booking if payment was successful (not cash on arrival)
      if (paymentMethod !== 'CashOnArrival') {
        await confirmBooking(bookingResult.booking.id);
      }

      return { success: true, bookingId: bookingResult.booking.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Booking failed';
      setError(message);
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  }, [trip, selectedSeats, passengerInfo, paymentMethod]);

  const reset = useCallback(() => {
    setTrip(null);
    setSelectedSeats([]);
    setPassengerInfo(null);
    setPaymentMethod(null);
    setBookingId(null);
    setBookingReference(null);
    setError(null);
  }, []);

  return (
    <TransportBookingContext.Provider
      value={{
        trip,
        setTrip,
        selectedSeats,
        selectSeat,
        deselectSeat,
        clearSeats,
        passengerInfo,
        setPassengerInfo,
        paymentMethod,
        setPaymentMethod,
        bookingId,
        bookingReference,
        isLoading,
        error,
        createBookingAndPay,
        reset,
        totalAmount,
      }}
    >
      {children}
    </TransportBookingContext.Provider>
  );
}

export function useTransportBooking() {
  const context = useContext(TransportBookingContext);
  if (!context) {
    throw new Error(
      'useTransportBooking must be used within TransportBookingProvider'
    );
  }
  return context;
}
