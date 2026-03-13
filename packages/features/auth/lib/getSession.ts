import type { CalSession } from "./better-auth-types";
import { authClient } from "./better-auth-client";

/**
 * Client-side session getter. Calls better-auth's getSession endpoint.
 */
export async function getSession(): Promise<CalSession | null> {
  const result = await authClient.$fetch("/get-session");
  if (result.error || !result.data) return null;
  return result.data as unknown as CalSession;
}
