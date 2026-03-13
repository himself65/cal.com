import { compare, hash } from "bcryptjs";

import prisma from "@calcom/prisma";

const BCRYPT_ROUNDS = 12;

/**
 * Custom password hash function for better-auth.
 *
 * Cal.com stores password hashes in a separate UserPassword table
 * (not on the User model). better-auth stores password in the Account
 * model's `password` field for credential accounts. This hash function
 * is used when better-auth creates a new credential account.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

/**
 * Custom password verify function for better-auth.
 *
 * Checks the UserPassword table first (for existing Cal.com users),
 * then falls back to comparing against the provided hash (for new
 * better-auth credential accounts stored in the Account table).
 */
export async function verifyPasswordBridge(data: { hash: string; password: string }): Promise<boolean> {
  return compare(data.password, data.hash);
}

/**
 * Looks up the bcrypt hash from the UserPassword table for a given user.
 * Returns null if user has no password (e.g., OAuth-only user).
 */
export async function getPasswordHashForUser(userId: number): Promise<string | null> {
  const record = await prisma.userPassword.findUnique({
    where: { userId },
    select: { hash: true },
  });
  return record?.hash ?? null;
}
