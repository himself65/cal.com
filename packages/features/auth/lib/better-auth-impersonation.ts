import { ensureOrganizationIsReviewed } from "@calcom/ee/organizations/lib/ensureOrganizationIsReviewed";
import { getOrgFullOrigin, subdomainSuffix } from "@calcom/features/ee/organizations/lib/orgDomains";
import {
  checkGlobalPermission,
  checkPBACImpersonationPermission,
  checkSelfImpersonation,
  checkUserIdentifier,
} from "@calcom/features/ee/impersonation/lib/ImpersonationProvider";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import type { Membership } from "@calcom/prisma/client";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";

import { auth } from "./better-auth";
import type { CalSession } from "./better-auth-types";

const log = logger.getSubLogger({ prefix: ["better-auth-impersonation"] });

/**
 * Impersonate a user by creating a new better-auth session.
 *
 * Replicates the ImpersonationProvider logic:
 * 1. Validates permissions (ADMIN or PBAC)
 * 2. Creates audit log in Impersonations table
 * 3. Creates a new session for the target user with impersonatedBy metadata
 *
 * Returns the new session token that the caller should set as a cookie.
 */
export async function impersonateUser({
  currentSession,
  targetUsername,
  teamId,
}: {
  currentSession: CalSession;
  targetUsername: string;
  teamId?: number;
}): Promise<{ sessionToken: string; impersonatedUserId: number }> {
  // Validate
  checkSelfImpersonation(
    { user: currentSession.user } as Parameters<typeof checkSelfImpersonation>[0],
    { username: targetUsername, teamId: teamId?.toString(), returnToId: "" }
  );
  checkUserIdentifier({ username: targetUsername, teamId: teamId?.toString(), returnToId: "" });
  checkGlobalPermission({ user: currentSession.user } as Parameters<typeof checkGlobalPermission>[0]);

  // Find target user
  const impersonatedUser = await prisma.user.findFirst({
    where: {
      OR: [{ username: targetUsername }, { email: targetUsername }],
    },
    select: {
      id: true,
      username: true,
      role: true,
      name: true,
      email: true,
      disableImpersonation: true,
      locale: true,
      organizationId: true,
      teams: {
        where: teamId
          ? { team: { id: teamId }, accepted: true, disableImpersonation: false }
          : { accepted: true },
        select: { teamId: true, role: true, disableImpersonation: true },
      },
    },
  });

  if (!impersonatedUser) {
    throw new Error("This user does not exist");
  }

  const currentUserId = currentSession.user.id;
  const isAdmin = currentSession.user.role === UserPermissionRole.ADMIN;

  if (isAdmin) {
    if (impersonatedUser.disableImpersonation) {
      throw new Error("This user has disabled Impersonation.");
    }
  } else {
    // Non-admin: must have org context and PBAC permission
    await ensureOrganizationIsReviewed(currentSession.user.org?.id);

    if (!teamId) {
      throw new Error("You do not have permission to do this.");
    }

    const sessionUserFromDb = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        teams: {
          where: { team: { id: teamId } },
          select: { role: true },
        },
      },
    });

    if (!sessionUserFromDb?.teams.length || !impersonatedUser.teams.length) {
      throw new Error("You do not have permission to do this.");
    }

    const hasPermission = await checkPBACImpersonationPermission({
      userId: currentUserId,
      teamId,
      userRole: sessionUserFromDb.teams[0].role as MembershipRole,
      organizationId: currentSession.user.org?.id,
    });

    if (!hasPermission) {
      throw new Error("You do not have permission to impersonate this user.");
    }

    // Admin can't impersonate owner
    if (
      sessionUserFromDb.teams[0].role === MembershipRole.ADMIN &&
      impersonatedUser.teams[0]?.role === MembershipRole.OWNER
    ) {
      throw new Error("You do not have permission to do this.");
    }
  }

  // Audit log
  await prisma.impersonations.create({
    data: {
      impersonatedBy: { connect: { id: currentUserId } },
      impersonatedUser: { connect: { id: impersonatedUser.id } },
    },
  });

  // Create a new session for the impersonated user
  // We store the impersonator's info in the session metadata via ipAddress field
  // (better-auth doesn't have a native impersonatedBy field on sessions yet,
  // so we'll store it and parse it in enrichSession)
  const newSession = await prisma.session.create({
    data: {
      sessionToken: crypto.randomUUID(),
      userId: impersonatedUser.id,
      expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      // Store impersonation metadata as JSON in userAgent field
      userAgent: JSON.stringify({
        impersonatedBy: {
          id: currentUserId,
          uuid: currentSession.user.uuid,
          role: currentSession.user.role,
        },
      }),
    },
  });

  log.debug("Created impersonation session", {
    impersonatedUserId: impersonatedUser.id,
    impersonatedByUserId: currentUserId,
  });

  return {
    sessionToken: newSession.sessionToken,
    impersonatedUserId: impersonatedUser.id,
  };
}

/**
 * Stop impersonating and return to the original admin session.
 */
export async function stopImpersonating({
  currentSession,
  adminSessionToken,
}: {
  currentSession: CalSession;
  adminSessionToken: string;
}): Promise<{ sessionToken: string }> {
  // Delete the impersonation session
  const currentDbSession = await prisma.session.findFirst({
    where: { userId: currentSession.user.id },
    orderBy: { expires: "desc" },
  });

  if (currentDbSession) {
    await prisma.session.delete({
      where: { id: currentDbSession.id },
    });
  }

  return { sessionToken: adminSessionToken };
}
