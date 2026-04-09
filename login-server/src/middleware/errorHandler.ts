import type { NextFunction, Request, Response } from "express";
import { AuthError } from "../services/authService.js";
import { config } from "../config.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AuthError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }
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
