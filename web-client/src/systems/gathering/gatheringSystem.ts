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
  startedAt: number;
  completesAt: number;
}

export interface GatheringUpdateResult {
  progress: ActionProgressView | null;
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

  public getNodeById(nodeId: string): ResourceNodeEntity | null {
    return this.nodes.find((node) => node.id === nodeId) ?? null;
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
  ): { ok: boolean; message: string; nodeId?: string; resourceType?: ResourceNodeType } {
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
    this.focusedNode.beginCollecting();
    this.activeTask = {
      node: this.focusedNode,
      startedAt: nowMs,
      completesAt: nowMs + this.focusedNode.gatherTimeMs,
    };
    return {
      ok: true,
      message: `${this.focusedNode.definition.actionLabel} em andamento.`,
      nodeId: this.focusedNode.id,
      resourceType: this.focusedNode.definition.type,
    };
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

  public syncServerState(payload: {
    active: boolean;
    nodeId: string | null;
    startedAt: number | null;
    completesAt: number | null;
    yieldItemId: ItemId | null;
    yieldAmount: number | null;
    status: "idle" | "started" | "cancelled" | "completed";
  }): { message: string | null; itemId: ItemId | null; amount: number } {
    const currentNode = payload.nodeId ? this.getNodeById(payload.nodeId) : null;
    if (payload.status === "started" && currentNode && payload.startedAt && payload.completesAt) {
      currentNode.beginCollecting();
      this.activeTask = {
        node: currentNode,
        startedAt: payload.startedAt,
        completesAt: payload.completesAt,
      };
      return { message: null, itemId: null, amount: 0 };
    }

    if (payload.status === "completed" && currentNode) {
      currentNode.finishCollecting();
      this.activeTask = null;
      return {
        message: `${currentNode.definition.name} coletado.`,
        itemId: payload.yieldItemId,
        amount: payload.yieldAmount ?? 0,
      };
    }

    if (payload.status === "cancelled") {
      this.activeTask?.node.cancelCollecting();
      this.activeTask = null;
      return { message: "Coleta cancelada.", itemId: null, amount: 0 };
    }

    if (!payload.active) {
      this.activeTask = null;
    }
    return { message: null, itemId: null, amount: 0 };
  }

  public update(nowMs: number): GatheringUpdateResult {
    if (!this.activeTask) {
      return { progress: null };
    }
    const totalMs = Math.max(1, this.activeTask.completesAt - this.activeTask.startedAt);
    const remainingMs = Math.max(0, this.activeTask.completesAt - nowMs);
    const progress = Math.min(1, Math.max(0, (nowMs - this.activeTask.startedAt) / totalMs));
    return {
      progress: {
        label: `${this.activeTask.node.definition.actionLabel} ${this.activeTask.node.definition.name}`,
        detail: `${this.activeTask.node.getRemainingQuantity()} restante(s) | ${formatDurationLabel(remainingMs)}`,
        progress,
        tone: this.activeTask.node.definition.category,
        badge: this.activeTask.node.definition.badge,
        hint: this.activeTask.node.definition.feedback.progressHint,
      },
    };
  }
}
