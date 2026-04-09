import Phaser from "phaser";
import {
  authResponseSchema,
  type ProgressionSnapshot,
  type RuneId,
} from "@myth-of-rune/shared";
import { GATEWAY_HTTP_URL, GATEWAY_WS_URL } from "./config";
import { sessionFromAuthResponse } from "./session";
import type {
  ActionProgressView,
  CraftingPanelView,
  InventorySlotView,
} from "./ui/hudModels";
import { WorldScene } from "./worldScene";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required DOM element: #${id}`);
  }
  return element as T;
}

function maybeElement<T extends HTMLElement>(id: string): T | null {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  return element as T;
}

type HudPanelId = "map" | "stats" | "bag";

interface HudState {
  panel: HudPanelId;
  hudScale: number;
  hudOpacity: number;
  showChat: boolean;
  showRight: boolean;
  showHotbar: boolean;
}

const HUD_STORAGE_KEY = "mythrune.web.hud.v2";
const DEFAULT_HUD_STATE: HudState = {
  panel: "map",
  hudScale: 0.78,
  hudOpacity: 0.94,
  showChat: true,
  showRight: true,
  showHotbar: true,
};

const AUTH_MODES = ["login", "register"] as const;
type AuthMode = (typeof AUTH_MODES)[number];
type CharacterClassValue = "warrior" | "mage" | "rogue" | "archer";
const VALID_CLASSES = new Set<CharacterClassValue>([
  "warrior",
  "mage",
  "rogue",
  "archer",
]);

const appRoot = requireElement<HTMLDivElement>("app");
const loginForm = requireElement<HTMLFormElement>("login-form");
const loginEmailInput = requireElement<HTMLInputElement>("login-email");
const loginPasswordInput = requireElement<HTMLInputElement>("login-password");
const loginButton = requireElement<HTMLButtonElement>("login-btn");
const loginStatus = requireElement<HTMLDivElement>("login-status");
const loginQuitButton = maybeElement<HTMLButtonElement>("login-quit-btn");
const toRegisterLink = maybeElement<HTMLAnchorElement>("to-register-link");

const registerForm = requireElement<HTMLFormElement>("register-form");
const registerEmailInput = requireElement<HTMLInputElement>("register-email");
const registerPasswordInput = requireElement<HTMLInputElement>("register-password");
const registerConfirmPasswordInput = requireElement<HTMLInputElement>(
  "register-confirm-password",
);
const registerCharacterNameInput = requireElement<HTMLInputElement>(
  "register-character-name",
);
const registerCharacterClassInput = requireElement<HTMLSelectElement>(
  "register-character-class",
);
const registerButton = requireElement<HTMLButtonElement>("register-btn");
const registerStatus = requireElement<HTMLDivElement>("register-status");
const registerQuitButton = maybeElement<HTMLButtonElement>("register-quit-btn");
const toLoginLink = maybeElement<HTMLAnchorElement>("to-login-link");
const forgotPasswordLink = maybeElement<HTMLAnchorElement>("forgot-password-link");
const authTabLogin = maybeElement<HTMLButtonElement>("auth-tab-login");
const authTabRegister = maybeElement<HTMLButtonElement>("auth-tab-register");

const gameShell = requireElement<HTMLDivElement>("game-shell");
const gameRoot = requireElement<HTMLDivElement>("game-root");

const hudRoot = requireElement<HTMLDivElement>("hud-root");
const hudRight = requireElement<HTMLElement>("hud-right");
const hudChat = requireElement<HTMLElement>("hud-chat");
const hudHotbar = requireElement<HTMLElement>("hud-hotbar");
const interactionPrompt = maybeElement<HTMLDivElement>("interaction-prompt");
const interactionPromptText = maybeElement<HTMLSpanElement>("interaction-prompt-text");
const dialogueBox = maybeElement<HTMLDivElement>("dialogue-box");
const dialogueSpeaker = maybeElement<HTMLDivElement>("dialogue-speaker");
const dialogueStep = maybeElement<HTMLDivElement>("dialogue-step");
const dialogueText = maybeElement<HTMLDivElement>("dialogue-text");
const dialogueAdvanceButton = maybeElement<HTMLButtonElement>("dialogue-advance");
const dialogueCloseButton = maybeElement<HTMLButtonElement>("dialogue-close");
const deathModal = maybeElement<HTMLDivElement>("death-modal");
const deathModalText = maybeElement<HTMLDivElement>("death-modal-text");
const deathRespawnButton = maybeElement<HTMLButtonElement>("death-respawn");
const actionProgress = maybeElement<HTMLDivElement>("action-progress");
const actionProgressBadge = maybeElement<HTMLDivElement>("action-progress-badge");
const actionProgressLabel = maybeElement<HTMLDivElement>("action-progress-label");
const actionProgressDetail = maybeElement<HTMLDivElement>("action-progress-detail");
const actionProgressFill = maybeElement<HTMLDivElement>("action-progress-fill");
const actionProgressPercent = maybeElement<HTMLDivElement>("action-progress-percent");
const actionProgressHint = maybeElement<HTMLDivElement>("action-progress-hint");

