import {
  QUEST_DEFINITIONS,
  createDefaultQuestState as createDefaultSharedQuestState,
  type MobType,
  type QuestDefinition,
  type QuestId,
  type QuestStateEntry,
  type QuestStateRecord,
} from "@myth-of-rune/shared";
import type { ConnectedPlayer } from "./room.js";

interface NpcPanelView {
  npcId: string;
  npcName: string;
  title: string;
  description: string;
  hint: string | null;
  actions: Array<{
    actionId: string;
    label: string;
    description: string;
    disabled: boolean;
    emphasis: "primary" | "muted" | "danger";
  }>;
}

const GOLD_ITEM_ID = "gold_coin";
const HEALTH_POTION_ITEM_ID = "health_potion";
const HEALTH_POTION_HEAL = 45;
const HEALER_FULL_HEAL_COST = 10;

interface MerchantOffer {
  id: string;
  itemId: string;
  label: string;
  description: string;
  price: number;
  quantity: number;
}

export type PlayerQuestState = QuestStateRecord;

const MERCHANT_OFFERS: readonly MerchantOffer[] = [
  {
    id: "health_potion",
    itemId: HEALTH_POTION_ITEM_ID,
    label: "Comprar pocao de vida",
    description: "Restaura vida em combate. Recebe 1 unidade.",
    price: 8,
    quantity: 1,
  },
  {
    id: "simple_axe",
    itemId: "simple_axe",
    label: "Comprar machado simples",
    description: "Ferramenta basica para cortar arvores.",
    price: 16,
    quantity: 1,
  },
  {
    id: "simple_pickaxe",
    itemId: "simple_pickaxe",
    label: "Comprar picareta simples",
    description: "Ferramenta basica para mineracao.",
    price: 16,
    quantity: 1,
  },
];

function rewardText(definition: QuestDefinition): string {
  return definition.rewards.map((reward) => `${reward.quantity} ${reward.itemId}`).join(" + ");
}

function getQuestStateEntry(state: PlayerQuestState, questId: QuestId): QuestStateEntry {
  return state[questId] ?? createDefaultQuestState()[questId];
}

function syncCollectQuestProgress(
  self: ConnectedPlayer,
  inventory: Record<string, number>,
  definition: QuestDefinition,
): void {
  if (!definition.targetItemId) {
    return;
  }
  const entry = getQuestStateEntry(self.questState, definition.id);
  if (entry.status === "available" || entry.status === "completed") {
    return;
  }
  entry.progress = Math.min(inventory[definition.targetItemId] ?? 0, definition.requiredAmount);
  if (entry.progress >= definition.requiredAmount) {
    entry.status = "ready";
  }
}

function questPanelForNpc(
  self: ConnectedPlayer,
  inventory: Record<string, number>,
  npcId: string,
): NpcPanelView | null {
  const quests = Object.values(QUEST_DEFINITIONS).filter((quest) => quest.npcId === npcId);
  if (quests.length === 0) {
    return null;
  }

  const actions: NpcPanelView["actions"] = [];
  const descriptions: string[] = [];
  const hints: string[] = [];

  for (const quest of quests) {
    syncCollectQuestProgress(self, inventory, quest);
    const entry = getQuestStateEntry(self.questState, quest.id);
    const currentProgress =
      quest.objectiveType === "collect" && quest.targetItemId
        ? Math.min(inventory[quest.targetItemId] ?? 0, quest.requiredAmount)
        : Math.min(entry.progress, quest.requiredAmount);

    descriptions.push(`${quest.title}: ${currentProgress}/${quest.requiredAmount}`);

    if (entry.status === "available") {
      actions.push({
        actionId: `quest:accept:${quest.id}`,
        label: `Aceitar: ${quest.title}`,
        description: quest.description,
        disabled: false,
        emphasis: "primary",
      });
      hints.push(`Recompensa: ${rewardText(quest)}.`);
      continue;
    }

    if (entry.status === "active") {
      actions.push({
        actionId: `quest:active:${quest.id}`,
        label: `${quest.title} em andamento`,
        description: `${currentProgress}/${quest.requiredAmount}`,
        disabled: true,
        emphasis: "muted",
      });
      hints.push(`Continue para receber ${rewardText(quest)}.`);
      continue;
    }

    if (entry.status === "ready") {
      actions.push({
        actionId: `quest:claim:${quest.id}`,
        label: `Entregar: ${quest.title}`,
        description: `Receber ${rewardText(quest)}.`,
        disabled: false,
        emphasis: "primary",
      });
      hints.push(`Pronto para entrega: ${quest.title}.`);
      continue;
    }

    actions.push({
      actionId: `quest:done:${quest.id}`,
      label: `${quest.title} concluida`,
      description: "Sem novas ordens nesta quest.",
      disabled: true,
      emphasis: "muted",
    });
  }

  return {
    npcId,
    npcName: quests[0]!.npcName,
    title: "Misses disponiveis",
    description: descriptions.join(" | "),
    hint: hints[0] ?? "Volte depois para mais ordens.",
    actions,
  };
}

