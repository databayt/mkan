// Stub utilities for unused row components

export function formatCheckDate(date: Date | null | undefined): string {
  if (!date) return 'Add date';
  return date.toLocaleDateString();
}

export function formatRangeDate(startDate: Date | null | undefined, endDate: Date | null | undefined): string {
  if (!startDate || !endDate) return 'Add dates';
  return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
}

interface GuestsState {
  adults: number;
  children: number;
  infants: number;
  pets: number;
}

interface FormatGuestsOptions {
  noInfants?: boolean;
  noPets?: boolean;
}

export function formatGuests(
  guests: GuestsState | number | null | undefined,
  options?: FormatGuestsOptions
): string {
  if (!guests) return 'Add guests';
  if (typeof guests === 'number') {
    return `${guests} guest${guests > 1 ? 's' : ''}`;
  }
  const total = guests.adults + guests.children;
  if (total === 0) return 'Add guests';
  let result = `${total} guest${total > 1 ? 's' : ''}`;
  if (!options?.noInfants && guests.infants > 0) {
    result += `, ${guests.infants} infant${guests.infants > 1 ? 's' : ''}`;
  }
  if (!options?.noPets && guests.pets > 0) {
    result += `, ${guests.pets} pet${guests.pets > 1 ? 's' : ''}`;
  }
  return result;
}
