import type { GetServerSidePropsContext, NextApiRequest } from "next";
import type { Session } from "next-auth";

import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";

import { auth } from "../better-auth";
import { enrichSession } from "../better-auth-session";

const log = logger.getSubLogger({ prefix: ["compat:getServerSession"] });

/**
 * Convert a Node.js IncomingMessage (NextApiRequest / getServerSideProps req)
 * into a standard Headers object that better-auth can consume.
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
 * Drop-in replacement for the Cal.com `getServerSession` wrapper.
 *
 * Signature matches the existing function in
 * `packages/features/auth/lib/getServerSession.ts` so that consumers can
 * switch imports without any other code changes:
 *
 *   // Before
 *   import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
 *
 *   // After
 *   import { getServerSession } from "@calcom/features/auth/lib/compat";
 */
export async function getServerSession(options: {
  req: NextApiRequest | GetServerSidePropsContext["req"];
}): Promise<Session | null> {
  const { req } = options;

  try {
    const headers = headersFromReq(req);
    const betterAuthSession = await auth.api.getSession({ headers });

    if (!betterAuthSession) {
      log.debug("No better-auth session found");
      return null;
    }

    log.debug("better-auth session found", safeStringify({ userId: betterAuthSession.user.id }));

    const calSession = await enrichSession(betterAuthSession);
    // Cast to next-auth Session for backward compatibility with consumer code
    return calSession as unknown as Session;
  } catch (error) {
    log.error("Error getting better-auth session", safeStringify(error));
    return null;
  }
}
