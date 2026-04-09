export type EquipmentSlot = "weapon" | "armour";

export interface EquipmentLoadout {
  weapon: string | null;
  armour: string | null;
}

export interface EquipmentBonuses {
  maxHealth: number;
  attack: number;
  defense: number;
  moveSpeed: number;
}

export interface EquippableItemDefinition {
  itemId: string;
  slot: EquipmentSlot;
  bonuses: EquipmentBonuses;
}

export const DEFAULT_EQUIPMENT: EquipmentLoadout = Object.freeze({
  weapon: null,
  armour: null,
});

export const EQUIPPABLE_ITEMS: Readonly<Record<string, EquippableItemDefinition>> = Object.freeze({
  simple_axe: {
    itemId: "simple_axe",
    slot: "weapon",
    bonuses: { maxHealth: 0, attack: 2, defense: 0, moveSpeed: 0 },
  },
  simple_pickaxe: {
    itemId: "simple_pickaxe",
    slot: "weapon",
    bonuses: { maxHealth: 0, attack: 1, defense: 0, moveSpeed: 0 },
  },
  leather_armour: {
    itemId: "leather_armour",
    slot: "armour",
    bonuses: { maxHealth: 10, attack: 0, defense: 3, moveSpeed: -0.05 },
  },
});

export function isEquippableItem(itemId: string): boolean {
  return itemId in EQUIPPABLE_ITEMS;
}

export function slotForItem(itemId: string): EquipmentSlot | null {
  return EQUIPPABLE_ITEMS[itemId]?.slot ?? null;
}

export function equipmentBonusesForLoadout(loadout: EquipmentLoadout): EquipmentBonuses {
  const bonuses: EquipmentBonuses = { maxHealth: 0, attack: 0, defense: 0, moveSpeed: 0 };
  for (const itemId of [loadout.weapon, loadout.armour]) {
    if (!itemId) continue;
    const def = EQUIPPABLE_ITEMS[itemId];
    if (!def) continue;
    bonuses.maxHealth += def.bonuses.maxHealth;
    bonuses.attack += def.bonuses.attack;
    bonuses.defense += def.bonuses.defense;
    bonuses.moveSpeed += def.bonuses.moveSpeed;
  }
  return bonuses;
}

