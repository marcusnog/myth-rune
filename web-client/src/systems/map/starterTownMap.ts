import Phaser from "phaser";
import type { ItemId } from "../../data/items";
import {
  RESOURCE_NODE_DEFINITIONS,
  RESOURCE_NODE_TYPES,
  type ResourceNodeMapConfig,
  type ResourceNodeType,
} from "../../data/resources";
import {
  assertStarterTownRuntimePropFrameIsSafe,
  assertStarterTownTilemapIsSafe,
} from "./TileCategoryGuard";

export const MAP_KEY = "map:starter-town";
export const MAP_TILESET_IMAGE_KEY = "map:starter-town-tiles";
export const MAP_TILESET_METADATA_KEY = "map:starter-town-tiles-meta";
export const MAP_TILESET_NAME = "tiles";
export const MAP_PROPS_ATLAS_IMAGE_KEY = "map:starter-town-props";
export const MAP_PROPS_ATLAS_METADATA_KEY = "map:starter-town-props-meta";
export const MAP_PROPS_LAYOUT_KEY = "map:starter-town-props-layout";
export const MAP_RESOURCE_ATLAS_IMAGE_KEY = "map:starter-town-resources";
export const MAP_RESOURCE_ATLAS_METADATA_KEY = "map:starter-town-resources-meta";
export const MAP_AUTUMN_TREE_WIND_TEXTURE_KEY = "map:starter-town-autumn-tree-wind";
export const MAP_WATER_TILESET_KEY = "map:starter-town-water";
export const MAP_WATER_TILESET_FRAMES = 1536; // 48 cols × 32 rows
export const MAP_SAFE_CENTER_TILE_X = 64.5;
export const MAP_SAFE_CENTER_TILE_Y = 64.5;
export const RESOURCE_OBJECT_LAYER = "resource_nodes";
export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 600;

const AUTUMN_TREE_WIND_ANIM_KEY = "map:starter-town-autumn-tree-wind:loop";

const STONE_VARIANT_BY_NODE_ID: Readonly<
  Record<
    string,
    Extract<ResourceNodeType, "stone_deposit" | "copper_deposit" | "iron_deposit" | "silver_deposit">
  >
> = Object.freeze({
  stone_1: "stone_deposit",
  stone_2: "copper_deposit",
  stone_3: "iron_deposit",
  stone_4: "silver_deposit",
});

const STARTER_TOWN_LAYER_DEPTHS = [
  ["ground", -100],
  ["ground_variation", -95],
  ["water", -92],
  ["paths", -90],
  ["transitions", -85],
  ["structures", -80],
  ["props", -70],
  ["above_player", 10000],
] as const;

interface TilesetMetadataEntry {
  gid: number;
  column: number;
  row: number;
}

interface TilesetMetadata {
  tileWidth: number;
  tileHeight: number;
  tiles: Record<string, TilesetMetadataEntry>;
}

interface RuntimePropAtlasEntry {
  category: string;
  label: string;
  confidence: string;
  x: number;
  y: number;
  width: number;
  height: number;
  notes?: string;
}

interface RuntimePropAtlasMetadata {
  image: string;
  items: Record<string, RuntimePropAtlasEntry>;
}

interface RuntimePropBlockerSpec {
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
}

interface RuntimePropPlacement {
  id: string;
  tileX: number;
  tileY: number;
  offsetX?: number;
  offsetY?: number;
  depthBias?: number;
  blocker?: RuntimePropBlockerSpec;
}

interface RuntimePropLayout {
  placements?: RuntimePropPlacement[];
}

interface AmbientAnimatedPropPlacement {
  textureKey: string;
  animationKey: string;
  tileX: number;
  tileY: number;
  frameCount: number;
  frameRate: number;
  offsetX?: number;
  offsetY?: number;
  depthBias?: number;
  blocker?: RuntimePropBlockerSpec;
}

