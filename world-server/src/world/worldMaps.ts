import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GatherResourceType, ItemId, MapId } from "@myth-of-rune/shared";
import { MAP_DEFINITIONS } from "@myth-of-rune/shared";

interface RawProperty {
  name?: string;
  value?: unknown;
}

interface RawObjectLayerObject {
  name?: string;
  x?: number;
  y?: number;
  properties?: RawProperty[];
}

interface RawObjectLayer {
  name?: string;
  type?: string;
  objects?: RawObjectLayerObject[];
}

interface RawTileLayer {
  name?: string;
  type?: string;
  width?: number;
  height?: number;
  data?: unknown;
}

interface RawMapJson {
  tilewidth?: number;
  tileheight?: number;
  width?: number;
  height?: number;
  layers?: Array<RawObjectLayer | RawTileLayer>;
}

export interface MapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ResourceNodeRuntime {
  nodeId: string;
  resourceType: GatherResourceType;
  x: number;
  y: number;
  interactDistance: number;
  gatherTimeMs: number;
  respawnTimeMs: number;
  yieldItemId: ItemId;
  yieldAmount: number;
  requiredTool: "simple_axe" | "simple_pickaxe";
}

const STONE_VARIANT_BY_NODE_ID: Readonly<
  Record<
    string,
    Extract<GatherResourceType, "stone_deposit" | "copper_deposit" | "iron_deposit" | "silver_deposit">
  >
> = Object.freeze({
  stone_1: "stone_deposit",
  stone_2: "copper_deposit",
  stone_3: "iron_deposit",
  stone_4: "silver_deposit",
});

const RESOURCE_NODE_RULES: Readonly<
  Record<
    GatherResourceType,
    {
      interactDistance: number;
      gatherTimeMs: number;
      yieldItemId: ItemId;
      yieldAmount: number;
      requiredTool: "simple_axe" | "simple_pickaxe";
    }
  >
> = Object.freeze({
  oak_tree: {
    interactDistance: 60,
    gatherTimeMs: 1600,
    yieldItemId: "wood",
    yieldAmount: 1,
    requiredTool: "simple_axe",
  },
  pine_tree: {
    interactDistance: 60,
    gatherTimeMs: 1750,
    yieldItemId: "wood",
    yieldAmount: 1,
    requiredTool: "simple_axe",
  },
  stone_deposit: {
    interactDistance: 52,
    gatherTimeMs: 1900,
    yieldItemId: "stone",
    yieldAmount: 1,
    requiredTool: "simple_pickaxe",
  },
  copper_deposit: {
    interactDistance: 52,
    gatherTimeMs: 2100,
    yieldItemId: "copper_ore",
    yieldAmount: 1,
    requiredTool: "simple_pickaxe",
  },
  iron_deposit: {
    interactDistance: 52,
    gatherTimeMs: 2350,
    yieldItemId: "iron_ore",
    yieldAmount: 1,
    requiredTool: "simple_pickaxe",
  },
  silver_deposit: {
    interactDistance: 52,
    gatherTimeMs: 2600,
    yieldItemId: "silver_ore",
    yieldAmount: 1,
    requiredTool: "simple_pickaxe",
  },
});

const SHARED_BOUNDS: MapBounds = Object.freeze({
  minX: -1664,
  maxX: 2432,
  minY: -1764,
  maxY: 2332,
});

const DEFAULT_MOB_SPAWNS = Object.freeze([
  { x: 140, y: 180 },
  { x: 620, y: 420 },
  { x: 400, y: 100 },
  { x: -368, y: -404 },
  { x: -600, y: -260 },
  { x: -220, y: -560 },
  { x: -780, y: -640 },
  { x: 1136, y: -372 },
  { x: 820, y: -560 },
  { x: 1340, y: -640 },
  { x: 960, y: -820 },
  { x: -304, y: 1324 },
  { x: -560, y: 980 },
  { x: -840, y: 1500 },
  { x: -200, y: 1700 },
  { x: 1392, y: 1292 },
  { x: 976, y: 1132 },
  { x: 1600, y: 960 },
  { x: 1200, y: 1600 },
  { x: 200, y: -700 },
  { x: -100, y: -900 },
  { x: 500, y: -880 },
  { x: 300, y: 1900 },
  { x: -50, y: 2100 },
]);

