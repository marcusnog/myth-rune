import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

export function safeErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? "unknown";
  const logPayload = {
    msg: "gateway_error",
    requestId,
    error:
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : String(err),
  };
  console.error(JSON.stringify(logPayload));

  if (res.headersSent) {
    return;
  }
  const message =
    config.nodeEnv === "production"
      ? "Bad gateway"
      : err instanceof Error
        ? err.message
        : "Proxy error";
  res.status(502).json({
    error: { code: "BAD_GATEWAY", message },
  });
}
