import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  baseStatsForClass,
  type CharacterClassId,
} from "@myth-of-rune/shared";
import type pg from "pg";
import * as characterRepository from "../repositories/characterRepository.js";
import * as userRepository from "../repositories/userRepository.js";
import type { UserRow } from "../repositories/userRepository.js";
import { signGameToken } from "./jwtService.js";
import { config } from "../config.js";
import type { AuthResponse } from "@myth-of-rune/shared";

const BCRYPT_ROUNDS = 10;

function toAuthResponse(
  character: characterRepository.CharacterRow,
  token: string,
): AuthResponse {
  return {
    token,
    expiresInSeconds: config.jwtExpiresSeconds,
    character: {
      id: character.id,
      name: character.name,
      characterClass: character.character_class,
      mapId: character.map_id,
      position: { x: character.x, y: character.y },
      health: character.health,
    },
  };
}

export async function register(
  client: pg.PoolClient,
  input: {
    email: string;
    password: string;
    characterName: string;
    characterClass: CharacterClassId;
  },
): Promise<AuthResponse> {
  const existing = await userRepository.findUserByEmail(client, input.email);
  if (existing) {
    throw new AuthError("EMAIL_IN_USE", "Email already registered", 409);
  }
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const stats = baseStatsForClass(input.characterClass);
  await client.query("BEGIN");
  try {
    const userId = await userRepository.createUser(
      client,
      input.email,
      passwordHash,
    );
    const character = await characterRepository.createCharacter(client, {
      userId,
      name: input.characterName,
      characterClass: input.characterClass,
      health: stats.maxHealth,
    });
    const token = signGameToken(userId, character.id);
    await client.query("COMMIT");
    return toAuthResponse(character, token);
  } catch (e) {
    await client.query("ROLLBACK");
    if (isPgUniqueViolation(e)) {
      throw new AuthError(
        "CONFLICT",
        "Email or character name already in use",
        409,
      );
    }
    throw e;
  }
}

async function findUserForLogin(
  client: pg.PoolClient,
  login: string,
): Promise<UserRow | null> {
  const trimmed = login.trim();
  const asEmail = z.string().email().safeParse(trimmed);
  if (asEmail.success) {
    return userRepository.findUserByEmail(client, asEmail.data.toLowerCase());
  }
  return userRepository.findUserByCharacterName(client, trimmed);
}

export async function login(
  client: pg.PoolClient,
  input: { login: string; password: string },
): Promise<AuthResponse> {
  const user = await findUserForLogin(client, input.login);
  if (!user) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid login or password", 401);
  }
  const ok = await bcrypt.compare(input.password, user.password_hash);
  if (!ok) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid login or password", 401);
  }
  const character = await characterRepository.findCharacterByUserId(
    client,
    user.id,
  );
  if (!character) {
    throw new AuthError("NO_CHARACTER", "No character for this account", 400);
  }
  const token = signGameToken(user.id, character.id);
  return toAuthResponse(character, token);
}

function isPgUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
