import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

import type { ApiConfig } from "./config.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    email: string;
  };
}

export function createAuthHelpers(config: ApiConfig) {
  return {
    signToken(email: string): string {
      return jwt.sign({ email }, config.JWT_SECRET, {
        expiresIn: "12h"
      });
    },
    verifyToken(token: string): { email: string } {
      return jwt.verify(token, config.JWT_SECRET) as { email: string };
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
