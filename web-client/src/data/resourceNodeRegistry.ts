import type { ResourceNodeType } from "./resources";

export const MAP_RESOURCE_ATLAS_IMAGE_KEY = "map:starter-town-resources";
export const MAP_RESOURCE_ATLAS_METADATA_KEY = "map:starter-town-resources-meta";

export interface ResourceNodeRuntimeVisual {
  frame: string;
  originX: number;
  originY: number;
  offsetX?: number;
  offsetY?: number;
  depthBias?: number;
}

export const RESOURCE_NODE_RUNTIME_VISUALS: Readonly<
  Record<ResourceNodeType, ResourceNodeRuntimeVisual>
> = {
  oak_tree: {
    frame: "oak_tree_resource_a",
    originX: 0.5,
    originY: 1,
    depthBias: 0.2,
  },
  pine_tree: {
    frame: "pine_tree_resource_a",
    originX: 0.5,
    originY: 1,
    depthBias: 0.2,
  },
  stone_deposit: {
    frame: "stone_deposit_resource_a",
    originX: 0.5,
    originY: 1,
    depthBias: 0.18,
    offsetY: 2,
  },
} as const;
