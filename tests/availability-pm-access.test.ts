import { describe, it, expect, vi, beforeEach } from "vitest"

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const { dbMock, sessionMock } = vi.hoisted(() => ({
  dbMock: {
    availability: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    availabilityOverride: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    availabilityDateRange: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    leave: {
      findMany: vi.fn(),
    },
    timeEntry: {
      findMany: vi.fn(),
    },
    projectMember: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(dbMock)),
  },
  sessionMock: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ db: dbMock }))
vi.mock("next-auth", () => ({ getServerSession: () => sessionMock() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 99, resetAt: Date.now() + 60_000 })),
  RATE_LIMITS: {
    general: { limit: 60, windowMs: 60_000 },
    crmWrite: { limit: 10, windowMs: 60_000 },
  },
}))
vi.mock("@/lib/audit-log", () => ({
  logAudit: vi.fn(),
  getIpAddress: vi.fn(() => "127.0.0.1"),
  getUserAgent: vi.fn(() => "test-agent"),
}))
vi.mock("@/lib/auto-migrate", () => ({
  ensureTable: vi.fn().mockResolvedValue(true),
  ensureCriticalSchema: vi.fn().mockResolvedValue(undefined),
  ensureAllTables: vi.fn().mockResolvedValue(undefined),
  runAutoMigrations: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string
      constructor(message: string, { code }: { code: string }) {
        super(message)
        this.code = code
      }
    },
  },
}))

import { GET as GetAvail, POST as PostAvail } from "@/app/api/availability/route"
import { GET as GetSchedule } from "@/app/api/availability/schedule/route"
import { GET as GetOverrides, POST as PostOverrides, DELETE as DeleteOverrides } from "@/app/api/availability/overrides/route"
import { GET as GetCheck } from "@/app/api/availability/check/route"
import { GET as GetDateRanges } from "@/app/api/availability/date-ranges/route"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSession(role: string, userId = "u1") {
  return {
    user: { id: userId, role, email: `${role.toLowerCase()}@test.com`, name: role },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  }
}

