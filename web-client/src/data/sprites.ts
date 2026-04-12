export type Facing = "up" | "down" | "left" | "right";
export type DirectionalAction = "walk" | "idle" | "attack";
export type GatherAction = "woodcutting" | "mining";
export type SingleAction = "hurt" | "death";
export type PlayerVisualKey = "warrior" | "rogue" | "mage" | "archer";
export type MobVisualKey = "goblin" | "zombie" | "wolf" | "ent";
export type VisualKey = PlayerVisualKey | MobVisualKey;

export interface DirectionalAnimSpec {
  rows?: Record<Facing, number>;
  frames?: number;
  sequences?: Partial<Record<Facing, number[]>>;
  flipX?: Partial<Record<Facing, boolean>>;
  fps: number;
  loop: boolean;
}

export interface SingleAnimSpec {
  row?: number;
  frames?: number;
  sequence?: number[];
  fps: number;
  loop: boolean;
}

export interface VisualSpec {
  textureKey: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  scale: number;
  directional: Record<DirectionalAction, DirectionalAnimSpec>;
  gather?: Partial<Record<GatherAction, DirectionalAnimSpec>>;
  single: Record<SingleAction, SingleAnimSpec>;
}

const DIRECTIONAL_ROWS: Record<DirectionalAction, Record<Facing, number>> = {
  walk: { up: 0, down: 1, left: 2, right: 3 },
  idle: { up: 4, down: 5, left: 6, right: 7 },
  attack: { up: 8, down: 9, left: 10, right: 11 },
};

function frameRange(row: number, startCol: number, count: number, columns = 8): number[] {
  const start = row * columns + startCol;
  return Array.from({ length: count }, (_, index) => start + index);
}

function buildCharacterSpec(textureKey: string, path: string): VisualSpec {
  return {
    textureKey,
    path,
    frameWidth: 128,
    frameHeight: 128,
    columns: 8,
    scale: 0.5,
    directional: {
      walk: { rows: DIRECTIONAL_ROWS.walk, frames: 6, fps: 10, loop: true },
      idle: { rows: DIRECTIONAL_ROWS.idle, frames: 4, fps: 6, loop: true },
      attack: { rows: DIRECTIONAL_ROWS.attack, frames: 8, fps: 14, loop: false },
    },
    single: {
      hurt: { row: 9, frames: 3, fps: 12, loop: false },
      death: { row: 11, frames: 8, fps: 8, loop: false },
    },
  };
}

function buildCompactCharacterSpec(textureKey: string, path: string): VisualSpec {
  return {
    textureKey,
    path,
    frameWidth: 51,
    frameHeight: 51,
    columns: 8,
    scale: 1.25,
    directional: {
      walk: {
        sequences: {
          up: frameRange(0, 0, 6),
          down: frameRange(1, 0, 6),
          left: frameRange(2, 0, 6),
          right: frameRange(2, 0, 6),
        },
        flipX: { right: true },
        fps: 10,
        loop: true,
      },
      idle: {
        sequences: {
          up: [frameRange(0, 0, 1)[0]],
          down: [frameRange(1, 0, 1)[0]],
          left: [frameRange(2, 0, 1)[0]],
          right: [frameRange(2, 0, 1)[0]],
        },
        flipX: { right: true },
        fps: 4,
        loop: true,
      },
      attack: {
        sequences: {
          up: frameRange(3, 4, 4),
          down: frameRange(3, 0, 4),
          left: frameRange(4, 0, 4),
          right: frameRange(4, 4, 4),
        },
        fps: 12,
        loop: false,
      },
    },
    gather: {
      woodcutting: {
        sequences: {
          up: frameRange(7, 4, 4),
          down: frameRange(7, 4, 4),
          left: frameRange(7, 4, 4),
          right: frameRange(7, 4, 4),
        },
        flipX: { right: true },
        fps: 10,
        loop: false,
      },
      mining: {
        sequences: {
          up: frameRange(6, 4, 4),
          down: frameRange(6, 4, 4),
          left: frameRange(6, 4, 4),
          right: frameRange(6, 4, 4),
        },
        flipX: { right: true },
        fps: 10,
        loop: false,
      },
    },
    single: {
      hurt: { sequence: frameRange(10, 0, 3), fps: 12, loop: false },
      death: { sequence: frameRange(5, 0, 4), fps: 8, loop: false },
    },
  };
}