const hudCharacter = requireElement<HTMLSpanElement>("hud-char");
const hudClass = requireElement<HTMLSpanElement>("hud-class");
const hudHp = requireElement<HTMLSpanElement>("hud-hp");
const hudExp = requireElement<HTMLSpanElement>("hud-exp");
const hudStatus = requireElement<HTMLSpanElement>("hud-status");
const hudHpFill = maybeElement<HTMLDivElement>("hud-hp-fill");
const hudMpFill = maybeElement<HTMLDivElement>("hud-mp-fill");
const hudExpFill = maybeElement<HTMLDivElement>("hud-exp-fill");
const hudLevel = maybeElement<HTMLSpanElement>("hud-level");
const hudAvatarInitial = maybeElement<HTMLSpanElement>("hud-avatar-initial");

const chatLog = maybeElement<HTMLDivElement>("chat-log");
const minimapMarker = maybeElement<HTMLDivElement>("minimap-marker");
const minimapPos = maybeElement<HTMLDivElement>("minimap-pos");
const inventoryGrid = maybeElement<HTMLDivElement>("inventory-grid");
const inventorySummary = maybeElement<HTMLDivElement>("inventory-summary");
const itemTooltip = maybeElement<HTMLDivElement>("item-tooltip");
const itemTooltipTitle = maybeElement<HTMLDivElement>("item-tooltip-title");
const itemTooltipMeta = maybeElement<HTMLDivElement>("item-tooltip-meta");
const itemTooltipDescription = maybeElement<HTMLDivElement>("item-tooltip-description");
const craftingOpenButton = maybeElement<HTMLButtonElement>("crafting-open");
const craftingMenuButton = maybeElement<HTMLButtonElement>("crafting-menu-btn");
const craftingPanel = maybeElement<HTMLDivElement>("crafting-panel");
const craftingCloseButton = maybeElement<HTMLButtonElement>("crafting-close");
const craftingStatus = maybeElement<HTMLDivElement>("crafting-status");
const craftingRecipeList = maybeElement<HTMLDivElement>("crafting-recipe-list");
const craftingRecipeName = maybeElement<HTMLDivElement>("crafting-recipe-name");
const craftingRecipeMeta = maybeElement<HTMLDivElement>("crafting-recipe-meta");
const craftingOutput = maybeElement<HTMLDivElement>("crafting-output");
const craftingMaterials = maybeElement<HTMLDivElement>("crafting-materials");
const craftingSubmitButton = maybeElement<HTMLButtonElement>("crafting-submit");
const statsLevel = maybeElement<HTMLDivElement>("stats-level");
const statsExpLabel = maybeElement<HTMLDivElement>("stats-exp-label");
const statsExpFill = maybeElement<HTMLDivElement>("stats-exp-fill");
const statsTotalXp = maybeElement<HTMLSpanElement>("stats-total-xp");
const statsMaxHealth = maybeElement<HTMLSpanElement>("stats-max-health");
const statsAttack = maybeElement<HTMLSpanElement>("stats-attack");
const statsDefense = maybeElement<HTMLSpanElement>("stats-defense");
const statsSpeed = maybeElement<HTMLSpanElement>("stats-speed");
const runeSlots = maybeElement<HTMLDivElement>("rune-slots");
const runeList = maybeElement<HTMLDivElement>("rune-list");
const runeStatus = maybeElement<HTMLDivElement>("rune-status");
const runeClearButton = maybeElement<HTMLButtonElement>("rune-clear");

const panelButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-panel-btn]"),
);
const panelViews = {
  map: requireElement<HTMLElement>("panel-map"),
  stats: requireElement<HTMLElement>("panel-stats"),
  bag: requireElement<HTMLElement>("panel-bag"),
} as const;

const settingsOpen = maybeElement<HTMLButtonElement>("settings-open");
const settingsClose = maybeElement<HTMLButtonElement>("settings-close");
const settingsModal = maybeElement<HTMLDivElement>("settings-modal");

const cfgHudScale = maybeElement<HTMLInputElement>("cfg-hud-scale");
const cfgHudOpacity = maybeElement<HTMLInputElement>("cfg-hud-opacity");
const cfgShowChat = maybeElement<HTMLInputElement>("cfg-show-chat");
const cfgShowRight = maybeElement<HTMLInputElement>("cfg-show-right");
const cfgShowHotbar = maybeElement<HTMLInputElement>("cfg-show-hotbar");

let game: Phaser.Game | null = null;
let activeWorldScene: WorldScene | null = null;
let hudBound = false;
let hudState = loadHudState();
let lastStatusLine = "";
let currentCraftingView: CraftingPanelView | null = null;
let currentProgression: ProgressionSnapshot | null = null;
let selectedRuneSlotIndex = 0;

function hideOverlay(node: HTMLElement | null): void {
  if (!node) {
    return;
  }
  node.hidden = true;
  node.setAttribute("aria-hidden", "true");
  node.style.display = "none";
}

