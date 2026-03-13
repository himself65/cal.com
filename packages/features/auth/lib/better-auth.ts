import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { WEBAPP_URL } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";

import { getMagicLinkPlugin } from "./better-auth-email";
import { getDatabaseHooks } from "./better-auth-hooks";
import { hashPassword, verifyPasswordBridge } from "./better-auth-password";
import { getGoogleProviderConfig, getSamlOAuthPlugin } from "./better-auth-providers";

const useSecureCookies = WEBAPP_URL?.startsWith("https://");
const NEXTAUTH_COOKIE_DOMAIN = process.env.NEXTAUTH_COOKIE_DOMAIN || "";

const googleProvider = getGoogleProviderConfig();
const samlPlugin = getSamlOAuthPlugin();
const magicLinkPlugin = getMagicLinkPlugin();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  basePath: "/api/auth/better",

  trustedOrigins: WEBAPP_URL ? [WEBAPP_URL] : [],

  emailAndPassword: {
    enabled: true,
    password: {
      hash: hashPassword,
      verify: verifyPasswordBridge,
    },
  },

  socialProviders: {
    ...(googleProvider ?? {}),
  },

  databaseHooks: getDatabaseHooks(),

  /**
   * Map better-auth's internal field names to the existing Cal.com Prisma schema.
   *
   * better-auth defaults:
   *   user: { id: string, email, emailVerified: boolean, name, image, createdAt, updatedAt }
   *   session: { id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt }
   *   account: { id, userId, providerId, accountId, accessToken, refreshToken, ... }
   *
   * Cal.com existing columns (see packages/prisma/schema.prisma):
   *   User:    { id: Int @id @default(autoincrement()), avatarUrl, emailVerified: DateTime?, ... } @@map("users")
   *   Session: { id: String, sessionToken, userId: Int, expires: DateTime }
   *   Account: { id: String, userId: Int, provider, providerAccountId, access_token, refresh_token, ... }
   */

  user: {
    modelName: "user",
    fields: {
      image: "avatarUrl",
      createdAt: "created",
    },
    additionalFields: {
      uuid: {
        type: "string",
        required: false,
        returned: true,
        input: false,
      },
      username: {
        type: "string",
        required: false,
        returned: true,
        input: true,
      },
      role: {
        type: "string",
        required: false,
        returned: true,
        input: false,
        defaultValue: "USER",
      },
      locale: {
        type: "string",
        required: false,
        returned: true,
        input: true,
      },
      completedOnboarding: {
        type: "boolean",
        required: false,
        returned: true,
        input: false,
        defaultValue: false,
      },
      timeZone: {
        type: "string",
        required: false,
        returned: true,
        input: true,
        defaultValue: "Europe/London",
      },
    },
  },

  session: {
    modelName: "Session",
    fields: {
      token: "sessionToken",
      expiresAt: "expires",
    },
    expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
    updateAge: 24 * 60 * 60, // Refresh session every 24 hours
  },

  account: {
    modelName: "Account",
    fields: {
      providerId: "provider",
      accountId: "providerAccountId",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      // better-auth expects Date for these; Cal.com's expires_at is Int (epoch seconds).
      // We added new DateTime columns accessTokenExpiresAt / refreshTokenExpiresAt
      // and leave them as-is (no field mapping needed — column name matches).
    },
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "email-password"],
    },
  },

  /**
   * Use a separate Verification table so we don't conflict with the existing
   * VerificationToken table (which has Cal.com-specific fields like teamId).
   */
  verification: {
    modelName: "BetterAuthVerification",
  },

  /**
   * Cookie configuration — matches existing Next-Auth cookie names where possible.
   * During the migration period, better-auth uses its own cookies alongside the
   * existing next-auth cookies to avoid conflicts.
   */
  useSecureCookies,
  defaultCookieAttributes: {
    domain: NEXTAUTH_COOKIE_DOMAIN || undefined,
    sameSite: useSecureCookies ? "none" : "lax",
    path: "/",
    secure: useSecureCookies,
  },

  advanced: {
    database: {
      /**
       * Cal.com User.id is Int @default(autoincrement()).
       * "serial" tells better-auth to:
       * 1. Let the DB generate user IDs (SERIAL/autoincrement)
       * 2. Convert userId foreign keys to Number() in queries
       *    (critical since Session.userId and Account.userId are Int)
       */
      generateId: "serial",
    },
    crossSubDomainCookies: NEXTAUTH_COOKIE_DOMAIN
      ? {
          enabled: true,
          domain: NEXTAUTH_COOKIE_DOMAIN,
        }
      : undefined,
  },

  pages: {
    signIn: "/auth/login",
    signUp: "/auth/login",
    error: "/auth/error",
    resetPassword: "/auth/forgot-password",
    emailVerification: "/auth/verify",
  },

  plugins: [nextCookies(), magicLinkPlugin, ...(samlPlugin ? [samlPlugin] : [])],
});

export type BetterAuthType = typeof auth;
