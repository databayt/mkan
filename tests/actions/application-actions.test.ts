import { describe, it, expect, vi, beforeEach } from "vitest";

// ApplicationStatus enum mirror (hoisted mocks cannot import from @prisma/client)
const ApplicationStatus = {
  Pending: "Pending",
  Denied: "Denied",
  Approved: "Approved",
} as const;

vi.mock("@prisma/client", () => ({
  ApplicationStatus: {
    Pending: "Pending",
    Denied: "Denied",
    Approved: "Approved",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    application: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    lease: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb: (tx: Record<string, unknown>) => unknown) =>
      cb({
        application: {
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        lease: {
          create: vi.fn(),
        },
      })
    ),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/sanitization", () => ({
  sanitizeInput: vi.fn((s: string) => s.trim()),
  sanitizeEmail: vi.fn((s: string) => s.toLowerCase().trim()),
  sanitizePhone: vi.fn((s: string) => s.trim()),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  getApplications,
  createApplication,
  updateApplicationStatus,
  getManagerApplications,
} from "@/lib/actions/application-actions";

const mockAuth = vi.mocked(auth);
const mockDb = vi.mocked(db);

const tenantSession = {
  user: { id: "tenant-1", name: "Tenant", email: "tenant@test.com", role: "USER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const managerSession = {
  user: { id: "host-1", name: "Host", email: "host@test.com", role: "MANAGER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const validApplicationData = {
  propertyId: 1,
  name: "John Doe",
  email: "john@test.com",
  phoneNumber: "+1234567890",
  message: "I would like to rent this place",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset $transaction to default behavior each test
  mockDb.$transaction.mockImplementation((cb: (tx: Record<string, unknown>) => unknown) =>
    cb({
      application: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 1 }),
        update: vi.fn().mockResolvedValue({ id: 1 }),
      },
      lease: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
    })
  );
});

// ============================================
// getApplications
// ============================================

describe("getApplications", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getApplications()).rejects.toThrow("Failed to fetch applications");
  });

  it("filters by hostId for manager role", async () => {
    mockAuth.mockResolvedValue(managerSession as never);
    mockDb.application.findMany.mockResolvedValue([] as never);

    await getApplications();

    expect(mockDb.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listing: { hostId: "host-1" } },
      })
    );
  });

  it("filters by tenantId for non-manager role", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.application.findMany.mockResolvedValue([] as never);

    await getApplications();

    expect(mockDb.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1" },
      })
    );
  });

  it("returns applications ordered by date descending", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    const mockApps = [{ id: 2 }, { id: 1 }];
    mockDb.application.findMany.mockResolvedValue(mockApps as never);

    const result = await getApplications();

    expect(result).toEqual(mockApps);
    expect(mockDb.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { applicationDate: "desc" },
      })
    );
  });
});

// ============================================
// createApplication
// ============================================

describe("createApplication", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(createApplication(validApplicationData)).rejects.toThrow(
      "Failed to create application"
    );
  });

  it("throws for invalid input (missing name)", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(
      createApplication({ propertyId: 1, email: "a@b.com", phoneNumber: "123" })
    ).rejects.toThrow("Failed to create application");
  });

  it("throws for invalid input (bad email)", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(
      createApplication({ ...validApplicationData, email: "not-an-email" })
    ).rejects.toThrow("Failed to create application");
  });

  it("throws for invalid input (negative propertyId)", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(
      createApplication({ ...validApplicationData, propertyId: -1 })
    ).rejects.toThrow("Failed to create application");
  });

  it("creates tenant profile when not exists", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.findUnique.mockResolvedValue(null as never);
    mockDb.tenant.create.mockResolvedValue({
      userId: "tenant-1",
      name: "John Doe",
      email: "john@test.com",
      phoneNumber: "+1234567890",
    } as never);

    // Transaction creates the application
    mockDb.$transaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => unknown) =>
      cb({
        application: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 1, status: ApplicationStatus.Pending }),
        },
        lease: { create: vi.fn() },
      })
    );

    await createApplication(validApplicationData);

    expect(mockDb.tenant.findUnique).toHaveBeenCalledWith({
      where: { userId: "tenant-1" },
    });
    expect(mockDb.tenant.create).toHaveBeenCalledWith({
      data: {
        userId: "tenant-1",
        name: "John Doe",
        email: "john@test.com",
        phoneNumber: "+1234567890",
      },
    });
  });

  it("skips tenant creation when tenant already exists", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.findUnique.mockResolvedValue({ userId: "tenant-1" } as never);

    mockDb.$transaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => unknown) =>
      cb({
        application: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 1 }),
        },
        lease: { create: vi.fn() },
      })
    );

    await createApplication(validApplicationData);

    expect(mockDb.tenant.findUnique).toHaveBeenCalled();
    expect(mockDb.tenant.create).not.toHaveBeenCalled();
  });

  it("prevents duplicate applications via $transaction", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.findUnique.mockResolvedValue({ userId: "tenant-1" } as never);

    mockDb.$transaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => unknown) =>
      cb({
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: 99 }), // existing application
          create: vi.fn(),
        },
        lease: { create: vi.fn() },
      })
    );

    await expect(createApplication(validApplicationData)).rejects.toThrow(
      "Failed to create application"
    );
  });

  it("creates application with Pending status on success", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.findUnique.mockResolvedValue({ userId: "tenant-1" } as never);

    const mockTxCreate = vi.fn().mockResolvedValue({ id: 1, status: ApplicationStatus.Pending });
    mockDb.$transaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => unknown) =>
      cb({
        application: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: mockTxCreate,
        },
        lease: { create: vi.fn() },
      })
    );

    await createApplication(validApplicationData);

    expect(mockTxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: 1,
          tenantId: "tenant-1",
          status: ApplicationStatus.Pending,
        }),
      })
    );
  });
});

