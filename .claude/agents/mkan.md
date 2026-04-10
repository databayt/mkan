---
name: mkan
description: Rental marketplace reference - property listings, booking system, search
model: opus
version: "Next.js + Prisma + Docker"
handoff: [architecture, prisma, nextjs]
---

# Mkan Reference Agent

**Scope**: Rental Marketplace | **Patterns**: Listings, Booking, Search | **Repo**: databayt/mkan

## When to Use

Trigger when user says:
- `like mkan`
- `booking like mkan`
- `listings`
- `rental`
- `property`
- `airbnb-style`
- `availability calendar`

## Repository Info

| Field | Value |
|-------|-------|
| **URL** | https://github.com/databayt/mkan |
| **Stack** | Next.js, Prisma, NextAuth, Docker |
| **Local** | /Users/abdout/oss/mkan (if cloned) |

## Core Patterns

### 1. Property Listing Model

```prisma
model Property {
  id           String   @id @default(cuid())
  hostId       String
  host         User     @relation(fields: [hostId], references: [id])

  title        String
  slug         String   @unique
  description  String
  type         PropertyType  // APARTMENT, HOUSE, VILLA, STUDIO

  // Location
  address      String
  city         String
  country      String
  latitude     Float?
  longitude    Float?

  // Details
  bedrooms     Int
  bathrooms    Int
  maxGuests    Int
  area         Float?

  // Pricing
  pricePerNight Decimal
  cleaningFee   Decimal?
  serviceFee    Decimal?

  // Amenities
  amenities    Amenity[]

  // Media
  images       PropertyImage[]
  virtualTour  String?

  // Status
  status       PropertyStatus  // DRAFT, ACTIVE, PAUSED, ARCHIVED

  bookings     Booking[]
  reviews      Review[]
  availability Availability[]

  createdAt    DateTime @default(now())

  @@index([city, status])
  @@index([hostId])
}
```

### 2. Booking System

```prisma
model Booking {
  id           String   @id @default(cuid())
  propertyId   String
  property     Property @relation(fields: [propertyId], references: [id])
  guestId      String
  guest        User     @relation(fields: [guestId], references: [id])

  checkIn      DateTime
  checkOut     DateTime
  guests       Int

  // Pricing breakdown
  nightsCount  Int
  pricePerNight Decimal
  cleaningFee  Decimal
  serviceFee   Decimal
  totalPrice   Decimal

  status       BookingStatus  // PENDING, CONFIRMED, CANCELLED, COMPLETED

  // Payment
  paymentId    String?
  paidAt       DateTime?

  createdAt    DateTime @default(now())

  @@index([propertyId, checkIn, checkOut])
  @@index([guestId])
}

// Check availability
async function checkAvailability(propertyId: string, checkIn: Date, checkOut: Date) {
  const conflicting = await db.booking.findFirst({
    where: {
      propertyId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      OR: [
        { checkIn: { lte: checkOut }, checkOut: { gte: checkIn } },
      ],
    },
  })
  return !conflicting
}
```

### 3. Availability Calendar

```prisma
model Availability {
  id           String   @id @default(cuid())
  propertyId   String
  property     Property @relation(fields: [propertyId], references: [id])

  date         DateTime
  available    Boolean  @default(true)
  priceOverride Decimal?  // Custom price for this date

  @@unique([propertyId, date])
  @@index([propertyId, date])
}

// Get calendar data
async function getCalendar(propertyId: string, startDate: Date, endDate: Date) {
  const [availability, bookings] = await Promise.all([
    db.availability.findMany({
      where: { propertyId, date: { gte: startDate, lte: endDate } },
    }),
    db.booking.findMany({
      where: {
        propertyId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        checkIn: { lte: endDate },
        checkOut: { gte: startDate },
      },
    }),
  ])

  return generateCalendarDays(startDate, endDate, availability, bookings)
}
```

### 4. Search and Filters

```typescript
// components/search/property-search.tsx
interface SearchFilters {
  location?: string
  checkIn?: Date
  checkOut?: Date
  guests?: number
  minPrice?: number
  maxPrice?: number
  type?: PropertyType[]
  amenities?: string[]
  bedrooms?: number
}

export async function searchProperties(filters: SearchFilters) {
  const { checkIn, checkOut, ...rest } = filters

  return db.property.findMany({
    where: {
      status: 'ACTIVE',
      ...(rest.location && {
        OR: [
          { city: { contains: rest.location, mode: 'insensitive' } },
          { address: { contains: rest.location, mode: 'insensitive' } },
        ],
      }),
      ...(rest.guests && { maxGuests: { gte: rest.guests } }),
      ...(rest.minPrice && { pricePerNight: { gte: rest.minPrice } }),
      ...(rest.maxPrice && { pricePerNight: { lte: rest.maxPrice } }),
      ...(rest.type?.length && { type: { in: rest.type } }),
      ...(rest.bedrooms && { bedrooms: { gte: rest.bedrooms } }),
      ...(rest.amenities?.length && {
        amenities: { some: { id: { in: rest.amenities } } },
      }),
      // Availability filter
      ...(checkIn && checkOut && {
        bookings: {
          none: {
            status: { in: ['PENDING', 'CONFIRMED'] },
            checkIn: { lte: checkOut },
            checkOut: { gte: checkIn },
          },
        },
      }),
    },
    include: {
      images: { take: 1 },
      _count: { select: { reviews: true } },
      reviews: { select: { rating: true } },
    },
  })
}
```

### 5. Review System

```prisma
model Review {
  id           String   @id @default(cuid())
  propertyId   String
  property     Property @relation(fields: [propertyId], references: [id])
  bookingId    String   @unique
  booking      Booking  @relation(fields: [bookingId], references: [id])
  guestId      String
  guest        User     @relation(fields: [guestId], references: [id])

  rating       Int      // 1-5
  comment      String?

  // Detailed ratings
  cleanliness  Int?
  communication Int?
  location     Int?
  value        Int?

  createdAt    DateTime @default(now())

  @@index([propertyId])
}
```

### 6. Host Dashboard

```
app/
  host/
    dashboard/
      page.tsx          # Overview, earnings
    properties/
      page.tsx          # My listings
      create/page.tsx   # Add property
      [id]/
        page.tsx        # Edit property
        calendar/page.tsx  # Manage availability
    bookings/
      page.tsx          # Booking requests
    reviews/
      page.tsx          # Guest reviews
```

## Reference Checklist

When implementing features "like mkan":

- [ ] Property with host relation
- [ ] Booking with date range conflict check
- [ ] Availability calendar with price overrides
- [ ] Search with location, dates, guests filters
- [ ] Review tied to completed booking
- [ ] Host dashboard routes

## Files to Reference

| Pattern | Path in mkan |
|---------|--------------|
| Property schema | `prisma/models/property.prisma` |
| Booking logic | `src/lib/booking.ts` |
| Search component | `src/components/search/` |
| Calendar component | `src/components/calendar/` |
| Host dashboard | `src/app/host/` |
| Availability API | `src/app/api/properties/[id]/availability/` |

## Access Commands

```bash
# Clone locally
git clone https://github.com/databayt/mkan ~/oss/mkan

# Reference via MCP
mcp__github__get_file_contents(owner="databayt", repo="mkan", path="prisma/models/property.prisma")
```

## Handoffs

| Situation | Hand to |
|-----------|---------|
| Database schema | `prisma` |
| Page implementation | `nextjs` |
| Architecture | `architecture` |
