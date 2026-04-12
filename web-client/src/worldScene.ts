import Phaser from "phaser";
import {
  MAP_DEFINITIONS,
  QUEST_DEFINITIONS,
  getPortalForPosition,
  playerAttackProfileForClass,
  type ProgressionSnapshot,
  type RuneId,
  type MapId,
  type SkillId,
  worldMoveSpeedForClass,
  type CharacterClassId,
  worldServerMessageSchema,
  type MobType,
  type WorldClientMessage,
  type WorldServerMessage,
} from "@myth-of-rune/shared";
import {
  STARTER_VILLAGE_NPCS,
  type StarterVillageNpcSpec,
} from "./starterVillageNpcs";
import type {
  ActionProgressView,
  CraftingPanelView,
  InventorySlotView,
  NpcPanelView as HudNpcPanelView,
} from "./ui/hudModels";
import { ITEM_DEFINITIONS, type ItemId } from "./data/items";
import { CraftingSystem } from "./systems/crafting/craftingSystem";
import type { ResourceNodeEntity } from "./entities/resourceNodes/resourceNode";
import { GatheringSystem } from "./systems/gathering/gatheringSystem";
import { InventoryStore } from "./systems/inventory/inventory";
import {
  MAP_RESOURCE_ATLAS_IMAGE_KEY,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  buildStarterTownWorld,
  ensureStarterTownPropFrames,
  ensureStarterTownResourceFrames,
  ensureStarterTownTileFrames,
  preloadStarterTownAssets,
  tileToWorldPosition as mapTileToWorldPosition,
  type StarterTownPropBlocker,
  type StarterTownWorld,
} from "./systems/map/starterTownMap";
import {
  VISUAL_SPECS,
  KNOWN_PLAYER_VISUALS,
  type Facing,
  type PlayerVisualKey,
  type VisualKey,
} from "./data/sprites";
import {
  EntityRenderer,
  type RenderedEntity,
} from "./systems/rendering/entityRenderer";
import { WeatherSystem, type WeatherType } from "./systems/weather/weatherSystem";
import { BiomeSystem, type BiomeType } from "./systems/biome/biomeSystem";
import { SkillSystem } from "./systems/skills/skillSystem";
import { FootstepSystem } from "./systems/footstep/footstepSystem";

type LootDropPayload = Extract<
  WorldServerMessage,
  { type: "welcome" | "state" }
>["payload"] extends infer P
  ? P extends { loot: infer L }
    ? L extends ReadonlyArray<infer Entry>
      ? Entry
      : never
    : never
  : never;

interface LootDropEntity {
  dropId: string;
  itemId: string;
  amount: number;
  x: number;
  y: number;
  marker: Phaser.GameObjects.Container;
  /** Ícone + anel: animação manual (evita shimmer com roundPixels/zoom). */
  floater: Phaser.GameObjects.Container;
  floatPhase: number;
  label: Phaser.GameObjects.Text;
}

interface HudBindings {
  setStatus: (text: string) => void;
  setHp: (current: number, max: number) => void;
  setPosition?: (x: number, y: number, mapWidth: number, mapHeight: number) => void;
  setInteractionPrompt: (text: string | null) => void;
  setInventory: (slots: InventorySlotView[], summary: string) => void;
  setProgression: (view: ProgressionSnapshot | null) => void;
  setCraftingPanel: (view: CraftingPanelView) => void;
  setActionProgress: (view: ActionProgressView | null) => void;
  pushFeedMessage: (text: string, tone?: "system" | "loot" | "player") => void;
  openDialogue: (speaker: string, text: string, step: number, total: number) => void;
  closeDialogue: () => void;
  setNpcPanel: (view: HudNpcPanelView) => void;
  closeNpcPanel: () => void;
  openDeathModal: (message: string) => void;
  closeDeathModal: () => void;
}

interface WorldSceneInitData {
  token: string;
  characterName: string;
  characterClass: string;
  gatewayWsUrl: string;
  hud: HudBindings;
}

interface StaticNpcEntity {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  nameTag: Phaser.GameObjects.Text;
  blockerRadiusX: number;
  blockerRadiusY: number;
  spec: StarterVillageNpcSpec;
}

interface DialogueState {
  npcId: string;
  lineIndex: number;
}

interface NpcPanelState {
  npcId: string;
}

type WelcomePayload = Extract<WorldServerMessage, { type: "welcome" }>["payload"];
type StatePayload = Extract<WorldServerMessage, { type: "state" }>["payload"];
type CombatEventPayload = Extract<
  WorldServerMessage,
  { type: "combat_event" }
>["payload"];

const MOVE_SEND_INTERVAL_MS = 60;
const REMOTE_MOVE_THRESHOLD = 0.35;
const LOCAL_MOVE_THRESHOLD = 16;
const STATUS_RESET_MS = 900;
const LOCAL_HARD_RECONCILE_DISTANCE = 220;
const LOCAL_SOFT_RECONCILE_DISTANCE = 10;
const LOCAL_SOFT_RECONCILE_RATE = 12;
const FOOT_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 8],
  [-7, 8],
  [7, 8],
  [0, 12],
  [-10, 12],
  [10, 12],
  [0, 16],
  [-10, 16],
  [10, 16],
];

const COLOR_DAMAGE_ENEMY = "#ffdf5f";
const COLOR_DAMAGE_PLAYER = "#ff7b7b";
const COLOR_REJECT = "#ffad84";

const ICON_TEXTURE_PREFIX = "itemIcon:";
function iconTextureKey(src: string): string {
  return `${ICON_TEXTURE_PREFIX}${src}`;
}

function frameIndexForIcon(
  textureWidth: number,
  iconSize: number,
  col: number,
  row: number,
): number {
  const cols = Math.max(1, Math.floor(textureWidth / iconSize));
  return row * cols + col;
}

/** Evita micro-jitter do servidor e não briga com tweens no mesmo GameObject. */
const LOOT_POS_EPS = 0.4;

const LOOT_FLOAT_SPEED = 2.05;
const LOOT_FLOAT_AMP = 3;

export class WorldScene extends Phaser.Scene {
  public static readonly SCENE_KEY = "WorldScene";

  private initData!: WorldSceneInitData;
  private ws: WebSocket | null = null;
  private entityRenderer!: EntityRenderer;

  private localId = "";
  private currentMapId: MapId = "default";
  private staticNpcEntities = new Map<string, StaticNpcEntity>();