// ============================================
// updateApplicationStatus
// ============================================

describe("updateApplicationStatus", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(
      updateApplicationStatus(1, ApplicationStatus.Approved)
    ).rejects.toThrow("Failed to update application status");
  });

  it("throws for invalid input (non-numeric applicationId)", async () => {
    mockAuth.mockResolvedValue(managerSession as never);

    await expect(
      updateApplicationStatus("abc", ApplicationStatus.Approved)
    ).rejects.toThrow("Failed to update application status");
  });

  it("throws for invalid input (invalid status value)", async () => {
    mockAuth.mockResolvedValue(managerSession as never);

    await expect(
      updateApplicationStatus(1, "InvalidStatus")
    ).rejects.toThrow("Failed to update application status");
  });

  it("throws when application not found", async () => {
    mockAuth.mockResolvedValue(managerSession as never);
    mockDb.application.findUnique.mockResolvedValue(null as never);

    await expect(
      updateApplicationStatus(1, ApplicationStatus.Approved)
    ).rejects.toThrow("Failed to update application status");
  });

  it("throws when user is not the host of the listing", async () => {
    mockAuth.mockResolvedValue(managerSession as never);
    mockDb.application.findUnique.mockResolvedValue({
      id: 1,
      listing: { hostId: "other-host" },
    } as never);

    await expect(
      updateApplicationStatus(1, ApplicationStatus.Approved)
    ).rejects.toThrow("Failed to update application status");
  });

  it("creates a lease when status is Approved", async () => {
    mockAuth.mockResolvedValue(managerSession as never);
    mockDb.application.findUnique.mockResolvedValue({
      id: 1,
      propertyId: 5,
      tenantId: "tenant-1",
      listing: { hostId: "host-1" },
    } as never);

    const mockTxUpdate = vi.fn().mockResolvedValue({
      id: 1,
      listing: { pricePerNight: 100, securityDeposit: 500 },
    });
    const mockTxLeaseCreate = vi.fn().mockResolvedValue({ id: 10 });

    mockDb.$transaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => unknown) =>
      cb({
        application: {
          update: mockTxUpdate,
        },
        lease: {
          create: mockTxLeaseCreate,
        },
      })
    );

    await updateApplicationStatus(1, ApplicationStatus.Approved);

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { status: ApplicationStatus.Approved },
      })
    );
    expect(mockTxLeaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: 5,
          tenantId: "tenant-1",
          rent: 100,
          deposit: 500,
        }),
      })
    );
  });

  it("does not create a lease when status is Denied", async () => {
    mockAuth.mockResolvedValue(managerSession as never);
    mockDb.application.findUnique.mockResolvedValue({
      id: 1,
      propertyId: 5,
      tenantId: "tenant-1",
      listing: { hostId: "host-1" },
    } as never);

    const mockTxLeaseCreate = vi.fn();
    const mockTxUpdate = vi.fn().mockResolvedValue({
      id: 1,
      listing: { pricePerNight: 100, securityDeposit: 500 },
    });

    mockDb.$transaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => unknown) =>
      cb({
        application: {
          update: mockTxUpdate,
        },
        lease: {
          create: mockTxLeaseCreate,
        },
      })
    );

    await updateApplicationStatus(1, ApplicationStatus.Denied);

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: ApplicationStatus.Denied },
      })
    );
    expect(mockTxLeaseCreate).not.toHaveBeenCalled();
  });
});

// ============================================
// getManagerApplications
// ============================================

describe("getManagerApplications", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getManagerApplications()).rejects.toThrow("Unauthorized");
  });

  it("returns applications for host's listings", async () => {
    mockAuth.mockResolvedValue(managerSession as never);
    const mockApps = [{ id: 1, listing: { hostId: "host-1" } }];
    mockDb.application.findMany.mockResolvedValue(mockApps as never);

    const result = await getManagerApplications();

    expect(result).toEqual({ success: true, applications: mockApps });
    expect(mockDb.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listing: { hostId: "host-1" } },
        orderBy: { applicationDate: "desc" },
      })
    );
  });
});
