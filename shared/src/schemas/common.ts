import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const mapIdSchema = z.literal("default");

export const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export type Position = z.infer<typeof positionSchema>;