const AMBIENT_ANIMATED_PROP_PLACEMENTS: readonly AmbientAnimatedPropPlacement[] = Object.freeze([
  {
    textureKey: MAP_AUTUMN_TREE_WIND_TEXTURE_KEY,
    animationKey: AUTUMN_TREE_WIND_ANIM_KEY,
    tileX: 54,
    tileY: 66,
    frameCount: 16,
    frameRate: 10,
    depthBias: 0.55,
    blocker: {
      width: 20,
      height: 12,
      offsetY: -2,
    },
  },
]);

export interface StarterTownPropBlocker {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AnimatedTileGroup {
  frameIndices: readonly number[];
  frameDurationMs: number;
  tiles: readonly Phaser.Tilemaps.Tile[];
}

export interface StarterTownWorld {
  tilemap: Phaser.Tilemaps.Tilemap;
  collisionLayer: Phaser.Tilemaps.TilemapLayer | null;
  worldMinX: number;
  worldMinY: number;
  worldMaxX: number;
  worldMaxY: number;
  worldWidth: number;
  worldHeight: number;
  /** Largura de um tile em pixels. */
  tileWidth: number;
  /** Altura de um tile em pixels. Pode diferir de tileWidth em tilesets não-quadrados. */
  tileHeight: number;
  resourceNodes: ResourceNodeMapConfig[];
  propSprites: readonly Phaser.GameObjects.GameObject[];
  propBlockers: readonly StarterTownPropBlocker[];
  animatedTileGroups: readonly AnimatedTileGroup[];
  waterSprites: readonly Phaser.GameObjects.Sprite[];
}

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

function readProperty(
  properties: readonly RawProperty[] | undefined,
  name: string,
): unknown {
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

function asItemId(value: unknown): ItemId | undefined {
  return typeof value === "string" ? (value as ItemId) : undefined;
}

function asInt(value: unknown, fallback: number): number {
  return Math.floor(asNumber(value, fallback));
}

function resolveRuntimeResourceType(
  typeRaw: ResourceNodeType,
  nodeId: string,
): ResourceNodeType {
  if (typeRaw !== "stone_deposit") {
    return typeRaw;
  }
  return STONE_VARIANT_BY_NODE_ID[nodeId] ?? typeRaw;
}

function resolveMapCenterTile(tilemap: Phaser.Tilemaps.Tilemap): {
  centerX: number;
  centerY: number;
} {
  const props = Array.isArray(tilemap.properties)
    ? (tilemap.properties as RawProperty[])
    : [];
  const safeCenterRaw = props.find((prop) => prop.name === "safeZoneCenter")?.value;
  if (typeof safeCenterRaw === "string") {
    const [xRaw, yRaw] = safeCenterRaw.split(",");
    const x = Number.parseFloat(xRaw);
    const y = Number.parseFloat(yRaw);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { centerX: x + 0.5, centerY: y + 0.5 };
    }
  }
  return { centerX: MAP_SAFE_CENTER_TILE_X, centerY: MAP_SAFE_CENTER_TILE_Y };
}

function parseResourceObjects(tilemap: Phaser.Tilemaps.Tilemap): ResourceNodeMapConfig[] {
  const layer = tilemap.getObjectLayer(RESOURCE_OBJECT_LAYER);
  if (!layer?.objects) {
    return [];
  }

  const tileWidth = tilemap.tileWidth || 32;
  const tileHeight = tilemap.tileHeight || 32;
  const result: ResourceNodeMapConfig[] = [];
  for (const raw of layer.objects as RawObjectLayerObject[]) {
    const typeRaw =
      readProperty(raw.properties, "nodeType") ?? readProperty(raw.properties, "type");
    if (typeof typeRaw !== "string" || !RESOURCE_NODE_TYPES.includes(typeRaw as ResourceNodeType)) {
      continue;
    }

    const tileX = asInt(
      readProperty(raw.properties, "tileX"),
      Math.floor((raw.x ?? 0) / tileWidth),
    );
    const tileY = asInt(
      readProperty(raw.properties, "tileY"),
      Math.floor((raw.y ?? 0) / tileHeight),
    );
    const nodeId =
      (typeof readProperty(raw.properties, "nodeId") === "string"
        ? (readProperty(raw.properties, "nodeId") as string)
        : raw.name) ?? `${typeRaw}:${tileX}:${tileY}`;
    const resolvedType = resolveRuntimeResourceType(typeRaw as ResourceNodeType, nodeId);
    const definition = RESOURCE_NODE_DEFINITIONS[resolvedType];
    result.push({
      nodeId,
      type: resolvedType,
      tileX,
      tileY,
      quantity: Math.max(
        1,
        Math.floor(
          asNumber(readProperty(raw.properties, "quantity"), definition.defaultQuantity),
        ),
      ),
      gatherTimeMs: Math.max(
        250,
        Math.floor(
          asNumber(readProperty(raw.properties, "gatherTimeMs"), definition.defaultGatherTimeMs),
        ),
      ),
      respawnTimeMs: Math.max(
        500,
        Math.floor(
          asNumber(readProperty(raw.properties, "respawnTimeMs"), definition.defaultRespawnTimeMs),
        ),
      ),
      yieldItemId: asItemId(readProperty(raw.properties, "yieldItemId")),
      yieldAmount: Math.max(
        1,
        Math.floor(asNumber(readProperty(raw.properties, "yieldAmount"), definition.yieldAmount)),
      ),
    });
  }

  return result;
}

function augmentForestTrees(params: {
  tilemap: Phaser.Tilemaps.Tilemap;
  collisionLayer: Phaser.Tilemaps.TilemapLayer | null;
  baseNodes: ResourceNodeMapConfig[];
  extraCount: number;
  safeCenterTileX: number;
  safeCenterTileY: number;
}): ResourceNodeMapConfig[] {
  const { tilemap, collisionLayer, baseNodes, extraCount, safeCenterTileX, safeCenterTileY } =
    params;
  if (extraCount <= 0 || baseNodes.length === 0) {
    return baseNodes;
  }

  const safeRadius = 14;
  const width = tilemap.width ?? 0;
  const height = tilemap.height ?? 0;
  const key = (x: number, y: number) => `${x}:${y}`;
  const occupied = new Set(baseNodes.map((n) => key(n.tileX, n.tileY)));
  const augmented = baseNodes.slice();

  const deltas: ReadonlyArray<[number, number]> = [
    [-3, -2], [-2, -3], [-2, 0], [-2, 2],
    [0, -2], [0, 2], [2, -2], [2, 0],
    [2, 2], [3, 1], [-3, 1], [1, 3],
    [-1, 3], [1, -3], [-1, -3],
  ];

  const isBlocked = (tileX: number, tileY: number): boolean => {
    if (!collisionLayer) return false;
    const tile = collisionLayer.getTileAt(tileX, tileY);
    return Boolean(tile && tile.index > 0);
  };

  const tooCloseToSafeZone = (tileX: number, tileY: number): boolean => {
    return (
      Math.abs(tileX - safeCenterTileX) <= safeRadius &&
      Math.abs(tileY - safeCenterTileY) <= safeRadius
    );
  };

  let created = 0;
  for (let attempt = 0; attempt < extraCount * 30 && created < extraCount; attempt += 1) {
    const base = baseNodes[Math.floor(Math.random() * baseNodes.length)]!;
    const [dx, dy] = deltas[Math.floor(Math.random() * deltas.length)]!;
    const tileX = base.tileX + dx;
    const tileY = base.tileY + dy;

    if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) continue;
    if (tooCloseToSafeZone(tileX, tileY)) continue;
    if (occupied.has(key(tileX, tileY))) continue;
    if (isBlocked(tileX, tileY)) continue;

    const id = `wood_extra_${created + 1}`;
    occupied.add(key(tileX, tileY));
    augmented.push({
      nodeId: id,
      type: Math.random() < 0.55 ? "oak_tree" : "pine_tree",
      tileX,
      tileY,
      quantity: 3,
      gatherTimeMs: Math.random() < 0.55 ? 1600 : 1750,
      respawnTimeMs: 300000,
      yieldItemId: "wood",
      yieldAmount: 1,
    });
    created += 1;
  }

