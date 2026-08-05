import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { VALID_DEPARTMENT_VALUES } from "@/lib/types"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { formatDisplayDate } from "@/lib/format"
import {
  CONTROLLABLE_PAGES,
  normalizePageAccessMode,
  parsePageAccessPages,
  type PageAccessMode,
} from "@/lib/nav-pages"

// [C3] Helper: convert Date to local YYYY-MM-DD string (avoids UTC timezone issue)
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// [T4/T6] Valid role values
const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER", "CLIENT"] as const

// [W15] Helper: verify user account is still active
async function requireActiveUser(userId: string): Promise<NextResponse | null> {
  const currentUser = await db.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  })
  if (!currentUser?.isActive) {
    return NextResponse.json({ error: "Account deactivated" }, { status: 403 })
  }
  return null
}

// GET /api/team - List team data
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // [T1] Rate limiting
    const rl = rateLimit('team-get-' + session.user.id, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // [W15] Verify user is still active
    const activeCheck = await requireActiveUser(session.user.id)
    if (activeCheck) return activeCheck

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")

    if (type === "me") {
      // Any authenticated user: fetch their own profile (including avatar).
      // Used by the Settings page to display and update the user's own avatar.
      const me = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          avatar: true,
          isActive: true,
        },
      })
      if (!me) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      return NextResponse.json(me)
    }

    if (type === "users") {
      // SUPER_ADMIN, ADMIN, and PROJECT_MANAGER: list all users for team/credential management.
      // PROJECT_MANAGER needs the user list to manage credentials (Access Hub).
      // They do NOT have access to the Team Management page itself (middleware-gated).
      const userRole = session.user.role
      if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && userRole !== "PROJECT_MANAGER") {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      // TODO: Add cursor-based pagination for large datasets
      // Active staff only for assign/pickers (deactivated users cannot be assigned)
      const users = await db.user.findMany({
        where: { role: { not: "CLIENT" }, isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          isActive: true,
          avatar: true, // [T7] Add avatar to user list
          pageAccessMode: true,
          pageAccessPages: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
        take: 100,
      })
      return NextResponse.json(users)
    }

    if (type === "attendance") {
      // Admin-only: computed attendance from Time Tracking + Availability + Leaves
      const userRole = session.user.role
      if (!isAdmin(userRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }

      const dateFromStr = searchParams.get("from")
      const dateToStr = searchParams.get("to")

      // [W12] Default: last 7 days when no explicit date provided
      const today = new Date()
      let dateFrom: Date
      if (dateFromStr) {
        dateFrom = new Date(dateFromStr)
        dateFrom.setHours(0, 0, 0, 0)
      } else {
        dateFrom = new Date(today)
        dateFrom.setDate(dateFrom.getDate() - 7)
        dateFrom.setHours(0, 0, 0, 0)
      }

      const dateTo = dateToStr ? new Date(dateToStr) : new Date(today)
      dateTo.setHours(23, 59, 59, 999)

      // [W13] Enforce maximum date range of 90 days
      const rangeDays = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
      if (rangeDays > 90) {
        return NextResponse.json({ error: "Date range cannot exceed 90 days" }, { status: 400 })
      }

      // 1. Fetch all active non-CLIENT users (must be first to get IDs for subsequent queries)
      const activeUsers = await db.user.findMany({
        where: { role: { not: "CLIENT" }, isActive: true },
        select: { id: true, name: true, email: true, role: true, avatar: true },
        orderBy: { name: "asc" },
      })
      const userIds = activeUsers.map(u => u.id)

      // 2-5. Fetch remaining data sources in parallel for performance
      const [allAvailability, leaves, timeEntries, manualAttendance] = await Promise.all([
        // 2. Fetch all availability schedules for these users
        db.availability.findMany({
          where: { userId: { in: userIds }, isAvailable: true },
        }),
        // 3. Fetch all approved leaves overlapping the date range
        db.leave.findMany({
          where: {
            userId: { in: userIds },
            status: "APPROVED",
            startDate: { lte: dateTo },
            endDate: { gte: dateFrom },
          },
        }),
        // 4. Fetch all COMPLETED time entries in the date range
        db.timeEntry.findMany({
          where: {
            userId: { in: userIds },
            status: "COMPLETED",
            clockIn: { gte: dateFrom, lt: new Date(dateTo.getTime() + 86400000) },
          },
          select: { id: true, userId: true, clockIn: true, clockOut: true, totalHours: true, date: true },
        }),
        // 5. Fetch existing manual attendance records
        db.attendance.findMany({
          where: {
            date: { gte: dateFrom, lte: dateTo },
          },
        }),
      ])

      // 6. Build lookup maps
      const availByUserDay = new Map<string, { startTime: string; endTime: string }[]>()
      for (const a of allAvailability) {
        const key = `${a.userId}-${a.dayOfWeek}`
        const existing = availByUserDay.get(key) || []
        existing.push({ startTime: a.startTime, endTime: a.endTime })
        availByUserDay.set(key, existing)
      }

      const leaveDaysByUser = new Map<string, Set<string>>()
      for (const l of leaves) {
        const key = l.userId
        const set = leaveDaysByUser.get(key) || new Set<string>()
        const start = new Date(l.startDate)
        const end = new Date(l.endDate)
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          set.add(toLocalDateStr(d))
        }
        leaveDaysByUser.set(key, set)
      }

      // Group time entries by userId + date string
      const timeByUserDay = new Map<string, { totalHours: number; clockIn: Date | null; clockOut: Date | null; entryCount: number }>()
      for (const te of timeEntries) {
        const dayStr = toLocalDateStr(new Date(te.date))
        const key = `${te.userId}-${dayStr}`
        const existing = timeByUserDay.get(key) || { totalHours: 0, clockIn: null as Date | null, clockOut: null as Date | null, entryCount: 0 }
        existing.totalHours += te.totalHours || 0
        existing.entryCount++
        // Track earliest clock-in and latest clock-out
        if (!existing.clockIn || te.clockIn < existing.clockIn) existing.clockIn = te.clockIn
        if (!existing.clockOut || (te.clockOut && te.clockOut > existing.clockOut)) existing.clockOut = te.clockOut
        timeByUserDay.set(key, existing)
      }

      // Manual attendance override map: "userId-dateStr" -> Attendance record
      const manualByUserDay = new Map<string, typeof manualAttendance[0]>()
      for (const ma of manualAttendance) {
        const dayStr = toLocalDateStr(new Date(ma.date))
        manualByUserDay.set(`${ma.userId}-${dayStr}`, ma)
      }

      // Helper: calculate required hours for a user on a given day of week
      function getRequiredHours(userId: string, dayOfWeek: number): number {
        const slots = availByUserDay.get(`${userId}-${dayOfWeek}`)
        if (!slots || slots.length === 0) return 0 // No schedule = not required
        let totalMinutes = 0
        for (const slot of slots) {
          const [sh, sm] = slot.startTime.split(":").map(Number)
          const [eh, em] = slot.endTime.split(":").map(Number)
          let diff = (eh * 60 + em) - (sh * 60 + sm)
          if (diff < 0) diff += 24 * 60 // Overnight shift (e.g. 19:59 - 23:59)
          totalMinutes += diff
        }
        return totalMinutes / 60
      }

      // 7. Generate computed attendance records for each day × each user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const records: Record<string, any>[] = []

      for (let d = new Date(dateFrom); d <= dateTo; d.setDate(d.getDate() + 1)) {
        const dayStr = toLocalDateStr(d)
        const dow = d.getDay()

        for (const user of activeUsers) {
          // Check manual override first
          const manualRecord = manualByUserDay.get(`${user.id}-${dayStr}`)
          if (manualRecord) {
            records.push({
              id: manualRecord.id,
              userId: user.id,
              date: manualRecord.date.toISOString(),
              checkIn: manualRecord.checkIn?.toISOString() || null,
              checkOut: manualRecord.checkOut?.toISOString() || null,
              status: manualRecord.status,
              notes: manualRecord.notes,
              isManual: true,
              requiredHours: null,
              workedHours: null,
              user,
            })
            continue
          }

          // Check if on approved leave FIRST (before skip logic)
          const userLeaveDays = leaveDaysByUser.get(user.id)
          if (userLeaveDays && userLeaveDays.has(dayStr)) {
            records.push({
              id: `computed-${user.id}-${dayStr}`,
              userId: user.id,
              date: d.toISOString(),
              checkIn: null,
              checkOut: null,
              status: "LEAVE",
              notes: "Auto-detected from approved leave",
              isManual: false,
              requiredHours: getRequiredHours(user.id, dow),
              workedHours: 0,
              user,
            })
            continue
          }

          // Check time tracking data
          const timeData = timeByUserDay.get(`${user.id}-${dayStr}`)
          const requiredHours = getRequiredHours(user.id, dow)
          const workedHours = timeData?.totalHours || 0

          // Skip days where the employee has NO availability schedule AND no time entries
          // (don't hard-skip Sundays — employees may work any day per their availability)
          if (requiredHours === 0 && workedHours === 0) continue

          // Determine status
          let status: string
          if (requiredHours === 0) {
            // No availability schedule for this day but has time entries
            // Mark as NO_SCHEDULE so admin knows there's no expected schedule
            status = "NO_SCHEDULE"
          } else if (workedHours >= requiredHours) {
            status = "PRESENT"
          } else if (workedHours >= requiredHours * 0.5) {
            status = "HALF_DAY"
          } else if (workedHours > 0) {
            status = "HALF_DAY"
          } else {
            status = "ABSENT"
          }

          records.push({
            id: `computed-${user.id}-${dayStr}`,
            userId: user.id,
            date: d.toISOString(),
            checkIn: timeData?.clockIn?.toISOString() || null,
            checkOut: timeData?.clockOut?.toISOString() || null,
            status,
            notes: timeData ? `${timeData.entryCount} time entry(s) logged` : "No time entries",
            isManual: false,
            requiredHours: Math.round(requiredHours * 100) / 100,
            workedHours: Math.round(workedHours * 100) / 100,
            user,
          })
        }
      }

      // Sort by date desc, then user name
      records.sort((a, b) => {
        const dateCompare = new Date(b.date as string).getTime() - new Date(a.date as string).getTime()
        if (dateCompare !== 0) return dateCompare
        return String((a.user as unknown as Record<string, unknown>)?.name).localeCompare(String((b.user as unknown as Record<string, unknown>)?.name))
      })

      // Limit to 500 records
      return NextResponse.json(records.slice(0, 500))
    }

    // Default: return team members (admin-only)
    // Leave list/create/approve: use /api/leaves instead
    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }
    // TODO: Add cursor-based pagination for large datasets
    // Default team roster for Team manage UI (includes deactivated so admins can reactivate).
    // Assignment pickers should use ?type=users (active-only) or filter isActive client-side.
    const users = await db.user.findMany({
      where: { role: { not: "CLIENT" } },
      include: {
        _count: { select: { leaves: true } },
      },
      orderBy: { name: "asc" },
      take: 100,
    })
    return NextResponse.json(users)
  } catch (error: unknown) {
    // [T2] Fixed error: any → error: unknown
    console.error("[team] GET error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/team - Create records
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // [T1] Rate limiting
    const rl = rateLimit('team-post-' + session.user.id, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // [W15] Verify user is still active
    const activeCheck = await requireActiveUser(session.user.id)
    if (activeCheck) return activeCheck

    // [T3] try/catch on req.json()
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { type, ...data } = body

    if (type === "attendance") {
      // SECURITY: Only admins can create attendance records
      const attendanceUserRole = session.user.role
      if (!isAdmin(attendanceUserRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      // [FIX H8: Validate attendance status against allowed values]
      const validAttStatuses = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "TRAINING", "NO_SCHEDULE"]
      const { date, userId: attUserId, status: attStatus, checkIn, checkOut, notes } = data
      if (attStatus && !validAttStatuses.includes(attStatus as string)) {
        return NextResponse.json({ error: "Invalid attendance status. Must be PRESENT, ABSENT, HALF_DAY, LEAVE, TRAINING, or NO_SCHEDULE" }, { status: 400 })
      }
      if (!date) {
        return NextResponse.json({ error: "Date is required" }, { status: 400 })
      }
      // [W14] Validate date format
      if (isNaN(new Date(date as string).getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
      }

      // Validate checkIn/checkOut date format if provided
      if (checkIn && isNaN(new Date(checkIn as string).getTime())) {
        return NextResponse.json({ error: "Invalid checkIn date format" }, { status: 400 })
      }
      if (checkOut && isNaN(new Date(checkOut as string).getTime())) {
        return NextResponse.json({ error: "Invalid checkOut date format" }, { status: 400 })
      }

      // [T10] Validate userId exists before creating attendance record
      if (attUserId) {
        const targetUser = await db.user.findUnique({ where: { id: attUserId as string } })
        if (!targetUser) {
          return NextResponse.json({ error: "User not found" }, { status: 404 })
        }
      }

      const attendance = await db.attendance.create({
        data: {
          date: new Date(date as string),
          userId: (attUserId || session.user.id) as string,
          ...(attStatus ? { status: attStatus as string } : {}),
          ...(checkIn ? { checkIn: checkIn as string } : {}),
          ...(checkOut ? { checkOut: checkOut as string } : {}),
          ...(notes ? { notes: (notes as string)?.slice(0, 1000) || null } : {}),
        },
      })
      // Audit: log attendance record creation (fire-and-forget)
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
        department: "HR_PEOPLE", page: "team", action: "CREATE",
        entityType: "Attendance", entityId: attendance.id,
        description: `Created attendance record for user ${attUserId || session.user.id} on ${formatDisplayDate(date as string)}${attStatus ? ` (${attStatus})` : ""}`,
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })
      return NextResponse.json(attendance, { status: 201 })
    }



    if (type === "user") {
      // SUPER_ADMIN and ADMIN: Create a new team member
      const userRole = session.user.role
      if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }

      const { name, email, role, department, password } = data
      if (!name || !email || !password) {
        return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 })
      }

      if ((password as string).length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }

      // [W14] Password complexity: must contain at least one letter and one number
      if (!/[a-zA-Z]/.test(password as string) || !/[0-9]/.test(password as string)) {
        return NextResponse.json({ error: "Password must contain at least one letter and one number" }, { status: 400 })
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email as string)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      }

      // [T4/T6] Validate role value (VIEWER is legacy — no longer assignable)
      if (role === "VIEWER") {
        return NextResponse.json({ error: "VIEWER role is no longer assignable" }, { status: 400 });
      }
      if (role && !VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      // [T5] Validate department value (allow null/empty)
      if (department && !VALID_DEPARTMENT_VALUES.includes(department as string)) {
        return NextResponse.json({ error: "Invalid department" }, { status: 400 });
      }

      // Only SUPER_ADMIN can create other SUPER_ADMIN, ADMIN, or PROJECT_MANAGER users.
      // PROJECT_MANAGER is a privileged role with admin-like project/client/credential access,
      // so it must be restricted the same way as ADMIN.
      if ((role === "SUPER_ADMIN" || role === "ADMIN" || role === "PROJECT_MANAGER") && userRole !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Only Super Admins can create Admin, Super Admin, or Project Manager users" }, { status: 403 });
      }

      // Check if email already exists
      const existing = await db.user.findUnique({ where: { email: email as string } })
      if (existing) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 })
      }

      const hashedPassword = await bcrypt.hash(password as string, 12)
      const user = await db.user.create({
        data: {
          name: name as string,
          email: email as string,
          password: hashedPassword,
          role: (role as string) || "DEVELOPER",
          department: (department as string) || null,
          isActive: true,
        }
      })

      // Audit: log new user creation (fire-and-forget)
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
        department: "HR_PEOPLE", page: "team", action: "CREATE",
        entityType: "User", entityId: user.id,
        description: `Created user: ${user.name} (${user.email}, role: ${user.role})`,
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })

      return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role }, { status: 201 })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error: unknown) {
    // [C5] Handle race condition on email uniqueness
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 })
    }
    // [T2] Fixed error: any → error: unknown
    console.error("[team] POST error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/team - Update records
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // [T1] Rate limiting
    const rl = rateLimit('team-patch-' + session.user.id, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // [W15] Verify user is still active
    const activeCheck = await requireActiveUser(session.user.id)
    if (activeCheck) return activeCheck

    // [T3] try/catch on req.json()
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { type, id, ...data } = body

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    // [W18] Explicitly reject email changes on this endpoint
    if (data.email) {
      return NextResponse.json({ error: "Email changes are not allowed here. Use /api/email-change." }, { status: 400 })
    }

    if (type === "attendance") {
      // SECURITY: Only admins can update attendance records
      const attPatchRole = session.user.role
      if (!isAdmin(attPatchRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      // SECURITY: Sanitize attendance update data
      const allowedAttFields = ["status", "checkIn", "checkOut", "notes"]
      const sanitizedAttData: Record<string, any> = {}
      for (const key of allowedAttFields) {
        if (data[key] !== undefined) sanitizedAttData[key] = data[key]
      }
      const attendanceRecord = await db.attendance.update({ where: { id: id as string }, data: sanitizedAttData })
      // Audit: log attendance update (fire-and-forget)
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
        department: "HR_PEOPLE", page: "team", action: "UPDATE",
        entityType: "Attendance", entityId: id as string,
        description: `Updated attendance record (fields: ${Object.keys(sanitizedAttData).join(", ") || "none"})`,
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })
      return NextResponse.json(attendanceRecord)
    }



    // Authorization: users can only update their own profile unless they're SUPER_ADMIN
    const sessionUserId = session.user.id;
    const sessionUserRole = session.user.role;

    const hasPageAccessUpdate =
      data.pageAccessMode !== undefined || data.pageAccessPages !== undefined

    // SECURITY: For self-profile updates (name only, no role/isActive/pageAccess),
    // always use the session user's ID — don't trust the body `id`.
    // This prevents IDOR where an ADMIN could modify another user's name.
    // Avatar updates are also self-profile updates (no role/isActive).
    const isSelfProfileUpdate =
      !data.role &&
      data.isActive === undefined &&
      !hasPageAccessUpdate &&
      (!!data.name || data.avatar !== undefined)
    const effectiveId = isSelfProfileUpdate ? sessionUserId : (id as string);

    if (effectiveId !== sessionUserId && sessionUserRole !== "SUPER_ADMIN" && sessionUserRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: You can only update your own profile" }, { status: 403 });
    }

    // Page access ACL: ADMIN or SUPER_ADMIN only (not self-serve)
    if (hasPageAccessUpdate) {
      if (sessionUserRole !== "SUPER_ADMIN" && sessionUserRole !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden: Admin access required for page access" }, { status: 403 })
      }
    }

    // Update user (SUPER_ADMIN only for role/active changes)
    if (data.role !== undefined || data.isActive !== undefined) {
      const userRole = session.user.role
      if (userRole !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can change user role or status" }, { status: 403 })
      }

      // Prevent changing role of SUPER_ADMIN users
      const targetUser = await db.user.findUnique({ where: { id: id as string } })
      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      if (targetUser.role === "SUPER_ADMIN" && data.role && data.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Cannot change role of SUPER_ADMIN users" }, { status: 403 })
      }
      if (targetUser.role === "SUPER_ADMIN" && data.isActive === false) {
        return NextResponse.json({ error: "Cannot deactivate SUPER_ADMIN users" }, { status: 403 })
      }
    }

    // [T4/T6] Validate role value on update (VIEWER is legacy — no longer assignable)
    if (data.role === "VIEWER") {
      return NextResponse.json({ error: "VIEWER role is no longer assignable" }, { status: 400 });
    }
    if (data.role && !VALID_ROLES.includes(data.role as typeof VALID_ROLES[number])) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // [T5] Validate department value on update (allow null/empty)
    if (data.department && !VALID_DEPARTMENT_VALUES.includes(data.department as string)) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }

    const updateData: Record<string, any> = {}
    if (data.name) {
      // Validate name: trim, length limit, no control characters
      const trimmedName = (data.name as string).trim()
      if (trimmedName.length < 1 || trimmedName.length > 100) {
        return NextResponse.json({ error: "Name must be between 1 and 100 characters" }, { status: 400 })
      }
      if (/[\x00-\x1f\x7f]/.test(trimmedName)) {
        return NextResponse.json({ error: "Name cannot contain control characters" }, { status: 400 })
      }
      updateData.name = trimmedName
    }
    if (data.department) updateData.department = data.department
    if (data.role) updateData.role = data.role
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    // Avatar update: accept a data URL (image only) up to 2 MB.
    // Allows any authenticated user to update their own profile picture.
    if (data.avatar !== undefined) {
      const avatarValue = data.avatar as string | null
      if (avatarValue === null) {
        // Clear avatar
        updateData.avatar = null
      } else {
        // Validate: must be a data URL with an image MIME type
        // Allowed: data:image/png;base64,..., data:image/jpeg;base64,..., data:image/webp;base64,..., data:image/gif;base64,...
        const dataUrlMatch = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(avatarValue)
        if (!dataUrlMatch) {
          return NextResponse.json({ error: "Avatar must be a base64 data URL (PNG, JPEG, WebP, or GIF)" }, { status: 400 })
        }
        // Size limit: ~2 MB base64-encoded (~2.67M chars). Base64 inflates by ~33%.
        if (avatarValue.length > 2_700_000) {
          return NextResponse.json({ error: "Avatar image too large (max 2 MB)" }, { status: 400 })
        }
        updateData.avatar = avatarValue
      }
    }
    // Password updates NOT allowed here — use /api/password-change or /api/password-reset

    if (hasPageAccessUpdate) {
      const existing = await db.user.findUnique({
        where: { id: effectiveId },
        select: { pageAccessMode: true, pageAccessPages: true },
      })
      const mode: PageAccessMode =
        data.pageAccessMode !== undefined
          ? normalizePageAccessMode(data.pageAccessMode)
          : normalizePageAccessMode(existing?.pageAccessMode)
      const allowedHrefs = new Set(
        CONTROLLABLE_PAGES.filter((p) => !p.locked).map((p) => p.href)
      )
      const pages =
        data.pageAccessPages !== undefined
          ? parsePageAccessPages(data.pageAccessPages).filter((h) => allowedHrefs.has(h))
          : parsePageAccessPages(existing?.pageAccessPages).filter((h) => allowedHrefs.has(h))
      updateData.pageAccessMode = mode
      updateData.pageAccessPages = JSON.stringify(mode === "OFF" ? [] : pages)
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    const user = await db.user.update({
      where: { id: effectiveId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        isActive: true,
        avatar: true,
        pageAccessMode: true,
        pageAccessPages: true,
      },
    })

    // Deactivate → instantly revoke all device sessions (JWT multi-device tokens)
    if (data.isActive === false) {
      try {
        const { invalidateSession } = await import("@/lib/session-manager")
        await invalidateSession(effectiveId)
      } catch (err) {
        console.warn(
          "[team] Failed to revoke sessions on deactivate:",
          err instanceof Error ? err.message : err
        )
      }
    }

    // Audit: log user profile update (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "HR_PEOPLE", page: "team", action: "UPDATE",
      entityType: "User", entityId: effectiveId,
      description: `Updated user profile: ${user.name} (fields: ${Object.keys(updateData).join(", ") || "none"})`,
      newValue: data.role ? String(data.role) : undefined,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    return NextResponse.json(user)
  } catch (error: unknown) {
    // [T2] Fixed error: any → error: unknown
    console.error("[team] PATCH error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "Team operation failed" }, { status: 500 })
  }
}

// DELETE /api/team - Remove agent access
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // [T1] Rate limiting
    const rl = rateLimit('team-del-' + session.user.id, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // [W15] Verify user is still active
    const activeCheck = await requireActiveUser(session.user.id)
    if (activeCheck) return activeCheck

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })



    if (type === "user") {
      // SUPER_ADMIN only: permanently delete a deactivated user
      if (session.user.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Forbidden: Super Admin access required" }, { status: 403 })
      }

      const target = await db.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      })
      if (!target) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      if (target.isActive) {
        return NextResponse.json({ error: "Only deactivated users can be permanently deleted" }, { status: 400 })
      }
      if (target.role === "SUPER_ADMIN") {
        return NextResponse.json({ error: "Cannot delete SUPER_ADMIN users" }, { status: 403 })
      }
      if (target.id === session.user.id) {
        return NextResponse.json({ error: "Cannot delete your own account" }, { status: 403 })
      }

      try {
        await db.$transaction(async (tx) => {
          await tx.activeSession.deleteMany({ where: { userId: id } })
          await tx.userCredential.deleteMany({ where: { userId: id } })
          await tx.notificationPreference.deleteMany({ where: { userId: id } })
          await tx.passwordReset.deleteMany({ where: { userId: id } })
          await tx.passwordChange.deleteMany({ where: { userId: id } })
          await tx.user.delete({ where: { id } })
        })
      } catch (delErr: unknown) {
        if (delErr instanceof Prisma.PrismaClientKnownRequestError && delErr.code === "P2003") {
          return NextResponse.json(
            { error: "Cannot delete user: related records still exist. Remove linked data first." },
            { status: 409 }
          )
        }
        console.error("[team] DELETE user error:", delErr instanceof Error ? delErr.message : String(delErr))
        return NextResponse.json(
          { error: "Cannot delete user due to related records. Deactivate and clean up linked data first." },
          { status: 409 }
        )
      }

      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
        department: "HR_PEOPLE", page: "team", action: "DELETE",
        entityType: "User", entityId: id,
        description: `Permanently deleted deactivated user: ${target.name} (${target.email})`,
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })

      return NextResponse.json({ success: true })
    }

    if (type === "attendance") {
      // SECURITY: Only admins can delete attendance records
      const deleteAttRole = session.user.role
      if (!isAdmin(deleteAttRole)) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
      }
      // Verify record exists before deleting
      const record = await db.attendance.findUnique({ where: { id } })
      if (!record) {
        return NextResponse.json({ error: "Attendance record not found" }, { status: 404 })
      }
      await db.attendance.delete({ where: { id } })
      // Audit: log attendance record deletion (fire-and-forget)
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
        department: "HR_PEOPLE", page: "team", action: "DELETE",
        entityType: "Attendance", entityId: id,
        description: `Deleted attendance record for user ${record.userId} on ${formatDisplayDate(record.date)}`,
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error: unknown) {
    // [T2] Fixed error: any → error: unknown
    console.error("[team] DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
