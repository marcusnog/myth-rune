import type { ItemId } from "./items";
import { RESOURCE_NODE_RUNTIME_VISUALS } from "./resourceNodeRegistry";

export const RESOURCE_NODE_TYPES = [
  "oak_tree",
  "pine_tree",
  "stone_deposit",
  "copper_deposit",
  "iron_deposit",
  "silver_deposit",
] as const;

export type ResourceNodeType = (typeof RESOURCE_NODE_TYPES)[number];

export type ResourceNodeState = "available" | "collecting" | "exhausted";

export interface ResourceVisualPart {
  frame: string;
  dx: number;
  dy: number;
  offsetX?: number;
  offsetY?: number;
  originX?: number;
  originY?: number;
  depthBias?: number;
}

export interface ResourceGatherFeedback {
  progressHint: string;
  pulseIntervalMs: number;
  swingColor: number;
  impactColor: number;
  impactShape: "chips" | "sparks";
}

export interface ResourceNodeDefinition {
  type: ResourceNodeType;
  name: string;
  actionLabel: string;
  badge: string;
  category: "woodcutting" | "mining";
  /**
   * ItemId da ferramenta necessária para interagir com este nó.
   * undefined = sem requisito (mãos nuas funcionam).
   */
  requiredTool?: ItemId;
  interactDistance: number;
  yieldItemId: ItemId;
  yieldAmount: number;
  defaultQuantity: number;
  defaultGatherTimeMs: number;
  defaultRespawnTimeMs: number;
  footprintWidth: number;
  footprintHeight: number;
  shadowSize: { width: number; height: number };
  baseParts: readonly ResourceVisualPart[];
  topParts: readonly ResourceVisualPart[];
  feedback: ResourceGatherFeedback;
  exhaustedBaseAlpha: number;
  exhaustedTopAlpha: number;
}

export interface ResourceNodeMapConfig {
  nodeId: string;
  type: ResourceNodeType;
  tileX: number;
  tileY: number;
  quantity: number;
  gatherTimeMs: number;
  respawnTimeMs: number;
  yieldItemId?: ItemId;
  yieldAmount?: number;
}

