import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = req.header("x-request-id") ?? randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

export function jsonRequestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();
  res.on("finish", () => {
    const line = {
      msg: "http_request",
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      ms: Date.now() - start,
    };
    console.log(JSON.stringify(line));
  });
  next();
}