  return augmented;
}

export function preloadStarterTownAssets(scene: Phaser.Scene): void {
  scene.load.tilemapTiledJSON(MAP_KEY, "/maps/starter_town/map.json");
  scene.load.image(MAP_TILESET_IMAGE_KEY, "/maps/starter_town/tileset.png");
  scene.load.json(MAP_TILESET_METADATA_KEY, "/maps/starter_town/tileset-phaser-metadata.json");
  scene.load.image(MAP_PROPS_ATLAS_IMAGE_KEY, "/maps/starter_town/runtime_props/atlas.png");
  scene.load.json(MAP_PROPS_ATLAS_METADATA_KEY, "/maps/starter_town/runtime_props/atlas.json");
  scene.load.json(MAP_PROPS_LAYOUT_KEY, "/maps/starter_town/runtime_props/layout.json");
  scene.load.image(MAP_RESOURCE_ATLAS_IMAGE_KEY, "/maps/starter_town/runtime_resources/atlas.png");
  scene.load.json(MAP_RESOURCE_ATLAS_METADATA_KEY, "/maps/starter_town/runtime_resources/atlas.json");
  scene.load.spritesheet(
    MAP_AUTUMN_TREE_WIND_TEXTURE_KEY,
    "/sprites/environment/animated_autumn_tree_wind.png",
    {
      frameWidth: 64,
      frameHeight: 64,
    },
  );
  scene.load.spritesheet(MAP_WATER_TILESET_KEY, "/maps/starter_town/tileset-agua.png", {
    frameWidth: 32,
    frameHeight: 32,
  });
}

