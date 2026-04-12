import { z } from "zod";
import { MAP_IDS } from "../maps.js";

export const uuidSchema = z.string().uuid();

export const mapIdSchema = z.enum(MAP_IDS);

export const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export type Position = z.infer<typeof positionSchema>;
