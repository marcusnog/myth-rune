import tileRegistry from "../../../public/maps/starter_town/tile-registry.json";

export interface StarterTownTileRegistry {
  tileset: {
    name: string;
    image: string;
    tileWidth: number;
    tileHeight: number;
    columns: number;
    rows: number;
    engineSafeTilecount: number;
  };
  terrain: Record<string, number[]>;
  transitions: Record<string, number[]>;
  structures: {
    houseFloors: number[];
    houseWalls: number[];
    houseRoofs: number[];
    caveEntrances: number[];
    runtimeFrames: string[];
  };
  props: {
    lamps: number[];
    crates: number[];
    barrels: number[];
    signs: number[];
    runtimeFrames: Record<string, string[]>;
  };
  resources: {
    trees: number[];
    ores: number[];
    rocks: number[];
    runtimeFrames: Record<string, string[]>;
  };
  blocked: {
    rocks: number[];
    trees: number[];
    runtimeFrames: string[];
  };
  collision: Record<string, number[]>;
  forbidden: Record<string, number[]>;
  layerRules: Record<string, string[]>;
}

export const STARTER_TOWN_TILE_REGISTRY =
  tileRegistry as StarterTownTileRegistry;

function resolveRegistryPath(path: string): readonly number[] {
  const [group, key] = path.split(".");
  const root = STARTER_TOWN_TILE_REGISTRY as unknown as Record<string, unknown>;
  const bucket = root[group] as Record<string, number[]> | undefined;
  const value = bucket?.[key];
  return Array.isArray(value) ? value : [];
}

export function getStarterTownLayerWhitelist(layerName: string): ReadonlySet<number> {
  const allowed = new Set<number>();
  for (const path of STARTER_TOWN_TILE_REGISTRY.layerRules[layerName] ?? []) {
    for (const gid of resolveRegistryPath(path)) {
      allowed.add(gid);
    }
  }
  return allowed;
}

export function getStarterTownForbiddenTiles(): ReadonlySet<number> {
  const forbidden = new Set<number>();
  for (const group of Object.values(STARTER_TOWN_TILE_REGISTRY.forbidden)) {
    for (const gid of group) {
      forbidden.add(gid);
    }
  }
  return forbidden;
}

export function getStarterTownAllowedRuntimeFrames(): ReadonlySet<string> {
  const frames = new Set<string>([
    ...STARTER_TOWN_TILE_REGISTRY.structures.runtimeFrames,
    ...STARTER_TOWN_TILE_REGISTRY.blocked.runtimeFrames,
  ]);
  for (const group of Object.values(STARTER_TOWN_TILE_REGISTRY.props.runtimeFrames)) {
    for (const frame of group) {
      frames.add(frame);
    }
  }
  for (const group of Object.values(STARTER_TOWN_TILE_REGISTRY.resources.runtimeFrames)) {
    for (const frame of group) {
      frames.add(frame);
    }
  }
  return frames;
}
