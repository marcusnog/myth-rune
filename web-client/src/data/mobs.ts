import type { MobType } from "@myth-of-rune/shared";

export interface MobPresentationDefinition {
  readonly name: string;
  readonly level: number;
  readonly maxHealth: number;
  readonly hpBarColor: number;
  readonly auraColor: number;
  /** Key that matches a VisualKey in worldScene — must have a sprite sheet registered. */
  readonly visualKey: string;
}

export const MOB_PRESENTATION: Readonly<Record<MobType, MobPresentationDefinition>> = {
  goblin: {
    name: "Goblin",
    level: 3,
    maxHealth: 52,
    hpBarColor: 0xc94d4d,
    auraColor: 0xb81f28,
    visualKey: "goblin",
  },
  zombie: {
    name: "Zombie",
    level: 5,
    maxHealth: 52,
    hpBarColor: 0xb86e45,
    auraColor: 0xc43333,
    visualKey: "zombie",
  },
  wolf: {
    name: "Lobo",
    level: 4,
    maxHealth: 52,
    hpBarColor: 0xd0a78a,
    auraColor: 0x8d5242,
    visualKey: "wolf",
  },
  ent: {
    name: "Ent",
    level: 8,
    maxHealth: 180,
    hpBarColor: 0x4a9a2e,
    auraColor: 0x2d6e16,
    visualKey: "ent",
  },
};
