import type { Request, Response, NextFunction } from "express";
import {
  loginBodySchema,
  registerBodySchema,
} from "@myth-of-rune/shared";
import { pool } from "../db.js";
import * as authService from "../services/authService.js";

export async function postRegister(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = registerBodySchema.parse(req.body);
    const client = await pool.connect();
    try {
      const result = await authService.register(client, body);
      res.status(201).json(result);
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
}

export async function postLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = loginBodySchema.parse(req.body);
    const client = await pool.connect();
    try {
      const result = await authService.login(client, body);
      res.json(result);
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
}
