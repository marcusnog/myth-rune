import { z } from "zod";
import { uuidSchema } from "./common.js";

export const attackBodySchema = z.object({
  targetId: uuidSchema,
  /** MVP: single basic attack skill */
  skillId: z.literal("basic_attack").default("basic_attack"),
});

export type AttackBody = z.infer<typeof attackBodySchema>;

export const attackResultSchema = z.object({
  attackerId: z.string().uuid(),
  targetId: z.string().uuid(),
  damage: z.number().int().nonnegative(),
  targetHealth: z.number().int().nonnegative(),
  cooldownMsRemaining: z.number().int().nonnegative().optional(),
});

export type AttackResult = z.infer<typeof attackResultSchema>;