function showOverlay(node: HTMLElement | null, display = ""): void {
  if (!node) {
    return;
  }
  node.hidden = false;
  node.setAttribute("aria-hidden", "false");
  node.style.display = display;
}

function getWorldScene(): WorldScene | null {
  if (!game) {
    return null;
  }
  const scene = game.scene.getScene(WorldScene.SCENE_KEY);
  if (scene instanceof WorldScene) {
    activeWorldScene = scene;
    return scene;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadHudState(): HudState {
  const raw = localStorage.getItem(HUD_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_HUD_STATE };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HudState>;
    return {
      panel:
        parsed.panel === "map" || parsed.panel === "stats" || parsed.panel === "bag"
          ? parsed.panel
          : DEFAULT_HUD_STATE.panel,
      hudScale: clamp(parsed.hudScale ?? DEFAULT_HUD_STATE.hudScale, 0.6, 1),
      hudOpacity: clamp(parsed.hudOpacity ?? DEFAULT_HUD_STATE.hudOpacity, 0.7, 1),
      showChat: Boolean(parsed.showChat ?? DEFAULT_HUD_STATE.showChat),
      showRight: Boolean(parsed.showRight ?? DEFAULT_HUD_STATE.showRight),
      showHotbar: Boolean(parsed.showHotbar ?? DEFAULT_HUD_STATE.showHotbar),
    };
  } catch {
    return { ...DEFAULT_HUD_STATE };
  }
}

function persistHudState(): void {
  localStorage.setItem(HUD_STORAGE_KEY, JSON.stringify(hudState));
}

function setLoginStatus(text: string, isError = false): void {
  loginStatus.textContent = text;
  loginStatus.className = isError ? "status error" : "status";
}

function setRegisterStatus(text: string, isError = false): void {
  registerStatus.textContent = text;
  registerStatus.className = isError ? "status error" : "status";
}

function setAuthMode(mode: AuthMode): void {
  appRoot.dataset.authMode = mode;
  authTabLogin?.classList.toggle("active", mode === "login");
  authTabRegister?.classList.toggle("active", mode === "register");
}

function setAuthBusy(busy: boolean): void {
  loginButton.disabled = busy;
  registerButton.disabled = busy;
}

function tryCloseWindow(): void {
  window.close();
  setLoginStatus("Feche esta aba para sair.");
  setRegisterStatus("Feche esta aba para sair.");
}

function bindAuthUi(): void {
  authTabLogin?.addEventListener("click", () => setAuthMode("login"));
  authTabRegister?.addEventListener("click", () => setAuthMode("register"));
  toRegisterLink?.addEventListener("click", (ev) => {
    ev.preventDefault();
    setAuthMode("register");
  });
  toLoginLink?.addEventListener("click", (ev) => {
    ev.preventDefault();
    setAuthMode("login");
  });
  forgotPasswordLink?.addEventListener("click", (ev) => {
    ev.preventDefault();
    setLoginStatus("Recuperacao de senha ainda nao implementada.", true);
  });
  loginQuitButton?.addEventListener("click", tryCloseWindow);
  registerQuitButton?.addEventListener("click", tryCloseWindow);
}

function setHudStatus(text: string): void {
  hudStatus.textContent = text;
  if (text !== lastStatusLine) {
    pushChatLine(`[System] ${text}`, "system");
    lastStatusLine = text;
  }
}

function pushChatLine(text: string, kind: "system" | "loot" | "player" = "system"): void {
  if (!chatLog) {
    return;
  }
  const line = document.createElement("div");
  line.className = `chat-line ${kind}`;
  line.textContent = text;
  chatLog.prepend(line);
  while (chatLog.children.length > 6) {
    chatLog.removeChild(chatLog.lastElementChild as Element);
  }
}

function setBarFill(fillNode: HTMLElement | null, ratio: number): void {
  if (!fillNode) {
    return;
  }
  const safeRatio = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  fillNode.style.width = `${Math.round(safeRatio * 100)}%`;
}

function setHudHp(current: number, max: number): void {
  hudHp.textContent = `${current} / ${max}`;
  const hpRatio = max > 0 ? current / max : 0;
  setBarFill(hudHpFill, hpRatio);
  setBarFill(hudMpFill, 1);
  hudHp.style.color = hpRatio <= 0.25 ? "#ff9f93" : "#ffe7bb";
}

function renderProgression(snapshot: ProgressionSnapshot | null): void {
  currentProgression = snapshot;
  if (snapshot) {
    selectedRuneSlotIndex = clamp(
      selectedRuneSlotIndex,
      0,
      Math.max(0, snapshot.equippedRunes.length - 1),
    );
  } else {
    selectedRuneSlotIndex = 0;
  }

  if (hudLevel) {
    hudLevel.textContent = `Lv ${snapshot?.level ?? 1}`;
  }
  hudExp.textContent = snapshot
    ? `${snapshot.experienceIntoLevel}/${snapshot.experienceForNextLevel || 0} XP`
    : "0/0 XP";
  setBarFill(hudExpFill, snapshot?.levelProgress ?? 0);

  if (statsLevel) {
    statsLevel.textContent = snapshot ? `Nivel ${snapshot.level}` : "Nivel 1";
  }
  if (statsExpLabel) {
    statsExpLabel.textContent = snapshot
      ? `${snapshot.experienceIntoLevel}/${snapshot.experienceForNextLevel || 0} XP no nivel`
      : "0/0 XP no nivel";
  }
  setBarFill(statsExpFill, snapshot?.levelProgress ?? 0);
  if (statsTotalXp) {
    statsTotalXp.textContent = snapshot ? String(snapshot.experience) : "0";
  }
  if (statsMaxHealth) {
    statsMaxHealth.textContent = snapshot ? String(snapshot.stats.maxHealth) : "--";
  }
  if (statsAttack) {
    statsAttack.textContent = snapshot ? String(snapshot.stats.attack) : "--";
  }
  if (statsDefense) {
    statsDefense.textContent = snapshot ? String(snapshot.stats.defense) : "--";
  }
  if (statsSpeed) {
    statsSpeed.textContent = snapshot ? snapshot.stats.moveSpeed.toFixed(2) : "--";
  }

  if (runeStatus) {
    const selectedRuneId = snapshot?.equippedRunes[selectedRuneSlotIndex] ?? null;
    const selectedRune = snapshot?.availableRunes.find((entry) => entry.id === selectedRuneId);
    runeStatus.textContent = selectedRune
      ? `${selectedRune.name} equipada no slot ${selectedRuneSlotIndex + 1}.`
      : `Escolha uma runa para o slot ${selectedRuneSlotIndex + 1}.`;
  }

  if (runeClearButton) {
    runeClearButton.disabled = !snapshot?.equippedRunes[selectedRuneSlotIndex];
  }

  if (runeSlots) {
    runeSlots.replaceChildren();
    const slots = snapshot?.equippedRunes ?? [null, null, null];
    slots.forEach((runeId, slotIndex) => {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = `rune-slot${slotIndex === selectedRuneSlotIndex ? " is-selected" : ""}${runeId ? " is-filled" : ""}`;
      slot.dataset.slotIndex = String(slotIndex);
      const rune = snapshot?.availableRunes.find((entry) => entry.id === runeId) ?? null;
      slot.textContent = rune ? rune.name : `Slot ${slotIndex + 1}`;
      if (rune) {
        slot.style.setProperty("--rune-color", rune.color);
      }
      runeSlots.appendChild(slot);
    });
  }

  if (runeList) {
    runeList.replaceChildren();
    for (const rune of snapshot?.availableRunes ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `rune-card${rune.unlocked ? "" : " is-locked"}${rune.equippedSlotIndex !== null ? " is-equipped" : ""}`;
      button.dataset.runeId = rune.id;
      button.disabled = !rune.unlocked;
      button.style.setProperty("--rune-color", rune.color);

      const title = document.createElement("span");
      title.className = "rune-card-title";
      title.textContent = rune.name;
      button.appendChild(title);

      const meta = document.createElement("span");
      meta.className = "rune-card-meta";
      meta.textContent = rune.unlocked
        ? `Desbloqueada${rune.equippedSlotIndex !== null ? ` | Slot ${rune.equippedSlotIndex + 1}` : ""}`
        : `Desbloqueia no nivel ${rune.unlockLevel}`;
      button.appendChild(meta);

      const desc = document.createElement("span");
      desc.className = "rune-card-desc";
      desc.textContent = rune.description;
      button.appendChild(desc);

      const bonus = document.createElement("span");
      bonus.className = "rune-card-bonus";
      bonus.textContent = formatRuneBonuses(rune.bonuses);
      button.appendChild(bonus);

      runeList.appendChild(button);
    }
  }
}

function formatRuneBonuses(
  bonuses: ProgressionSnapshot["availableRunes"][number]["bonuses"],
): string {
  const parts: string[] = [];
  if (bonuses.maxHealth !== 0) {
    parts.push(`HP +${bonuses.maxHealth}`);
  }
  if (bonuses.attack !== 0) {
    parts.push(`ATK +${bonuses.attack}`);
  }
  if (bonuses.defense !== 0) {
    parts.push(`DEF +${bonuses.defense}`);
  }
  if (bonuses.moveSpeed !== 0) {
    parts.push(`VEL +${bonuses.moveSpeed.toFixed(2)}`);
  }
  return parts.join(" | ");
}

function setHudPosition(x: number, y: number, mapWidth: number, mapHeight: number): void {
  const px = clamp(x / Math.max(1, mapWidth), 0, 1);
  const py = clamp(y / Math.max(1, mapHeight), 0, 1);
  if (minimapMarker) {
    minimapMarker.style.left = `${Math.round(px * 100)}%`;
    minimapMarker.style.top = `${Math.round(py * 100)}%`;
  }
  if (minimapPos) {
    minimapPos.textContent = `x: ${Math.round(x)} | y: ${Math.round(y)}`;
  }
}

function setInteractionPrompt(text: string | null): void {
  if (!interactionPrompt || !interactionPromptText) {
    return;
  }
  if (!text) {
    interactionPrompt.classList.remove("visible");
    interactionPromptText.textContent = "";
    return;
  }
  interactionPromptText.textContent = text;
  interactionPrompt.classList.add("visible");
}

function hideItemTooltip(): void {
  if (!itemTooltip) {
    return;
  }
  itemTooltip.hidden = true;
}

function positionItemTooltip(clientX: number, clientY: number): void {
  if (!itemTooltip || itemTooltip.hidden) {
    return;
  }
  const offset = 18;
  const margin = 12;
  const rect = itemTooltip.getBoundingClientRect();
  let left = clientX + offset;
  let top = clientY + offset;

  if (left + rect.width + margin > window.innerWidth) {
    left = clientX - rect.width - offset;
  }
  if (top + rect.height + margin > window.innerHeight) {
    top = clientY - rect.height - offset;
  }

  const boundedLeft = clamp(
    left,
    margin,
    Math.max(margin, window.innerWidth - rect.width - margin),
  );
  const boundedTop = clamp(
    top,
    margin,
    Math.max(margin, window.innerHeight - rect.height - margin),
  );

  itemTooltip.style.left = `${Math.round(boundedLeft)}px`;
  itemTooltip.style.top = `${Math.round(boundedTop)}px`;
}

function showItemTooltip(slot: InventorySlotView, clientX: number, clientY: number): void {
  if (
    !itemTooltip ||
    !itemTooltipTitle ||
    !itemTooltipMeta ||
    !itemTooltipDescription ||
    !slot.tooltip
  ) {
    hideItemTooltip();
    return;
  }

  itemTooltipTitle.textContent = slot.tooltip.title;
  itemTooltipMeta.textContent = `${slot.tooltip.category} | ${slot.count} unidade(s)`;
  itemTooltipDescription.textContent = slot.tooltip.description;
  itemTooltip.hidden = false;
  positionItemTooltip(clientX, clientY);
}

function setInventory(slots: InventorySlotView[], summary: string): void {
  if (inventorySummary) {
    inventorySummary.textContent = summary;
  }
  if (!inventoryGrid) {
    return;
  }
  hideItemTooltip();
  inventoryGrid.replaceChildren();
  for (const slot of slots) {
    const node = document.createElement("div");
    node.className = `slot inventory-slot${slot.empty ? " empty" : ""}`;
    node.style.setProperty("--slot-accent", slot.accent);
    node.tabIndex = slot.empty ? -1 : 0;
    if (slot.tooltip) {
      node.setAttribute(
        "aria-label",
        `${slot.tooltip.title}. ${slot.tooltip.category}. ${slot.tooltip.description}`,
      );
    }

    if (slot.icon) {
      const { src, col, row, size } = slot.icon;
      const img = document.createElement("img");
      img.className = "inventory-icon";
      img.src = `/sprites/icons/${src}`;
      img.alt = slot.tooltip?.title ?? slot.label;
      img.style.objectPosition = `-${col * size}px -${row * size}px`;
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      node.appendChild(img);
    } else {
      const label = document.createElement("span");
      label.className = "inventory-label";
      label.textContent = slot.label;
      node.appendChild(label);
    }

    const count = document.createElement("span");
    count.className = "inventory-count";
    count.textContent = slot.empty ? "" : `x${slot.count}`;
    node.appendChild(count);

    if (slot.tooltip) {
      node.addEventListener("pointerenter", (event) => {
        showItemTooltip(slot, event.clientX, event.clientY);
      });
      node.addEventListener("pointermove", (event) => {
        positionItemTooltip(event.clientX, event.clientY);
      });
      node.addEventListener("pointerleave", hideItemTooltip);
      node.addEventListener("focus", () => {
        const rect = node.getBoundingClientRect();
        showItemTooltip(slot, rect.right, rect.top + rect.height / 2);
      });
      node.addEventListener("blur", hideItemTooltip);
    }

    inventoryGrid.appendChild(node);
  }
}

function setActionProgress(view: ActionProgressView | null): void {
  if (!actionProgress || !actionProgressLabel || !actionProgressDetail || !actionProgressFill) {
    return;
  }
  if (!view) {
    actionProgress.hidden = true;
    actionProgress.dataset.tone = "generic";
    actionProgressLabel.textContent = "";
    actionProgressDetail.textContent = "";
    actionProgressFill.style.width = "0%";
    if (actionProgressBadge) {
      actionProgressBadge.textContent = "ACO";
    }
    if (actionProgressPercent) {
      actionProgressPercent.textContent = "";
    }
    if (actionProgressHint) {
      actionProgressHint.textContent = "";
    }
    return;
  }
  const safeProgress = clamp(view.progress, 0, 1);
  actionProgress.hidden = false;
  actionProgress.dataset.tone = view.tone ?? "generic";
  if (actionProgressBadge) {
    actionProgressBadge.textContent = view.badge ?? progressBadgeForTone(view.tone);
  }
  actionProgressLabel.textContent = view.label;
  actionProgressDetail.textContent = view.detail;
  actionProgressFill.style.width = `${Math.round(safeProgress * 100)}%`;
  if (actionProgressPercent) {
    actionProgressPercent.textContent = `${Math.round(safeProgress * 100)}%`;
  }
  if (actionProgressHint) {
    actionProgressHint.textContent = view.hint ?? "ESC cancela";
  }
}

function progressBadgeForTone(tone: ActionProgressView["tone"]): string {
  switch (tone) {
    case "woodcutting":
      return "MAD";
    case "mining":
      return "MIN";
    case "crafting":
      return "CRF";
    default:
      return "ACO";
  }
}

function renderCraftingPanel(view: CraftingPanelView): void {
  currentCraftingView = view;
  craftingMenuButton?.classList.toggle("is-active", view.open);
  craftingOpenButton?.classList.toggle("is-active", view.open);
  if (!craftingPanel) {
    return;
  }

  if (!view.open) {
    hideOverlay(craftingPanel);
  } else {
    showOverlay(craftingPanel);
  }
  if (!view.open) {
    return;
  }

  if (craftingStatus) {
    craftingStatus.textContent = view.statusText;
  }
  if (craftingRecipeName) {
    craftingRecipeName.textContent = view.selectedName ?? "Nenhuma receita";
  }
  if (craftingRecipeMeta) {
    const parts = [view.selectedCategory, view.selectedCraftTimeLabel].filter(Boolean);
    craftingRecipeMeta.textContent = parts.join(" | ");
  }
  if (craftingOutput) {
    craftingOutput.textContent = view.selectedOutputLabel
      ? `Resultado: ${view.selectedOutputLabel}`
      : "Selecione uma receita para ver os detalhes.";
  }
  if (craftingSubmitButton) {
    craftingSubmitButton.disabled = !view.canCraftSelected;
    craftingSubmitButton.textContent = view.busy ? "Craftando..." : "Craftar";
  }

  if (craftingRecipeList) {
    craftingRecipeList.replaceChildren();
    for (const recipe of view.recipes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `crafting-recipe${recipe.selected ? " is-active" : ""}`;
      button.dataset.recipeId = recipe.id;
      button.disabled = view.busy;

      const name = document.createElement("span");
      name.className = "crafting-recipe-name";
      name.textContent = recipe.name;
      button.appendChild(name);

      const meta = document.createElement("span");
      meta.className = "crafting-recipe-meta";
      meta.textContent = `${recipe.category} | ${recipe.craftTimeLabel}`;
      button.appendChild(meta);

      const output = document.createElement("span");
      output.className = `crafting-recipe-output${recipe.craftable ? "" : " is-muted"}`;
      output.textContent = recipe.outputLabel;
      button.appendChild(output);

      craftingRecipeList.appendChild(button);
    }
  }

  if (craftingMaterials) {
    craftingMaterials.replaceChildren();
    for (const material of view.selectedMaterials) {
      const row = document.createElement("div");
      row.className = `crafting-material${material.satisfied ? "" : " missing"}`;
      row.textContent = `${material.name}: ${material.owned}/${material.required}`;
      craftingMaterials.appendChild(row);
    }
    if (view.selectedRequirement) {
      const requirement = document.createElement("div");
      requirement.className = "crafting-material requirement";
      requirement.textContent = `Requisito: ${view.selectedRequirement}`;
      craftingMaterials.appendChild(requirement);
    }
  }
}

function openDialogue(speaker: string, text: string, step: number, total: number): void {
  if (!dialogueBox || !dialogueSpeaker || !dialogueText || !dialogueStep) {
    return;
  }
  dialogueSpeaker.textContent = speaker;
  dialogueText.textContent = text;
  dialogueStep.textContent = `${step}/${total}`;
  if (dialogueAdvanceButton) {
    dialogueAdvanceButton.textContent = step >= total ? "Fechar" : "Continuar";
  }
  showOverlay(dialogueBox);
}

function closeDialogue(): void {
  if (!dialogueBox || !dialogueSpeaker || !dialogueText || !dialogueStep) {
    return;
  }
  hideOverlay(dialogueBox);
  dialogueSpeaker.textContent = "";
  dialogueText.textContent = "";
  dialogueStep.textContent = "";
  if (dialogueAdvanceButton) {
    dialogueAdvanceButton.textContent = "Continuar";
  }
}

function forceCloseCraftingPanel(): void {
  if (currentCraftingView) {
    renderCraftingPanel({
      ...currentCraftingView,
      open: false,
    });
  } else {
    hideOverlay(craftingPanel);
  }
  getWorldScene()?.closeCraftingFromHud();
}

function forceCloseDialoguePanel(): void {
  closeDialogue();
  getWorldScene()?.closeDialogueFromHud();
}

function openDeathModal(message: string): void {
  if (deathModalText) {
    deathModalText.textContent = message;
  }
  showOverlay(deathModal);
}

function closeDeathModal(): void {
  hideOverlay(deathModal);
}

function setActivePanel(panel: HudPanelId): void {
  hudState.panel = panel;
  panelButtons.forEach((btn) => {
    const isActive = btn.dataset.panelBtn === panel;
    btn.classList.toggle("is-active", isActive);
  });
  (Object.keys(panelViews) as HudPanelId[]).forEach((key) => {
    panelViews[key].classList.toggle("is-active", key === panel);
  });
  persistHudState();
}

function applyHudState(): void {
  hudRoot.style.setProperty("--hud-scale", hudState.hudScale.toFixed(2));
  hudRoot.style.setProperty("--hud-opacity", hudState.hudOpacity.toFixed(2));

  hudChat.classList.toggle("hidden", !hudState.showChat);
  hudRight.classList.toggle("hidden", !hudState.showRight);
  hudHotbar.classList.toggle("hidden", !hudState.showHotbar);

  if (cfgHudScale) {
    cfgHudScale.value = hudState.hudScale.toFixed(2);
  }
  if (cfgHudOpacity) {
    cfgHudOpacity.value = hudState.hudOpacity.toFixed(2);
  }
  if (cfgShowChat) {
    cfgShowChat.checked = hudState.showChat;
  }
  if (cfgShowRight) {
    cfgShowRight.checked = hudState.showRight;
  }
  if (cfgShowHotbar) {
    cfgShowHotbar.checked = hudState.showHotbar;
  }

  setActivePanel(hudState.panel);
}

function bindHudControlsOnce(): void {
  if (hudBound) {
    return;
  }
  hudBound = true;

  const bindImmediateButton = (
    button: HTMLButtonElement | null,
    handler: (event: Event) => void,
  ): void => {
    if (!button) {
      return;
    }
    button.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      handler(ev);
    });
    button.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      handler(ev);
    });
  };

  panelButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = btn.dataset.panelBtn;
      if (panel === "map" || panel === "stats" || panel === "bag") {
        setActivePanel(panel);
      }
    });
  });

  settingsOpen?.addEventListener("click", () => {
    if (!settingsModal) {
      return;
    }
    settingsModal.hidden = false;
  });

  settingsClose?.addEventListener("click", () => {
    if (!settingsModal) {
      return;
    }
    settingsModal.hidden = true;
  });

  bindImmediateButton(dialogueAdvanceButton, () => {
    getWorldScene()?.advanceDialogueFromHud();
  });

  bindImmediateButton(dialogueCloseButton, () => {
    forceCloseDialoguePanel();
  });

  bindImmediateButton(deathRespawnButton, () => {
    getWorldScene()?.requestRespawnFromHud();
  });

  bindImmediateButton(craftingMenuButton, () => {
    getWorldScene()?.toggleCraftingFromHud();
  });

  bindImmediateButton(craftingOpenButton, () => {
    getWorldScene()?.toggleCraftingFromHud();
  });

  bindImmediateButton(craftingCloseButton, () => {
    forceCloseCraftingPanel();
  });

  bindImmediateButton(craftingSubmitButton, () => {
    getWorldScene()?.craftSelectedRecipeFromHud();
  });

  craftingRecipeList?.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("[data-recipe-id]");
    const recipeId = button?.dataset.recipeId;
    if (!recipeId) {
      return;
    }
    getWorldScene()?.selectCraftingRecipeFromHud(recipeId);
  });

  runeSlots?.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("[data-slot-index]");
    const slotIndex = Number(button?.dataset.slotIndex);
    if (!Number.isInteger(slotIndex)) {
      return;
    }
    selectedRuneSlotIndex = slotIndex;
    renderProgression(currentProgression);
  });

  runeList?.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("[data-rune-id]");
    const runeId = button?.dataset.runeId;
    if (!runeId) {
      return;
    }
    getWorldScene()?.equipRuneFromHud(selectedRuneSlotIndex, runeId as RuneId);
  });

  bindImmediateButton(runeClearButton, () => {
    getWorldScene()?.equipRuneFromHud(selectedRuneSlotIndex, null);
  });

  cfgHudScale?.addEventListener("input", () => {
    hudState.hudScale = clamp(Number(cfgHudScale.value), 0.6, 1);
    applyHudState();
    persistHudState();
  });

  cfgHudOpacity?.addEventListener("input", () => {
    hudState.hudOpacity = clamp(Number(cfgHudOpacity.value), 0.7, 1);
    applyHudState();
    persistHudState();
  });

  cfgShowChat?.addEventListener("change", () => {
    hudState.showChat = cfgShowChat.checked;
    applyHudState();
    persistHudState();
  });

  cfgShowRight?.addEventListener("change", () => {
    hudState.showRight = cfgShowRight.checked;
    applyHudState();
    persistHudState();
  });

  cfgShowHotbar?.addEventListener("change", () => {
    hudState.showHotbar = cfgShowHotbar.checked;
    applyHudState();
    persistHudState();
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && settingsModal && !settingsModal.hidden) {
      settingsModal.hidden = true;
      return;
    }
    if (deathModal && !deathModal.hidden) {
      return;
    }
    if (ev.key === "Escape" && dialogueBox && !dialogueBox.hidden) {
      forceCloseDialoguePanel();
      return;
    }
    if ((ev.key === "c" || ev.key === "C") && craftingPanel && !craftingPanel.hidden) {
      forceCloseCraftingPanel();
    }
  });
}