export function ensureStarterTownTileFrames(scene: Phaser.Scene): void {
  const metadata = scene.cache.json.get(MAP_TILESET_METADATA_KEY) as TilesetMetadata | undefined;
  if (!metadata) {
    throw new Error("Tileset metadata de starter_town nao encontrado.");
  }
  const texture = scene.textures.get(MAP_TILESET_IMAGE_KEY);
  if (!texture) {
    throw new Error("Tileset texture de starter_town nao encontrado.");
  }

  for (const [frameName, entry] of Object.entries(metadata.tiles)) {
    if (texture.has(frameName)) {
      continue;
    }
    texture.add(
      frameName,
      0,
      entry.column * metadata.tileWidth,
      entry.row * metadata.tileHeight,
      metadata.tileWidth,
      metadata.tileHeight,
    );
  }
}

export function ensureStarterTownPropFrames(scene: Phaser.Scene): void {
  const metadata = scene.cache.json.get(MAP_PROPS_ATLAS_METADATA_KEY) as
    | RuntimePropAtlasMetadata
    | undefined;
  if (!metadata?.items) {
    return;
  }
  const texture = scene.textures.get(MAP_PROPS_ATLAS_IMAGE_KEY);
  if (!texture) {
    return;
  }

  for (const [frameName, entry] of Object.entries(metadata.items)) {
    if (texture.has(frameName)) {
      continue;
    }
    texture.add(frameName, 0, entry.x, entry.y, entry.width, entry.height);
  }
}

export function ensureStarterTownResourceFrames(scene: Phaser.Scene): void {
  const metadata = scene.cache.json.get(MAP_RESOURCE_ATLAS_METADATA_KEY) as
    | RuntimePropAtlasMetadata
    | undefined;
  if (!metadata?.items) {
    return;
  }
  const texture = scene.textures.get(MAP_RESOURCE_ATLAS_IMAGE_KEY);
  if (!texture) {
    return;
  }

  for (const [frameName, entry] of Object.entries(metadata.items)) {
    if (texture.has(frameName)) {
      continue;
    }
    texture.add(frameName, 0, entry.x, entry.y, entry.width, entry.height);
  }
}

function getTilesetMetadata(scene: Phaser.Scene): TilesetMetadata | null {
  return (scene.cache.json.get(MAP_TILESET_METADATA_KEY) as TilesetMetadata | undefined) ?? null;
}

function resolveAnimatedWaterFrameIndices(scene: Phaser.Scene): readonly number[] {
  const metadata = getTilesetMetadata(scene);
  if (!metadata) {
    return [21, 22, 23];
  }
  const indices = ["water_0", "water_1", "water_2"]
    .map((name) => metadata.tiles[name]?.gid)
    .filter((gid): gid is number => typeof gid === "number" && gid > 0);
  return indices.length === 3 ? indices : [21, 22, 23];
}

