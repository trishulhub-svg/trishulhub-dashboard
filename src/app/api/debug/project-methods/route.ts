import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureAllTables } from "@/lib/auto-migrate"

// GET /api/debug/project-methods — Diagnostic endpoint
// Tests the full flow and returns detailed results
export async function GET() {
  const results: Array<{ step: string; status: string; detail?: string; data?: unknown }> = []

  // Step 1: Session check
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      results.push({ step: "1_session", status: "FAIL", detail: "No session" })
      return NextResponse.json({ results })
    }
    results.push({ step: "1_session", status: "OK", detail: `role=${session.user.role}, id=${session.user.id}` })
    if (!isAdmin(session.user.role)) {
      results.push({ step: "1b_admin_check", status: "FAIL", detail: `role=${session.user.role} is not admin` })
      return NextResponse.json({ results })
    }
    results.push({ step: "1b_admin_check", status: "OK" })
  } catch (e: unknown) {
    results.push({ step: "1_session", status: "ERROR", detail: e instanceof Error ? e.message : String(e) })
  }

  // Step 2: ensureAllTables
  try {
    await ensureAllTables()
    results.push({ step: "2_ensureAllTables", status: "OK" })
  } catch (e: unknown) {
    results.push({ step: "2_ensureAllTables", status: "ERROR", detail: e instanceof Error ? e.message : String(e) })
  }

  // Step 3: Check if table exists via raw query
  try {
    const tableCheck = await db.$queryRawUnsafe(
      `SELECT name, sql FROM sqlite_master WHERE type='table' AND name='ProjectMethod'`
    ) as Array<{ name: string; sql: string }>
    results.push({ step: "3_table_exists", status: tableCheck.length > 0 ? "OK" : "FAIL", data: tableCheck })
  } catch (e: unknown) {
    results.push({ step: "3_table_exists", status: "ERROR", detail: e instanceof Error ? e.message : String(e) })
  }

  // Step 4: Try listing existing methods
  try {
    const methods = await db.projectMethod.findMany()
    results.push({ step: "4_findMany", status: "OK", data: methods })
  } catch (e: unknown) {
    results.push({ step: "4_findMany", status: "ERROR", detail: e instanceof Error ? e.message : String(e) })
  }

  // Step 5: Try creating a test method
  try {
    const testMethod = await db.projectMethod.create({ data: { name: `DEBUG_TEST_${Date.now()}` } })
    results.push({ step: "5_create", status: "OK", data: testMethod })
    // Cleanup
    await db.projectMethod.delete({ where: { id: testMethod.id } })
    results.push({ step: "5b_cleanup", status: "OK" })
  } catch (e: unknown) {
    const errDetail = e instanceof Error ? e.message : String(e)
    const errCode = (e as Record<string, unknown>).code
    const errMeta = (e as Record<string, unknown>).meta
    results.push({ step: "5_create", status: "ERROR", detail: errDetail, data: { code: errCode, meta: errMeta } })
  }

  // Step 6: Check DB connection info
  try {
    const info = await db.$queryRawUnsafe(`SELECT 1 as ok`)
    results.push({ step: "6_db_connection", status: "OK", data: info })
  } catch (e: unknown) {
    results.push({ step: "6_db_connection", status: "ERROR", detail: e instanceof Error ? e.message : String(e) })
  }

  return NextResponse.json({ results, timestamp: new Date().toISOString() })
}