  private moveKeys!: {
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private attackKey!: Phaser.Input.Keyboard.Key;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private craftKey!: Phaser.Input.Keyboard.Key;
  private cancelKey!: Phaser.Input.Keyboard.Key;
  private lastMoveSentAt = 0;
  private statusResetTimer: Phaser.Time.TimerEvent | null = null;
  private localMoveSpeed = 240;
  private worldMinX = 0;
  private worldMinY = 0;
  private worldMaxX = WORLD_WIDTH;
  private worldMaxY = WORLD_HEIGHT;
  private worldWidth = WORLD_WIDTH;
  private worldHeight = WORLD_HEIGHT;
  private collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private propBlockers: readonly StarterTownPropBlocker[] = [];
  private mapWorld: StarterTownWorld | null = null;
  private localInputActive = false;
  private hasAuthoritativeLocalPosition = false;
  private authoritativeLocalX = 0;
  private authoritativeLocalY = 0;
  private focusedNpcId: string | null = null;
  private dialogueState: DialogueState | null = null;
  private npcPanelState: NpcPanelState | null = null;
  private readonly lootDrops = new Map<string, LootDropEntity>();
  private inventory!: InventoryStore;
  private craftingSystem!: CraftingSystem;
  private gatheringSystem: GatheringSystem | null = null;
  private weatherSystem: WeatherSystem | null = null;
  private biomeSystem: BiomeSystem | null = null;
  private skillSystem: SkillSystem | null = null;
  private footstepSystem: FootstepSystem | null = null;
  private skillKey!: Phaser.Input.Keyboard.Key;
  private inventoryUnsubscribe: (() => void) | null = null;
  private progressionSnapshot: ProgressionSnapshot | null = null;

  private maxHp = 100;
  private combatConfig = {
    playerAttackRange: 72,
    playerAttackCooldownMs: 550,
    mobAttackDamage: 14,
    mobDefense: 4,
    mobAttackRange: 56,
    mobAttackCooldownMs: 1400,
  };

  public constructor() {
    super(WorldScene.SCENE_KEY);
  }

  public init(data: WorldSceneInitData): void {
    this.initData = data;
  }

  public preload(): void {
    preloadStarterTownAssets(this);
    WeatherSystem.preload(this);
    for (const visual of Object.keys(VISUAL_SPECS) as VisualKey[]) {
      const spec = VISUAL_SPECS[visual];
      this.load.spritesheet(spec.textureKey, spec.path, {
        frameWidth: spec.frameWidth,
        frameHeight: spec.frameHeight,
      });
    }
    const iconSheets = new Map<string, number>();
    for (const def of Object.values(ITEM_DEFINITIONS)) {
      if (!def?.icon?.src) continue;
      if (!iconSheets.has(def.icon.src)) {
        iconSheets.set(def.icon.src, def.icon.size);
      }
    }
    for (const [src, size] of iconSheets.entries()) {
      this.load.spritesheet(iconTextureKey(src), `/sprites/icons/${src}`, {
        frameWidth: size,
        frameHeight: size,
      });
    }
    for (const npc of STARTER_VILLAGE_NPCS) {
      this.load.image(npc.textureKey, npc.path);
    }
  }

  public create(): void {
    this.inventoryUnsubscribe?.();
    this.inventory = new InventoryStore();
    this.craftingSystem = new CraftingSystem(this.inventory);
    this.inventoryUnsubscribe = this.inventory.subscribe(() => {
      this.syncInventoryHud();
      this.syncCraftingHud();
    });

    this.entityRenderer = new EntityRenderer(this, () => this.worldMinY);
    this.createTilemapWorld();
    ensureStarterTownTileFrames(this);
    ensureStarterTownPropFrames(this);
    ensureStarterTownResourceFrames(this);
    this.entityRenderer.ensureAnimationsRegistered();
    this.createGatheringSystem();
    this.createStaticNpcs();
    this.weatherSystem = new WeatherSystem(this);
    this.biomeSystem = new BiomeSystem(
      this,
      this.weatherSystem,
      this.worldMinX,
      this.worldMinY,
      (biome: BiomeType, label: string) => {
        if (label) {
          this.setTransientStatus(label);
          this.initData.hud.pushFeedMessage(`Entrando: ${label}`, "system");
        } else {
          this.setTransientStatus("Floresta");
        }
      },
    );
    this.syncMapPresentation();
    this.footstepSystem = new FootstepSystem(
      this,
      () => this.biomeSystem?.current ?? "forest",
    );
    this.skillSystem = new SkillSystem(
      this.resolveCharacterClass(this.initData.characterClass),
      this,
    );
    this.syncInventoryHud();
    this.syncCraftingHud();
    this.initData.hud.setActionProgress(null);

    this.input.mouse?.disableContextMenu();
    const kb = this.input.keyboard;
    if (!kb) {
      throw new Error("Keyboard input unavailable.");
    }
    this.moveKeys = kb.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as unknown as WorldScene["moveKeys"];
    this.attackKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.interactKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.craftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.cancelKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.skillKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.input.on("pointerdown", () => this.requestBasicAttack());

    this.cameras.main.setBounds(
      this.worldMinX,
      this.worldMinY,
      this.worldWidth,
      this.worldHeight,
    );
    this.cameras.main.setZoom(1.9);
    this.cameras.main.setRoundPixels(true);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearStatusTimer();
      this.ws?.close();
      this.ws = null;
      this.initData.hud.setInteractionPrompt(null);
      this.initData.hud.setActionProgress(null);
      this.initData.hud.setProgression(null);
      this.initData.hud.closeDialogue();
      this.initData.hud.closeNpcPanel();
      this.initData.hud.closeDeathModal();
      this.entityRenderer.clearGatherAnimation();
      this.craftingSystem.closePanel();
      this.syncCraftingHud();
      this.gatheringSystem?.destroy();
      this.gatheringSystem = null;
      this.weatherSystem?.destroy();
      this.weatherSystem = null;
      this.biomeSystem?.destroy();
      this.biomeSystem = null;
      this.skillSystem?.destroy();
      this.skillSystem = null;
      this.footstepSystem?.destroy();
      this.footstepSystem = null;
      this.propBlockers = [];
      this.mapWorld?.propSprites.forEach((sprite) => sprite.destroy());
      this.inventoryUnsubscribe?.();
      this.inventoryUnsubscribe = null;
      this.entityRenderer.destroyAll();
      for (const npc of this.staticNpcEntities.values()) {
        this.destroyStaticNpc(npc);
      }
      this.staticNpcEntities.clear();
    });

