# TrishulHub Worklog

---
Task ID: 1
Agent: Main Agent
Task: Fix deployment - Bun runtime incompatibility with Next.js standalone

Work Log:
- Received platform error: `Cannot find package 'next'` when platform runs `bun server.js`
- Root cause: Bun uses its global module cache (/home/z/.bun/install/cache/) instead of local node_modules, resolving wrong Next.js version (16.2.4 vs 16.1.3) and missing traced dependencies
- Also found that `spawn()` was blocked on platform ("operation not permitted"), so initial Bun→Node re-spawn failed
- Fix: Restructured server.js into wrapper + _server_real.js:
  - server.js: Detects Bun, uses execFileSync('node', ...) to re-execute with Node.js
  - _server_real.js: Original Next.js server code with .env loader and DATABASE_URL redirect
  - Sets NODE_PATH to local node_modules for correct module resolution
  - Falls back to spawn() if execFileSync fails
- Fixed DATABASE_URL to use absolute path (path.join(__dirname, 'db', 'custom.db')) instead of relative
- Verified all 7 tests pass with `bun server.js` + platform environment simulation
- Updated copy-standalone.js to apply this fix automatically on every build

Stage Summary:
- ALL 7/7 TESTS PASSED with platform simulation
- Bun→Node.js transition works via execFileSync
- Full auth flow works: Login → Session → API Keys → Dashboard
- Port 81 (Caddy proxy) works
- Ready for platform deployment
