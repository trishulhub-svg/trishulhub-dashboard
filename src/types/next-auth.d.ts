import { DefaultUser } from "next-auth"
import { JWT as DefaultJWT } from "next-auth/jwt"

type UserRole = "SUPER_ADMIN" | "ADMIN" | "DEVELOPER" | "CLIENT"

declare module "next-auth" {
  interface User {
    role: UserRole
    id: string
  }
  interface Session {
    user: User & DefaultUser
    error?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole
    id: string
    sessionToken?: string
    error?: string
  }
}
