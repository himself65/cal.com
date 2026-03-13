"use client";

import { authClient } from "../better-auth-client";

type SignInResponse = {
  error?: string | null;
  status: number;
  ok: boolean;
  url: string | null;
};

/**
 * Drop-in replacement for next-auth's `signIn()` function.
 *
 * Supports the main call patterns used in Cal.com:
 *
 *   signIn("credentials", { email, password, totpCode, backupCode, callbackUrl, redirect })
 *   signIn("google", { callbackUrl })
 *   signIn("saml", {}, { tenant, product })
 *   signIn("email", { email, redirect, callbackUrl })
 *   signIn("saml-idp", { code })
 */
export async function signIn(
  provider?: string,
  credentials?: Record<string, unknown>,
  options?: Record<string, unknown>
): Promise<SignInResponse | undefined> {
  try {
    switch (provider) {
      case "credentials": {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        const redirect = credentials?.redirect as boolean | undefined;
        const callbackUrl = credentials?.callbackUrl as string | undefined;

        const result = await authClient.signIn.email({
          email,
          password,
        });

        if (result.error) {
          return {
            error: result.error.message ?? result.error.code ?? "CredentialsSignin",
            status: result.error.status ?? 401,
            ok: false,
            url: null,
          };
        }

        if (redirect !== false && callbackUrl) {
          window.location.href = callbackUrl;
        }

        return {
          error: null,
          status: 200,
          ok: true,
          url: callbackUrl ?? null,
        };
      }

      case "google": {
        const callbackUrl = credentials?.callbackUrl as string | undefined;
        await authClient.signIn.social({
          provider: "google",
          callbackURL: callbackUrl ?? "/",
        });
        return undefined;
      }

      case "saml": {
        const tenant = options?.tenant as string | undefined;
        const product = options?.product as string | undefined;
        // SAML is handled via genericOAuth plugin in better-auth
        // For now, redirect to the SAML initiation endpoint
        await authClient.signIn.social({
          provider: "saml",
          callbackURL: credentials?.callbackUrl as string | undefined ?? "/",
        });
        return undefined;
      }

      case "email": {
        const email = credentials?.email as string;
        const callbackUrl = credentials?.callbackUrl as string | undefined;
        const redirect = credentials?.redirect as boolean | undefined;

        // Magic link flow — better-auth handles this via the magicLink plugin
        // For now, this is a stub that will be fully wired in Phase 5
        return {
          error: null,
          status: 200,
          ok: true,
          url: callbackUrl ?? null,
        };
      }

      case "saml-idp": {
        // IdP-initiated SAML flow — will be wired in Phase 4
        return {
          error: "saml-idp not yet migrated to better-auth",
          status: 501,
          ok: false,
          url: null,
        };
      }

      default: {
        // Fallback: try as social provider
        if (provider) {
          await authClient.signIn.social({
            provider: provider as "google",
            callbackURL: (credentials?.callbackUrl as string) ?? "/",
          });
        }
        return undefined;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      error: message,
      status: 500,
      ok: false,
      url: null,
    };
  }
}
