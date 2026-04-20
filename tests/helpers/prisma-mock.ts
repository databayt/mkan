import { vi } from "vitest";

type MockModel = {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
};

function createMockModel(): MockModel {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

export function createMockDb() {
  const mockDb = {
    user: createMockModel(),
    account: createMockModel(),
    session: createMockModel(),
    verificationToken: createMockModel(),
    twoFactorToken: createMockModel(),
    twoFactorConfirmation: createMockModel(),
    passwordResetToken: createMockModel(),
    tenant: createMockModel(),
    listing: createMockModel(),
    location: createMockModel(),
    lease: createMockModel(),
    application: createMockModel(),
    payment: createMockModel(),
    booking: createMockModel(),
    review: createMockModel(),
    blockedDate: createMockModel(),
    seasonalPricing: createMockModel(),
    transportOffice: createMockModel(),
    bus: createMockModel(),
    route: createMockModel(),
    trip: createMockModel(),
    seat: createMockModel(),
    transportBooking: createMockModel(),
    transportPayment: createMockModel(),
    assemblyPoint: createMockModel(),
    rideDriver: createMockModel(),
    ride: createMockModel(),
    $transaction: vi.fn((fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb)),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };

  return mockDb;
}

export type MockDb = ReturnType<typeof createMockDb>;

/**
 * Sets up vi.mock('@/lib/db') to use the mock db.
 * Call this BEFORE importing the module under test.
 *
 * Usage:
 *   const mockDb = createMockDb();
 *   vi.mock('@/lib/db', () => ({ db: mockDb }));
 */
export { createMockModel };
