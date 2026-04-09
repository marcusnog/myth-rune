import { ITEM_DEFINITIONS, ITEM_SORT_ORDER, type ItemId } from "../../data/items";
import type { RecipeMaterial } from "../../data/recipes";
import type { InventorySlotView } from "../../ui/hudModels";

type InventoryListener = () => void;

export class InventoryStore {
  private readonly counts = new Map<ItemId, number>();
  private readonly listeners = new Set<InventoryListener>();

  public subscribe(listener: InventoryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public add(itemId: ItemId, amount: number): void {
    if (amount <= 0) {
      return;
    }
    const next = this.getCount(itemId) + amount;
    this.counts.set(itemId, next);
    this.emit();
  }

  public remove(itemId: ItemId, amount: number): boolean {
    if (amount <= 0) {
      return true;
    }
    const current = this.getCount(itemId);
    if (current < amount) {
      return false;
    }
    const next = current - amount;
    if (next <= 0) {
      this.counts.delete(itemId);
    } else {
      this.counts.set(itemId, next);
    }
    this.emit();
    return true;
  }

  public getCount(itemId: ItemId): number {
    return this.counts.get(itemId) ?? 0;
  }

  public canAfford(materials: readonly RecipeMaterial[]): boolean {
    return materials.every((material) => this.getCount(material.itemId) >= material.quantity);
  }

  public consume(materials: readonly RecipeMaterial[]): boolean {
    if (!this.canAfford(materials)) {
      return false;
    }
    for (const material of materials) {
      const next = this.getCount(material.itemId) - material.quantity;
      if (next <= 0) {
        this.counts.delete(material.itemId);
      } else {
        this.counts.set(material.itemId, next);
      }
    }
    this.emit();
    return true;
  }

  public buildSlotViews(slotCount = 12): InventorySlotView[] {
    const filled: InventorySlotView[] = ITEM_SORT_ORDER.filter(
      (itemId) => this.getCount(itemId) > 0,
    ).map((itemId) => {
      const definition = ITEM_DEFINITIONS[itemId];
      return {
        itemId,
        label: definition.shortLabel,
        icon: definition.icon ?? null,
        count: this.getCount(itemId),
        accent: definition.accent,
        empty: false,
        tooltip: {
          title: definition.name,
          category: definition.category,
          description: definition.description,
        },
      };
    });

    while (filled.length < slotCount) {
      filled.push({
        itemId: null,
        label: "Vazio",
        icon: null,
        count: 0,
        accent: "#6b4e32",
        empty: true,
        tooltip: null,
      });
    }

    return filled.slice(0, slotCount);
  }

  public buildSummary(): string {
    const distinct = Array.from(this.counts.values()).filter((value) => value > 0).length;
    const total = Array.from(this.counts.values()).reduce((sum, value) => sum + value, 0);
    if (distinct === 0) {
      return "Bolsa vazia";
    }
    return `${distinct} item(ns) | ${total} unidade(s)`;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
