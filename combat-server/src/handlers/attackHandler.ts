import type { NextFunction, Request, Response } from "express";
import { attackBodySchema } from "@myth-of-rune/shared";
import { pool } from "../db.js";
import { verifyGameToken } from "../services/jwtService.js";
import { CombatError, performBasicAttack } from "../services/attackService.js";
import type { Redis } from "ioredis";

function bearerToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    return null;
  }
  return h.slice("Bearer ".length).trim() || null;
}

export function createPostAttack(redis: Redis) {
  return async function postAttack(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = bearerToken(req);
      if (!token) {
        res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Missing Bearer token" },
        });
        return;
      }
      let attackerId: string;
      try {
        const payload = verifyGameToken(token);
        attackerId = payload.cid;
      } catch {
        res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Invalid token" },
        });
        return;
      }
      const body = attackBodySchema.parse(req.body);
      const client = await pool.connect();
      try {
        const result = await performBasicAttack(
          redis,
          client,
          attackerId,
          body.targetId,
        );
        res.json(result);
      } finally {
        client.release();
      }
    } catch (e) {
      next(e);
    }
  };
}

export function combatErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof CombatError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }
  next(err);
}
