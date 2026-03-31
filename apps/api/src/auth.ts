import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

import type { ApiConfig } from "./config.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    email: string;
  };
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, expectedHash] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}

export function createAuthHelpers(config: ApiConfig) {
  return {
    signToken(email: string): string {
      return jwt.sign({ email: normalizeEmail(email) }, config.JWT_SECRET, {
        expiresIn: "12h"
      });
    },
    verifyToken(token: string): { email: string } {
      const payload = jwt.verify(token, config.JWT_SECRET) as { email: string };
      return {
        email: normalizeEmail(payload.email)
      };
    },
    authenticate(
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): void {
      const header = req.headers.authorization;
      const queryToken =
        typeof req.query.token === "string" ? req.query.token : undefined;
      const token = header?.startsWith("Bearer ")
        ? header.slice("Bearer ".length)
        : queryToken;
      if (!token) {
        res.status(401).json({ error: "Missing bearer token." });
        return;
      }
      try {
        const payload = this.verifyToken(token);
        req.user = { email: payload.email };
        next();
      } catch {
        res.status(401).json({ error: "Invalid bearer token." });
      }
    }
  };
}
