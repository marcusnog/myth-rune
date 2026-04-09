export interface StarterVillageNpcSpec {
  id: string;
  name: string;
  textureKey: string;
  path: string;
  tileX: number;
  tileY: number;
  scale: number;
  blockerRadiusX: number;
  blockerRadiusY: number;
  interactionRadius: number;
  dialogue: readonly string[];
}

export const STARTER_VILLAGE_NPCS: readonly StarterVillageNpcSpec[] = [
  {
    id: "elder_bran",
    name: "Elder Bran",
    textureKey: "npc:elder_bran",
    path: "/sprites/npcs/starter_village/elder_bran.png",
    tileX: 64,
    tileY: 67,
    scale: 1,
    blockerRadiusX: 10,
    blockerRadiusY: 7,
    interactionRadius: 54,
    dialogue: [
      "Bem-vindo a Myth Rune, aventureiro. Esta vila e pequena, mas aguenta firmemente a borda da floresta.",
      "Converse com os moradores, prepare seu equipamento e so depois siga para o mato fechado.",
      "Quando estiver pronto, a estrada ao sul e o primeiro passo para problemas maiores.",
    ],
  },
  {
    id: "merchant_mira",
    name: "Merchant Mira",
    textureKey: "npc:merchant_mira",
    path: "/sprites/npcs/starter_village/merchant_mira.png",
    tileX: 72,
    tileY: 60,
    scale: 1,
    blockerRadiusX: 10,
    blockerRadiusY: 7,
    interactionRadius: 52,
    dialogue: [
      "Tenho mantimentos, corda, lampioes e o que mais sobrou da ultima caravana.",
      "Se for sair da vila, leve algo para se curar. Os novatos sempre esquecem disso.",
    ],
  },
  {
    id: "healer_lyra",
    name: "Healer Lyra",
    textureKey: "npc:healer_lyra",
    path: "/sprites/npcs/starter_village/healer_lyra.png",
    tileX: 60,
    tileY: 57,
    scale: 1,
    blockerRadiusX: 10,
    blockerRadiusY: 7,
    interactionRadius: 52,
    dialogue: [
      "A floresta anda inquieta. Tenho recebido mais feridos do que o normal.",
      "Se perder muita vida em combate, volte e recupere o folego antes de insistir.",
    ],
  },
  {
    id: "ranger_kael",
    name: "Ranger Kael",
    textureKey: "npc:ranger_kael",
    path: "/sprites/npcs/starter_village/ranger_kael.png",
    tileX: 76,
    tileY: 67,
    scale: 1,
    blockerRadiusX: 10,
    blockerRadiusY: 7,
    interactionRadius: 54,
    dialogue: [
      "As trilhas a leste parecem seguras, mas so parecem.",
      "Siga as marcas no chao e nao avance demais ate sentir o ritmo do combate.",
    ],
  },
  {
    id: "blacksmith_torren",
    name: "Blacksmith Torren",
    textureKey: "npc:blacksmith_torren",
    path: "/sprites/npcs/starter_village/blacksmith_torren.png",
    tileX: 56,
    tileY: 76,
    scale: 1,
    blockerRadiusX: 12,
    blockerRadiusY: 8,
    interactionRadius: 56,
    dialogue: [
      "Armas ruins quebram no pior momento. Eu prefiro evitar esse tipo de licao.",
      "Se conseguir minerio e sucata melhores, eu posso transformar isso em algo util.",
    ],
  },
  {
    id: "guard_hale",
    name: "Guard Hale",
    textureKey: "npc:guard_hale",
    path: "/sprites/npcs/starter_village/guard_hale.png",
    tileX: 64,
    tileY: 50,
    scale: 1,
    blockerRadiusX: 11,
    blockerRadiusY: 8,
    interactionRadius: 56,
    dialogue: [
      "Mantenha os olhos na estrada principal e os pes longe da agua funda.",
      "Se vir goblins rondando perto da cerca, avise alguem antes que virem um bando.",
    ],
  },
  {
    id: "captain_brom",
    name: "Captain Brom",
    textureKey: "npc:captain_brom",
    path: "/sprites/npcs/starter_village/captain_brom.png",
    tileX: 50,
    tileY: 66,
    scale: 1,
    blockerRadiusX: 11,
    blockerRadiusY: 8,
    interactionRadius: 56,
    dialogue: [
      "Os guardas seguram a linha aqui, mas a vila precisa de gente capaz la fora.",
      "Treine, conheca o terreno e nao lute sozinho quando puder evitar.",
    ],
  },
  {
    id: "mage_elowen",
    name: "Mage Elowen",
    textureKey: "npc:mage_elowen",
    path: "/sprites/npcs/starter_village/mage_elowen.png",
    tileX: 72,
    tileY: 74,
    scale: 1,
    blockerRadiusX: 10,
    blockerRadiusY: 7,
    interactionRadius: 54,
    dialogue: [
      "Ha energia antiga na floresta. Algumas ruinas ainda sussurram para quem sabe ouvir.",
      "Se encontrar algo estranho, observe primeiro. Nem toda luz e um convite.",
    ],
  },
];
