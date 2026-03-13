import { calendar_v3 } from "@googleapis/calendar";
import { OAuth2Client } from "googleapis-common";

import { updateProfilePhotoGoogle } from "@calcom/app-store/_utils/oauth/updateProfilePhotoGoogle";
import {
  createGoogleCalendarServiceWithGoogleType,
} from "@calcom/app-store/googlecalendar/lib/CalendarService";
import { CredentialRepository } from "@calcom/features/credentials/repositories/CredentialRepository";
import { buildCredentialCreateData } from "@calcom/features/credentials/services/CredentialDataService";
import { GOOGLE_CALENDAR_SCOPES } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";

const GOOGLE_API_CREDENTIALS = process.env.GOOGLE_API_CREDENTIALS || "{}";
const { client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET } =
  JSON.parse(GOOGLE_API_CREDENTIALS)?.web || {};

const log = logger.getSubLogger({ prefix: ["better-auth-google-calendar"] });

/**
 * Auto-installs Google Calendar + Google Meet credentials after a Google
 * OAuth sign-in, if the user granted calendar scopes.
 *
 * This replicates the logic from the JWT callback in next-auth-options.ts
 * (lines 717-775). It should be called after a successful Google sign-in
 * when the account includes calendar scopes.
 */
export async function autoInstallGoogleCalendar({
  userId,
  accessToken,
  refreshToken,
  idToken,
  tokenType,
  expiresAt,
  scope,
}: {
  userId: number;
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  tokenType?: string | null;
  expiresAt?: number | null;
  scope?: string | null;
}) {
  const grantedScopes = scope?.split(" ") ?? [];

  // Only install if all calendar scopes were granted
  if (!GOOGLE_CALENDAR_SCOPES.every((s) => grantedScopes.includes(s))) {
    return;
  }

  // Skip if already has Google Calendar credential
  const existingCred = await CredentialRepository.findFirstByAppIdAndUserId({
    userId,
    appId: "google-calendar",
  });
  if (existingCred) return;

  try {
    const credentialKey = {
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
      token_type: tokenType,
      expires_at: expiresAt,
    };

    // Install Google Calendar
    const gcalCredentialData = buildCredentialCreateData({
      userId,
      key: credentialKey,
      appId: "google-calendar",
      type: "google_calendar",
    });
    const gcalCredential = await CredentialRepository.create(gcalCredentialData);
    const gCalService = createGoogleCalendarServiceWithGoogleType({
      ...gcalCredential,
      user: null,
      delegatedTo: null,
    });

    // Install Google Meet if not already present
    const existingMeetCred = await CredentialRepository.findFirstByUserIdAndType({
      userId,
      type: "google_video",
    });
    if (!existingMeetCred) {
      const googleMeetCredentialData = buildCredentialCreateData({
        type: "google_video",
        key: {},
        userId,
        appId: "google-meet",
      });
      await CredentialRepository.create(googleMeetCredentialData);
    }

    // Set up primary calendar selection
    const oAuth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oAuth2Client.setCredentials(credentialKey);
    const calendar = new calendar_v3.Calendar({ auth: oAuth2Client });
    const primaryCal = await gCalService.getPrimaryCalendar(calendar);
    if (primaryCal?.id) {
      await gCalService.createSelectedCalendar({
        externalId: primaryCal.id,
        userId,
      });
    }

    // Update profile photo from Google
    await updateProfilePhotoGoogle(oAuth2Client, userId);

    log.debug("Auto-installed Google Calendar for user", { userId });
  } catch (err) {
    log.error("Failed to auto-install Google Calendar", err);
  }
}
