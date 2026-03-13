"use client";

import { useEffect, useState } from "react";

import type { CalSession } from "../better-auth-types";
import { authClient } from "../better-auth-client";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface UseSessionReturn {
  data: CalSession | null;
  status: SessionStatus;
  update: (data?: Partial<CalSession>) => Promise<void>;
}

/**
 * Drop-in replacement for next-auth's `useSession()` hook.
 *
 * Returns `{ data, status, update }` with the same shape so that
 * consumer components don't need any changes beyond the import path.
 *
 *   // Before
 *   import { useSession } from "next-auth/react";
 *
 *   // After
 *   import { useSession } from "@calcom/features/auth/lib/compat";
 */
export function useSession(): UseSessionReturn {
  const betterSession = authClient.useSession();

  // Map better-auth's { data, isPending, error } to next-auth's shape
  const status: SessionStatus = betterSession.isPending
    ? "loading"
    : betterSession.data
      ? "authenticated"
      : "unauthenticated";

  // For now, update is a no-op stub — better-auth doesn't have client-side
  // session mutation. The full implementation will call a custom API endpoint
  // to update session data (e.g., profile switching, locale changes).
  const update = async (_data?: Partial<CalSession>) => {
    // TODO: Implement session update via custom API endpoint
    // This will be needed for profile switching (upId/profileId changes)
    await betterSession.refetch();
  };

  return {
    data: betterSession.data as CalSession | null,
    status,
    update,
  };
}