function startGame(token: string, characterName: string, characterClass: string): void {
  appRoot.style.display = "none";
  gameShell.style.display = "block";
  bindHudControlsOnce();
  applyHudState();

  hudCharacter.textContent = characterName;
  hudClass.textContent = characterClass;
  if (hudAvatarInitial) {
    const initial = characterName.trim().slice(0, 1).toUpperCase();
    hudAvatarInitial.textContent = initial.length > 0 ? initial : "H";
  }

  hudHp.textContent = "-- / --";
  setBarFill(hudHpFill, 1);
  setBarFill(hudMpFill, 1);
  setInteractionPrompt(null);
  setInventory([], "Bolsa vazia");
  renderProgression(null);
  renderCraftingPanel({
    open: false,
    busy: false,
    selectedRecipeId: null,
    statusText: "Selecione uma receita para comecar.",
    recipes: [],
    selectedName: null,
    selectedCategory: null,
    selectedOutputLabel: null,
    selectedCraftTimeLabel: null,
    selectedRequirement: null,
    selectedMaterials: [],
    canCraftSelected: false,
  });
  setActionProgress(null);
  closeDialogue();
  closeDeathModal();
  setHudStatus("Inicializando...");

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameRoot,
    backgroundColor: "#0b1412",
    width: window.innerWidth,
    height: window.innerHeight,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [WorldScene],
  });

  game.scene.start(WorldScene.SCENE_KEY, {
    token,
    characterName,
    characterClass,
    gatewayWsUrl: GATEWAY_WS_URL,
    hud: {
      setStatus: setHudStatus,
      setHp: setHudHp,
      setPosition: setHudPosition,
      setInteractionPrompt,
      setInventory,
      setProgression: renderProgression,
      setCraftingPanel: renderCraftingPanel,
      setActionProgress,
      pushFeedMessage: pushChatLine,
      openDialogue,
      closeDialogue,
      openDeathModal,
      closeDeathModal,
    },
  });
  activeWorldScene = game.scene.getScene(WorldScene.SCENE_KEY) as unknown as WorldScene;
}

