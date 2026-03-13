import { parse } from "accept-language-parser";
import { lookup } from "bcp-47-match";

import { i18n } from "@calcom/i18n/next-i18next.config";

import { auth } from "./better-auth";

type ReadonlyHeaders = Awaited<ReturnType<typeof import("next/headers").headers>>;
type ReadonlyRequestCookies = Awaited<ReturnType<typeof import("next/headers").cookies>>;

type ReqLike =
  | { headers: Record<string, string | string[] | undefined>; cookies?: Record<string, string> }
  | { cookies: ReadonlyRequestCookies; headers: ReadonlyHeaders };

/**
 * Build a standard Headers object from the various request types.
 */
function toHeaders(req: ReqLike): Headers {
  const headers = new Headers();
  if (req.headers instanceof Headers) {
    req.headers.forEach((value, key) => headers.set(key, value));
  } else {
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else {
        headers.set(key, value);
      }
    }
  }
  return headers;
}

/**
 * Extracts the user's locale. Tries the better-auth session first,
 * then falls back to the Accept-Language header.
 */
export const getLocale = async (req: ReqLike): Promise<string> => {
  // Try better-auth session for locale
  try {
    const session = await auth.api.getSession({ headers: toHeaders(req) });
    const locale = (session?.user as Record<string, unknown> | undefined)?.locale as string | undefined;
    if (locale) return locale;
  } catch {
    // No session — fall through to Accept-Language
  }

  // Fall back to Accept-Language header
  const acceptLanguage =
    req.headers instanceof Headers ? req.headers.get("accept-language") : req.headers["accept-language"];

  const languages = acceptLanguage ? parse(acceptLanguage) : [];

  const code: string = languages[0]?.code ?? "";
  const region: string = languages[0]?.region ?? "";

  const testedCode = /^[a-zA-Z]+$/.test(code) ? code : "en";
  const testedRegion = /^[a-zA-Z0-9]+$/.test(region) ? region : "";

  const requestedLocale = `${testedCode}${testedRegion !== "" ? "-" : ""}${testedRegion}`;

  return lookup(i18n.locales, requestedLocale) ?? requestedLocale;
};
