export const ITEM_IDS = [
  "gold_coin",
  "health_potion",
  "wood",
  "plank",
  "wood_handle",
  "stone",
  "cut_stone",
  "simple_axe",
  "simple_pickaxe",
] as const;

export type ItemId = (typeof ITEM_IDS)[number];
