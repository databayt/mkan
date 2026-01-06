// Stub utilities for unused row components

export function formatRangeDate(startDate: Date | null, endDate: Date | null): string {
  if (!startDate || !endDate) return '';
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = startDate.toLocaleDateString('en-US', options);
  const end = endDate.toLocaleDateString('en-US', options);
  return `${start} - ${end}`;
}

interface GuestsState {
  adults: number;
  children: number;
  infants: number;
  pets: number;
}

export function formatGuests(guests: GuestsState | number): string {
  if (typeof guests === 'number') {
    if (guests <= 0) return '';
    return guests === 1 ? '1 guest' : `${guests} guests`;
  }
  const total = guests.adults + guests.children;
  if (total <= 0) return '';
  let result = total === 1 ? '1 guest' : `${total} guests`;
  if (guests.infants > 0) {
    result += `, ${guests.infants} infant${guests.infants > 1 ? 's' : ''}`;
  }
  if (guests.pets > 0) {
    result += `, ${guests.pets} pet${guests.pets > 1 ? 's' : ''}`;
  }
  return result;
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(price);
}
