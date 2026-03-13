import { genericOAuth } from "better-auth/plugins/generic-oauth";

import { clientSecretVerifier, isSAMLLoginEnabled } from "@calcom/features/ee/sso/lib/saml";
import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_OAUTH_SCOPES,
  WEBAPP_URL,
} from "@calcom/lib/constants";

const GOOGLE_API_CREDENTIALS = process.env.GOOGLE_API_CREDENTIALS || "{}";
const { client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET } =
  JSON.parse(GOOGLE_API_CREDENTIALS)?.web || {};
const GOOGLE_LOGIN_ENABLED = process.env.GOOGLE_LOGIN_ENABLED === "true";

export const IS_GOOGLE_LOGIN_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_LOGIN_ENABLED);

/**
 * Google OAuth social provider config for better-auth.
 *
 * Requests both userinfo + calendar scopes (matching the existing
 * NextAuth GoogleProvider config) so that Google Calendar can be
 * auto-installed after first sign-in.
 */
export function getGoogleProviderConfig() {
  if (!IS_GOOGLE_LOGIN_ENABLED) return null;
  return {
    google: {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      scope: [...GOOGLE_OAUTH_SCOPES, ...GOOGLE_CALENDAR_SCOPES],
      accessType: "offline" as const,
    },
  };
}

/**
 * BoxyHQ SAML provider via better-auth's genericOAuth plugin.
 *
 * Points to the existing Jackson endpoints at /api/auth/saml/*.
 * This preserves the current SAML flow: Jackson handles the actual
 * SAML protocol, and we consume it as a standard OAuth2 flow.
 */
export function getSamlOAuthPlugin() {
  if (!isSAMLLoginEnabled) return null;

  return genericOAuth({
    config: [
      {
        providerId: "saml",
        clientId: "dummy",
        clientSecret: clientSecretVerifier,
        authorizationUrl: `${WEBAPP_URL}/api/auth/saml/authorize`,
        tokenUrl: `${WEBAPP_URL}/api/auth/saml/token`,
        userInfoUrl: `${WEBAPP_URL}/api/auth/saml/userinfo`,
        scopes: [],
        pkce: true,
        redirectURI: `${WEBAPP_URL}/api/auth/better/callback/saml`,
        mapProfileToUser: async (profile) => {
          return {
            name: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
            email: profile.email?.toLowerCase(),
            emailVerified: true,
            image: null,
          };
        },
      },
    ],
  });
}