export const RESOURCE_NODE_DEFINITIONS: Readonly<Record<ResourceNodeType, ResourceNodeDefinition>> =
  {
    oak_tree: {
      type: "oak_tree",
      name: "Carvalho",
      actionLabel: "Cortar",
      badge: "MAD",
      category: "woodcutting",
      requiredTool: "simple_axe",
      interactDistance: 60,
      yieldItemId: "wood",
      yieldAmount: 1,
      defaultQuantity: 3,
      defaultGatherTimeMs: 1600,
      defaultRespawnTimeMs: 300000,
      footprintWidth: 2,
      footprintHeight: 1,
      shadowSize: { width: 34, height: 14 },
      baseParts: [
        {
          frame: RESOURCE_NODE_RUNTIME_VISUALS.oak_tree.frame,
          dx: 0,
          dy: 0,
          originX: RESOURCE_NODE_RUNTIME_VISUALS.oak_tree.originX,
          originY: RESOURCE_NODE_RUNTIME_VISUALS.oak_tree.originY,
          offsetX: RESOURCE_NODE_RUNTIME_VISUALS.oak_tree.offsetX,
          offsetY: RESOURCE_NODE_RUNTIME_VISUALS.oak_tree.offsetY,
          depthBias: RESOURCE_NODE_RUNTIME_VISUALS.oak_tree.depthBias,
        },
      ],
      topParts: [],
      feedback: {
        progressHint: "ESC, ataque ou movimento cancelam",
        pulseIntervalMs: 320,
        swingColor: 0xcfb06a,
        impactColor: 0xc89a54,
        impactShape: "chips",
      },
      exhaustedBaseAlpha: 0.72,
      exhaustedTopAlpha: 0.18,
    },
    pine_tree: {
      type: "pine_tree",
      name: "Pinheiro",
      actionLabel: "Cortar",
      badge: "MAD",
      category: "woodcutting",
      requiredTool: "simple_axe",
      interactDistance: 60,
      yieldItemId: "wood",
      yieldAmount: 1,
      defaultQuantity: 3,
      defaultGatherTimeMs: 1750,
      defaultRespawnTimeMs: 300000,
      footprintWidth: 2,
      footprintHeight: 1,
      shadowSize: { width: 30, height: 13 },
      baseParts: [
        {
          frame: RESOURCE_NODE_RUNTIME_VISUALS.pine_tree.frame,
          dx: 0,
          dy: 0,
          originX: RESOURCE_NODE_RUNTIME_VISUALS.pine_tree.originX,
          originY: RESOURCE_NODE_RUNTIME_VISUALS.pine_tree.originY,
          offsetX: RESOURCE_NODE_RUNTIME_VISUALS.pine_tree.offsetX,
          offsetY: RESOURCE_NODE_RUNTIME_VISUALS.pine_tree.offsetY,
          depthBias: RESOURCE_NODE_RUNTIME_VISUALS.pine_tree.depthBias,
        },
      ],
      topParts: [],
      feedback: {
        progressHint: "ESC, ataque ou movimento cancelam",
        pulseIntervalMs: 320,
        swingColor: 0xcfb06a,
        impactColor: 0xc89a54,
        impactShape: "chips",
      },
      exhaustedBaseAlpha: 0.72,
      exhaustedTopAlpha: 0.16,
    },
    stone_deposit: {
      type: "stone_deposit",
      name: "Deposito de pedra",
      actionLabel: "Minerar",
      badge: "MIN",
      category: "mining",
      requiredTool: "simple_pickaxe",
      interactDistance: 52,
      yieldItemId: "stone",
      yieldAmount: 1,
      defaultQuantity: 3,
      defaultGatherTimeMs: 1900,
      defaultRespawnTimeMs: 300000,
      footprintWidth: 1,
      footprintHeight: 1,
      shadowSize: { width: 22, height: 11 },
      baseParts: [
        {
          frame: RESOURCE_NODE_RUNTIME_VISUALS.stone_deposit.frame,
          dx: 0,
          dy: 0,
          originX: RESOURCE_NODE_RUNTIME_VISUALS.stone_deposit.originX,
          originY: RESOURCE_NODE_RUNTIME_VISUALS.stone_deposit.originY,
          offsetX: RESOURCE_NODE_RUNTIME_VISUALS.stone_deposit.offsetX,
          offsetY: RESOURCE_NODE_RUNTIME_VISUALS.stone_deposit.offsetY,
          depthBias: RESOURCE_NODE_RUNTIME_VISUALS.stone_deposit.depthBias,
        },
      ],
      topParts: [],
      feedback: {
        progressHint: "ESC, ataque ou movimento cancelam",
        pulseIntervalMs: 240,
        swingColor: 0x8fd8ff,
        impactColor: 0xcfeaff,
        impactShape: "sparks",
      },
      exhaustedBaseAlpha: 0.45,
      exhaustedTopAlpha: 0.45,
    },
    copper_deposit: {
      type: "copper_deposit",
      name: "Deposito de cobre",
      actionLabel: "Minerar",
      badge: "MIN",
      category: "mining",
      requiredTool: "simple_pickaxe",
      interactDistance: 52,
      yieldItemId: "copper_ore",
      yieldAmount: 1,
      defaultQuantity: 3,
      defaultGatherTimeMs: 2100,
      defaultRespawnTimeMs: 300000,
      footprintWidth: 1,
      footprintHeight: 1,
      shadowSize: { width: 22, height: 11 },
      baseParts: [
        {
          frame: RESOURCE_NODE_RUNTIME_VISUALS.copper_deposit.frame,
          dx: 0,
          dy: 0,
          originX: RESOURCE_NODE_RUNTIME_VISUALS.copper_deposit.originX,
          originY: RESOURCE_NODE_RUNTIME_VISUALS.copper_deposit.originY,
          offsetX: RESOURCE_NODE_RUNTIME_VISUALS.copper_deposit.offsetX,
          offsetY: RESOURCE_NODE_RUNTIME_VISUALS.copper_deposit.offsetY,
          depthBias: RESOURCE_NODE_RUNTIME_VISUALS.copper_deposit.depthBias,
        },
      ],
      topParts: [],
      feedback: {
        progressHint: "ESC, ataque ou movimento cancelam",
        pulseIntervalMs: 240,
        swingColor: 0xffb075,
        impactColor: 0xffd0aa,
        impactShape: "sparks",
      },
      exhaustedBaseAlpha: 0.45,
      exhaustedTopAlpha: 0.45,
    },
    iron_deposit: {
      type: "iron_deposit",
      name: "Deposito de ferro",
      actionLabel: "Minerar",
      badge: "MIN",
      category: "mining",
      requiredTool: "simple_pickaxe",
      interactDistance: 52,
      yieldItemId: "iron_ore",
      yieldAmount: 1,
      defaultQuantity: 3,
      defaultGatherTimeMs: 2350,
      defaultRespawnTimeMs: 300000,
      footprintWidth: 1,
      footprintHeight: 1,
      shadowSize: { width: 22, height: 11 },
      baseParts: [
        {
          frame: RESOURCE_NODE_RUNTIME_VISUALS.iron_deposit.frame,
          dx: 0,
          dy: 0,
          originX: RESOURCE_NODE_RUNTIME_VISUALS.iron_deposit.originX,
          originY: RESOURCE_NODE_RUNTIME_VISUALS.iron_deposit.originY,
          offsetX: RESOURCE_NODE_RUNTIME_VISUALS.iron_deposit.offsetX,
          offsetY: RESOURCE_NODE_RUNTIME_VISUALS.iron_deposit.offsetY,
          depthBias: RESOURCE_NODE_RUNTIME_VISUALS.iron_deposit.depthBias,
        },
      ],
      topParts: [],
      feedback: {
        progressHint: "ESC, ataque ou movimento cancelam",
        pulseIntervalMs: 220,
        swingColor: 0xc9d5e4,
        impactColor: 0xe8eff8,
        impactShape: "sparks",
      },
      exhaustedBaseAlpha: 0.45,
      exhaustedTopAlpha: 0.45,
    },
    silver_deposit: {
      type: "silver_deposit",
      name: "Deposito de prata",
      actionLabel: "Minerar",
      badge: "MIN",
      category: "mining",
      requiredTool: "simple_pickaxe",
      interactDistance: 52,
      yieldItemId: "silver_ore",
      yieldAmount: 1,
      defaultQuantity: 2,
      defaultGatherTimeMs: 2600,
      defaultRespawnTimeMs: 300000,
      footprintWidth: 1,
      footprintHeight: 1,
      shadowSize: { width: 22, height: 11 },
      baseParts: [
        {
          frame: RESOURCE_NODE_RUNTIME_VISUALS.silver_deposit.frame,
          dx: 0,
          dy: 0,
          originX: RESOURCE_NODE_RUNTIME_VISUALS.silver_deposit.originX,
          originY: RESOURCE_NODE_RUNTIME_VISUALS.silver_deposit.originY,
          offsetX: RESOURCE_NODE_RUNTIME_VISUALS.silver_deposit.offsetX,
          offsetY: RESOURCE_NODE_RUNTIME_VISUALS.silver_deposit.offsetY,
          depthBias: RESOURCE_NODE_RUNTIME_VISUALS.silver_deposit.depthBias,
        },
      ],
      topParts: [],
      feedback: {
        progressHint: "ESC, ataque ou movimento cancelam",
        pulseIntervalMs: 210,
        swingColor: 0xd7e8ff,
        impactColor: 0xf5fbff,
        impactShape: "sparks",
      },
      exhaustedBaseAlpha: 0.45,
      exhaustedTopAlpha: 0.45,
    },
  };