function ensureAmbientAnimatedPropAnimations(scene: Phaser.Scene): void {
  for (const placement of AMBIENT_ANIMATED_PROP_PLACEMENTS) {
    if (scene.anims.exists(placement.animationKey)) {
      continue;
    }
    scene.anims.create({
      key: placement.animationKey,
      frames: scene.anims.generateFrameNumbers(placement.textureKey, {
        start: 0,
        end: placement.frameCount - 1,
      }),
      frameRate: placement.frameRate,
      repeat: -1,
    });
  }
}

function buildRuntimePropSprites(
  scene: Phaser.Scene,
  tileWidth: number,
  tileHeight: number,
  worldMinX: number,
  worldMinY: number,
): {
  propSprites: Phaser.GameObjects.GameObject[];
  propBlockers: StarterTownPropBlocker[];
} {
  const atlas = scene.cache.json.get(MAP_PROPS_ATLAS_METADATA_KEY) as
    | RuntimePropAtlasMetadata
    | undefined;
  const layout = scene.cache.json.get(MAP_PROPS_LAYOUT_KEY) as RuntimePropLayout | undefined;

  if (!atlas?.items || !Array.isArray(layout?.placements)) {
    return { propSprites: [], propBlockers: [] };
  }

  ensureStarterTownPropFrames(scene);

  const propSprites: Phaser.GameObjects.GameObject[] = [];
  const propBlockers: StarterTownPropBlocker[] = [];

  for (const placement of layout.placements) {
    const frame = atlas.items[placement.id];
    if (!frame) {
      continue;
    }
    assertStarterTownRuntimePropFrameIsSafe(placement.id);

    const worldX =
      worldMinX + placement.tileX * tileWidth + tileWidth / 2 + (placement.offsetX ?? 0);
    const worldY =
      worldMinY + (placement.tileY + 1) * tileHeight + (placement.offsetY ?? 0);

    const sprite = scene.add
      .image(worldX, worldY, MAP_PROPS_ATLAS_IMAGE_KEY, placement.id)
      .setOrigin(0.5, 1)
      .setDepth(worldY - worldMinY + (placement.depthBias ?? 0.5));

    propSprites.push(sprite);

    if (placement.blocker) {
      const blockerCenterX = worldX + (placement.blocker.offsetX ?? 0);
      const blockerBottomY = worldY + (placement.blocker.offsetY ?? 0);
      propBlockers.push({
        left: blockerCenterX - placement.blocker.width / 2,
        right: blockerCenterX + placement.blocker.width / 2,
        top: blockerBottomY - placement.blocker.height,
        bottom: blockerBottomY,
      });
    }
  }

  ensureAmbientAnimatedPropAnimations(scene);

  for (const placement of AMBIENT_ANIMATED_PROP_PLACEMENTS) {
    const worldX =
      worldMinX + placement.tileX * tileWidth + tileWidth / 2 + (placement.offsetX ?? 0);
    const worldY =
      worldMinY + (placement.tileY + 1) * tileHeight + (placement.offsetY ?? 0);

    const sprite = scene.add
      .sprite(worldX, worldY, placement.textureKey, 0)
      .setOrigin(0.5, 1)
      .setDepth(worldY - worldMinY + (placement.depthBias ?? 0.5));
    sprite.play(placement.animationKey);
    propSprites.push(sprite);

    if (placement.blocker) {
      const blockerCenterX = worldX + (placement.blocker.offsetX ?? 0);
      const blockerBottomY = worldY + (placement.blocker.offsetY ?? 0);
      propBlockers.push({
        left: blockerCenterX - placement.blocker.width / 2,
        right: blockerCenterX + placement.blocker.width / 2,
        top: blockerBottomY - placement.blocker.height,
        bottom: blockerBottomY,
      });
    }
  }

  return { propSprites, propBlockers };
}

