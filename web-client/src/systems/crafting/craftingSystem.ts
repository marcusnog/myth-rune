import { ITEM_DEFINITIONS } from "../../data/items";
import {
  CRAFTING_RECIPES,
  type CraftingRecipe,
  type CraftingRecipeCatalog,
} from "../../data/recipes";
import type { ActionProgressView, CraftingPanelView } from "../../ui/hudModels";
import { InventoryStore } from "../inventory/inventory";
import { formatDurationLabel } from "../../utils/format";

interface CraftingTask {
  recipe: CraftingRecipe;
  startedAt: number;
  completesAt: number;
}

export class CraftingSystem {
  private readonly inventory: InventoryStore;
  private readonly recipes: CraftingRecipeCatalog;
  private readonly recipeById: ReadonlyMap<string, CraftingRecipe>;
  private panelOpen = false;
  private selectedRecipeId: string | null;
  private activeTask: CraftingTask | null = null;
  private statusText = "Selecione uma receita para comecar.";

  public constructor(
    inventory: InventoryStore,
    recipes: CraftingRecipeCatalog = CRAFTING_RECIPES,
  ) {
    this.inventory = inventory;
    this.recipes = recipes;
    this.recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    this.selectedRecipeId = recipes[0]?.id ?? null;
  }

  public isPanelOpen(): boolean {
    return this.panelOpen;
  }

  public isBusy(): boolean {
    return this.activeTask !== null;
  }

  public openPanel(): void {
    this.panelOpen = true;
  }

  public closePanel(): void {
    if (this.activeTask) {
      return;
    }
    this.panelOpen = false;
  }

  public togglePanel(): void {
    if (this.panelOpen) {
      this.closePanel();
      return;
    }
    this.openPanel();
  }

  public selectRecipe(recipeId: string): void {
    if (!this.findRecipe(recipeId)) {
      return;
    }
    this.selectedRecipeId = recipeId;
    this.statusText = "Receita preparada para crafting.";
  }

  public startSelectedCraft(nowMs = Date.now()): { ok: boolean; message: string; recipeId?: string } {
    if (!this.selectedRecipeId) {
      return { ok: false, message: "Selecione uma receita." };
    }
    const recipe = this.findRecipe(this.selectedRecipeId);
    if (!recipe) {
      return { ok: false, message: "Receita nao encontrada." };
    }
    if (this.activeTask) {
      return { ok: false, message: "Ja existe um craft em andamento." };
    }
    if (!this.inventory.canAfford(recipe.materials)) {
      this.statusText = "Materiais insuficientes.";
      return { ok: false, message: this.statusText };
    }
    this.activeTask = {
      recipe,
      startedAt: nowMs,
      completesAt: nowMs + recipe.craftTimeMs,
    };
    this.panelOpen = true;
    this.statusText = `Criando ${recipe.name}...`;
    return { ok: true, message: this.statusText, recipeId: recipe.id };
  }

  public cancelActiveCraft(): string | null {
    if (!this.activeTask) {
      return null;
    }
    const recipeName = this.activeTask.recipe.name;
    this.activeTask = null;
    this.statusText = `Craft de ${recipeName} cancelado.`;
    return recipeName;
  }

  public syncServerState(payload: {
    active: boolean;
    recipeId: string | null;
    startedAt: number | null;
    completesAt: number | null;
    status: "idle" | "started" | "cancelled" | "completed";
  }): string | null {
    if (!payload.active || !payload.recipeId || !payload.startedAt || !payload.completesAt) {
      const previous = this.activeTask;
      this.activeTask = null;
      if (payload.status === "completed" && previous) {
        this.statusText = `${previous.recipe.name} concluido com sucesso.`;
        return `${previous.recipe.name} concluido.`;
      }
      if (payload.status === "cancelled" && previous) {
        this.statusText = `Craft de ${previous.recipe.name} cancelado.`;
        return `Craft de ${previous.recipe.name} cancelado.`;
      }
      return null;
    }

    const recipe = this.findRecipe(payload.recipeId);
    if (!recipe) {
      return null;
    }
    this.activeTask = {
      recipe,
      startedAt: payload.startedAt,
      completesAt: payload.completesAt,
    };
    this.panelOpen = true;
    this.statusText = `Criando ${recipe.name}...`;
    return null;
  }

  public update(nowMs: number): {
    progress: ActionProgressView | null;
  } {
    if (!this.activeTask) {
      return { progress: null };
    }
    const totalMs = Math.max(1, this.activeTask.completesAt - this.activeTask.startedAt);
    const elapsedMs = Math.max(0, nowMs - this.activeTask.startedAt);
    const progress = Math.min(1, elapsedMs / totalMs);
    const remainingMs = Math.max(0, this.activeTask.completesAt - nowMs);
    const recipe = this.activeTask.recipe;
    return {
      progress: {
        label: `Craftando ${recipe.name}`,
        detail: `${ITEM_DEFINITIONS[recipe.outputItemId].name} x${recipe.outputQuantity} | ${formatDurationLabel(remainingMs)}`,
        progress,
        tone: "crafting",
        badge: "CRF",
        hint: "ESC, ataque ou movimento cancelam",
      },
    };
  }

  public getPanelView(): CraftingPanelView {
    const selectedRecipe =
      (this.selectedRecipeId ? this.findRecipe(this.selectedRecipeId) : null) ?? null;

    return {
      open: this.panelOpen,
      busy: this.activeTask !== null,
      selectedRecipeId: selectedRecipe?.id ?? null,
      statusText: this.statusText,
      recipes: this.recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        category: recipe.category,
        outputLabel: `${ITEM_DEFINITIONS[recipe.outputItemId].name} x${recipe.outputQuantity}`,
        craftTimeLabel: formatDurationLabel(recipe.craftTimeMs),
        craftable: this.inventory.canAfford(recipe.materials),
        selected: recipe.id === selectedRecipe?.id,
      })),
      selectedName: selectedRecipe?.name ?? null,
      selectedCategory: selectedRecipe?.category ?? null,
      selectedOutputLabel: selectedRecipe
        ? `${ITEM_DEFINITIONS[selectedRecipe.outputItemId].name} x${selectedRecipe.outputQuantity}`
        : null,
      selectedCraftTimeLabel: selectedRecipe
        ? formatDurationLabel(selectedRecipe.craftTimeMs)
        : null,
      selectedRequirement: selectedRecipe?.requirement ?? null,
      selectedMaterials:
        selectedRecipe?.materials.map((material) => ({
          itemId: material.itemId,
          name: ITEM_DEFINITIONS[material.itemId].name,
          required: material.quantity,
          owned: this.inventory.getCount(material.itemId),
          satisfied: this.inventory.getCount(material.itemId) >= material.quantity,
        })) ?? [],
      canCraftSelected: selectedRecipe
        ? this.inventory.canAfford(selectedRecipe.materials) && this.activeTask === null
        : false,
    };
  }

  private findRecipe(recipeId: string): CraftingRecipe | null {
    return this.recipeById.get(recipeId) ?? null;
  }
}