export function createDefaultQuestState(): PlayerQuestState {
  return createDefaultSharedQuestState();
}

export function normalizeQuestState(raw: unknown): PlayerQuestState {
  const fallback = createDefaultQuestState();
  if (!raw || typeof raw !== "object") {
    return fallback;
  }
  const source = raw as Record<string, unknown>;
  const next = createDefaultQuestState();
  for (const questId of Object.keys(QUEST_DEFINITIONS) as QuestId[]) {
    const entry = source[questId];
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const status = (entry as Record<string, unknown>).status;
    const progress = (entry as Record<string, unknown>).progress;
    if (
      status === "available" ||
      status === "active" ||
      status === "ready" ||
      status === "completed"
    ) {
      next[questId] = {
        status,
        progress:
          typeof progress === "number" && Number.isFinite(progress)
            ? Math.max(0, Math.floor(progress))
            : 0,
      };
    }
  }
  return next;
}

export function isServiceNpc(npcId: string): boolean {
  return [
    "merchant_mira",
    "healer_lyra",
    "captain_brom",
    "guard_hale",
    "blacksmith_torren",
    "mage_elowen",
  ].includes(npcId);
}

export function getQuestIdsForNpc(npcId: string): QuestId[] {
  return Object.values(QUEST_DEFINITIONS)
    .filter((quest) => quest.npcId === npcId)
    .map((quest) => quest.id);
}

export function buildNpcPanel(
  self: ConnectedPlayer,
  inventory: Record<string, number>,
  npcId: string,
): NpcPanelView | null {
  if (npcId === "merchant_mira") {
    const gold = inventory[GOLD_ITEM_ID] ?? 0;
    return {
      npcId,
      npcName: "Merchant Mira",
      title: "Mercadora da vila",
      description: `Saldo atual: ${gold} moeda(s) de ouro.`,
      hint: "Monstros derrotados e quests rendem moedas para gastar aqui.",
      actions: MERCHANT_OFFERS.map((offer) => ({
        actionId: `buy:${offer.id}`,
        label: `${offer.label} (${offer.price} ouro)`,
        description: offer.description,
        disabled: gold < offer.price,
        emphasis: gold < offer.price ? "muted" : "primary",
      })),
    };
  }

  if (npcId === "healer_lyra") {
    const gold = inventory[GOLD_ITEM_ID] ?? 0;
    const missingHealth = Math.max(0, self.stats.maxHealth - self.health);
    const questPanel = questPanelForNpc(self, inventory, npcId);
    if (!questPanel) {
      return {
        npcId,
        npcName: "Healer Lyra",
        title: "Santuario de cura",
        description:
          missingHealth <= 0
            ? "Voce ja esta em plena forma."
            : `Faltam ${missingHealth} ponto(s) de vida. Uma cura completa custa ${HEALER_FULL_HEAL_COST} moedas.`,
        hint: "Pocoes restauram parte da vida. Lyra restaura tudo de uma vez.",
        actions: [
          {
            actionId: "heal:full",
            label: `Cura completa (${HEALER_FULL_HEAL_COST} ouro)`,
            description: "Recupera toda a sua vida imediatamente.",
            disabled: missingHealth <= 0 || gold < HEALER_FULL_HEAL_COST,
            emphasis: missingHealth <= 0 || gold < HEALER_FULL_HEAL_COST ? "muted" : "primary",
          },
        ],
      };
    }

    return {
      ...questPanel,
      title: "Santuario e tarefas",
      description:
        missingHealth <= 0
          ? questPanel.description
          : `${questPanel.description} | Cura completa: ${HEALER_FULL_HEAL_COST} ouro.`,
      actions: [
        {
          actionId: "heal:full",
          label: `Cura completa (${HEALER_FULL_HEAL_COST} ouro)`,
          description: "Recupera toda a sua vida imediatamente.",
          disabled: missingHealth <= 0 || gold < HEALER_FULL_HEAL_COST,
          emphasis: missingHealth <= 0 || gold < HEALER_FULL_HEAL_COST ? "muted" : "primary",
        },
        ...questPanel.actions,
      ],
    };
  }

  return questPanelForNpc(self, inventory, npcId);
}

