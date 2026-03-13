import type { GetServerSidePropsContext, NextApiRequest } from "next";
import type { CalSession as Session } from "@calcom/features/auth/lib/better-auth-types";

import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";

import { auth } from "./better-auth";
import { enrichSession } from "./better-auth-session";

const log = logger.getSubLogger({ prefix: ["getServerSession"] });

/**
 * Convert a Node.js IncomingMessage into a Headers object for better-auth.
 */
function headersFromReq(req: NextApiRequest | GetServerSidePropsContext["req"]): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

/**
 * Gets the current session via better-auth.
 *
 * Reads the better-auth session cookie from the request, validates it
 * against the database, and enriches with Cal.com-specific data.
 */
export async function getServerSession(options: {
  req: NextApiRequest | GetServerSidePropsContext["req"];
  authOptions?: unknown;
}): Promise<Session | null> {
  const { req } = options;

  try {
    const headers = headersFromReq(req);
    const betterAuthSession = await auth.api.getSession({ headers });

    if (!betterAuthSession) {
      log.debug("No session found");
      return null;
    }

    log.debug("Session found", { userId: betterAuthSession.user.id });
    const calSession = await enrichSession(betterAuthSession);
    return calSession as unknown as Session;
  } catch (error) {
    log.error("Error getting session", safeStringify(error));
    return null;
  }
}
