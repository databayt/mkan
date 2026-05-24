-- Short-term Booking payment record (mirrors TransportPayment).
-- See prisma/schema.prisma BookingPayment for field docs.

-- CreateEnum
CREATE TYPE "BookingPaymentMethod" AS ENUM ('Card', 'Bankak', 'Cashi', 'MobileMoney', 'BankTransfer', 'Cash');

-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM ('Pending', 'PendingVerification', 'Paid', 'Failed', 'Refunded', 'PartiallyRefunded');

-- CreateTable
CREATE TABLE "BookingPayment" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "BookingPaymentMethod" NOT NULL,
    "status" "BookingPaymentStatus" NOT NULL DEFAULT 'Pending',
    "intentId" TEXT,
    "reference" TEXT,
    "transactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "failureCode" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingPayment_bookingId_idx" ON "BookingPayment"("bookingId");

-- CreateIndex
CREATE INDEX "BookingPayment_status_idx" ON "BookingPayment"("status");

-- CreateIndex
CREATE INDEX "BookingPayment_intentId_idx" ON "BookingPayment"("intentId");

-- CreateIndex
CREATE INDEX "BookingPayment_reference_idx" ON "BookingPayment"("reference");

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
