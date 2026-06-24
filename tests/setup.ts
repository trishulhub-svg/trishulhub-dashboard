// Vitest setup for availability PM access tests
const TEST_KEY = "a".repeat(64)
process.env.ENCRYPTION_KEY = TEST_KEY
process.env.CREDENTIAL_ENCRYPTION_KEY = "b".repeat(64)
process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./test.db"
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret"
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000"
