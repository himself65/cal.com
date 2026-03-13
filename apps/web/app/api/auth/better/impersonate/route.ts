import { NextResponse } from "next/server";

import { auth } from "@calcom/features/auth/lib/better-auth";
import { impersonateUser, stopImpersonating } from "@calcom/features/auth/lib/better-auth-impersonation";
import { enrichSession } from "@calcom/features/auth/lib/better-auth-session";
import logger from "@calcom/lib/logger";

const log = logger.getSubLogger({ prefix: ["api/auth/better/impersonate"] });

/**
 * POST /api/auth/better/impersonate
 *
 * Start or stop impersonation.
 *
 * Body: { action: "start", username: string, teamId?: number }
 *    or { action: "stop", adminSessionToken: string }
 */
export async function POST(request: Request) {
  try {
    const headers = request.headers;
    const betterAuthSession = await auth.api.getSession({ headers });

    if (!betterAuthSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const calSession = await enrichSession(betterAuthSession);
    const body = await request.json();

    if (body.action === "start") {
      const { username, teamId } = body;
      if (!username) {
        return NextResponse.json({ error: "username is required" }, { status: 400 });
      }

      const result = await impersonateUser({
        currentSession: calSession,
        targetUsername: username,
        teamId: teamId ? Number(teamId) : undefined,
      });

      return NextResponse.json({
        sessionToken: result.sessionToken,
        impersonatedUserId: result.impersonatedUserId,
      });
    }

    if (body.action === "stop") {
      const { adminSessionToken } = body;
      if (!adminSessionToken) {
        return NextResponse.json({ error: "adminSessionToken is required" }, { status: 400 });
      }

      const result = await stopImpersonating({
        currentSession: calSession,
        adminSessionToken,
      });

      return NextResponse.json({
        sessionToken: result.sessionToken,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log.error("Impersonation error", { error: message });
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
