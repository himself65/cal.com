import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

import { ErrorCode } from "./ErrorCode";

const log = logger.getSubLogger({ prefix: ["better-auth-2fa"] });

/**
 * Verifies a TOTP code against a user's encrypted 2FA secret.
 *
 * Cal.com stores `twoFactorSecret` as AES-256 encrypted with
 * `CALENDSO_ENCRYPTION_KEY`. The decrypted secret is a 32-char string
 * used with `@calcom/lib/totp` (otplib-based).
 */
export async function verifyTotpCode(userId: number, totpCode: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      twoFactorSecret: true,
    },
  });

  if (!user?.twoFactorEnabled) {
    throw new Error(ErrorCode.TwoFactorDisabled);
  }

  if (!user.twoFactorSecret) {
    log.error(`2FA enabled for user ${userId} but no secret found`);
    throw new Error(ErrorCode.InternalServerError);
  }

  const encryptionKey = process.env.CALENDSO_ENCRYPTION_KEY;
  if (!encryptionKey) {
    log.error("Missing CALENDSO_ENCRYPTION_KEY");
    throw new Error(ErrorCode.InternalServerError);
  }

  const secret = symmetricDecrypt(user.twoFactorSecret, encryptionKey);
  if (secret.length !== 32) {
    log.error(`2FA secret decryption failed: expected 32 chars, got ${secret.length}`);
    throw new Error(ErrorCode.InternalServerError);
  }

  const { totpAuthenticatorCheck } = await import("@calcom/lib/totp");
  const isValid = totpAuthenticatorCheck(totpCode, secret);

  if (!isValid) {
    throw new Error(ErrorCode.IncorrectTwoFactorCode);
  }
}

/**
 * Verifies a backup code and invalidates it after use.
 *
 * Cal.com stores `backupCodes` as a JSON-stringified array, encrypted
 * with AES-256. Used codes are set to `null` in the array.
 */
export async function verifyBackupCode(userId: number, backupCode: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      backupCodes: true,
    },
  });

  if (!user?.twoFactorEnabled) {
    throw new Error(ErrorCode.TwoFactorDisabled);
  }

  const encryptionKey = process.env.CALENDSO_ENCRYPTION_KEY;
  if (!encryptionKey) {
    log.error("Missing CALENDSO_ENCRYPTION_KEY");
    throw new Error(ErrorCode.InternalServerError);
  }

  if (!user.backupCodes) {
    throw new Error(ErrorCode.MissingBackupCodes);
  }

  const backupCodes = JSON.parse(symmetricDecrypt(user.backupCodes, encryptionKey));
  const normalizedCode = backupCode.replaceAll("-", "");
  const index = backupCodes.indexOf(normalizedCode);

  if (index === -1) {
    throw new Error(ErrorCode.IncorrectBackupCode);
  }

  // Invalidate the used backup code
  backupCodes[index] = null;
  await prisma.user.update({
    where: { id: userId },
    data: {
      backupCodes: symmetricEncrypt(JSON.stringify(backupCodes), encryptionKey),
    },
  });
}

/**
 * Checks whether a user has 2FA enabled.
 */
export async function isTwoFactorEnabled(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });
  return user?.twoFactorEnabled ?? false;
}
