import { createAuthClient } from "better-auth/react";

import { WEBAPP_URL } from "@calcom/lib/constants";

import type { BetterAuthType } from "./better-auth";

export const authClient = createAuthClient({
  baseURL: WEBAPP_URL,
  basePath: "/api/auth/better",
});

export const { useSession, signIn, signOut, signUp } = authClient;
