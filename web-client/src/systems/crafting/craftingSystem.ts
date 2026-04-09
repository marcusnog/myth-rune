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
  elapsedMs: number;
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

  public startSelectedCraft(): { ok: boolean; message: string } {
    if (!this.selectedRecipeId) {
      return { ok: false, message: "Selecione uma receita." };
    }
    return this.startCraft(this.selectedRecipeId);
  }

  public startCraft(recipeId: string): { ok: boolean; message: string } {
    if (this.activeTask) {
      return { ok: false, message: "Ja existe um craft em andamento." };
    }
    const recipe = this.findRecipe(recipeId);
    if (!recipe) {
      return { ok: false, message: "Receita nao encontrada." };
    }
    // Consume materials immediately on start — avoids TOCTOU between check and completion.
    if (!this.inventory.consume(recipe.materials)) {
      this.statusText = "Materiais insuficientes.";
      return { ok: false, message: this.statusText };
    }
    this.activeTask = {
      recipe,
      elapsedMs: 0,
    };
    this.panelOpen = true;
    this.statusText = `Criando ${recipe.name}...`;
    return { ok: true, message: this.statusText };
  }

  public cancelActiveCraft(): string | null {
    if (!this.activeTask) {
      return null;
    }
    const { recipe } = this.activeTask;
    // Refund materials consumed at craft start.
    for (const material of recipe.materials) {
      this.inventory.add(material.itemId, material.quantity);
    }
    this.activeTask = null;
    this.statusText = `Craft de ${recipe.name} cancelado.`;
    return recipe.name;
  }

  public update(deltaMs: number): {
    progress: ActionProgressView | null;
    completedMessage: string | null;
  } {
    if (!this.activeTask) {
      return { progress: null, completedMessage: null };
    }

    this.activeTask.elapsedMs += deltaMs;
    const recipe = this.activeTask.recipe;
    const progress = Math.min(1, this.activeTask.elapsedMs / recipe.craftTimeMs);
    const remainingMs = Math.max(0, recipe.craftTimeMs - this.activeTask.elapsedMs);

    if (progress < 1) {
      return {
        progress: {
          label: `Craftando ${recipe.name}`,
          detail: `${ITEM_DEFINITIONS[recipe.outputItemId].name} x${recipe.outputQuantity} | ${formatDurationLabel(remainingMs)}`,
          progress,
          tone: "crafting",
          badge: "CRF",
          hint: "ESC, ataque ou movimento cancelam",
        },
        completedMessage: null,
      };
    }

    // Materials were already consumed at startCraft — just deliver the output.
    const completedRecipe = this.activeTask.recipe;
    this.activeTask = null;
    this.inventory.add(completedRecipe.outputItemId, completedRecipe.outputQuantity);
    this.statusText = `${completedRecipe.name} concluido com sucesso.`;
    return {
      progress: null,
      completedMessage: `${completedRecipe.name} concluido.`,
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
