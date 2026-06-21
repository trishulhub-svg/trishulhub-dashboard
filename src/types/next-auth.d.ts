import { DefaultUser } from "next-auth"
import { JWT as DefaultJWT } from "next-auth/jwt"

type UserRole = "SUPER_ADMIN" | "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER" | "VIEWER" | "CLIENT"

declare module "next-auth" {
  interface User {
    role: UserRole
    id: string
    department?: string
  }
  interface Session {
    user: User & DefaultUser
    error?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string
    role: UserRole
    id: string
    name?: string
    email?: string
    department?: string
    sessionToken?: string
    error?: string
  }
}
