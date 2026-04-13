import { ITEM_IDS, type ItemId } from "./items.js";

export interface RecipeMaterial {
  itemId: ItemId;
  quantity: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  category: string;
  materials: readonly RecipeMaterial[];
  outputItemId: ItemId;
  outputQuantity: number;
  craftTimeMs: number;
  requirement?: string;
}

export type CraftingRecipeCatalog = ReadonlyArray<CraftingRecipe>;

export const CRAFTING_RECIPES: CraftingRecipeCatalog = [
  {
    id: "plank",
    name: "Tabua",
    category: "Materiais",
    materials: [{ itemId: "wood", quantity: 2 }],
    outputItemId: "plank",
    outputQuantity: 1,
    craftTimeMs: 1400,
  },
  {
    id: "wood_handle",
    name: "Cabo de madeira",
    category: "Componentes",
    materials: [{ itemId: "wood", quantity: 1 }],
    outputItemId: "wood_handle",
    outputQuantity: 1,
    craftTimeMs: 1000,
  },
  {
    id: "cut_stone",
    name: "Pedra lapidada",
    category: "Materiais",
    materials: [{ itemId: "stone", quantity: 2 }],
    outputItemId: "cut_stone",
    outputQuantity: 1,
    craftTimeMs: 1600,
  },
  {
    id: "copper_ingot",
    name: "Lingote de cobre",
    category: "Metalurgia",
    materials: [{ itemId: "copper_ore", quantity: 2 }],
    outputItemId: "copper_ingot",
    outputQuantity: 1,
    craftTimeMs: 1800,
  },
  {
    id: "iron_ingot",
    name: "Lingote de ferro",
    category: "Metalurgia",
    materials: [{ itemId: "iron_ore", quantity: 2 }],
    outputItemId: "iron_ingot",
    outputQuantity: 1,
    craftTimeMs: 2100,
  },
  {
    id: "silver_ingot",
    name: "Lingote de prata",
    category: "Metalurgia",
    materials: [{ itemId: "silver_ore", quantity: 2 }],
    outputItemId: "silver_ingot",
    outputQuantity: 1,
    craftTimeMs: 2400,
  },
  {
    id: "simple_axe",
    name: "Machado simples",
    category: "Ferramentas",
    materials: [
      { itemId: "wood", quantity: 2 },
      { itemId: "stone", quantity: 2 },
    ],
    outputItemId: "simple_axe",
    outputQuantity: 1,
    craftTimeMs: 2200,
  },
  {
    id: "simple_pickaxe",
    name: "Picareta simples",
    category: "Ferramentas",
    materials: [
      { itemId: "wood", quantity: 2 },
      { itemId: "stone", quantity: 2 },
    ],
    outputItemId: "simple_pickaxe",
    outputQuantity: 1,
    craftTimeMs: 2200,
  },
];

export const CRAFTING_RECIPE_BY_ID: Readonly<Record<string, CraftingRecipe>> = Object.freeze(
  Object.fromEntries(CRAFTING_RECIPES.map((recipe) => [recipe.id, recipe])),
);

export function isItemId(value: string): value is ItemId {
  return (ITEM_IDS as readonly string[]).includes(value);
}
