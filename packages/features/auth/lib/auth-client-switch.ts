"use client";

/**
 * Central auth client module.
 *
 * All consumer files import from here instead of "next-auth/react".
 * Exports better-auth compat layer functions that match the next-auth API surface.
 */

export { useSession } from "./compat/useSession";
export { signIn } from "./compat/signIn";
export { signOut } from "./compat/signOut";
export { SessionProvider } from "./compat/SessionProvider";
