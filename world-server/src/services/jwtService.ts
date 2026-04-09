import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { GameJwtPayload } from "../types/jwt.js";

export function verifyGameToken(token: string): GameJwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as GameJwtPayload;
  if (!decoded.sub || !decoded.cid) {
    throw new Error("Invalid token payload");
  }
  return decoded;
}
