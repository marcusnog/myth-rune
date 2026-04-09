import { z } from "zod";
import { CharacterClass } from "../character.js";

const characterClassSchema = z.enum([
  CharacterClass.Warrior,
  CharacterClass.Mage,
  CharacterClass.Rogue,
  CharacterClass.Archer,
]);

export const registerBodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  characterName: z.string().min(2).max(32),
  characterClass: characterClassSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

/** Email ou nome do personagem (nick). */
export const loginBodySchema = z.object({
  login: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(128),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const authCharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  characterClass: characterClassSchema,
  mapId: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  health: z.number().int().nonnegative(),
});

export const authResponseSchema = z.object({
  token: z.string(),
  expiresInSeconds: z.number().int().positive(),
  character: authCharacterSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
