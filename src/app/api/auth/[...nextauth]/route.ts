import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"

// NextAuth v4 with App Router - trustHost handles URL detection
const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