    this.connectWorldSocket();
  }

  public update(time: number, deltaMs: number): void {
    this.updateLootFloatAnimation(time);

    if (!this.entityRenderer.local) {
      return;
    }

    // Update biome zones based on player position
    this.biomeSystem?.update(
      this.entityRenderer.local.sprite.x,
      this.entityRenderer.local.sprite.y,
    );

    // Update skill system (cooldown + overlay refresh)
    if (this.skillSystem) {
      const level = this.progressionSnapshot?.level ?? 1;
      const justReady = this.skillSystem.update(level);
      if (justReady) {
        this.initData.hud.pushFeedMessage(
          `${this.skillSystem.definition?.name ?? "Habilidade"} pronta!`,
          "system",
        );
      }
    }

    const interactPressed = Phaser.Input.Keyboard.JustDown(this.interactKey);
    const attackPressed = Phaser.Input.Keyboard.JustDown(this.attackKey);
    const craftPressed = Phaser.Input.Keyboard.JustDown(this.craftKey);
    const cancelPressed = Phaser.Input.Keyboard.JustDown(this.cancelKey);
    const skillPressed = Phaser.Input.Keyboard.JustDown(this.skillKey);
    const movementIntent = this.hasMovementIntent();

    this.refreshInteractionUi();
    this.entityRenderer.refreshMobTargetUi(
      this.entityRenderer.local.sprite.x,
      this.entityRenderer.local.sprite.y,
      this.combatConfig.playerAttackRange,
    );

    if (this.entityRenderer.local.dead) {
      this.syncLocalFootsteps(0, 0);
      this.initData.hud.setInteractionPrompt(null);
      this.entityRenderer.applyMotionVisual(this.entityRenderer.local, 0, 0, LOCAL_MOVE_THRESHOLD);
      return;
    }

    if (this.dialogueState) {
      this.syncLocalFootsteps(0, 0);
      if (interactPressed) {
        this.advanceDialogue();
      } else if (cancelPressed) {
        this.closeDialogue();
      }
      this.entityRenderer.applyMotionVisual(this.entityRenderer.local, 0, 0, LOCAL_MOVE_THRESHOLD);
      return;
    }

    if (this.npcPanelState) {
      this.syncLocalFootsteps(0, 0);
      if (interactPressed || cancelPressed) {
        this.closeNpcPanel();
      }
      this.initData.hud.setInteractionPrompt(null);
      this.entityRenderer.applyMotionVisual(this.entityRenderer.local, 0, 0, LOCAL_MOVE_THRESHOLD);
      return;
    }

    if (this.gatheringSystem?.isBusy() && (movementIntent || attackPressed || cancelPressed)) {
      const canceled = this.gatheringSystem.cancelActiveGather(
        "Acao interrompida",
        this.time.now,
      );
      if (canceled) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const msg: WorldClientMessage = { type: "gather_cancel", payload: {} };
          this.ws.send(JSON.stringify(msg));
        }
        this.initData.hud.pushFeedMessage(canceled, "system");
        this.setTransientStatus("Coleta cancelada");
      }
    }

    if (this.craftingSystem.isBusy() && (movementIntent || attackPressed || cancelPressed)) {
      const canceledRecipe = this.craftingSystem.cancelActiveCraft();
      if (canceledRecipe) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const msg: WorldClientMessage = { type: "craft_cancel", payload: {} };
          this.ws.send(JSON.stringify(msg));
        }
        this.initData.hud.pushFeedMessage(
          `Craft de ${canceledRecipe} cancelado.`,
          "system",
        );
        this.setTransientStatus("Craft cancelado");
        this.syncCraftingHud();
      }
    }

    const actionBlocked = this.updateActionSystems(deltaMs);
    if (actionBlocked) {
      this.syncLocalFootsteps(0, 0);
      this.entityRenderer.applyMotionVisual(this.entityRenderer.local, 0, 0, LOCAL_MOVE_THRESHOLD);
      this.reconcileLocalPosition(deltaMs / 1000);
      return;
    }

    if (this.craftingSystem.isPanelOpen()) {
      this.syncLocalFootsteps(0, 0);
      if (cancelPressed || craftPressed) {
        this.craftingSystem.closePanel();
        this.syncCraftingHud();
      }
      this.initData.hud.setInteractionPrompt(null);
      this.entityRenderer.applyMotionVisual(this.entityRenderer.local, 0, 0, LOCAL_MOVE_THRESHOLD);
      return;
    }

    if (craftPressed) {
      this.syncLocalFootsteps(0, 0);
      this.toggleCraftingPanel();
      this.entityRenderer.applyMotionVisual(this.entityRenderer.local, 0, 0, LOCAL_MOVE_THRESHOLD);
      return;
    }

    if (interactPressed) {
      const target = this.getPrimaryInteractable();
      if (target?.kind === "resource") {
        const started = this.gatheringSystem?.tryStartFocusedGather(
          this.time.now,
          this.inventory,
        );
        if (started?.ok) {
          if (this.ws && this.ws.readyState === WebSocket.OPEN && started.nodeId && started.resourceType) {
            const msg: WorldClientMessage = {
              type: "gather_start",
              payload: {
                nodeId: started.nodeId,
                resourceType: started.resourceType,
              },
            };
            this.ws.send(JSON.stringify(msg));
          }
          this.setTransientStatus(target.node.definition.actionLabel);
        } else if (started) {
          this.initData.hud.pushFeedMessage(started.message, "system");
          this.setTransientStatus(started.message);
        }
        this.refreshInteractionUi();
        this.syncLocalFootsteps(0, 0);
        this.entityRenderer.applyMotionVisual(this.entityRenderer.local, 0, 0, LOCAL_MOVE_THRESHOLD);
        return;
      }
      if (target?.kind === "npc") {
        this.syncLocalFootsteps(0, 0);
        if (target.npc.spec.interactionMode === "panel") {
          this.openNpcPanel(target.npc);
        } else {
          this.openDialogue(target.npc);
        }
        return;
      }
      if (target?.kind === "loot") {
        this.syncLocalFootsteps(0, 0);
        this.tryPickupLoot(target.dropId);
        return;
      }
      if (target?.kind === "portal") {
        this.syncLocalFootsteps(0, 0);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const msg: WorldClientMessage = {
            type: "change_map",
            payload: { portalId: target.portalId },
          };
          this.ws.send(JSON.stringify(msg));
          this.setTransientStatus("Transitando...");
        }
        return;
      }
    }

    if (skillPressed) {
      this.requestSkillUse();
    }

    const velocity = this.handleLocalMovement(deltaMs / 1000);
    this.syncLocalFootsteps(velocity.vx, velocity.vy);
    this.entityRenderer.applyMotionVisual(
      this.entityRenderer.local,
      velocity.vx,
      velocity.vy,
      LOCAL_MOVE_THRESHOLD,
    );
    this.reconcileLocalPosition(deltaMs / 1000);

    if (attackPressed) {
      this.requestBasicAttack();
    }
    this.trySendMove(time);
  }

  public advanceDialogueFromHud(): void {
    if (!this.dialogueState) {
      return;
    }
    this.advanceDialogue();
  }

  public closeDialogueFromHud(): void {
    if (!this.dialogueState) {
      return;
    }
    this.closeDialogue();
  }

  public closeNpcPanelFromHud(): void {
    if (!this.npcPanelState) {
      return;
    }
    this.closeNpcPanel();
  }

  public performNpcActionFromHud(actionId: string): void {
    if (!this.npcPanelState || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const msg: WorldClientMessage = {
      type: "npc_action",
      payload: { npcId: this.npcPanelState.npcId, actionId },
    };
    this.ws.send(JSON.stringify(msg));
  }

  public useItemFromHud(itemId: ItemId): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const msg: WorldClientMessage = {
      type: "use_item",
      payload: { itemId },
    };
    this.ws.send(JSON.stringify(msg));
  }

  public toggleCraftingFromHud(): void {
    this.toggleCraftingPanel();
  }

  public closeCraftingFromHud(): void {
    this.craftingSystem.closePanel();
    this.syncCraftingHud();
  }

  public equipRuneFromHud(slotIndex: number, runeId: RuneId | null): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const msg: WorldClientMessage = {
      type: "equip_rune",
      payload: { slotIndex, runeId },
    };
    this.ws.send(JSON.stringify(msg));
  }

  public equipItemFromHud(slot: "weapon" | "armour", itemId: string | null): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const msg: WorldClientMessage = {
      type: "equip_item",
      payload: { slot, itemId },
    };
    this.ws.send(JSON.stringify(msg));
  }

  public requestRespawnFromHud(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.entityRenderer.local?.dead) {
      return;
    }
    const msg: WorldClientMessage = {
      type: "respawn",
      payload: {},
    };
    this.ws.send(JSON.stringify(msg));
  }

  public selectCraftingRecipeFromHud(recipeId: string): void {
    this.craftingSystem.selectRecipe(recipeId);
    this.syncCraftingHud();
  }

  public craftSelectedRecipeFromHud(): void {
    const result = this.craftingSystem.startSelectedCraft(this.time.now);
    if (!result.ok) {
      this.setTransientStatus(result.message);
      this.initData.hud.pushFeedMessage(result.message, "system");
    } else if (result.recipeId && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg: WorldClientMessage = {
        type: "craft_start",
        payload: { recipeId: result.recipeId },
      };
      this.ws.send(JSON.stringify(msg));
      this.initData.hud.pushFeedMessage(result.message, "system");
    }
    this.syncCraftingHud();
  }

  // ---------------------------------------------------------------------------
  // Private — map / systems setup
  // ---------------------------------------------------------------------------

  private createTilemapWorld(): void {
    this.mapWorld = buildStarterTownWorld(this);
    this.worldMinX = this.mapWorld.worldMinX;
    this.worldMinY = this.mapWorld.worldMinY;
    this.worldWidth = this.mapWorld.worldWidth;
    this.worldHeight = this.mapWorld.worldHeight;
    this.worldMaxX = this.mapWorld.worldMaxX;
    this.worldMaxY = this.mapWorld.worldMaxY;
    this.collisionLayer = this.mapWorld.collisionLayer;
    this.propBlockers = this.mapWorld.propBlockers;
  }

  private createGatheringSystem(): void {
    if (!this.mapWorld) {
      throw new Error("Mapa inicial nao disponivel para resource nodes.");
    }
    this.gatheringSystem = new GatheringSystem({
      scene: this,
      textureKey: MAP_RESOURCE_ATLAS_IMAGE_KEY,
      worldMinX: this.mapWorld.worldMinX,
      worldMinY: this.mapWorld.worldMinY,
      tileWidth: this.mapWorld.tileWidth,
      tileHeight: this.mapWorld.tileHeight,
      nodes: this.mapWorld.resourceNodes,
    });
  }

  private syncInventoryHud(): void {
    this.initData.hud.setInventory(
      this.inventory.buildSlotViews(),
      this.inventory.buildSummary(),
    );
  }

  private syncCraftingHud(): void {
    this.initData.hud.setCraftingPanel(this.craftingSystem.getPanelView());
  }

  // ---------------------------------------------------------------------------
  // Private — progression
  // ---------------------------------------------------------------------------

  private applyProgressionSnapshot(
    snapshot: ProgressionSnapshot,
    announce = true,
  ): void {
    const previous = this.progressionSnapshot;
    this.progressionSnapshot = snapshot;
    this.maxHp = snapshot.stats.maxHealth;
    this.localMoveSpeed = snapshot.stats.worldMoveSpeed;
    this.initData.hud.setProgression(snapshot);
    this.initData.hud.setHp(snapshot.currentHealth, snapshot.stats.maxHealth);
    if (snapshot.currentHealth > 0) {
      this.initData.hud.closeDeathModal();
      if (this.entityRenderer.local?.dead) {
        this.entityRenderer.local.dead = false;
        this.entityRenderer.playAction(this.entityRenderer.local, "idle", {
          facing: this.entityRenderer.local.facing,
          force: true,
        });
      }
    }

    if (!announce) {
      return;
    }

    const gainedXp = snapshot.experience - (previous?.experience ?? 0);
    if (gainedXp > 0) {
      this.initData.hud.pushFeedMessage(`+${gainedXp} XP`, "loot");
    }
    if (previous && snapshot.level > previous.level) {
      const x = this.entityRenderer.local?.sprite.x ?? this.worldMinX + 80;
      const y = this.entityRenderer.local?.sprite.y ?? this.worldMinY + 80;
      this.entityRenderer.playLevelUpEffect(x, y, snapshot.level);
      this.initData.hud.pushFeedMessage(
        `Nivel ${snapshot.level} alcancado.`,
        "system",
      );
      this.setTransientStatus(`Nivel ${snapshot.level}`);
    }
    if (previous) {
      const previousUnlocked = new Set(
        previous.availableRunes.filter((entry) => entry.unlocked).map((entry) => entry.id),
      );
      for (const rune of snapshot.availableRunes) {
        if (rune.unlocked && !previousUnlocked.has(rune.id)) {
          this.initData.hud.pushFeedMessage(
            `Runa desbloqueada: ${rune.name}.`,
            "system",
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private — action systems (gathering + crafting)
  // ---------------------------------------------------------------------------

  private updateActionSystems(deltaMs: number): boolean {
    if (!this.entityRenderer.local) {
      this.initData.hud.setActionProgress(null);
      this.entityRenderer.clearGatherAnimation();
      return false;
    }

    void deltaMs;
    const gathering = this.gatheringSystem?.update(this.time.now);

    const activeGatherNode = this.gatheringSystem?.getActiveNode() ?? null;
    if (activeGatherNode && !this.entityRenderer.local.dead) {
      this.entityRenderer.syncGatherAnimation(activeGatherNode, this.entityRenderer.local);
    } else {
      this.entityRenderer.clearGatherAnimation();
    }

    const crafting = this.craftingSystem.update(this.time.now);

    const progress = gathering?.progress ?? crafting.progress;
    this.initData.hud.setActionProgress(progress);
    return Boolean(progress);
  }

  // ---------------------------------------------------------------------------
  // Private — static NPCs
  // ---------------------------------------------------------------------------

  private createStaticNpcs(): void {
    for (const spec of STARTER_VILLAGE_NPCS) {
      const worldPosition = this.tileToWorldPosition(spec.tileX, spec.tileY);
      const safePosition = this.findNearestWalkablePosition(worldPosition.x, worldPosition.y);
      const npc = this.createStaticNpc(spec, safePosition.x, safePosition.y);
      this.staticNpcEntities.set(spec.id, npc);
    }
  }

  private tileToWorldPosition(tileX: number, tileY: number): { x: number; y: number } {
    return mapTileToWorldPosition(
      {
        tileWidth: this.mapWorld?.tileWidth ?? 32,
        tileHeight: this.mapWorld?.tileHeight ?? 32,
        worldMinX: this.worldMinX,
        worldMinY: this.worldMinY,
      },
      tileX,
      tileY,
    );
  }

  private createStaticNpc(
    spec: StarterVillageNpcSpec,
    x: number,
    y: number,
  ): StaticNpcEntity {
    const shadow = this.add.ellipse(x, y - 5, 22, 10, 0x000000, 0.28);
    const sprite = this.add.sprite(x, y, spec.textureKey);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(spec.scale);

    const nameTag = this.add
      .text(x, y - 56, spec.name, {
        fontFamily: "IBM Plex Mono",
        fontSize: "10px",
        color: "#f6efda",
        backgroundColor: "#22180fbb",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5);

    const npc: StaticNpcEntity = {
      id: spec.id,
      sprite,
      shadow,
      nameTag,
      blockerRadiusX: spec.blockerRadiusX,
      blockerRadiusY: spec.blockerRadiusY,
      spec,
    };

    this.setStaticNpcPosition(npc, x, y);
    return npc;
  }

  private setStaticNpcPosition(npc: StaticNpcEntity, x: number, y: number): void {
    npc.sprite.setPosition(x, y);
    npc.shadow.setPosition(x, y - 5);
    npc.nameTag.setPosition(x, y - 56);

    const relativeY = y - this.worldMinY;
    npc.shadow.setDepth(relativeY - 1.2);
    npc.sprite.setDepth(relativeY + 0.8);
    npc.nameTag.setDepth(relativeY + 8);
  }

  private destroyStaticNpc(npc: StaticNpcEntity): void {
    npc.shadow.destroy();
    npc.nameTag.destroy();
    npc.sprite.destroy();
  }

  private setStaticNpcVisible(npc: StaticNpcEntity, visible: boolean): void {
    npc.sprite.setVisible(visible).setActive(visible);
    npc.shadow.setVisible(visible).setActive(visible);
    npc.nameTag.setVisible(visible).setActive(visible);
  }

  private syncMapPresentation(): void {
    const definition = MAP_DEFINITIONS[this.currentMapId];
    const weather: WeatherType =
      definition.defaultWeather === "clear" ? "none" : definition.defaultWeather;
    this.weatherSystem?.set(weather);
    const showVillageNpcs = this.currentMapId === "default";
    for (const npc of this.staticNpcEntities.values()) {
      this.setStaticNpcVisible(npc, showVillageNpcs);
    }
    this.refreshInteractionUi();
  }

  // ---------------------------------------------------------------------------
  // Private — interaction UI
  // ---------------------------------------------------------------------------

  private refreshInteractionUi(): void {
    const target = this.getPrimaryInteractable();
    this.focusedNpcId = target?.kind === "npc" ? target.npc.id : null;
    if (
      this.dialogueState ||
      this.npcPanelState ||
      this.craftingSystem.isPanelOpen() ||
      this.craftingSystem.isBusy() ||
      this.gatheringSystem?.isBusy()
    ) {
      this.initData.hud.setInteractionPrompt(null);
      return;
    }
    if (!target) {
      this.initData.hud.setInteractionPrompt(null);
      return;
    }
    this.initData.hud.setInteractionPrompt(
      target.kind === "resource"
        ? `${target.node.getPromptText()}`
        : target.kind === "loot"
          ? `Coletar ${target.itemLabel}`
          : target.kind === "portal"
            ? target.label
            : target.npc.spec.interactionMode === "panel"
              ? `Atender com ${target.npc.spec.name}`
              : `Falar com ${target.npc.spec.name}`,
    );
  }

  private findNearestInteractableNpc(): StaticNpcEntity | null {
    if (!this.entityRenderer.local) {
      return null;
    }

    let bestNpc: StaticNpcEntity | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const npc of this.staticNpcEntities.values()) {
      if (!npc.sprite.visible) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(
        this.entityRenderer.local.sprite.x,
        this.entityRenderer.local.sprite.y,
        npc.sprite.x,
        npc.sprite.y - 8,
      );
      if (distance > npc.spec.interactionRadius || distance >= bestDistance) {
        continue;
      }
      bestDistance = distance;
      bestNpc = npc;
    }

    return bestNpc;
  }

  private getPrimaryInteractable():
    | { kind: "resource"; node: ResourceNodeEntity; distance: number }
    | { kind: "npc"; npc: StaticNpcEntity; distance: number }
    | { kind: "loot"; dropId: string; distance: number; itemLabel: string }
    | { kind: "portal"; portalId: string; label: string; distance: number }
    | null {
    if (!this.entityRenderer.local) {
      return null;
    }

    const resource = this.gatheringSystem?.updateFocus(
      this.entityRenderer.local.sprite.x,
      this.entityRenderer.local.sprite.y,
    ) ?? null;
    const resourceDistance = resource
      ? resource.distanceTo(this.entityRenderer.local.sprite.x, this.entityRenderer.local.sprite.y)
      : Number.POSITIVE_INFINITY;
    const npc = this.findNearestInteractableNpc();
    const npcDistance = npc
      ? Phaser.Math.Distance.Between(
          this.entityRenderer.local.sprite.x,
          this.entityRenderer.local.sprite.y,
          npc.sprite.x,
          npc.sprite.y - 8,
        )
      : Number.POSITIVE_INFINITY;

    const loot = this.findNearestLootDrop();
    const lootDistance = loot?.distance ?? Number.POSITIVE_INFINITY;
    const portal = getPortalForPosition(
      this.currentMapId,
      this.entityRenderer.local.sprite.x,
      this.entityRenderer.local.sprite.y,
    );
    const portalDistance = portal
      ? Phaser.Math.Distance.Between(
          this.entityRenderer.local.sprite.x,
          this.entityRenderer.local.sprite.y,
          portal.x,
          portal.y,
        )
      : Number.POSITIVE_INFINITY;

    if (
      resource &&
      resourceDistance <= npcDistance &&
      resourceDistance <= lootDistance &&
      resourceDistance <= portalDistance
    ) {
      return { kind: "resource", node: resource, distance: resourceDistance };
    }
    if (loot && lootDistance <= npcDistance && lootDistance <= portalDistance) {
      return {
        kind: "loot",
        dropId: loot.drop.dropId,
        distance: lootDistance,
        itemLabel: loot.label,
      };
    }
    if (npc && npcDistance <= lootDistance && npcDistance <= portalDistance) {
      return { kind: "npc", npc, distance: npcDistance };
    }
    if (portal) {
      return {
        kind: "portal",
        portalId: portal.id,
        label: portal.label,
        distance: portalDistance,
      };
    }
    return null;
  }

  /** Flutuação só com offset inteiro em Y (sem tween de escala/alpha — evita piscar). */
  private updateLootFloatAnimation(timeMs: number): void {
    const t = timeMs / 1000;
    for (const drop of this.lootDrops.values()) {
      const yOff = Math.round(
        Math.sin(t * LOOT_FLOAT_SPEED + drop.floatPhase) * LOOT_FLOAT_AMP,
      );
      drop.floater.setY(yOff);
    }
  }

  private findNearestLootDrop(): { drop: LootDropEntity; distance: number; label: string } | null {
    if (!this.entityRenderer.local || this.lootDrops.size === 0) return null;
    const lx = this.entityRenderer.local.sprite.x;
    const ly = this.entityRenderer.local.sprite.y;
    let best: LootDropEntity | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const drop of this.lootDrops.values()) {
      const d = Phaser.Math.Distance.Between(lx, ly, drop.x, drop.y);
      if (d < bestDist) {
        bestDist = d;
        best = drop;
      }
    }
    if (!best) return null;
    const definition = (ITEM_DEFINITIONS as Record<string, { name?: string }>)[best.itemId];
    const name = definition?.name ?? best.itemId;
    return { drop: best, distance: bestDist, label: `${name} x${best.amount}` };
  }

  private syncLoot(entries: ReadonlyArray<LootDropPayload>): void {
    const seen = new Set<string>();
    for (const entry of entries) {
      const e = entry as any;
      const dropId = e.dropId as string;
      seen.add(dropId);
      const existing = this.lootDrops.get(dropId);
      if (existing) {
        const nx = e.x as number;
        const ny = e.y as number;
        const nAmount = e.amount as number;
        if (
          Math.abs(nx - existing.x) > LOOT_POS_EPS ||
          Math.abs(ny - existing.y) > LOOT_POS_EPS
        ) {
          existing.x = nx;
          existing.y = ny;
          existing.marker.setPosition(Math.round(nx), Math.round(ny));
          existing.marker.setDepth(ny - this.worldMinY + 2);
        }
        if (nAmount !== existing.amount) {
          existing.amount = nAmount;
          existing.label.setText(String(nAmount));
        }
        continue;
      }

      const x = e.x as number;
      const y = e.y as number;
      const itemId = e.itemId as string;
      const amount = e.amount as number;

      const rx = Math.round(x);
      const ry = Math.round(y);
      const floatPhase = Math.random() * Math.PI * 2;

      // Root = posição do servidor. Filho = ícone + anel de loot (tweens só aqui; não conflita com setPosition).
      const marker = this.add.container(rx, ry);
      marker.setDepth(ry - this.worldMinY + 2);

      const floater = this.add.container(0, 0);
      marker.add(floater);

      const lootRing = this.add.graphics();
      lootRing.lineStyle(2, 0xffc966, 0.55);
      lootRing.strokeCircle(0, 0, 20);
      lootRing.lineStyle(1, 0x8b5a14, 0.4);
      lootRing.strokeCircle(0, 0, 26);
      floater.add(lootRing);

      const definition = (ITEM_DEFINITIONS as Record<string, any>)[itemId];
      const icon = definition?.icon as
        | { src: string; col: number; row: number; size: number }
        | undefined;

      let usedRealIcon = false;
      if (icon) {
        const key = iconTextureKey(icon.src);
        if (this.textures.exists(key)) {
          const tex = this.textures.get(key);
          const textureWidth =
            tex.source?.[0]?.width ??
            (tex.getSourceImage() as HTMLImageElement | undefined)?.width ??
            0;
          const frame = frameIndexForIcon(textureWidth, icon.size, icon.col, icon.row);
          const sprite = this.add.sprite(0, 0, key, frame);
          sprite.setOrigin(0.5, 0.5);
          sprite.setScale(2);
          floater.add(sprite);
          usedRealIcon = true;
        }
      }

      if (!usedRealIcon) {
        const gfx = this.add.graphics();
        const accent = (definition?.accent as string | undefined) ?? "#ffe480";
        const color = Phaser.Display.Color.HexStringToColor(accent).color;
        gfx.fillStyle(color, 0.95);
        gfx.beginPath();
        gfx.moveTo(0, -6);
        gfx.lineTo(6, 0);
        gfx.lineTo(0, 6);
        gfx.lineTo(-6, 0);
        gfx.closePath();
        gfx.fillPath();
        gfx.lineStyle(1, 0x120707, 0.8);
        gfx.strokePath();
        floater.add(gfx);
      }

      const label = this.add
        .text(0, -16, String(amount), {
          fontFamily: "IBM Plex Mono",
          fontSize: "10px",
          color: "#ffe9c7",
          stroke: "#140908",
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      marker.add(label);
      label.setDepth(4);

      this.lootDrops.set(dropId, {
        dropId,
        itemId,
        amount,
        x,
        y,
        marker,
        floater,
        floatPhase,
        label,
      });
    }

    for (const [id, drop] of this.lootDrops.entries()) {
      if (seen.has(id)) continue;
      drop.marker.destroy(true);
      this.lootDrops.delete(id);
    }
  }

  // ---------------------------------------------------------------------------
  // Private — dialogue
  // ---------------------------------------------------------------------------

  private openDialogue(npc: StaticNpcEntity): void {
    this.dialogueState = { npcId: npc.id, lineIndex: 0 };
    this.initData.hud.setInteractionPrompt(null);
    this.renderDialogue();
  }

  private openNpcPanel(npc: StaticNpcEntity): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.npcPanelState = { npcId: npc.id };
    this.initData.hud.setInteractionPrompt(null);
    const msg: WorldClientMessage = {
      type: "open_npc_panel",
      payload: { npcId: npc.id },
    };
    this.ws.send(JSON.stringify(msg));
  }

  private renderNpcPanel(view: Omit<HudNpcPanelView, "open">): void {
    this.npcPanelState = { npcId: view.npcId };
    this.initData.hud.setNpcPanel({
      ...view,
      open: true,
    });
  }

  private advanceDialogue(): void {
    if (!this.dialogueState) {
      return;
    }
    const npc = this.staticNpcEntities.get(this.dialogueState.npcId);
    if (!npc) {
      this.closeDialogue();
      return;
    }
    const nextIndex = this.dialogueState.lineIndex + 1;
    if (nextIndex >= npc.spec.dialogue.length) {
      this.closeDialogue();
      return;
    }
    this.dialogueState.lineIndex = nextIndex;
    this.renderDialogue();
  }

  private renderDialogue(): void {
    if (!this.dialogueState) {
      return;
    }
    const npc = this.staticNpcEntities.get(this.dialogueState.npcId);
    if (!npc) {
      this.closeDialogue();
      return;
    }
    this.initData.hud.openDialogue(
      npc.spec.name,
      npc.spec.dialogue[this.dialogueState.lineIndex],
      this.dialogueState.lineIndex + 1,
      npc.spec.dialogue.length,
    );
  }

  private closeDialogue(): void {
    this.dialogueState = null;
    this.initData.hud.closeDialogue();
    this.refreshInteractionUi();
  }

  private closeNpcPanel(): void {
    this.npcPanelState = null;
    this.initData.hud.closeNpcPanel();
    this.refreshInteractionUi();
  }

  // ---------------------------------------------------------------------------
  // Private — crafting panel
  // ---------------------------------------------------------------------------

  private toggleCraftingPanel(): void {
    if (this.dialogueState || this.npcPanelState || this.gatheringSystem?.isBusy()) {
      return;
    }
    this.craftingSystem.togglePanel();
    this.syncCraftingHud();
    this.refreshInteractionUi();
  }

  // ---------------------------------------------------------------------------
  // Private — WebSocket
  // ---------------------------------------------------------------------------

  private connectWorldSocket(): void {
    this.initData.hud.setStatus("Conectando ao world...");
    this.ws = new WebSocket(this.initData.gatewayWsUrl);

    this.ws.onopen = () => {
      this.initData.hud.setStatus("Autenticando...");
      const msg: WorldClientMessage = {
        type: "auth",
        payload: { token: this.initData.token },
      };
      this.ws?.send(JSON.stringify(msg));
    };

    this.ws.onclose = () => {
      this.clearStatusTimer();
      this.initData.hud.setStatus("Socket fechado");
    };

    this.ws.onerror = () => {
      this.initData.hud.setStatus("Erro de conexao");
    };

    this.ws.onmessage = (ev) => {
      this.handleServerPayload(ev.data);
    };
  }

  private handleServerPayload(raw: unknown): void {
    if (typeof raw !== "string") {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const validated = worldServerMessageSchema.safeParse(parsed);
    if (!validated.success) {
      return;
    }
    this.handleServerMessage(validated.data);
  }

  private handleServerMessage(msg: WorldServerMessage): void {
    switch (msg.type) {
      case "welcome": {
        this.localId = msg.payload.characterId;
        this.currentMapId = msg.payload.mapId;
        this.combatConfig = msg.payload.combatConfig;
        this.ensureLocalEntity(this.localId, msg.payload.position.x, msg.payload.position.y);
        this.applyProgressionSnapshot(msg.payload.progression, false);
        this.syncPlayers(msg.payload.players);
        this.syncMobs(msg.payload.mobs);
        this.syncLoot(msg.payload.loot ?? []);
        this.inventory.setFromServer(msg.payload.inventory ?? {});
        this.craftingSystem.syncServerState(msg.payload.craftState);
        this.gatheringSystem?.syncServerState(msg.payload.gatherState);
        this.initData.hud.closeNpcPanel();
        this.npcPanelState = null;
        this.syncMapPresentation();
        this.initData.hud.setStatus("No mundo");
        this.syncInventoryHud();
        this.syncCraftingHud();
        return;
      }
      case "inventory": {
        // Nunca trocar a instância de InventoryStore: CraftingSystem mantém referência ao store criado no create().
        this.inventory.setFromServer(msg.payload.inventory);
        this.syncInventoryHud();
        this.syncCraftingHud();
        return;
      }
      case "state": {
        this.syncPlayers(msg.payload.players);
        this.syncMobs(msg.payload.mobs);
        this.syncLoot(msg.payload.loot ?? []);
        return;
      }
      case "craft_state": {
        const message = this.craftingSystem.syncServerState(msg.payload);
        if (message) {
          this.initData.hud.pushFeedMessage(message, "loot");
          this.setTransientStatus(msg.payload.status === "completed" ? "Craft concluido" : "Craft cancelado");
        }
        this.syncCraftingHud();
        return;
      }
      case "gather_state": {
        const result = this.gatheringSystem?.syncServerState(msg.payload);
        if (result?.itemId && result.amount > 0 && this.entityRenderer.local) {
          const itemName = ITEM_DEFINITIONS[result.itemId].name;
          this.entityRenderer.showFloatingText(
            this.entityRenderer.local.sprite.x,
            this.entityRenderer.local.sprite.y - 44,
            `+${result.amount} ${itemName}`,
            "#8dd2ff",
          );
          this.initData.hud.pushFeedMessage(`${itemName} +${result.amount}.`, "loot");
          this.setTransientStatus("Recurso coletado");
        } else if (result?.message) {
          this.initData.hud.pushFeedMessage(result.message, "system");
        }
        return;
      }
      case "progression": {
        this.applyProgressionSnapshot(msg.payload);
        return;
      }
      case "position_correction": {
        this.authoritativeLocalX = msg.payload.x;
        this.authoritativeLocalY = msg.payload.y;
        this.hasAuthoritativeLocalPosition = true;
        if (this.entityRenderer.local) {
          this.entityRenderer.setEntityPosition(this.entityRenderer.local, msg.payload.x, msg.payload.y);
          this.notifyHudPosition(msg.payload.x, msg.payload.y);
        }
        return;
      }
      case "respawned": {
        this.ensureLocalEntity(
          this.localId,
          msg.payload.position.x,
          msg.payload.position.y,
        );
        if (this.entityRenderer.local) {
          this.entityRenderer.local.dead = false;
          this.entityRenderer.playAction(this.entityRenderer.local, "idle", {
            facing: this.entityRenderer.local.facing,
            force: true,
          });
        }
        this.applyProgressionSnapshot(msg.payload.progression, false);
        this.initData.hud.closeDeathModal();
        this.initData.hud.setStatus("Respawnado");
        return;
      }
      case "combat_event": {
        this.applyCombatEvent(msg.payload);
        return;
      }
      case "error": {
        this.applyErrorFeedback(msg.payload.code, msg.payload.message);
        return;
      }
      case "npc_panel": {
        this.renderNpcPanel({
          npcId: msg.payload.npcId,
          npcName: msg.payload.npcName,
          title: msg.payload.title,
          description: msg.payload.description,
          hint: msg.payload.hint,
          actions: msg.payload.actions,
        });
        return;
      }
      case "pong": {
        return;
      }
      case "map_changed": {
        this.currentMapId = msg.payload.mapId;
        this.ensureLocalEntity(this.localId, msg.payload.position.x, msg.payload.position.y);
        this.authoritativeLocalX = msg.payload.position.x;
        this.authoritativeLocalY = msg.payload.position.y;
        this.hasAuthoritativeLocalPosition = true;
        this.closeDialogue();
        this.closeNpcPanel();
        this.craftingSystem.closePanel();
        this.syncCraftingHud();
        this.syncMapPresentation();
        this.initData.hud.pushFeedMessage(
          `Entrando em ${MAP_DEFINITIONS[msg.payload.mapId].name}.`,
          "system",
        );
        this.setTransientStatus(MAP_DEFINITIONS[msg.payload.mapId].name);
        return;
      }
      case "quest_update": {
        const quest = QUEST_DEFINITIONS[msg.payload.questId];
        if (!quest) {
          return;
        }
        const progressLabel = `${Math.min(msg.payload.progress, quest.requiredAmount)}/${quest.requiredAmount}`;
        if (msg.payload.status === "ready") {
          this.initData.hud.pushFeedMessage(`${quest.title} pronta para entrega.`, "system");
          this.setTransientStatus("Quest pronta");
          return;
        }
        if (msg.payload.status === "completed") {
          this.initData.hud.pushFeedMessage(`${quest.title} concluida.`, "system");
          this.setTransientStatus("Quest concluida");
          return;
        }
        this.initData.hud.pushFeedMessage(`${quest.title}: ${progressLabel}.`, "system");
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private — entity sync (server state → renderer)
  // ---------------------------------------------------------------------------

  private ensureLocalEntity(characterId: string, x: number, y: number): void {
    this.localMoveSpeed = worldMoveSpeedForClass(
      this.resolveCharacterClass(this.initData.characterClass),
    );
    const safePosition = this.findNearestWalkablePosition(
      x,
      y,
      this.entityRenderer.local
        ? {
            x: this.entityRenderer.local.sprite.x,
            y: this.entityRenderer.local.sprite.y,
          }
        : undefined,
    );
    this.hasAuthoritativeLocalPosition = true;
    this.authoritativeLocalX = safePosition.x;
    this.authoritativeLocalY = safePosition.y;
    const visual = this.entityRenderer.resolvePlayerVisual(this.initData.characterClass);
    if (!this.entityRenderer.local) {
      this.entityRenderer.local = this.entityRenderer.createEntity({
        id: characterId,
        kind: "player",
        visual,
        x: safePosition.x,
        y: safePosition.y,
        isLocal: true,
      });
      this.cameras.main.startFollow(this.entityRenderer.local.sprite, true, 0.12, 0.12);
      this.notifyHudPosition(safePosition.x, safePosition.y);
      return;
    }
    this.entityRenderer.setEntityPosition(this.entityRenderer.local, safePosition.x, safePosition.y);
    this.notifyHudPosition(safePosition.x, safePosition.y);
  }

  private syncPlayers(players: WelcomePayload["players"] | StatePayload["players"]): void {
    const seenRemotes = new Set<string>();
    for (const player of players) {
      if (player.characterId === this.localId) {
        if (this.entityRenderer.local) {
          const safePosition = this.findNearestWalkablePosition(player.x, player.y, {
            x: this.entityRenderer.local.sprite.x,
            y: this.entityRenderer.local.sprite.y,
          });
          this.hasAuthoritativeLocalPosition = true;
          this.authoritativeLocalX = safePosition.x;
          this.authoritativeLocalY = safePosition.y;
          const distToAuthoritative = Phaser.Math.Distance.Between(
            this.entityRenderer.local.sprite.x,
            this.entityRenderer.local.sprite.y,
            safePosition.x,
            safePosition.y,
          );
          if (
            !this.localInputActive &&
            distToAuthoritative > LOCAL_HARD_RECONCILE_DISTANCE
          ) {
            this.entityRenderer.setEntityPosition(this.entityRenderer.local, safePosition.x, safePosition.y);
            this.notifyHudPosition(safePosition.x, safePosition.y);
          }
        }
        continue;
      }

      seenRemotes.add(player.characterId);
      const existing = this.entityRenderer.remotes.get(player.characterId);
      if (existing) {
        const dx = player.x - existing.lastX;
        const dy = player.y - existing.lastY;
        this.entityRenderer.setEntityPosition(existing, player.x, player.y);
        this.entityRenderer.applyMotionVisual(existing, dx, dy, REMOTE_MOVE_THRESHOLD);
        continue;
      }

      const created = this.entityRenderer.createEntity({
        id: player.characterId,
        kind: "player",
        visual: this.entityRenderer.resolvePlayerVisual(player.characterClass),
        x: player.x,
        y: player.y,
        name: player.characterName,
      });
      this.entityRenderer.remotes.set(player.characterId, created);
    }

    for (const [id, entity] of this.entityRenderer.remotes.entries()) {
      if (seenRemotes.has(id)) {
        continue;
      }
      this.entityRenderer.destroyEntity(entity);
      this.entityRenderer.remotes.delete(id);
    }
  }

  private syncMobs(mobs: WelcomePayload["mobs"] | StatePayload["mobs"]): void {
    const seenMobs = new Set<string>();
    for (const mob of mobs) {
      const mobHealthValue = "health" in mob ? mob.health : undefined;
      const mobHealth =
        typeof mobHealthValue === "number" ? mobHealthValue : undefined;
      seenMobs.add(mob.mobId);
      this.entityRenderer.pendingDeadMobs.delete(mob.mobId);
      const existing = this.entityRenderer.mobs.get(mob.mobId);
      if (existing) {
        if (typeof mobHealth === "number") {
          this.entityRenderer.setMobHealth(existing, mobHealth);
        }
        if (!existing.dead) {
          const dx = mob.x - existing.lastX;
          const dy = mob.y - existing.lastY;
          this.entityRenderer.setEntityPosition(existing, mob.x, mob.y);
          this.entityRenderer.applyMotionVisual(existing, dx, dy, REMOTE_MOVE_THRESHOLD);
        }
        continue;
      }

      const created = this.entityRenderer.createEntity({
        id: mob.mobId,
        kind: "mob",
        visual: this.entityRenderer.resolveMobVisual(mob.mobType),
        x: mob.x,
        y: mob.y,
        mobType: mob.mobType,
      });
      const initialHealth = mobHealth ?? created.mobUi?.maxHp ?? 0;
      this.entityRenderer.setMobHealth(created, initialHealth);
      this.entityRenderer.mobs.set(mob.mobId, created);
    }

    for (const [mobId, entity] of this.entityRenderer.mobs.entries()) {
      if (seenMobs.has(mobId) || this.entityRenderer.pendingDeadMobs.has(mobId)) {
        continue;
      }
      if (this.entityRenderer.currentTargetMobId === mobId) {
        this.entityRenderer.currentTargetMobId = null;
      }
      this.entityRenderer.destroyEntity(entity);
      this.entityRenderer.mobs.delete(mobId);
    }
  }

  private applyCombatEvent(payload: CombatEventPayload): void {
    const attacker = this.entityRenderer.resolveEntity(payload.attackerId, this.localId);
    const target = this.entityRenderer.resolveEntity(payload.targetId, this.localId);
    const attackStyle = this.resolveAttackStyle(attacker);

    if (attacker && !attacker.dead) {
      const targetX = target?.sprite.x ?? attacker.sprite.x + 1;
      const targetY = target?.sprite.y ?? attacker.sprite.y;
      const facing = this.entityRenderer.facingFromDelta(
        targetX - attacker.sprite.x,
        targetY - attacker.sprite.y,
        attacker.facing,
      );
      this.entityRenderer.playAction(attacker, "attack", {
        facing,
        force: true,
        lockForDuration: true,
      });
    }

    if (!target) {
      return;
    }

    const applyImpact = (): void => {
      const impactTarget = this.entityRenderer.resolveEntity(payload.targetId, this.localId) ?? target;
      if (!impactTarget.sprite.active) {
        return;
      }
      const impactAttacker =
        this.entityRenderer.resolveEntity(payload.attackerId, this.localId) ?? attacker;
      const isLocalTarget = payload.targetId === this.localId;
      const popupColor = isLocalTarget ? COLOR_DAMAGE_PLAYER : COLOR_DAMAGE_ENEMY;
      const isHeavyHit = payload.damage >= 20 || Boolean(payload.isCritical);

      if (payload.isDodged) {
        this.entityRenderer.showFloatingText(
          impactTarget.sprite.x,
          impactTarget.sprite.y - 32,
          "Esquiva",
          "#8fe7ff",
        );
        if (isLocalTarget) {
          this.initData.hud.setHp(payload.targetHealth, this.maxHp);
        }
        return;
      }

      if (payload.damage > 0 && payload.targetHealth > 0) {
        this.entityRenderer.playAction(impactTarget, "hurt", {
          force: true,
          lockForDuration: true,
        });
        this.entityRenderer.flashEntity(impactTarget, isHeavyHit);
        if (impactAttacker && attackStyle === "melee") {
          this.entityRenderer.knockbackEntity(
            impactTarget,
            impactAttacker.sprite.x,
            impactAttacker.sprite.y,
          );
        }
      }

      if (isLocalTarget && payload.damage > 0) {
        const intensity = isHeavyHit ? 0.009 : 0.004;
        this.cameras.main.shake(170, intensity);
      }

      this.entityRenderer.showFloatingText(
        impactTarget.sprite.x,
        impactTarget.sprite.y - 32,
        String(payload.damage),
        popupColor,
        isHeavyHit,
      );
      if (payload.isCritical) {
        this.entityRenderer.showFloatingText(
          impactTarget.sprite.x,
          impactTarget.sprite.y - 50,
          "Crit!",
          "#ffd866",
        );
      }

      if (isLocalTarget) {
        this.initData.hud.setHp(payload.targetHealth, this.maxHp);
        if (payload.targetHealth <= 0) {
          impactTarget.dead = true;
          this.craftingSystem.closePanel();
          this.syncCraftingHud();
          this.closeDialogue();
          this.closeNpcPanel();
          this.entityRenderer.playAction(impactTarget, "death", {
            force: true,
            lockForDuration: true,
          });
          this.initData.hud.setStatus("Voce morreu");
          this.initData.hud.openDeathModal(
            "Voce foi derrotado. Clique em respawn para voltar ao vilarejo.",
          );
        }
      }

      const isMob = this.entityRenderer.mobs.has(payload.targetId);
      if (isMob) {
        this.entityRenderer.setMobHealth(impactTarget, payload.targetHealth);
      }
      if (payload.targetHealth <= 0 && isMob) {
        this.entityRenderer.pendingDeadMobs.add(payload.targetId);
        if (this.entityRenderer.currentTargetMobId === payload.targetId) {
          this.entityRenderer.currentTargetMobId = null;
        }
        impactTarget.dead = true;
        impactTarget.mobUi?.aura.setVisible(false);
        impactTarget.mobUi?.hpBarBack.setVisible(false);
        impactTarget.mobUi?.hpBarFill.setVisible(false);
        impactTarget.mobUi?.levelTag.setVisible(false);
        this.entityRenderer.playAction(impactTarget, "death", {
          force: true,
          lockForDuration: true,
        });
        this.time.delayedCall(650, () => {
          const mob = this.entityRenderer.mobs.get(payload.targetId);
          if (!mob) {
            return;
          }
          this.entityRenderer.destroyEntity(mob);
          this.entityRenderer.mobs.delete(payload.targetId);
          this.entityRenderer.pendingDeadMobs.delete(payload.targetId);
        });
      }
    };

    if (attacker && attackStyle === "ranged") {
      const travelMs = this.entityRenderer.spawnArcaneProjectile(
        attacker.sprite.x,
        attacker.sprite.y,
        target.sprite.x,
        target.sprite.y,
      );
      this.time.delayedCall(travelMs, applyImpact);
      return;
    }

    applyImpact();
  }

  // ---------------------------------------------------------------------------
  // Private — error feedback / status
  // ---------------------------------------------------------------------------

  private applyErrorFeedback(code: string, message: string): void {
    if (!this.entityRenderer.local) {
      return;
    }
    if (code === "CRAFT") {
      this.craftingSystem.cancelActiveCraft();
      this.syncCraftingHud();
    }
    if (code === "GATHER" || (code === "OUT_OF_RANGE" && this.gatheringSystem?.isBusy())) {
      this.gatheringSystem?.cancelActiveGather("Servidor rejeitou a coleta", this.time.now);
    }
    if (code === "COOLDOWN" || code === "OUT_OF_RANGE" || code === "NOT_FOUND") {
      const label =
        code === "COOLDOWN"
          ? "Recarga"
          : code === "OUT_OF_RANGE"
            ? "Fora de alcance"
            : "Sem alvo";
      this.entityRenderer.showFloatingText(
        this.entityRenderer.local.sprite.x,
        this.entityRenderer.local.sprite.y - 36,
        label,
        COLOR_REJECT,
      );
      this.setTransientStatus(label);
      return;
    }
    this.initData.hud.setStatus(`${code}: ${message}`);
  }

  private setTransientStatus(text: string): void {
    this.clearStatusTimer();
    this.initData.hud.setStatus(text);
    this.statusResetTimer = this.time.delayedCall(STATUS_RESET_MS, () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.initData.hud.setStatus("No mundo");
      }
      this.statusResetTimer = null;
    });
  }

  private clearStatusTimer(): void {
    if (!this.statusResetTimer) {
      return;
    }
    this.statusResetTimer.remove(false);
    this.statusResetTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Private — local movement
  // ---------------------------------------------------------------------------

  private hasMovementIntent(): boolean {
    return (
      this.moveKeys.left.isDown ||
      this.moveKeys.right.isDown ||
      this.moveKeys.up.isDown ||
      this.moveKeys.down.isDown
    );
  }

  private handleLocalMovement(dtSeconds: number): { vx: number; vy: number } {
    if (!this.entityRenderer.local || this.entityRenderer.local.dead) {
      this.localInputActive = false;
      return { vx: 0, vy: 0 };
    }
    const dx =
      (this.moveKeys.right.isDown ? 1 : 0) - (this.moveKeys.left.isDown ? 1 : 0);
    const dy =
      (this.moveKeys.down.isDown ? 1 : 0) - (this.moveKeys.up.isDown ? 1 : 0);

    let vx = 0;
    let vy = 0;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const speedMult = this.skillSystem?.speedMultiplier ?? 1;
      vx = (dx / len) * this.localMoveSpeed * speedMult;
      vy = (dy / len) * this.localMoveSpeed * speedMult;
    }
    this.localInputActive = dx !== 0 || dy !== 0;

    let nx = this.entityRenderer.local.sprite.x;
    let ny = this.entityRenderer.local.sprite.y;

    if (vx !== 0) {
      const tx = Phaser.Math.Clamp(nx + vx * dtSeconds, this.worldMinX, this.worldMaxX);
      const currentlyBlocked = this.isBlockedAtWorldPosition(nx, ny);
      if (currentlyBlocked || !this.isBlockedAtWorldPosition(tx, ny)) {
        nx = tx;
      } else {
        vx = 0;
      }
    }
    if (vy !== 0) {
      const ty = Phaser.Math.Clamp(ny + vy * dtSeconds, this.worldMinY, this.worldMaxY);
      const currentlyBlocked = this.isBlockedAtWorldPosition(nx, ny);
      if (currentlyBlocked || !this.isBlockedAtWorldPosition(nx, ty)) {
        ny = ty;
      } else {
        vy = 0;
      }
    }

    this.entityRenderer.setEntityPosition(this.entityRenderer.local, nx, ny);
    this.notifyHudPosition(nx, ny);
    return { vx, vy };
  }

  private reconcileLocalPosition(dtSeconds: number): void {
    if (!this.entityRenderer.local || !this.hasAuthoritativeLocalPosition) {
      return;
    }
    if (this.localInputActive) {
      return;
    }
    const dist = Phaser.Math.Distance.Between(
      this.entityRenderer.local.sprite.x,
      this.entityRenderer.local.sprite.y,
      this.authoritativeLocalX,
      this.authoritativeLocalY,
    );
    if (dist <= LOCAL_SOFT_RECONCILE_DISTANCE) {
      return;
    }
    const t = Math.min(1, dtSeconds * LOCAL_SOFT_RECONCILE_RATE);
    const nx = Phaser.Math.Linear(this.entityRenderer.local.sprite.x, this.authoritativeLocalX, t);
    const ny = Phaser.Math.Linear(this.entityRenderer.local.sprite.y, this.authoritativeLocalY, t);
    this.entityRenderer.setEntityPosition(this.entityRenderer.local, nx, ny);
    this.notifyHudPosition(nx, ny);
  }

  private notifyHudPosition(x: number, y: number): void {
    this.initData.hud.setPosition?.(
      x - this.worldMinX,
      y - this.worldMinY,
      this.worldWidth,
      this.worldHeight,
    );
  }

  private syncLocalFootsteps(vx: number, vy: number): void {
    if (!this.entityRenderer.local || !this.footstepSystem) {
      return;
    }
    this.footstepSystem.update(
      this.entityRenderer.local.sprite.x,
      this.entityRenderer.local.sprite.y,
      vx,
      vy,
    );
  }

  // ---------------------------------------------------------------------------
  // Private — collision
  // ---------------------------------------------------------------------------

  private isBlockedAtWorldPosition(x: number, y: number): boolean {
    if (!this.collisionLayer) {
      return false;
    }
    return FOOT_PROBES.some(([dx, dy]) => {
      const px = x + dx;
      const py = y + dy;
      const tile = this.collisionLayer?.getTileAtWorldXY(px, py);
      return (
        Boolean(tile && tile.index > 0) ||
        this.isBlockedByStaticNpc(px, py) ||
        this.isBlockedByRuntimeProp(px, py)
      );
    });
  }

  private isBlockedByStaticNpc(x: number, y: number): boolean {
    for (const npc of this.staticNpcEntities.values()) {
      if (!npc.sprite.visible) {
        continue;
      }
      const centerX = npc.sprite.x;
      const centerY = npc.sprite.y - 10;
      const dx = (x - centerX) / npc.blockerRadiusX;
      const dy = (y - centerY) / npc.blockerRadiusY;
      if (dx * dx + dy * dy <= 1) {
        return true;
      }
    }
    return false;
  }

  private isBlockedByRuntimeProp(x: number, y: number): boolean {
    for (const blocker of this.propBlockers) {
      if (
        x >= blocker.left &&
        x <= blocker.right &&
        y >= blocker.top &&
        y <= blocker.bottom
      ) {
        return true;
      }
    }
    return false;
  }

  private findNearestWalkablePosition(
    x: number,
    y: number,
    preferred?: { x: number; y: number },
  ): { x: number; y: number } {
    const clampedX = Phaser.Math.Clamp(x, this.worldMinX, this.worldMaxX);
    const clampedY = Phaser.Math.Clamp(y, this.worldMinY, this.worldMaxY);
    if (!this.isBlockedAtWorldPosition(clampedX, clampedY)) {
      return { x: clampedX, y: clampedY };
    }

    const tileSize = this.collisionLayer?.tilemap.tileWidth ?? 32;
    const step = Math.max(8, Math.floor(tileSize / 2));
    const maxRings = 12;

    for (let ring = 1; ring <= maxRings; ring += 1) {
      let bestCandidate: { x: number; y: number } | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let oy = -ring; oy <= ring; oy += 1) {
        for (let ox = -ring; ox <= ring; ox += 1) {
          if (Math.abs(ox) !== ring && Math.abs(oy) !== ring) {
            continue;
          }
          const nx = Phaser.Math.Clamp(clampedX + ox * step, this.worldMinX, this.worldMaxX);
          const ny = Phaser.Math.Clamp(clampedY + oy * step, this.worldMinY, this.worldMaxY);
          if (this.isBlockedAtWorldPosition(nx, ny)) {
            continue;
          }
          const fallbackDistance = Phaser.Math.Distance.Between(nx, ny, clampedX, clampedY);
          const preferredDistance = preferred
            ? Phaser.Math.Distance.Between(nx, ny, preferred.x, preferred.y)
            : 0;
          const score = fallbackDistance * 1000 + preferredDistance;
          if (score < bestScore) {
            bestScore = score;
            bestCandidate = { x: nx, y: ny };
          }
        }
      }
      if (bestCandidate) {
        return bestCandidate;
      }
    }

    return { x: clampedX, y: clampedY };
  }

  // ---------------------------------------------------------------------------
  // Private — WS send helpers
  // ---------------------------------------------------------------------------

  private tryPickupLoot(dropId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const msg: WorldClientMessage = {
      type: "pickup_loot",
      payload: { dropId },
    };
    this.ws.send(JSON.stringify(msg));
  }

  private trySendMove(nowMs: number): void {
    if (!this.entityRenderer.local || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (nowMs - this.lastMoveSentAt < MOVE_SEND_INTERVAL_MS) {
      return;
    }
    this.lastMoveSentAt = nowMs;
    const msg: WorldClientMessage = {
      type: "move",
      payload: {
        x: this.entityRenderer.local.sprite.x,
        y: this.entityRenderer.local.sprite.y,
      },
    };
    this.ws.send(JSON.stringify(msg));
  }

  private requestBasicAttack(): void {
    if (
      this.dialogueState ||
      this.craftingSystem.isPanelOpen() ||
      this.craftingSystem.isBusy() ||
      this.gatheringSystem?.isBusy() ||
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      this.entityRenderer.mobs.size === 0
    ) {
      return;
    }
    if (!this.entityRenderer.local || this.entityRenderer.local.dead) {
      return;
    }

    const targetMobId = this.entityRenderer.currentTargetMobId;
    if (!targetMobId) {
      return;
    }

    const target = this.entityRenderer.mobs.get(targetMobId);
    if (target) {
      const facing = this.entityRenderer.facingFromDelta(
        target.sprite.x - this.entityRenderer.local.sprite.x,
        target.sprite.y - this.entityRenderer.local.sprite.y,
        this.entityRenderer.local.facing,
      );
      this.entityRenderer.playAction(this.entityRenderer.local, "attack", {
        facing,
        force: true,
        lockForDuration: true,
      });
    }

    const msg: WorldClientMessage = {
      type: "attack",
      payload: { targetMobId },
    };
    this.ws.send(JSON.stringify(msg));
  }

  private requestSkillUse(): void {
    if (
      !this.skillSystem ||
      !this.entityRenderer.local ||
      this.entityRenderer.local.dead ||
      this.dialogueState ||
      this.npcPanelState ||
      this.craftingSystem.isPanelOpen()
    ) {
      return;
    }

    const level = this.progressionSnapshot?.level ?? 1;
    const activated = this.skillSystem.tryActivate(level);

    if (!activated) {
      const remaining = this.skillSystem.remainingCooldownMs();
      if (!this.skillSystem.isUnlocked(level)) {
        this.entityRenderer.showFloatingText(
          this.entityRenderer.local.sprite.x,
          this.entityRenderer.local.sprite.y - 36,
          `Lv.${this.skillSystem.definition?.unlockLevel ?? 5}`,
          COLOR_REJECT,
        );
        this.setTransientStatus("Habilidade bloqueada");
      } else if (remaining > 0) {
        const secs = Math.ceil(remaining / 1000);
        this.entityRenderer.showFloatingText(
          this.entityRenderer.local.sprite.x,
          this.entityRenderer.local.sprite.y - 36,
          `${secs}s`,
          COLOR_REJECT,
        );
        this.setTransientStatus("Em recarga");
      }
      return;
    }

    // Visual effect
    const x = this.entityRenderer.local.sprite.x;
    const y = this.entityRenderer.local.sprite.y;
    const facing = this.resolveSkillFacing();
    this.entityRenderer.playAction(this.entityRenderer.local, "attack", {
      facing,
      force: true,
      lockForDuration: true,
    });
    this.entityRenderer.spawnSkillEffect(activated, x, y, facing);

    // Base class skills
    const impactRadius = this.skillSystem.definition?.impactRadius ?? 0;
    if (activated === "warrior_battle_cry") {
      this.cameras.main.flash(260, 255, 194, 90, false);
      this.requestAoeAttack(activated, impactRadius);
    } else if (activated === "rogue_shadow_step") {
      this.cameras.main.flash(170, 120, 170, 210, false);
      this.requestAoeAttack(activated, impactRadius);
    } else if (activated === "mage_arcane_blast") {
      this.cameras.main.flash(300, 80, 40, 180, false);
      this.requestAoeAttack(activated, impactRadius);
    } else if (activated === "archer_rain_of_arrows") {
      this.cameras.main.flash(350, 230, 120, 40, false);
      this.requestAoeAttack(activated, impactRadius);
    }

    // Send WS notification (server can handle or ignore)
    if (this.ws && this.ws.readyState === WebSocket.OPEN && impactRadius <= 0) {
      const msg: WorldClientMessage = {
        type: "use_skill",
        payload: { skillId: activated as SkillId },
      };
      this.ws.send(JSON.stringify(msg));
    }

    const name = this.skillSystem.definition?.name ?? "Habilidade";
    this.initData.hud.pushFeedMessage(`${name} ativada!`, "system");
    this.setTransientStatus(name);
  }

  /** Resolve an offensive class skill server-side in one authoritative AOE message. */
  private requestAoeAttack(skillId: SkillId, radius: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (radius <= 0) {
      const msg: WorldClientMessage = { type: "use_skill", payload: { skillId } };
      this.ws.send(JSON.stringify(msg));
      return;
    }
    const msg: WorldClientMessage = { type: "aoe_attack", payload: { skillId } };
    this.ws.send(JSON.stringify(msg));
  }

  // ---------------------------------------------------------------------------
  // Private — resolve helpers
  // ---------------------------------------------------------------------------

  private resolveCharacterClass(classId: string): CharacterClassId {
    if (KNOWN_PLAYER_VISUALS.has(classId as PlayerVisualKey)) {
      return classId as CharacterClassId;
    }
    return "warrior";
  }

  private resolveAttackStyle(
    entity: RenderedEntity | null,
  ): "melee" | "ranged" {
    if (!entity || entity.kind !== "player") {
      return "melee";
    }
    return playerAttackProfileForClass(entity.visual as CharacterClassId).style;
  }

  private resolveSkillFacing(): Facing {
    const local = this.entityRenderer.local;
    if (!local) {
      return "right";
    }
    const targetMobId = this.entityRenderer.currentTargetMobId;
    const target = targetMobId ? this.entityRenderer.mobs.get(targetMobId) : null;
    if (!target) {
      return local.facing;
    }
    return this.entityRenderer.facingFromDelta(
      target.sprite.x - local.sprite.x,
      target.sprite.y - local.sprite.y,
      local.facing,
    );
  }
}