export const VISUAL_SPECS: Record<VisualKey, VisualSpec> = {
  warrior: buildCompactCharacterSpec("sheet:warrior", "/sprites/characters/warrior/warrior_walk2.png"),

  rogue: buildCompactCharacterSpec("sheet:rogue", "/sprites/characters/rogue/rogue_walk.png"),
  mage: buildCompactCharacterSpec("sheet:mage", "/sprites/characters/mage/mage_walk.png"),
  archer: buildCharacterSpec("sheet:archer", "/sprites/characters/archer/archer_walk.png"),

  goblin: {
    textureKey: "sheet:goblin",
    path: "/sprites/mobs/goblin/goblin_sprite_sheet.png",
    frameWidth: 128,
    frameHeight: 128,
    columns: 8,
    scale: 0.5,
    directional: {
      walk: { rows: DIRECTIONAL_ROWS.walk, frames: 8, fps: 10, loop: true },
      idle: { rows: DIRECTIONAL_ROWS.idle, frames: 8, fps: 6, loop: true },
      attack: { rows: DIRECTIONAL_ROWS.attack, frames: 8, fps: 12, loop: false },
    },
    single: {
      hurt: { row: 9, frames: 3, fps: 10, loop: false },
      death: { row: 11, frames: 8, fps: 8, loop: false },
    },
  },

  // zombie uses the goblin sheet as a placeholder (its own sheet is not uniform).
  zombie: {
    textureKey: "sheet:goblin",
    path: "/sprites/mobs/goblin/goblin_sprite_sheet.png",
    frameWidth: 128,
    frameHeight: 128,
    columns: 8,
    scale: 0.5,
    directional: {
      walk: { rows: DIRECTIONAL_ROWS.walk, frames: 8, fps: 9, loop: true },
      idle: { rows: DIRECTIONAL_ROWS.idle, frames: 8, fps: 6, loop: true },
      attack: { rows: DIRECTIONAL_ROWS.attack, frames: 8, fps: 11, loop: false },
    },
    single: {
      hurt: { row: 9, frames: 3, fps: 10, loop: false },
      death: { row: 11, frames: 8, fps: 7, loop: false },
    },
  },

  wolf: {
    textureKey: "sheet:wolf",
    path: "/sprites/mobs/wolf/wolf_sprite_sheet.png",
    frameWidth: 128,
    frameHeight: 128,
    columns: 8,
    scale: 0.78,
    directional: {
      walk: { rows: { up: 2, down: 2, left: 3, right: 2 }, frames: 7, fps: 11, loop: true },
      idle: { rows: { up: 0, down: 0, left: 1, right: 0 }, frames: 4, fps: 6, loop: true },
      attack: { rows: { up: 4, down: 4, left: 5, right: 4 }, frames: 7, fps: 12, loop: false },
    },
    single: {
      hurt: { row: 6, frames: 2, fps: 10, loop: false },
      death: { row: 7, frames: 3, fps: 7, loop: false },
    },
  },

  ent: {
    textureKey: "sheet:ent",
    path: "/sprites/mobs/ent/ent_sprite_sheet.png",
    frameWidth: 192,
    frameHeight: 192,
    columns: 8,
    scale: 0.75,
    directional: {
      walk: { rows: DIRECTIONAL_ROWS.walk, frames: 8, fps: 7, loop: true },
      idle: { rows: DIRECTIONAL_ROWS.idle, frames: 8, fps: 5, loop: true },
      attack: { rows: DIRECTIONAL_ROWS.attack, frames: 8, fps: 10, loop: false },
    },
    single: {
      hurt: { row: 9, frames: 3, fps: 10, loop: false },
      death: { row: 11, frames: 6, fps: 6, loop: false },
    },
  },
};

export const KNOWN_PLAYER_VISUALS = new Set<PlayerVisualKey>([
  "warrior",
  "rogue",
  "mage",
  "archer",
]);
