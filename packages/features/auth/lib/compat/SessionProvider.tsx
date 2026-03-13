"use client";

import type { ReactNode } from "react";

interface SessionProviderProps {
  children: ReactNode;
  /** Kept for API compat — better-auth doesn't require a provider wrapper. */
  session?: unknown;
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
  refetchWhenOffline?: boolean;
}

/**
 * Drop-in replacement for next-auth's `<SessionProvider>`.
 *
 * better-auth doesn't need a context provider — session state is managed
 * internally by the auth client. This component simply passes through
 * children so that existing provider trees don't need restructuring.
 *
 *   // Before
 *   import { SessionProvider } from "next-auth/react";
 *
 *   // After
 *   import { SessionProvider } from "@calcom/features/auth/lib/compat";
 */
export function SessionProvider({ children }: SessionProviderProps) {
  return <>{children}</>;
}
