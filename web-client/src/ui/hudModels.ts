import type { ItemId, ItemIcon } from "../data/items";

export interface InventoryItemTooltipView {
  title: string;
  category: string;
  description: string;
}

export interface InventorySlotView {
  itemId: ItemId | null;
  label: string;
  icon: ItemIcon | null;
  count: number;
  accent: string;
  empty: boolean;
  tooltip: InventoryItemTooltipView | null;
}

export type ActionProgressTone = "generic" | "woodcutting" | "mining" | "crafting";

export interface ActionProgressView {
  label: string;
  detail: string;
  progress: number;
  tone?: ActionProgressTone;
  badge?: string;
  hint?: string;
}

export interface CraftingMaterialView {
  itemId: ItemId;
  name: string;
  required: number;
  owned: number;
  satisfied: boolean;
}

export interface CraftingRecipeListItemView {
  id: string;
  name: string;
  category: string;
  outputLabel: string;
  craftTimeLabel: string;
  craftable: boolean;
  selected: boolean;
}

export interface CraftingPanelView {
  open: boolean;
  busy: boolean;
  selectedRecipeId: string | null;
  statusText: string;
  recipes: readonly CraftingRecipeListItemView[];
  selectedName: string | null;
  selectedCategory: string | null;
  selectedOutputLabel: string | null;
  selectedCraftTimeLabel: string | null;
  selectedRequirement: string | null;
  selectedMaterials: readonly CraftingMaterialView[];
  canCraftSelected: boolean;
}

export type NpcPanelActionEmphasis = "primary" | "muted" | "danger";

export interface NpcPanelActionView {
  actionId: string;
  label: string;
  description: string;
  disabled: boolean;
  emphasis: NpcPanelActionEmphasis;
}

export interface NpcPanelView {
  open: boolean;
  npcId: string;
  npcName: string;
  title: string;
  description: string;
  hint: string | null;
  actions: readonly NpcPanelActionView[];
}