function makeRequest(url: string, init?: { method?: string; body?: unknown }) {
  return new Request(`https://app.test${url}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  }) as any
}

function resetMocks() {
  sessionMock.mockReset()
  for (const m of Object.values(dbMock)) {
    for (const f of Object.values(m)) {
      if (typeof (f as any).mockReset === "function") (f as any).mockReset()
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("PM availability access — GET routes allow PROJECT_MANAGER", () => {
  beforeEach(() => resetMocks())

  it("GET /api/availability allows PROJECT_MANAGER (returns 200, not 403)", async () => {
    sessionMock.mockResolvedValue(makeSession("PROJECT_MANAGER"))
    dbMock.availability.findMany.mockResolvedValue([])
    dbMock.availability.count.mockResolvedValue(0)
    const res = await GetAvail(makeRequest("/api/availability"))
    expect(res.status).toBe(200)
  })

  it("GET /api/availability/schedule allows PROJECT_MANAGER", async () => {
    sessionMock.mockResolvedValue(makeSession("PROJECT_MANAGER"))
    dbMock.availability.findMany.mockResolvedValue([])
    dbMock.availabilityOverride.findMany.mockResolvedValue([])
    dbMock.availabilityDateRange.findMany.mockResolvedValue([])
    dbMock.timeEntry.findMany.mockResolvedValue([])
    dbMock.leave.findMany.mockResolvedValue([])
    dbMock.user.findMany.mockResolvedValue([])
    dbMock.user.count.mockResolvedValue(0)
    const res = await GetSchedule(makeRequest("/api/availability/schedule?date=2026-06-24&type=week"))
    expect(res.status).toBe(200)
  })

  it("GET /api/availability/overrides allows PROJECT_MANAGER", async () => {
    sessionMock.mockResolvedValue(makeSession("PROJECT_MANAGER"))
    dbMock.availabilityOverride.findMany.mockResolvedValue([])
    dbMock.availabilityOverride.count.mockResolvedValue(0)
    const res = await GetOverrides(makeRequest("/api/availability/overrides"))
    expect(res.status).toBe(200)
  })

  it("GET /api/availability/check allows PROJECT_MANAGER", async () => {
    sessionMock.mockResolvedValue(makeSession("PROJECT_MANAGER"))
    dbMock.user.findMany.mockResolvedValue([])
    dbMock.leave.findMany.mockResolvedValue([])
    dbMock.availability.findMany.mockResolvedValue([])
    dbMock.availabilityOverride.findMany.mockResolvedValue([])
    const res = await GetCheck(makeRequest("/api/availability/check?date=2026-06-24"))
    expect(res.status).toBe(200)
  })

  it("GET /api/availability/date-ranges allows PROJECT_MANAGER to see ALL ranges (not just own)", async () => {
    sessionMock.mockResolvedValue(makeSession("PROJECT_MANAGER"))
    dbMock.availabilityDateRange.findMany.mockResolvedValue([
      { id: "dr1", userId: "other-user", startDate: new Date("2026-06-01"), endDate: new Date("2026-06-30"), startTime: null, endTime: null, isAvailable: false, reason: "Vacation", createdAt: new Date(), updatedAt: new Date(), user: { id: "other-user", name: "Other User", email: "o@t.com", avatar: null } },
    ])
    const res = await GetDateRanges(makeRequest("/api/availability/date-ranges"))
    expect(res.status).toBe(200)
    const body = await res.json()
    // PM should see ALL date ranges (not filtered to their own userId)
    expect(body.dateRanges).toHaveLength(1)
    expect(body.dateRanges[0].userId).toBe("other-user")
  })

  it("GET /api/availability still allows ADMIN", async () => {
    sessionMock.mockResolvedValue(makeSession("ADMIN"))
    dbMock.availability.findMany.mockResolvedValue([])
    dbMock.availability.count.mockResolvedValue(0)
    const res = await GetAvail(makeRequest("/api/availability"))
    expect(res.status).toBe(200)
  })

  it("GET /api/availability still allows SUPER_ADMIN", async () => {
    sessionMock.mockResolvedValue(makeSession("SUPER_ADMIN"))
    dbMock.availability.findMany.mockResolvedValue([])
    dbMock.availability.count.mockResolvedValue(0)
    const res = await GetAvail(makeRequest("/api/availability"))
    expect(res.status).toBe(200)
  })

  it("GET /api/availability still blocks DEVELOPER", async () => {
    sessionMock.mockResolvedValue(makeSession("DEVELOPER"))
    const res = await GetAvail(makeRequest("/api/availability"))
    expect(res.status).toBe(403)
  })

  it("GET /api/availability still blocks unauthenticated", async () => {
    sessionMock.mockResolvedValue(null)
    const res = await GetAvail(makeRequest("/api/availability"))
    expect(res.status).toBe(401)
  })
})

describe("PM availability access — mutation routes BLOCK PROJECT_MANAGER", () => {
  beforeEach(() => resetMocks())

  it("POST /api/availability blocks PROJECT_MANAGER (403)", async () => {
    sessionMock.mockResolvedValue(makeSession("PROJECT_MANAGER"))
    const res = await PostAvail(makeRequest("/api/availability", {
      method: "POST",
      body: { userId: "u1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
    }))
    expect(res.status).toBe(403)
  })

  it("POST /api/availability/overrides blocks PROJECT_MANAGER (403)", async () => {
    sessionMock.mockResolvedValue(makeSession("PROJECT_MANAGER"))
    const res = await PostOverrides(makeRequest("/api/availability/overrides", {
      method: "POST",
      body: { userId: "u1", date: "2026-06-24", isAvailable: false, reason: "Sick" },
    }))
    expect(res.status).toBe(403)
  })

  it("DELETE /api/availability/overrides blocks PROJECT_MANAGER (403)", async () => {
    sessionMock.mockResolvedValue(makeSession("PROJECT_MANAGER"))
    const res = await DeleteOverrides(makeRequest("/api/availability/overrides?id=dr1", {
      method: "DELETE",
    }))
    expect(res.status).toBe(403)
  })

  it("POST /api/availability still allows ADMIN", async () => {
    sessionMock.mockResolvedValue(makeSession("ADMIN"))
    dbMock.user.findUnique.mockResolvedValue({ id: "u1", isActive: true })
    dbMock.availability.findMany.mockResolvedValue([])
    dbMock.availability.create.mockResolvedValue({
      id: "a1", userId: "u1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00",
      isAvailable: true, user: { id: "u1", name: "Admin", email: "a@t.com", avatar: null },
    })
    const res = await PostAvail(makeRequest("/api/availability", {
      method: "POST",
      body: { userId: "u1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
    }))
    expect([200, 201]).toContain(res.status)
  })

  it("POST /api/availability still allows SUPER_ADMIN", async () => {
    sessionMock.mockResolvedValue(makeSession("SUPER_ADMIN"))
    dbMock.user.findUnique.mockResolvedValue({ id: "u1", isActive: true })
    dbMock.availability.findMany.mockResolvedValue([])
    dbMock.availability.create.mockResolvedValue({
      id: "a1", userId: "u1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00",
      isAvailable: true, user: { id: "u1", name: "Super", email: "s@t.com", avatar: null },
    })
    const res = await PostAvail(makeRequest("/api/availability", {
      method: "POST",
      body: { userId: "u1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
    }))
    expect([200, 201]).toContain(res.status)
  })

  it("POST /api/availability still blocks DEVELOPER (403)", async () => {
    sessionMock.mockResolvedValue(makeSession("DEVELOPER"))
    const res = await PostAvail(makeRequest("/api/availability", {
      method: "POST",
      body: { userId: "u1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
    }))
    expect(res.status).toBe(403)
  })
})