async function requestAuth(
  path: "/auth/login" | "/auth/register",
  payload: Record<string, unknown>,
): Promise<ReturnType<typeof sessionFromAuthResponse>> {
  const res = await fetch(`${GATEWAY_HTTP_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof (raw as { error?: { message?: unknown } })?.error?.message === "string"
        ? (raw as { error: { message: string } }).error.message
        : `Falha HTTP ${res.status}`;
    throw new Error(message);
  }
  const parsed = authResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Resposta de autenticacao invalida.");
  }
  return sessionFromAuthResponse(parsed.data);
}

async function tryLogin(email: string, password: string): Promise<void> {
  setAuthBusy(true);
  setLoginStatus("Autenticando...");
  setRegisterStatus("");
  try {
    const session = await requestAuth("/auth/login", { email, password });
    startGame(session.token, session.characterName, session.characterClass);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro de login";
    setLoginStatus(message, true);
  } finally {
    if (!game) {
      setAuthBusy(false);
    }
  }
}

async function tryRegister(
  email: string,
  password: string,
  confirmPassword: string,
  characterName: string,
  characterClassRaw: string,
): Promise<void> {
  if (password !== confirmPassword) {
    setRegisterStatus("As senhas nao conferem.", true);
    return;
  }
  const characterClass = characterClassRaw.toLowerCase() as CharacterClassValue;
  if (!VALID_CLASSES.has(characterClass)) {
    setRegisterStatus("Classe invalida.", true);
    return;
  }
  const cleanName = characterName.trim();
  if (cleanName.length < 2) {
    setRegisterStatus("Nome do personagem muito curto.", true);
    return;
  }

  setAuthBusy(true);
  setRegisterStatus("Criando conta...");
  setLoginStatus("");
  try {
    const session = await requestAuth("/auth/register", {
      email,
      password,
      characterName: cleanName,
      characterClass,
    });
    startGame(session.token, session.characterName, session.characterClass);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro de registro";
    setRegisterStatus(message, true);
  } finally {
    if (!game) {
      setAuthBusy(false);
    }
  }
}

loginForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (game) {
    return;
  }
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;
  void tryLogin(email, password);
});

registerForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (game) {
    return;
  }
  const email = registerEmailInput.value.trim();
  const password = registerPasswordInput.value;
  const confirmPassword = registerConfirmPasswordInput.value;
  const characterName = registerCharacterNameInput.value;
  const characterClass = registerCharacterClassInput.value;
  void tryRegister(email, password, confirmPassword, characterName, characterClass);
});

bindAuthUi();
setAuthMode("login");
setLoginStatus(`Gateway: ${GATEWAY_HTTP_URL}`);
setRegisterStatus("");
