import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function zodErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION",
        message: "Invalid request body",
        details: err.flatten(),
      },
    });
    return;
  }
  next(err);
}
