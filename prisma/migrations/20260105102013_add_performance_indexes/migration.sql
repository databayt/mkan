-- CreateEnum
CREATE TYPE "BusAmenity" AS ENUM ('AirConditioning', 'WiFi', 'USB', 'LegRoom', 'Toilet', 'Refreshments', 'Entertainment', 'Luggage', 'Reclining');

-- CreateEnum
CREATE TYPE "TransportBookingStatus" AS ENUM ('Pending', 'Confirmed', 'Cancelled', 'Completed', 'NoShow');

-- CreateEnum
CREATE TYPE "TransportPaymentStatus" AS ENUM ('Pending', 'Paid', 'Refunded', 'Failed');

-- CreateEnum
CREATE TYPE "TransportPaymentMethod" AS ENUM ('MobileMoney', 'CreditCard', 'DebitCard', 'CashOnArrival', 'BankTransfer');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('Available', 'Reserved', 'Booked', 'Blocked');

-- DropIndex
DROP INDEX "idx_account_user";

-- DropIndex
DROP INDEX "idx_lease_dates";

-- DropIndex
DROP INDEX "idx_lease_property";

-- DropIndex
DROP INDEX "idx_lease_tenant";

-- DropIndex
DROP INDEX "idx_listing_draft";

-- DropIndex
DROP INDEX "idx_listing_filter";

-- DropIndex
DROP INDEX "idx_listing_guest_count";

-- DropIndex
DROP INDEX "idx_listing_published";

-- DropIndex
DROP INDEX "idx_listing_search";

-- DropIndex
DROP INDEX "idx_location_city_state";

-- DropIndex
DROP INDEX "idx_password_reset_email";

-- DropIndex
DROP INDEX "idx_password_reset_token";

-- DropIndex
DROP INDEX "idx_payment_due_date";

-- DropIndex
DROP INDEX "idx_payment_lease";

-- DropIndex
DROP INDEX "idx_payment_status";

-- DropIndex
DROP INDEX "idx_session_expires";

-- DropIndex
DROP INDEX "idx_session_token";

-- DropIndex
DROP INDEX "idx_session_user";

-- DropIndex
DROP INDEX "idx_tenant_user";

-- DropIndex
DROP INDEX "idx_two_factor_email";

-- DropIndex
DROP INDEX "idx_two_factor_token";

-- DropIndex
DROP INDEX "idx_user_email";

-- DropIndex
DROP INDEX "idx_user_last_login";

-- DropIndex
DROP INDEX "idx_user_role";

-- DropIndex
DROP INDEX "idx_verification_email";

-- DropIndex
DROP INDEX "idx_verification_token";

-- DropIndex
DROP INDEX "idx_tenant_favorites";

-- DropIndex
DROP INDEX "idx_tenant_properties";

-- CreateTable
CREATE TABLE "AssemblyPoint" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblyPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportOffice" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "logoUrl" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "ownerId" TEXT NOT NULL,
    "assemblyPointId" INTEGER,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportOffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bus" (
    "id" SERIAL NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "model" TEXT,
    "manufacturer" TEXT,
    "year" INTEGER,
    "capacity" INTEGER NOT NULL,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amenities" "BusAmenity"[] DEFAULT ARRAY[]::"BusAmenity"[],
    "seatLayout" JSONB,
    "officeId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" SERIAL NOT NULL,
    "officeId" INTEGER NOT NULL,
    "originId" INTEGER NOT NULL,
    "destinationId" INTEGER NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "duration" INTEGER NOT NULL,
    "distance" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" SERIAL NOT NULL,
    "routeId" INTEGER NOT NULL,
    "busId" INTEGER NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "departureTime" TEXT NOT NULL,
    "arrivalTime" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "availableSeats" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" SERIAL NOT NULL,
    "tripId" INTEGER NOT NULL,
    "seatNumber" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "column" INTEGER NOT NULL,
    "seatType" TEXT,
    "status" "SeatStatus" NOT NULL DEFAULT 'Available',
    "bookingId" INTEGER,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportBooking" (
    "id" SERIAL NOT NULL,
    "bookingReference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" INTEGER NOT NULL,
    "officeId" INTEGER NOT NULL,
    "passengerName" TEXT NOT NULL,
    "passengerPhone" TEXT NOT NULL,
    "passengerEmail" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" "TransportBookingStatus" NOT NULL DEFAULT 'Pending',
    "qrCode" TEXT,
    "ticketUrl" TEXT,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPayment" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "TransportPaymentMethod" NOT NULL,
    "status" "TransportPaymentStatus" NOT NULL DEFAULT 'Pending',
    "transactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportOffice_ownerId_idx" ON "TransportOffice"("ownerId");

