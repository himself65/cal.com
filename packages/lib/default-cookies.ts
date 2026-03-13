type CookieOptions = {
  domain?: string;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
};

type CookieOption = {
  name: string;
  options: CookieOptions;
};

type CookiesOptions = Record<string, CookieOption>;

/**
 * Cookie configuration for auth.
 *
 * Use secure cookies if the site uses HTTPS.
 * This being conditional allows cookies to work non-HTTPS development URLs.
 * Honour secure cookie option, which sets 'secure' and also adds '__Secure-'
 * prefix, but enable them by default if the site URL is HTTPS; but not for
 * non-HTTPS URLs like http://localhost which are used in development.
 * For more on prefixes see https://googlechrome.github.io/samples/cookie-prefixes/
 */

const NEXTAUTH_COOKIE_DOMAIN = process.env.NEXTAUTH_COOKIE_DOMAIN || "";

export function defaultCookies(useSecureCookies: boolean): CookiesOptions {
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";

  const defaultOptions: CookieOptions = {
    domain: NEXTAUTH_COOKIE_DOMAIN || undefined,
    sameSite: useSecureCookies ? "none" : "lax",
    path: "/",
    secure: useSecureCookies,
  };
  return {
    sessionToken: {
      name: `${cookiePrefix}better-auth.session_token`,
      options: {
        ...defaultOptions,
        httpOnly: true,
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}better-auth.callback-url`,
      options: defaultOptions,
    },
    csrfToken: {
      name: `${cookiePrefix}better-auth.csrf-token`,
      options: {
        ...defaultOptions,
        httpOnly: true,
      },
    },
  };
}