export function buildStarterTownWorld(scene: Phaser.Scene): StarterTownWorld {
  const tilemap = scene.make.tilemap({ key: MAP_KEY });
  const tileset = tilemap.addTilesetImage(MAP_TILESET_NAME, MAP_TILESET_IMAGE_KEY);
  if (!tileset) {
    throw new Error("Tileset 'tiles' nao encontrado no map.json.");
  }
  assertStarterTownTilemapIsSafe(tilemap);

  const { centerX, centerY } = resolveMapCenterTile(tilemap);
  const centerWorldX = centerX * tilemap.tileWidth;
  const centerWorldY = centerY * tilemap.tileHeight;
  const mapOffsetX = WORLD_WIDTH / 2 - centerWorldX;
  const mapOffsetY = WORLD_HEIGHT / 2 - centerWorldY;

  const addLayer = (name: string, depth: number): Phaser.Tilemaps.TilemapLayer | null => {
    const layer = tilemap.createLayer(name, tileset, mapOffsetX, mapOffsetY);
    layer?.setDepth(depth);
    return layer;
  };

  const renderLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  for (const [layerName, depth] of STARTER_TOWN_LAYER_DEPTHS) {
    const layer = addLayer(layerName, depth);
    if (layer) {
      renderLayers.push(layer);
    }
  }

  const collisionLayer = addLayer("collision", 9950);
  collisionLayer?.setVisible(false);
  collisionLayer?.setCollisionByExclusion([-1, 0]);

  const waterLayer = renderLayers.find((l) => l.layer.name === "water") ?? null;
  const tw = tilemap.tileWidth, th = tilemap.tileHeight;
  const waterSprites: Phaser.GameObjects.Sprite[] = [];
  const waterFrameSet = new Set(resolveAnimatedWaterFrameIndices(scene));
  if (waterLayer && scene.textures.exists(MAP_WATER_TILESET_KEY)) {
    const tex = scene.textures.get(MAP_WATER_TILESET_KEY);
    const texW = tex.source[0].width, texH = tex.source[0].height;
    const cols = texW / tw;
    for (let ty = 0; ty < tilemap.height; ty++) {
      for (let tx = 0; tx < tilemap.width; tx++) {
        const tile = waterLayer.getTileAt(tx, ty);
        if (!tile || !waterFrameSet.has(tile.index)) continue;
        const worldX = mapOffsetX + tx * tw + tw / 2;
        const worldY = mapOffsetY + ty * th + th / 2;
        const baseCol = ((tx * 7 + ty * 13) % (texW / tw));
        const baseRow = ((tx * 11 + ty * 5) % (texH / th));
        const sprite = scene.add.sprite(worldX, worldY, MAP_WATER_TILESET_KEY, baseRow * (texW / tw) + baseCol);
        sprite.setDepth(-92);
        waterSprites.push(sprite);
      }
    }
    waterLayer.setVisible(false);
  }

  const { propSprites, propBlockers } = buildRuntimePropSprites(
    scene,
    tilemap.tileWidth,
    tilemap.tileHeight,
    mapOffsetX,
    mapOffsetY,
  );

  const resourceNodes = parseResourceObjects(tilemap);

  return {
    tilemap,
    collisionLayer,
    worldMinX: mapOffsetX,
    worldMinY: mapOffsetY,
    worldWidth: tilemap.widthInPixels,
    worldHeight: tilemap.heightInPixels,
    worldMaxX: mapOffsetX + tilemap.widthInPixels,
    worldMaxY: mapOffsetY + tilemap.heightInPixels,
    tileWidth: tilemap.tileWidth,
    tileHeight: tilemap.tileHeight,
    resourceNodes,
    propSprites,
    propBlockers,
    animatedTileGroups: [],
    waterSprites,
  };
}

export function tileToWorldPosition(
  world: Pick<StarterTownWorld, "tileWidth" | "tileHeight" | "worldMinX" | "worldMinY">,
  tileX: number,
  tileY: number,
): { x: number; y: number } {
  return {
    x: world.worldMinX + tileX * world.tileWidth + world.tileWidth / 2,
    y: world.worldMinY + (tileY + 1) * world.tileHeight - 2,
  };
}
