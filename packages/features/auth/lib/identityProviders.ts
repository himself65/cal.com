import { IdentityProvider } from "@calcom/prisma/enums";

/**
 * Maps OAuth provider names to IdentityProvider enum values.
 * Includes aliases (e.g., "saml-idp" -> SAML).
 */
export const PROVIDER_TO_IDENTITY_PROVIDER: Record<string, IdentityProvider> = {
  "azure-ad": IdentityProvider.AZUREAD,
  google: IdentityProvider.GOOGLE,
  saml: IdentityProvider.SAML,
  "saml-idp": IdentityProvider.SAML,
  cal: IdentityProvider.CAL,
};

/**
 * @deprecated Use PROVIDER_TO_IDENTITY_PROVIDER directly
 */
export const NEXTAUTH_TO_IDENTITY_PROVIDER = PROVIDER_TO_IDENTITY_PROVIDER;

/**
 * Get IdentityProvider enum from OAuth provider name.
 * Returns null for unknown providers so callers can reject the login gracefully.
 */
export const getIdentityProvider = (provider: string): IdentityProvider | null => {
  return PROVIDER_TO_IDENTITY_PROVIDER[provider] ?? null;
};