-- CreateIndex
CREATE INDEX "TransportOffice_isActive_isVerified_idx" ON "TransportOffice"("isActive", "isVerified");

-- CreateIndex
CREATE INDEX "TransportOffice_assemblyPointId_idx" ON "TransportOffice"("assemblyPointId");

-- CreateIndex
CREATE UNIQUE INDEX "Bus_plateNumber_key" ON "Bus"("plateNumber");

-- CreateIndex
CREATE INDEX "Route_originId_idx" ON "Route"("originId");

-- CreateIndex
CREATE INDEX "Route_destinationId_idx" ON "Route"("destinationId");

-- CreateIndex
CREATE INDEX "Route_isActive_idx" ON "Route"("isActive");

-- CreateIndex
CREATE INDEX "Route_officeId_isActive_idx" ON "Route"("officeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Route_officeId_originId_destinationId_key" ON "Route"("officeId", "originId", "destinationId");

-- CreateIndex
CREATE INDEX "Trip_departureDate_idx" ON "Trip"("departureDate");

-- CreateIndex
CREATE INDEX "Trip_routeId_departureDate_idx" ON "Trip"("routeId", "departureDate");

-- CreateIndex
CREATE INDEX "Seat_tripId_status_idx" ON "Seat"("tripId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_tripId_seatNumber_key" ON "Seat"("tripId", "seatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TransportBooking_bookingReference_key" ON "TransportBooking"("bookingReference");

-- CreateIndex
CREATE INDEX "TransportBooking_userId_idx" ON "TransportBooking"("userId");

-- CreateIndex
CREATE INDEX "TransportBooking_tripId_idx" ON "TransportBooking"("tripId");

-- CreateIndex
CREATE INDEX "TransportBooking_officeId_idx" ON "TransportBooking"("officeId");

-- CreateIndex
CREATE INDEX "TransportBooking_status_idx" ON "TransportBooking"("status");

-- CreateIndex
CREATE INDEX "TransportBooking_bookedAt_idx" ON "TransportBooking"("bookedAt");

-- CreateIndex
CREATE INDEX "Application_propertyId_status_idx" ON "Application"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Listing_isPublished_draft_idx" ON "Listing"("isPublished", "draft");

-- CreateIndex
CREATE INDEX "Listing_hostId_isPublished_idx" ON "Listing"("hostId", "isPublished");

-- CreateIndex
CREATE INDEX "Location_city_idx" ON "Location"("city");

-- CreateIndex
CREATE INDEX "Location_country_idx" ON "Location"("country");

-- AddForeignKey
ALTER TABLE "TransportOffice" ADD CONSTRAINT "TransportOffice_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOffice" ADD CONSTRAINT "TransportOffice_assemblyPointId_fkey" FOREIGN KEY ("assemblyPointId") REFERENCES "AssemblyPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "TransportOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "TransportOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_originId_fkey" FOREIGN KEY ("originId") REFERENCES "AssemblyPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "AssemblyPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "TransportBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "TransportOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPayment" ADD CONSTRAINT "TransportPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "TransportBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_application_date" RENAME TO "Application_applicationDate_idx";

-- RenameIndex
ALTER INDEX "idx_application_property" RENAME TO "Application_propertyId_idx";

-- RenameIndex
ALTER INDEX "idx_application_status" RENAME TO "Application_status_idx";

-- RenameIndex
ALTER INDEX "idx_application_tenant" RENAME TO "Application_tenantId_idx";

-- RenameIndex
ALTER INDEX "idx_listing_created" RENAME TO "Listing_postedDate_idx";

-- RenameIndex
ALTER INDEX "idx_listing_host" RENAME TO "Listing_hostId_idx";

-- RenameIndex
ALTER INDEX "idx_listing_location" RENAME TO "Listing_locationId_idx";

-- RenameIndex
ALTER INDEX "idx_listing_price" RENAME TO "Listing_pricePerNight_idx";

-- RenameIndex
ALTER INDEX "idx_listing_property_type" RENAME TO "Listing_propertyType_idx";

-- RenameIndex
ALTER INDEX "idx_location_coordinates" RENAME TO "Location_latitude_longitude_idx";

-- RenameIndex
ALTER INDEX "idx_tenant_email" RENAME TO "Tenant_email_idx";
