import Phaser from "phaser";
import type { ActionProgressView } from "../../ui/hudModels";
import { ResourceNodeEntity } from "../../entities/resourceNodes/resourceNode";
import type { ResourceNodeMapConfig, ResourceNodeType } from "../../data/resources";
import { ITEM_DEFINITIONS, type ItemId } from "../../data/items";
import { formatDurationLabel } from "../../utils/format";
import type { InventoryStore } from "../inventory/inventory";

interface GatheringSystemParams {
  scene: Phaser.Scene;
  textureKey: string;
  worldMinX: number;
  worldMinY: number;
  tileWidth: number;
  tileHeight: number;
  nodes: readonly ResourceNodeMapConfig[];
}

interface ActiveGatherTask {
  node: ResourceNodeEntity;
  elapsedMs: number;
}

export interface GatheringUpdateResult {
  progress: ActionProgressView | null;
  completed: {
    resourceType: ResourceNodeType;
    itemId: ItemId;
    amount: number;
    nodeLabel: string;
  } | null;
  canceledMessage: string | null;
}

export class GatheringSystem {
  private readonly nodes: ResourceNodeEntity[];
  private activeTask: ActiveGatherTask | null = null;
  private focusedNode: ResourceNodeEntity | null = null;
  private interactionLockedUntilMs = 0;

  public constructor(params: GatheringSystemParams) {
    this.nodes = params.nodes.map(
      (config) =>
        new ResourceNodeEntity({
          scene: params.scene,
          textureKey: params.textureKey,
          worldMinX: params.worldMinX,
          worldMinY: params.worldMinY,
          tileWidth: params.tileWidth,
          tileHeight: params.tileHeight,
          config,
        }),
    );
  }

  public destroy(): void {
    for (const node of this.nodes) {
      node.destroy();
    }
  }

  public isBusy(): boolean {
    return this.activeTask !== null;
  }

  public getActiveNode(): ResourceNodeEntity | null {
    return this.activeTask?.node ?? null;
  }

  public getFocusedNode(): ResourceNodeEntity | null {
    return this.focusedNode;
  }

  public updateFocus(playerX: number, playerY: number): ResourceNodeEntity | null {
    if (this.activeTask) {
      this.focusedNode = this.activeTask.node;
      this.activeTask.node.setFocused(true);
      return this.focusedNode;
    }

    let nextFocus: ResourceNodeEntity | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of this.nodes) {
      const canInteract = node.canInteract(playerX, playerY);
      const distance = canInteract ? node.distanceTo(playerX, playerY) : Number.POSITIVE_INFINITY;
      node.setFocused(false);
      if (!canInteract || distance >= bestDistance) {
        continue;
      }
      bestDistance = distance;
      nextFocus = node;
    }

    this.focusedNode = nextFocus;
    this.focusedNode?.setFocused(true);
    return this.focusedNode;
  }

  public tryStartFocusedGather(
    nowMs: number,
    inventory: InventoryStore,
  ): { ok: boolean; message: string } {
    if (this.activeTask) {
      return { ok: false, message: "Ja existe uma coleta em andamento." };
    }
    if (nowMs < this.interactionLockedUntilMs) {
      return { ok: false, message: "Aguarde um instante." };
    }
    if (!this.focusedNode?.isAvailable()) {
      return { ok: false, message: "Nenhum recurso disponivel." };
    }

    const { requiredTool } = this.focusedNode.definition;
    if (requiredTool && inventory.getCount(requiredTool) === 0) {
      const toolName = ITEM_DEFINITIONS[requiredTool].name;
      return { ok: false, message: `Necessita de ${toolName}.` };
    }

    this.activeTask = {
      node: this.focusedNode,
      elapsedMs: 0,
    };
    this.focusedNode.beginCollecting();
    return { ok: true, message: `${this.focusedNode.definition.actionLabel} em andamento.` };
  }

  public cancelActiveGather(reason: string, nowMs: number): string | null {
    if (!this.activeTask) {
      return null;
    }
    const nodeName = this.activeTask.node.definition.name;
    this.activeTask.node.cancelCollecting();
    this.activeTask = null;
    this.interactionLockedUntilMs = nowMs + 180;
    return `${reason}: ${nodeName}`;
  }

  public update(
    deltaMs: number,
    playerX: number,
    playerY: number,
    nowMs: number,
  ): GatheringUpdateResult {
    if (!this.activeTask) {
      return { progress: null, completed: null, canceledMessage: null };
    }

    if (!this.activeTask.node.isInRange(playerX, playerY)) {
      this.activeTask.node.cancelCollecting();
      this.activeTask = null;
      return {
        progress: null,
        completed: null,
        canceledMessage: "Coleta cancelada por sair do alcance.",
      };
    }

    this.activeTask.elapsedMs += deltaMs;
    const progress = Math.min(
      1,
      this.activeTask.elapsedMs / this.activeTask.node.gatherTimeMs,
    );
    const remainingMs = Math.max(0, this.activeTask.node.gatherTimeMs - this.activeTask.elapsedMs);
    const badge = this.activeTask.node.definition.badge;

    if (progress < 1) {
      return {
        progress: {
          label: `${this.activeTask.node.definition.actionLabel} ${this.activeTask.node.definition.name}`,
          detail: `${this.activeTask.node.getRemainingQuantity()} restante(s) | ${formatDurationLabel(remainingMs)}`,
          progress,
          tone: this.activeTask.node.definition.category,
          badge,
          hint: this.activeTask.node.definition.feedback.progressHint,
        },
        completed: null,
        canceledMessage: null,
      };
    }

    const finishedNode = this.activeTask.node;
    finishedNode.finishCollecting();
    this.activeTask = null;
    this.interactionLockedUntilMs = nowMs + 250;
    return {
      progress: null,
      completed: {
        resourceType: finishedNode.definition.type,
        itemId: finishedNode.yieldItemId,
        amount: finishedNode.yieldAmount,
        nodeLabel: finishedNode.definition.name,
      },
      canceledMessage: null,
    };
  }
}

