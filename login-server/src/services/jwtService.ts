import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { GameJwtPayload } from "../types/jwt.js";

export function signGameToken(userId: string, characterId: string): string {
  const payload: GameJwtPayload = { sub: userId, cid: characterId };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresSeconds,
  });
}
