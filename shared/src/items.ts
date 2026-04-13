export const ITEM_IDS = [
  "gold_coin",
  "health_potion",
  "wood",
  "plank",
  "wood_handle",
  "stone",
  "copper_ore",
  "iron_ore",
  "silver_ore",
  "cut_stone",
  "copper_ingot",
  "iron_ingot",
  "silver_ingot",
  "simple_axe",
  "simple_pickaxe",
] as const;

export type ItemId = (typeof ITEM_IDS)[number];
