import NextAuth from "next-auth"
import { UserRole } from "@prisma/client"
import { PrismaAdapter } from "@auth/prisma-adapter"
import type { DefaultSession } from "next-auth"
import { db } from "./src/lib/db"
import { getUserById } from "./src/components/auth/user"
import { getTwoFactorConfirmationByUserId } from "./src/components/auth/verification/2f-confirmation"
import { getAccountByUserId } from "./src/components/auth/account"
import authConfig from "./auth.config"
import { validateEnv } from "./src/lib/env-check"

// Validate environment variables
validateEnv();

const isDevelopment = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

// Extend the built-in session types
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string
      role: UserRole
      isTwoFactorEnabled: boolean
      isOAuth: boolean
    } & DefaultSession["user"]
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  pages: {
    signIn: "/login",
    error: "/error",
  },
  cookies: {
    sessionToken: {
      name: isProduction ? `__Secure-next-auth.session-token` : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: isProduction ? "strict" : "lax",
        path: "/",
        secure: isProduction,
        maxAge: 30 * 24 * 60 * 60, // 30 days
      },
    },
    callbackUrl: {
      name: isProduction ? `__Secure-next-auth.callback-url` : `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
      },
    },
    csrfToken: {
      name: isProduction ? `__Host-next-auth.csrf-token` : `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
      },
    },
  },
  // Ensure proper URL handling for production
  trustHost: true,
  events: {
    async linkAccount({ user }) {
      if (isDevelopment) {
        console.log("OAuth account linked:", user.email);
      }
      if (user.id) {
        await db.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() }
        })
      }
    },
    async signIn({ user, account, isNewUser }) {
      if (isDevelopment) {
        console.log("Sign-in event:", {
          userId: user.id,
          provider: account?.provider,
          isNewUser
        });
      }
      // Track sign-in for security auditing
      if (user.id) {
        await db.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() }
        }).catch(() => {});
      }
    },
  },
  callbacks: {
    async signIn({ user, account }) {
      if (isDevelopment) {
        console.log("Sign-in attempt:", {
          userId: user.id,
          provider: account?.provider
        });
      }
      
      if (!user.id) return false
      
      if (account?.provider !== "credentials") return true

      const existingUser = await getUserById(user.id)

      if (!existingUser?.emailVerified) return false

      if (existingUser.isTwoFactorEnabled) {
        const twoFactorConfirmation = await getTwoFactorConfirmationByUserId(existingUser.id)

        if (!twoFactorConfirmation) return false

        await db.twoFactorConfirmation.delete({
          where: { id: twoFactorConfirmation.id }
        })
      }

      return true
    },
    async session({ token, session }) {
      if (token.sub && session.user) {
        session.user.id = token.sub
      }

      if (token.role && session.user) {
        session.user.role = token.role as UserRole
      }

      if (session.user) {
        session.user.isTwoFactorEnabled = !!token.isTwoFactorEnabled
        session.user.name = token.name as string
        session.user.email = token.email as string
        session.user.isOAuth = !!token.isOAuth
      }

      return session
    },
    async jwt({ token }) {
      if (!token.sub) return token

      const existingUser = await getUserById(token.sub)

      if (!existingUser) return token

      const existingAccount = await getAccountByUserId(existingUser.id)

      token.isOAuth = !!existingAccount
      token.name = existingUser.username
      token.email = existingUser.email
      token.role = existingUser.role
      token.isTwoFactorEnabled = existingUser.isTwoFactorEnabled

      return token
    }
  },
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  // Enable debug mode only in development
  debug: isDevelopment,
  // Production security settings
  useSecureCookies: isProduction,
  ...authConfig,
})