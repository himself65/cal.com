import { waitUntil } from "@vercel/functions";

import { getBillingProviderService } from "@calcom/features/ee/billing/di/containers/Billing";
import createUsersAndConnectToOrg from "@calcom/features/ee/dsync/lib/users/createUsersAndConnectToOrg";
import { getOrganizationRepository } from "@calcom/features/ee/organizations/di/OrganizationRepository.container";
import { hostedCal, isSAMLLoginEnabled } from "@calcom/features/ee/sso/lib/saml";
import { HOSTED_CAL_FEATURES, IS_CALCOM } from "@calcom/lib/constants";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { isENVDev } from "@calcom/lib/env";
import logger from "@calcom/lib/logger";
import { randomString } from "@calcom/lib/random";
import { safeStringify } from "@calcom/lib/safeStringify";
import { hashEmail } from "@calcom/lib/server/PiiHasher";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { CreationSource, IdentityProvider, MembershipRole } from "@calcom/prisma/enums";

import { getOrgUsernameFromEmail } from "../signup/utils/getOrgUsernameFromEmail";
import { dub } from "./dub";

const log = logger.getSubLogger({ prefix: ["better-auth-hooks"] });

const usernameSlug = (username: string) => `${slugify(username)}-${randomString(6).toLowerCase()}`;
const getDomainFromEmail = (email: string): string => email.split("@")[1];

const ORGANIZATIONS_AUTOLINK =
  process.env.ORGANIZATIONS_AUTOLINK === "1" || process.env.ORGANIZATIONS_AUTOLINK === "true";

async function checkIfUserShouldBelongToOrg(idP: IdentityProvider, email: string) {
  const [orgUsername, apexDomain] = email.split("@");
  if (!ORGANIZATIONS_AUTOLINK || idP !== "GOOGLE") return { orgUsername, orgId: undefined };
  const existingOrg = await prisma.team.findFirst({
    where: {
      organizationSettings: {
        isOrganizationVerified: true,
        orgAutoAcceptEmail: apexDomain,
      },
    },
    select: { id: true },
  });
  return { orgUsername, orgId: existingOrg?.id };
}

/**
 * Database hooks for better-auth.
 *
 * These replicate the logic from the next-auth signIn callback and events:
 * - User creation: org auto-assignment, Stripe customer, Dub tracking
 * - Session creation: rate limiting, locked account checks
 */
export function getDatabaseHooks() {
  return {
    user: {
      create: {
        before: async (user: Record<string, unknown>) => {
          const email = user.email as string;
          if (!email) return true;

          // Check if the user should auto-join an organization
          const idP = IdentityProvider.GOOGLE; // Default for OAuth sign-ups
          const { orgUsername, orgId } = await checkIfUserShouldBelongToOrg(idP, email);

          const username = orgId ? slugify(orgUsername) : usernameSlug((user.name as string) || email);

          return {
            data: {
              ...user,
              username,
              emailVerified: new Date(),
              identityProvider: idP,
              creationSource: CreationSource.WEBAPP,
              ...(orgId && {
                verified: true,
                organizationId: orgId,
              }),
            },
          };
        },

        after: async (user: Record<string, unknown>) => {
          const userId = user.id as number;
          const email = user.email as string;
          const name = user.name as string;
          const username = user.username as string;

          // Auto-join org membership if organizationId was set
          const orgId = user.organizationId as number | undefined;
          if (orgId) {
            try {
              await prisma.membership.create({
                data: {
                  role: MembershipRole.MEMBER,
                  accepted: true,
                  userId,
                  teamId: orgId,
                },
              });
            } catch (err) {
              log.error("Failed to create org membership for new user", err);
            }
          }

          // Create Stripe customer in the background
          waitUntil(
            (async () => {
              try {
                const billingService = getBillingProviderService();
                const customer = await billingService.createCustomer({
                  email,
                  metadata: {
                    email,
                    username: username ?? "",
                  },
                });
                await prisma.user.update({
                  where: { id: userId },
                  data: {
                    metadata: {
                      stripeCustomerId: customer.stripeCustomerId,
                    },
                  },
                });
              } catch (err) {
                log.error("Failed to create Stripe customer for new user", err);
              }
            })()
          );

          // Track new user sign-up with Dub analytics
          if ((isENVDev || IS_CALCOM) && process.env.DUB_API_KEY) {
            waitUntil(
              (async () => {
                try {
                  await dub.track.lead({
                    clickId: "",
                    eventName: "Sign Up",
                    externalId: String(userId),
                    customerName: name,
                    customerEmail: email,
                  });
                } catch (err) {
                  log.error("Failed to track new user with Dub", err);
                }
              })()
            );
          }
        },
      },
    },

    session: {
      create: {
        before: async (session: Record<string, unknown>) => {
          const userId = session.userId as string;
          if (!userId) return true;

          // Check if user is locked
          const user = await prisma.user.findUnique({
            where: { id: Number(userId) },
            select: { locked: true, email: true },
          });

          if (!user) return false;

          if (user.locked) {
            log.warn("Blocked session creation for locked user", { userId });
            return false;
          }

          // Rate limit check
          try {
            await checkRateLimitAndThrowError({
              identifier: hashEmail(user.email),
            });
          } catch {
            log.warn("Rate limit exceeded for session creation", { userId });
            return false;
          }

          return true;
        },
      },
    },
  };
}
