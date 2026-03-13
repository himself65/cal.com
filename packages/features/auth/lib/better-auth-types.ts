import type { UserPermissionRole } from "@calcom/prisma/client";
import type { MembershipRole } from "@calcom/prisma/enums";
import type { UserProfile } from "@calcom/types/UserProfile";

/**
 * Cal.com session user shape — must match the next-auth.d.ts extension exactly
 * so that all 149 consumer files can switch imports without type errors.
 */
export interface CalUser {
  id: number;
  uuid: string;
  name?: string | null;
  email?: string | null;
  emailVerified?: Date | null;
  email_verified?: boolean;
  image?: string | null;
  username?: string | null;
  orgAwareUsername?: string | null;
  avatarUrl?: string | null;
  role?: UserPermissionRole | "INACTIVE_ADMIN";
  locale?: string | null;
  completedOnboarding?: boolean;
  belongsToActiveTeam?: boolean;
  impersonatedBy?: {
    id: number;
    uuid: string;
    role: UserPermissionRole;
  };
  org?: {
    id: number;
    name?: string;
    slug: string;
    logoUrl?: string | null;
    fullDomain: string;
    domainSuffix: string;
    role: MembershipRole;
  };
  profile?: UserProfile;
  samlTenant?: string;
}

/**
 * Cal.com session shape — matches the next-auth Session extension exactly.
 */
export interface CalSession {
  hasValidLicense: boolean;
  profileId?: number | null;
  upId: string;
  expires: string;
  user: CalUser;
}
