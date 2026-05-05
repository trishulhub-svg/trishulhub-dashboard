import { DefaultUser } from "next-auth"
import { JWT as DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface User {
    role: string
    id: string
  }
  interface Session {
    user: User & DefaultUser
    error?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string
    id: string
    sessionToken?: string
    error?: string
  }
}
