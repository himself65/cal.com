import { NextAuthPassportStrategy } from "@/lib/passport/strategies/types";
import { UsersRepository } from "@/modules/users/users.repository";
import { Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { getToken } from "next-auth/jwt";

@Injectable()
export class NextAuthStrategy extends PassportStrategy(NextAuthPassportStrategy, "next-auth") {
  constructor(private readonly userRepository: UsersRepository, private readonly config: ConfigService) {
    super();
  }

  /**
   * Try to authenticate via better-auth DB session cookie first,
   * then fall back to next-auth JWT token.
   */
  async authenticate(req: Request) {
    try {
      const betterAuthEnabled = this.config.get("app.betterAuthEnabled", { infer: true }) === "true";

      // Try better-auth session cookie
      if (betterAuthEnabled) {
        const user = await this.authenticateWithBetterAuth(req);
        if (user) return this.success(user);
      }

      // Fall back to next-auth JWT
      const nextAuthSecret = this.config.get("next.authSecret", { infer: true });
      const payload = await getToken({ req, secret: nextAuthSecret });

      if (!payload) {
        throw new UnauthorizedException("NextAuthStrategy - Authentication token is missing or invalid.");
      }

      if (!payload.email) {
        throw new UnauthorizedException("NextAuthStrategy - Email not found in the authentication token.");
      }

      const user = await this.userRepository.findByEmailWithProfile(payload.email);
      if (!user) {
        throw new UnauthorizedException(
          "NextAuthStrategy - User associated with the authentication token email not found."
        );
      }

      return this.success(user);
    } catch (error) {
      if (error instanceof Error) return this.error(error);
      return this.error(
        new InternalServerErrorException(
          "NextAuthStrategy - An error occurred while authenticating the request"
        )
      );
    }
  }

  /**
   * Attempts to validate a better-auth session cookie by looking up the
   * session token in the database.
   */
  private async authenticateWithBetterAuth(req: Request) {
    try {
      const sessionToken =
        req.cookies?.["better-auth.session_token"] || req.cookies?.["__Secure-better-auth.session_token"];

      if (!sessionToken) return null;

      const user = await this.userRepository.findBySessionToken(sessionToken);
      return user ?? null;
    } catch {
      return null;
    }
  }
}
