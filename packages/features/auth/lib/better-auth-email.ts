import { magicLink } from "better-auth/plugins/magic-link";

import sendVerificationRequest from "./sendVerificationRequest";

/**
 * Magic link plugin for better-auth.
 *
 * Reuses the existing `sendVerificationRequest` email function that sends
 * the confirm-email.html Handlebars template via nodemailer.
 */
export function getMagicLinkPlugin() {
  return magicLink({
    expiresIn: 10 * 60, // 10 minutes, matching the existing EmailProvider maxAge
    sendMagicLink: async ({ email, url }) => {
      await sendVerificationRequest({
        identifier: email,
        url,
      });
    },
  });
}
