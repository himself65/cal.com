"use client";

import { authClient } from "../better-auth-client";

interface SignOutParams {
  callbackUrl?: string;
  redirect?: boolean;
}

interface SignOutResponse {
  url: string;
}

/**
 * Drop-in replacement for next-auth's `signOut()` function.
 *
 * Supports the main call patterns used in Cal.com:
 *
 *   signOut({ redirect: false })
 *   signOut({ callbackUrl: "/auth/logout" })
 */
export async function signOut(params?: SignOutParams): Promise<SignOutResponse> {
  const { callbackUrl = "/auth/login", redirect = true } = params ?? {};

  await authClient.signOut();

  if (redirect) {
    window.location.href = callbackUrl;
  }

  return { url: callbackUrl };
}
