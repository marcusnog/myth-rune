import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

export function genericErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const message =
    config.nodeEnv === "production"
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "Unknown error";
  res.status(500).json({
    error: { code: "INTERNAL", message },
  });
}