export function useHealthPotion(
  self: ConnectedPlayer,
  inventory: Record<string, number>,
): { ok: true; message: string } | { ok: false; code: string; message: string } {
  if ((inventory[HEALTH_POTION_ITEM_ID] ?? 0) <= 0) {
    return { ok: false, code: "ITEM", message: "Voce nao possui pocao de vida." };
  }
  if (self.health >= self.stats.maxHealth) {
    return { ok: false, code: "ITEM", message: "Sua vida ja esta cheia." };
  }

  inventory[HEALTH_POTION_ITEM_ID] -= 1;
  if (inventory[HEALTH_POTION_ITEM_ID] <= 0) {
    delete inventory[HEALTH_POTION_ITEM_ID];
  }
  self.health = Math.min(self.stats.maxHealth, self.health + HEALTH_POTION_HEAL);
  return { ok: true, message: `Pocao usada. Vida restaurada em ${HEALTH_POTION_HEAL}.` };
}

export function syncInventoryQuestProgress(
  self: ConnectedPlayer,
  inventory: Record<string, number>,
): QuestId[] {
  const changed: QuestId[] = [];
  for (const quest of Object.values(QUEST_DEFINITIONS)) {
    if (quest.objectiveType !== "collect") {
      continue;
    }
    const entry = getQuestStateEntry(self.questState, quest.id);
    const previousStatus = entry.status;
    const previousProgress = entry.progress;
    syncCollectQuestProgress(self, inventory, quest);
    if (entry.status !== previousStatus || entry.progress !== previousProgress) {
      changed.push(quest.id);
    }
  }
  return changed;
}

export function recordMobKill(self: ConnectedPlayer, mobType: MobType): QuestId[] {
  const changed: QuestId[] = [];
  for (const quest of Object.values(QUEST_DEFINITIONS)) {
    if (quest.objectiveType !== "kill" || quest.targetMobType !== mobType) {
      continue;
    }
    const entry = getQuestStateEntry(self.questState, quest.id);
    if (entry.status !== "active") {
      continue;
    }
    entry.progress = Math.min(entry.progress + 1, quest.requiredAmount);
    if (entry.progress >= quest.requiredAmount) {
      entry.status = "ready";
    }
    changed.push(quest.id);
  }
  return changed;
}