const FOREST_EDGE_MOB_SPAWNS = Object.freeze([
  { x: 1536, y: 960 },
  { x: 1600, y: 1100 },
  { x: 1280, y: 1380 },
  { x: 1180, y: 1520 },
  { x: 980, y: 1320 },
  { x: 900, y: 1650 },
  { x: 650, y: 1760 },
  { x: 320, y: 1890 },
  { x: 100, y: 1700 },
  { x: -120, y: 1550 },
  { x: -300, y: 1320 },
  { x: -480, y: 1040 },
]);

function readProperty(properties: readonly RawProperty[] | undefined, name: string): unknown {
  return properties?.find((property) => property.name === name)?.value;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function loadStarterTownMap(): RawMapJson {
  const mapPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../web-client/public/maps/starter_town/map.json",
  );
  return JSON.parse(readFileSync(mapPath, "utf-8")) as RawMapJson;
}

function loadResourceNodes(): readonly ResourceNodeRuntime[] {
  const raw = loadStarterTownMap();
  const tileWidth = raw.tilewidth ?? 32;
  const tileHeight = raw.tileheight ?? 32;
  const objectLayer = (raw.layers ?? []).find(
    (layer) => layer.type === "objectgroup" && layer.name === "resource_nodes",
  ) as RawObjectLayer | undefined;
  if (!objectLayer?.objects) {
    return [];
  }

  return objectLayer.objects
    .map((entry, index) => {
      const resourceTypeRaw =
        readProperty(entry.properties, "nodeType") ?? readProperty(entry.properties, "type");
      if (
        resourceTypeRaw !== "oak_tree" &&
        resourceTypeRaw !== "pine_tree" &&
        resourceTypeRaw !== "stone_deposit"
      ) {
        return null;
      }
      const tileX = Math.floor(asNumber(readProperty(entry.properties, "tileX"), (entry.x ?? 0) / tileWidth));
      const tileY = Math.floor(asNumber(readProperty(entry.properties, "tileY"), (entry.y ?? 0) / tileHeight));
      const x = SHARED_BOUNDS.minX + tileX * tileWidth + tileWidth / 2;
      const y = SHARED_BOUNDS.minY + (tileY + 1) * tileHeight - 2;
      const nodeId = (typeof readProperty(entry.properties, "nodeId") === "string"
        ? (readProperty(entry.properties, "nodeId") as string)
        : entry.name) ?? `${resourceTypeRaw}:${index}`;
      const resourceType =
        resourceTypeRaw === "stone_deposit"
          ? (STONE_VARIANT_BY_NODE_ID[nodeId] ?? resourceTypeRaw)
          : resourceTypeRaw;
      const rules = RESOURCE_NODE_RULES[resourceType];
      return {
        nodeId,
        resourceType,
        x,
        y,
        interactDistance: rules.interactDistance,
        gatherTimeMs: Math.max(
          250,
          Math.floor(asNumber(readProperty(entry.properties, "gatherTimeMs"), rules.gatherTimeMs)),
        ),
        respawnTimeMs: Math.max(
          1000,
          Math.floor(asNumber(readProperty(entry.properties, "respawnTimeMs"), 300000)),
        ),
        yieldItemId: rules.yieldItemId,
        yieldAmount: Math.max(
          1,
          Math.floor(asNumber(readProperty(entry.properties, "yieldAmount"), rules.yieldAmount)),
        ),
        requiredTool: rules.requiredTool,
      } satisfies ResourceNodeRuntime;
    })
    .filter((entry): entry is ResourceNodeRuntime => entry !== null);
}

const RESOURCE_NODES = loadResourceNodes();

export function getMapBounds(_mapId: MapId): MapBounds {
  return SHARED_BOUNDS;
}

