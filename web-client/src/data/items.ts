export const ITEM_IDS = [
  "wood",
  "plank",
  "wood_handle",
  "stone",
  "cut_stone",
  "simple_axe",
  "simple_pickaxe",
] as const;

export type ItemId = (typeof ITEM_IDS)[number];

/** Sprite sheet icon — col/row are 0-indexed tile coordinates at `size` px per tile. */
export interface ItemIcon {
  src: string;   // path relative to /sprites/icons/
  col: number;
  row: number;
  size: number;  // tile size in the sheet (px)
}

export interface ItemDefinition {
  id: ItemId;
  name: string;
  category: string;
  description: string;
  shortLabel: string;
  accent: string;
  sortOrder: number;
  icon: ItemIcon;
}

export const ITEM_DEFINITIONS: Readonly<Record<ItemId, ItemDefinition>> = {
  wood: {
    id: "wood",
    name: "Madeira",
    category: "Recurso",
    description: "Troncos cortados e prontos para uso em crafting basico.",
    shortLabel: "MAD",
    accent: "#d8a266",
    sortOrder: 1,
    // camping.png row 0: backpack, rope, mushroom, herb, log?, ?, ?
    icon: { src: "camping.png", col: 0, row: 0, size: 16 },
  },
  plank: {
    id: "plank",
    name: "Tabua",
    category: "Material",
    description: "Madeira processada para receitas de construcao e ferramentas.",
    shortLabel: "TAB",
    accent: "#f0c17a",
    sortOrder: 2,
    icon: { src: "camping.png", col: 1, row: 0, size: 16 },
  },
  wood_handle: {
    id: "wood_handle",
    name: "Cabo de madeira",
    category: "Componente",
    description: "Empunhadura simples usada na montagem de ferramentas.",
    shortLabel: "CAB",
    accent: "#c68d52",
    sortOrder: 3,
    icon: { src: "camping.png", col: 2, row: 0, size: 16 },
  },
  stone: {
    id: "stone",
    name: "Pedra",
    category: "Recurso",
    description: "Pedra bruta extraida de nodos mineraveis espalhados pelo mapa.",
    shortLabel: "PED",
    accent: "#b6c1cf",
    sortOrder: 4,
    // cave.png: row 0 col 4 = blue crystal/rock
    icon: { src: "cave.png", col: 4, row: 0, size: 16 },
  },
  cut_stone: {
    id: "cut_stone",
    name: "Pedra lapidada",
    category: "Material",
    description: "Pedra refinada para receitas mais resistentes e acabamentos.",
    shortLabel: "LAP",
    accent: "#d4dde8",
    sortOrder: 5,
    // cave.png: row 0 col 2 = processed gem/stone
    icon: { src: "cave.png", col: 2, row: 0, size: 16 },
  },
  simple_axe: {
    id: "simple_axe",
    name: "Machado simples",
    category: "Ferramenta",
    description: "Ferramenta inicial para cortar arvores e coletar madeira.",
    shortLabel: "MAX",
    accent: "#ffcb75",
    sortOrder: 6,
    // cave.png: row 1 col 0 = axe
    icon: { src: "cave.png", col: 0, row: 1, size: 16 },
  },
  simple_pickaxe: {
    id: "simple_pickaxe",
    name: "Picareta simples",
    category: "Ferramenta",
    description: "Ferramenta inicial para minerar rochas e depositos de ore.",
    shortLabel: "PIC",
    accent: "#9fd4ff",
    sortOrder: 7,
    // cave.png: row 0 col 0 = pickaxe
    icon: { src: "cave.png", col: 0, row: 0, size: 16 },
  },
};

export const ITEM_SORT_ORDER = ITEM_IDS.slice().sort(
  (left, right) => ITEM_DEFINITIONS[left].sortOrder - ITEM_DEFINITIONS[right].sortOrder,
);