export function applyNpcAction(
  self: ConnectedPlayer,
  inventory: Record<string, number>,
  npcId: string,
  actionId: string,
): { ok: true; message: string; panel: NpcPanelView } | { ok: false; code: string; message: string } {
  if (npcId === "merchant_mira" && actionId.startsWith("buy:")) {
    const offerId = actionId.slice("buy:".length);
    const offer = MERCHANT_OFFERS.find((entry) => entry.id === offerId);
    if (!offer) {
      return { ok: false, code: "SHOP", message: "Oferta desconhecida." };
    }
    if ((inventory[GOLD_ITEM_ID] ?? 0) < offer.price) {
      return { ok: false, code: "SHOP", message: "Moedas insuficientes." };
    }
    inventory[GOLD_ITEM_ID] -= offer.price;
    if (inventory[GOLD_ITEM_ID] <= 0) {
      delete inventory[GOLD_ITEM_ID];
    }
    inventory[offer.itemId] = (inventory[offer.itemId] ?? 0) + offer.quantity;
    return {
      ok: true,
      message: `${offer.label} concluida.`,
      panel: buildNpcPanel(self, inventory, npcId)!,
    };
  }

  if (npcId === "healer_lyra" && actionId === "heal:full") {
    if (self.health >= self.stats.maxHealth) {
      return { ok: false, code: "HEAL", message: "Sua vida ja esta cheia." };
    }
    if ((inventory[GOLD_ITEM_ID] ?? 0) < HEALER_FULL_HEAL_COST) {
      return { ok: false, code: "HEAL", message: "Moedas insuficientes para a cura." };
    }
    inventory[GOLD_ITEM_ID] -= HEALER_FULL_HEAL_COST;
    if (inventory[GOLD_ITEM_ID] <= 0) {
      delete inventory[GOLD_ITEM_ID];
    }
    self.health = self.stats.maxHealth;
    return {
      ok: true,
      message: "Lyra restaurou toda a sua vida.",
      panel: buildNpcPanel(self, inventory, npcId)!,
    };
  }

  if (actionId.startsWith("quest:accept:")) {
    const questId = actionId.slice("quest:accept:".length) as QuestId;
    const definition = QUEST_DEFINITIONS[questId];
    if (!definition || definition.npcId !== npcId) {
      return { ok: false, code: "QUEST", message: "Quest invalida." };
    }
    const entry = getQuestStateEntry(self.questState, questId);
    if (entry.status !== "available") {
      return { ok: false, code: "QUEST", message: "Essa quest ja foi iniciada." };
    }
    entry.status = "active";
    entry.progress = 0;
    syncCollectQuestProgress(self, inventory, definition);
    return {
      ok: true,
      message: `${definition.title} aceita.`,
      panel: buildNpcPanel(self, inventory, npcId)!,
    };
  }

  if (actionId.startsWith("quest:claim:")) {
    const questId = actionId.slice("quest:claim:".length) as QuestId;
    const definition = QUEST_DEFINITIONS[questId];
    if (!definition || definition.npcId !== npcId) {
      return { ok: false, code: "QUEST", message: "Quest invalida." };
    }
    const entry = getQuestStateEntry(self.questState, questId);
    syncCollectQuestProgress(self, inventory, definition);
    if (entry.status !== "ready") {
      return { ok: false, code: "QUEST", message: "A recompensa ainda nao esta disponivel." };
    }

    if (definition.objectiveType === "collect" && definition.targetItemId) {
      if ((inventory[definition.targetItemId] ?? 0) < definition.requiredAmount) {
        return { ok: false, code: "QUEST", message: "Itens insuficientes para entregar." };
      }
      inventory[definition.targetItemId] -= definition.requiredAmount;
      if (inventory[definition.targetItemId] <= 0) {
        delete inventory[definition.targetItemId];
      }
    }

    for (const reward of definition.rewards) {
      inventory[reward.itemId] = (inventory[reward.itemId] ?? 0) + reward.quantity;
    }
    entry.status = "completed";
    entry.progress = definition.requiredAmount;

    return {
      ok: true,
      message: `Recompensa recebida: ${definition.title}.`,
      panel: buildNpcPanel(self, inventory, npcId)!,
    };
  }

  return { ok: false, code: "NPC", message: "Acao de NPC invalida." };
}