export function getRespawnPoint(mapId: MapId): { x: number; y: number } {
  return MAP_DEFINITIONS[mapId].spawn;
}

export function getMobSpawns(mapId: MapId): readonly { x: number; y: number }[] {
  return mapId === "forest_edge" ? FOREST_EDGE_MOB_SPAWNS : DEFAULT_MOB_SPAWNS;
}

export function getResourceNodes(): readonly ResourceNodeRuntime[] {
  return RESOURCE_NODES;
}

export function findResourceNode(_mapId: MapId, nodeId: string): ResourceNodeRuntime | null {
  return getResourceNodes().find((node) => node.nodeId === nodeId) ?? null;
}

// ── Blockers ──────────────────────────────────────────────────────────────────

export interface NpcBlocker {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
}

export interface PropBlockerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function loadRuntimePropBlockers(): readonly PropBlockerRect[] {
  const layoutPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../web-client/public/maps/starter_town/runtime_props/layout.json",
  );
  const raw = JSON.parse(readFileSync(layoutPath, "utf-8")) as {
    placements?: Array<{
      tileX?: number;
      tileY?: number;
      blocker?: { width?: number; height?: number; offsetX?: number; offsetY?: number };
    }>;
  };
  if (!Array.isArray(raw.placements)) return [];
  const TW = 32, TH = 32;
  const blockers: PropBlockerRect[] = [];
  for (const p of raw.placements) {
    const b = p.blocker;
    if (!b || b.width == null || b.height == null) continue;
    const cx = SHARED_BOUNDS.minX + (p.tileX ?? 0) * TW + TW / 2 + (b.offsetX ?? 0);
    const by = SHARED_BOUNDS.minY + ((p.tileY ?? 0) + 1) * TH + (b.offsetY ?? 0);
    blockers.push({ x: cx - b.width / 2, y: by - b.height, w: b.width, h: b.height });
  }
  return Object.freeze(blockers);
}

// ponytail: safezone is a circle around the village spawn; keeps new players safe from mobs
const VILLAGE_SAFEZONE = Object.freeze({ x: 384, y: 256, radius: 280 });

export function isInSafezone(x: number, y: number): boolean {
  const dx = x - VILLAGE_SAFEZONE.x;
  const dy = y - VILLAGE_SAFEZONE.y;
  return dx * dx + dy * dy <= VILLAGE_SAFEZONE.radius * VILLAGE_SAFEZONE.radius;
}

const TILE_W = 32, TILE_H = 32;

function tileWorldX(tileX: number): number {
  return SHARED_BOUNDS.minX + tileX * TILE_W + TILE_W / 2;
}

function tileWorldY(tileY: number): number {
  return SHARED_BOUNDS.minY + (tileY + 1) * TILE_H - 2;
}

const VILLAGE_NPC_BLOCKERS: readonly NpcBlocker[] = Object.freeze([
  { x: tileWorldX(64), y: tileWorldY(67), radiusX: 10, radiusY: 7 },
  { x: tileWorldX(72), y: tileWorldY(60), radiusX: 10, radiusY: 7 },
  { x: tileWorldX(60), y: tileWorldY(57), radiusX: 10, radiusY: 7 },
  { x: tileWorldX(76), y: tileWorldY(67), radiusX: 10, radiusY: 7 },
  { x: tileWorldX(56), y: tileWorldY(76), radiusX: 12, radiusY: 8 },
  { x: tileWorldX(64), y: tileWorldY(50), radiusX: 11, radiusY: 8 },
  { x: tileWorldX(50), y: tileWorldY(66), radiusX: 11, radiusY: 8 },
  { x: tileWorldX(72), y: tileWorldY(74), radiusX: 10, radiusY: 7 },
]);

const RUNTIME_PROP_BLOCKERS: readonly PropBlockerRect[] = loadRuntimePropBlockers();

export function getNpcBlockers(): readonly NpcBlocker[] {
  return VILLAGE_NPC_BLOCKERS;
}

export function getPropBlockers(): readonly PropBlockerRect[] {
  return RUNTIME_PROP_BLOCKERS;
}


