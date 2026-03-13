import type { GetServerSidePropsContext, NextApiResponse } from "next";

import { prisma } from "@calcom/prisma";
import { IdentityProvider } from "@calcom/prisma/enums";

type UpdateProfileOptions = {
  ctx: {
    user: {
      id: number;
      identityProvider: IdentityProvider;
      identityProviderId: string | null;
    };
    res?: NextApiResponse | GetServerSidePropsContext["res"];
  };
};

const unlinkConnectedAccount = async ({ ctx }: UpdateProfileOptions) => {
  const { user } = ctx;
  const provider = user.identityProvider.toLocaleLowerCase();
  // Remove the linked account record
  try {
    await prisma.account.deleteMany({
      where: {
        provider,
        providerAccountId: user.identityProviderId || "",
        userId: user.id,
      },
    });
  } catch {
    // Fail silently if we don't have a record in the account table
  }
  // Fall back to the default identity provider
  const _user = await prisma.user.update({
    where: {
      id: user.id,
      identityProvider: IdentityProvider.GOOGLE,
      identityProviderId: { not: null },
    },
    data: {
      identityProvider: IdentityProvider.CAL,
      identityProviderId: null,
    },
    select: {
      id: true,
    },
  });
  if (!_user) return { message: "account_unlinked_error" };
  return { message: "account_unlinked_success" };
};

export default unlinkConnectedAccount;
