import { ITEM_IDS, type ItemId } from "@myth-of-rune/shared";
export { ITEM_IDS, type ItemId };

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
  gold_coin: {
    id: "gold_coin",
    name: "Moeda de ouro",
    category: "Moeda",
    description: "Moeda comum usada para negociar com mercadores e servicos na vila.",
    shortLabel: "G",
    accent: "#f2c14d",
    sortOrder: 0,
    icon: { src: "consumables.png", col: 0, row: 0, size: 16 },
  },
  health_potion: {
    id: "health_potion",
    name: "Pocao de vida",
    category: "Consumivel",
    description: "Restaura parte da vida quando usada fora do menu de equipamento.",
    shortLabel: "PV",
    accent: "#ff8f8f",
    sortOrder: 1,
    icon: { src: "potions.png", col: 0, row: 0, size: 16 },
  },
  wood: {
    id: "wood",
    name: "Madeira",
    category: "Recurso",
    description: "Troncos cortados e prontos para uso em crafting basico.",
    shortLabel: "MAD",
    accent: "#d8a266",
    sortOrder: 2,
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
    sortOrder: 3,
    icon: { src: "camping.png", col: 1, row: 0, size: 16 },
  },
  wood_handle: {
    id: "wood_handle",
    name: "Cabo de madeira",
    category: "Componente",
    description: "Empunhadura simples usada na montagem de ferramentas.",
    shortLabel: "CAB",
    accent: "#c68d52",
    sortOrder: 4,
    icon: { src: "camping.png", col: 2, row: 0, size: 16 },
  },
  stone: {
    id: "stone",
    name: "Pedra",
    category: "Recurso",
    description: "Pedra bruta extraida de nodos mineraveis espalhados pelo mapa.",
    shortLabel: "PED",
    accent: "#b6c1cf",
    sortOrder: 5,
    // cave.png: row 0 col 4 = blue crystal/rock
    icon: { src: "cave.png", col: 4, row: 0, size: 16 },
  },
  copper_ore: {
    id: "copper_ore",
    name: "Minerio de cobre",
    category: "Recurso",
    description: "Minerio bruto de tom quente, util para fundicao e componentes metalicos.",
    shortLabel: "COB",
    accent: "#d58b57",
    sortOrder: 6,
    icon: { src: "cave.png", col: 5, row: 0, size: 16 },
  },
  iron_ore: {
    id: "iron_ore",
    name: "Minerio de ferro",
    category: "Recurso",
    description: "Veio metalico mais denso, base para pecas resistentes e ferramentas futuras.",
    shortLabel: "FER",
    accent: "#aab5c4",
    sortOrder: 7,
    icon: { src: "cave.png", col: 3, row: 1, size: 16 },
  },
  silver_ore: {
    id: "silver_ore",
    name: "Minerio de prata",
    category: "Recurso",
    description: "Minerio raro de brilho frio, bom para receitas refinadas e itens especiais.",
    shortLabel: "PRA",
    accent: "#d8e3f3",
    sortOrder: 8,
    icon: { src: "cave.png", col: 4, row: 1, size: 16 },
  },
  cut_stone: {
    id: "cut_stone",
    name: "Pedra lapidada",
    category: "Material",
    description: "Pedra refinada para receitas mais resistentes e acabamentos.",
    shortLabel: "LAP",
    accent: "#d4dde8",
    sortOrder: 9,
    // cave.png: row 0 col 2 = processed gem/stone
    icon: { src: "cave.png", col: 2, row: 0, size: 16 },
  },
  copper_ingot: {
    id: "copper_ingot",
    name: "Lingote de cobre",
    category: "Material",
    description: "Metal refinado de cobre, pronto para componentes e trabalhos de forja.",
    shortLabel: "LCO",
    accent: "#e19a67",
    sortOrder: 10,
    icon: { src: "cave.png", col: 2, row: 2, size: 16 },
  },
  iron_ingot: {
    id: "iron_ingot",
    name: "Lingote de ferro",
    category: "Material",
    description: "Barra de ferro refinada para receitas mais robustas e duraveis.",
    shortLabel: "LFE",
    accent: "#c0c9d6",
    sortOrder: 11,
    icon: { src: "cave.png", col: 3, row: 2, size: 16 },
  },
  silver_ingot: {
    id: "silver_ingot",
    name: "Lingote de prata",
    category: "Material",
    description: "Prata refinada para pecas finas, reforcos e receitas raras.",
    shortLabel: "LPR",
    accent: "#eaf1fb",
    sortOrder: 12,
    icon: { src: "cave.png", col: 4, row: 2, size: 16 },
  },
  simple_axe: {
    id: "simple_axe",
    name: "Machado simples",
    category: "Ferramenta",
    description: "Ferramenta inicial para cortar arvores e coletar madeira.",
    shortLabel: "MAX",
    accent: "#ffcb75",
    sortOrder: 13,
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
    sortOrder: 14,
    // cave.png: row 0 col 0 = pickaxe
    icon: { src: "cave.png", col: 0, row: 0, size: 16 },
  },
};

export const ITEM_SORT_ORDER = ITEM_IDS.slice().sort(
  (left, right) => ITEM_DEFINITIONS[left].sortOrder - ITEM_DEFINITIONS[right].sortOrder,
);
