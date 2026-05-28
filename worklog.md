---
Task ID: 1
Agent: Main Coordinator
Task: Full parallel audit of finance page (5 agents)

Work Log:
- Launched 6 parallel agents to audit: finance page.tsx, overview-charts.tsx, API routes, dashboard page.tsx (working reference), utils/types, Prisma schema
- All agents completed with detailed findings

Stage Summary:
CRITICAL FINDINGS:
1. React #310 source: NOT in overview-charts.tsx (cleared). Likely from: (a) notif.title/message in layout.tsx not wrapped in safeText, (b) POST/PATCH API responses returning raw Prisma Date objects, (c) excessive re-renders from useEffect dependency issues
2. Double-fetch storm: Filter useEffect (line 438) fires on mount AND on every filter change. Non-memoized fetch functions in deps cause cascade re-renders
3. formatDate("") renders "Invalid Date" - missing null guard
4. fetchEmployees calls non-existent /api/users - employee dropdown always empty
5. All tabs blocked by dashLoading guard - even non-overview tabs
6. 1758-line god component with 38 useState + 55 hooks
7. overview-charts.tsx missing React.memo and empty state for BarChart

HIGH FINDINGS:
8. POST/PATCH API responses missing JSON.parse(JSON.stringify()) for Date serialization
9. Pagination NaN bug across endpoints
10. Missing createExpenseSchema Zod validation
11. Expenses search pagination mismatch (in-memory filter after DB pagination)
12. TOCTOU race conditions in subscription PATCH/DELETE
13. Missing error.tsx for finance page
14. deepSanitize returns {} on failure instead of [] for array types

KEY INSIGHT FROM DASHBOARD COMPARISON:
- Dashboard works perfectly with 504 lines, 3 useState, 1 useEffect, no hydration guards
- Finance has 1758 lines, 38 useState, 6 useEffect, complex hydration defense
- Dashboard uses atomic loading (all-or-nothing), finance uses partial loading
- Dashboard has error.tsx boundary, finance doesn't
