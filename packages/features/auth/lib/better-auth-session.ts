import type { BetterAuthOptions, Session, User } from "better-auth";

import { LicenseKeySingleton } from "@calcom/ee/common/server/LicenseKeyService";
import { DeploymentRepository } from "@calcom/features/ee/deployment/repositories/DeploymentRepository";
import { getOrgFullOrigin, subdomainSuffix } from "@calcom/features/ee/organizations/lib/orgDomains";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import { ENABLE_PROFILE_SWITCHER, IS_TEAM_BILLING_ENABLED } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import type { Membership, Team } from "@calcom/prisma/client";
import type { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";
import { teamMetadataSchema } from "@calcom/prisma/zod-utils";

import type { CalSession, CalUser } from "./better-auth-types";

const log = logger.getSubLogger({ prefix: ["better-auth-session"] });

type UserTeams = {
  teams: (Membership & {
    team: Pick<Team, "metadata">;
  })[];
};

export const checkIfUserBelongsToActiveTeam = <T extends UserTeams>(user: T) =>
  user.teams.some((m: { team: { metadata: unknown } }) => {
    if (!IS_TEAM_BILLING_ENABLED) {
      return true;
    }
    const metadata = teamMetadataSchema.safeParse(m.team.metadata);
    return metadata.success && metadata.data?.subscriptionId;
  });

/**
 * Identifies which profile the user should be logged into.
 */
function determineProfile({
  profiles,
  currentUpId,
}: {
  profiles: { id: number | null; upId: string }[];
  currentUpId?: string | null;
}): { profileId: number | null; upId: string } {
  if (!ENABLE_PROFILE_SWITCHER) {
    return profiles[0];
  }
  if (currentUpId) {
    const match = profiles.find((p) => p.upId === currentUpId);
    if (match) return { profileId: match.id, upId: match.upId };
  }
  return profiles[0];
}

/**
 * Enriches a bare better-auth session + user with all Cal.com specific data.
 *
 * This function is called by the customSession plugin and also by the
 * compatibility getServerSession shim.
 */
export async function enrichSession(
  dbSession: { session: Session; user: User },
  /**
   * Optional existing Cal.com enrichment data — when present we skip the DB
   * lookups (used by the compat layer that already has the data).
   */
  overrides?: Partial<CalSession>
): Promise<CalSession> {
  const userId = Number(dbSession.user.id);

  const deploymentRepo = new DeploymentRepository(prisma);
  const licenseKeyService = await LicenseKeySingleton.getInstance(deploymentRepo);
  const hasValidLicense = await licenseKeyService.checkLicense();

  const userFromDb = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      uuid: true,
      username: true,
      avatarUrl: true,
      name: true,
      email: true,
      role: true,
      locale: true,
      emailVerified: true,
      completedOnboarding: true,
      movedToProfileId: true,
      teams: {
        include: {
          team: {
            select: {
              id: true,
              metadata: true,
            },
          },
        },
      },
    },
  });

  if (!userFromDb) {
    log.warn("enrichSession: user not found", { userId });
    return {
      hasValidLicense,
      expires: dbSession.session.expiresAt.toISOString(),
      upId: `usr-${userId}`,
      user: {
        id: userId,
        uuid: "",
        email: dbSession.user.email,
        name: dbSession.user.name,
      },
      ...overrides,
    };
  }

  const belongsToActiveTeam = checkIfUserBelongsToActiveTeam(userFromDb);

  const allProfiles = await ProfileRepository.findAllProfilesForUserIncludingMovedUser(userFromDb);
  const { upId, profileId } = determineProfile({
    profiles: allProfiles,
    currentUpId: overrides?.upId,
  });

  const profile = await ProfileRepository.findByUpIdWithAuth(upId, userFromDb.id);
  const profileOrg = profile?.organization;

  let orgRole: MembershipRole | undefined;
  let org: CalUser["org"];

  if (profileOrg) {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_teamId: {
          teamId: profileOrg.id,
          userId: userFromDb.id,
        },
      },
    });
    orgRole = membership?.role;

    if (!profileOrg.isPlatform) {
      org = {
        id: profileOrg.id,
        name: profileOrg.name,
        slug: profileOrg.slug ?? profileOrg.requestedSlug ?? "",
        logoUrl: profileOrg.logoUrl,
        fullDomain: getOrgFullOrigin(profileOrg.slug ?? profileOrg.requestedSlug ?? ""),
        domainSuffix: subdomainSuffix(),
        role: orgRole as MembershipRole,
      };
    }
  }

  const userRepo = new UserRepository(prisma);
  const enrichedUser = await userRepo.enrichUserWithTheProfile({
    user: userFromDb,
    upId,
  });

  // Parse impersonation metadata from session's userAgent field
  // (stored as JSON by better-auth-impersonation.ts)
  let impersonatedBy: CalUser["impersonatedBy"];
  try {
    const sessionRecord = await prisma.session.findFirst({
      where: { userId, sessionToken: dbSession.session.token },
      select: { userAgent: true },
    });
    if (sessionRecord?.userAgent) {
      const parsed = JSON.parse(sessionRecord.userAgent);
      if (parsed?.impersonatedBy?.id) {
        impersonatedBy = parsed.impersonatedBy;
      }
    }
  } catch {
    // userAgent is not JSON — normal session, not impersonation
  }

  const calUser: CalUser = {
    id: userFromDb.id,
    uuid: userFromDb.uuid,
    name: userFromDb.name,
    email: userFromDb.email,
    emailVerified: userFromDb.emailVerified,
    email_verified: userFromDb.emailVerified !== null,
    image: getUserAvatarUrl({ avatarUrl: userFromDb.avatarUrl }),
    username: userFromDb.username,
    orgAwareUsername: profileOrg ? profile?.username : userFromDb.username,
    avatarUrl: userFromDb.avatarUrl,
    role: userFromDb.role as UserPermissionRole,
    locale: userFromDb.locale,
    completedOnboarding: userFromDb.completedOnboarding,
    belongsToActiveTeam,
    impersonatedBy,
    org,
    profile: enrichedUser.profile,
  };

  return {
    hasValidLicense,
    profileId: profileId ?? null,
    upId,
    expires: dbSession.session.expiresAt.toISOString(),
    user: calUser,
  };
}
