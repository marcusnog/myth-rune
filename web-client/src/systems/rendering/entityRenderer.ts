import Phaser from "phaser";
import { MOB_PRESENTATION } from "../../data/mobs";
import type { ResourceGatherFeedback } from "../../data/resources";
import type { ResourceNodeEntity } from "../../entities/resourceNodes/resourceNode";
import {
  KNOWN_PLAYER_VISUALS,
  VISUAL_SPECS,
  type Facing,
  type DirectionalAction,
  type SingleAction,
  type VisualKey,
  type PlayerVisualKey,
} from "../../data/sprites";
import type { MobType } from "@myth-of-rune/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnimAction = DirectionalAction | SingleAction;

export interface MobUi {
  mobType: MobType;
  currentHp: number;
  maxHp: number;
  levelTag: Phaser.GameObjects.Text;
  hpBarBack: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  aura: Phaser.GameObjects.Ellipse;
}

export interface RenderedEntity {
  id: string;
  kind: "player" | "mob";
  visual: VisualKey;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  indicator?: Phaser.GameObjects.Arc;
  nameTag?: Phaser.GameObjects.Text;
  mobUi?: MobUi;
  facing: Facing;
  lockUntilMs: number;
  dead: boolean;
  lastX: number;
  lastY: number;
}

interface CreateEntityParams {
  id: string;
  kind: "player" | "mob";
  visual: VisualKey;
  x: number;
  y: number;
  isLocal?: boolean;
  name?: string;
  mobType?: MobType;
}

// ---------------------------------------------------------------------------
// EntityRenderer
// ---------------------------------------------------------------------------

export class EntityRenderer {
  public local: RenderedEntity | null = null;
  public readonly remotes = new Map<string, RenderedEntity>();
  public readonly mobs = new Map<string, RenderedEntity>();
  public readonly pendingDeadMobs = new Set<string>();
  public currentTargetMobId: string | null = null;

  // Gather animation state
  public gatherAnimKey: string | null = null;
  public nextGatherAnimAt = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly getWorldMinY: () => number,
  ) {}

  // -------------------------------------------------------------------------
  // Animation setup
  // -------------------------------------------------------------------------

  public ensureAnimationsRegistered(): void {
    for (const visual of Object.keys(VISUAL_SPECS) as VisualKey[]) {
      const spec = VISUAL_SPECS[visual];
      for (const action of ["walk", "idle", "attack"] as DirectionalAction[]) {
        const directional = spec.directional[action];
        for (const facing of ["up", "down", "left", "right"] as Facing[]) {
          const key = this.animKey(visual, action, facing);
          if (this.scene.anims.exists(key)) continue;
          const row = directional.rows[facing];
          const start = row * spec.columns;
          this.scene.anims.create({
            key,
            frames: this.scene.anims.generateFrameNumbers(spec.textureKey, {
              start,
              end: start + directional.frames - 1,
            }),
            frameRate: directional.fps,
            repeat: directional.loop ? -1 : 0,
          });
        }
      }
      for (const action of ["hurt", "death"] as SingleAction[]) {
        const single = spec.single[action];
        const key = this.animKey(visual, action);
        if (this.scene.anims.exists(key)) continue;
        const start = single.row * spec.columns;
        this.scene.anims.create({
          key,
          frames: this.scene.anims.generateFrameNumbers(spec.textureKey, {
            start,
            end: start + single.frames - 1,
          }),
          frameRate: single.fps,
          repeat: single.loop ? -1 : 0,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Entity lifecycle
  // -------------------------------------------------------------------------

  public createEntity(params: CreateEntityParams): RenderedEntity {
    const spec = VISUAL_SPECS[params.visual];
    const shadow = this.scene.add.ellipse(params.x, params.y + 18, 24, 10, 0x000000, 0.3);
    const sprite = this.scene.add.sprite(params.x, params.y, spec.textureKey);
    sprite.setScale(spec.scale);

    const entity: RenderedEntity = {
      id: params.id,
      kind: params.kind,
      visual: params.visual,
      sprite,
      shadow,
      facing: "right",
      lockUntilMs: 0,
      dead: false,
      lastX: params.x,
      lastY: params.y,
    };

    if (params.kind === "mob" && params.mobType) {
      entity.mobUi = this.createMobUi(params.mobType, params.x, params.y);
    }

    if (params.isLocal) {
      entity.indicator = this.scene.add
        .circle(params.x, params.y + 16, 13, 0x000000, 0)
        .setStrokeStyle(1.5, 0x9cf5cb, 0.9);
    }

    if (params.name) {
      entity.nameTag = this.scene.add
        .text(params.x, params.y - 26, params.name, {
          fontFamily: "IBM Plex Mono",
          fontSize: "10px",
          color: "#dce7ff",
          backgroundColor: "#0b122099",
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5);
    }

    this.setEntityPosition(entity, params.x, params.y);
    this.playAction(entity, "idle", { facing: "right", force: true });
    return entity;
  }

  public destroyEntity(entity: RenderedEntity): void {
    entity.shadow.destroy();
    entity.indicator?.destroy();
    entity.nameTag?.destroy();
    entity.mobUi?.levelTag.destroy();
    entity.mobUi?.hpBarBack.destroy();
    entity.mobUi?.hpBarFill.destroy();
    entity.mobUi?.aura.destroy();
    entity.sprite.destroy();
  }

  public destroyAll(): void {
    if (this.local) {
      this.destroyEntity(this.local);
      this.local = null;
    }
    for (const entity of this.remotes.values()) {
      this.destroyEntity(entity);
    }
    this.remotes.clear();
    for (const entity of this.mobs.values()) {
      this.destroyEntity(entity);
    }
    this.mobs.clear();
    this.pendingDeadMobs.clear();
  }

  // -------------------------------------------------------------------------
  // Positioning & depth
  // -------------------------------------------------------------------------

  public setEntityPosition(entity: RenderedEntity, x: number, y: number): void {
    entity.sprite.setPosition(x, y);
    entity.shadow.setPosition(x, y + 18);
    entity.indicator?.setPosition(x, y + 16);
    entity.nameTag?.setPosition(x, y - 26);
    this.positionMobUi(entity, x, y);

    const relativeY = y - this.getWorldMinY();
    entity.shadow.setDepth(relativeY - 2);
    entity.indicator?.setDepth(relativeY - 1.5);
    entity.sprite.setDepth(relativeY + 1);
    entity.nameTag?.setDepth(relativeY + 10);
    if (entity.mobUi) {
      entity.mobUi.aura.setDepth(relativeY - 1.7);
      entity.mobUi.hpBarBack.setDepth(relativeY + 9.2);
      entity.mobUi.hpBarFill.setDepth(relativeY + 9.3);
      entity.mobUi.levelTag.setDepth(relativeY + 9.4);
    }

    entity.lastX = x;
    entity.lastY = y;
  }

  // -------------------------------------------------------------------------
  // Animation
  // -------------------------------------------------------------------------

  public applyMotionVisual(
    entity: RenderedEntity,
    dx: number,
    dy: number,
    movingThreshold: number,
  ): void {
    if (entity.dead || this.scene.time.now < entity.lockUntilMs) return;
    const speed = Math.hypot(dx, dy);
    if (speed >= movingThreshold) {
      this.playAction(entity, "walk", { facing: this.facingFromDelta(dx, dy, entity.facing) });
      return;
    }
    this.playAction(entity, "idle", { facing: entity.facing });
  }

  public playAction(
    entity: RenderedEntity,
    action: DirectionalAction,
    options?: { facing?: Facing; force?: boolean; lockForDuration?: boolean },
  ): void;
  public playAction(
    entity: RenderedEntity,
    action: SingleAction,
    options?: { force?: boolean; lockForDuration?: boolean },
  ): void;
  public playAction(
    entity: RenderedEntity,
    action: AnimAction,
    options: { facing?: Facing; force?: boolean; lockForDuration?: boolean } = {},
  ): void {
    const facing =
      action === "hurt" || action === "death"
        ? entity.facing
        : (options.facing ?? entity.facing);
    entity.facing = facing;

    const key =
      action === "hurt" || action === "death"
        ? this.animKey(entity.visual, action)
        : this.animKey(entity.visual, action, facing);

    const current = entity.sprite.anims.currentAnim?.key;
    if (!options.force && current === key && entity.sprite.anims.isPlaying) return;

    entity.sprite.play(key, true);

    if (options.lockForDuration) {
      const duration = this.getAnimationDurationMs(entity.visual, action);
      entity.lockUntilMs = Math.max(entity.lockUntilMs, this.scene.time.now + duration);
    }
  }

  public facingFromDelta(dx: number, dy: number, fallback: Facing): Facing {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return fallback;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
    return dy >= 0 ? "down" : "up";
  }

  // -------------------------------------------------------------------------
  // Visual effects
  // -------------------------------------------------------------------------

  public playLevelUpEffect(x: number, y: number, level: number): void {
    this.scene.cameras.main.flash(700, 255, 220, 80, false);

    for (const delay of [0, 140]) {
      const ring = this.scene.add.graphics();
      ring.setPosition(x, y);
      ring.setDepth(y - this.getWorldMinY() + 50);
      ring.lineStyle(3, 0xffe480, 1);
      ring.strokeCircle(0, 0, 18);
      this.scene.tweens.add({
        targets: ring,
        scaleX: 3.8,
        scaleY: 3.8,
        alpha: 0,
        duration: 650,
        delay,
        ease: "Quad.Out",
        onComplete: () => ring.destroy(),
      });
    }

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const spark = this.scene.add.graphics();
      spark.setPosition(x, y);
      spark.setDepth(y - this.getWorldMinY() + 51);
      spark.fillStyle(0xffe480, 1);
      spark.fillCircle(0, 0, 3);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 48,
        y: y + Math.sin(angle) * 48,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 520,
        delay: 60,
        ease: "Quad.Out",
        onComplete: () => spark.destroy(),
      });
    }

    const label = this.scene.add
      .text(x, y - 32, `LEVEL ${level}!`, {
        fontFamily: "IBM Plex Mono",
        fontSize: "16px",
        color: "#ffe480",
        stroke: "#3a2000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(y - this.getWorldMinY() + 52);
    this.scene.tweens.add({
      targets: label,
      y: y - 76,
      alpha: 0,
      duration: 1200,
      ease: "Cubic.Out",
      onComplete: () => label.destroy(),
    });

    if (this.local) {
      const baseScaleX = this.local.sprite.scaleX;
      const baseScaleY = this.local.sprite.scaleY;
      this.scene.tweens.add({
        targets: this.local.sprite,
        scaleX: baseScaleX * 1.35,
        scaleY: baseScaleY * 1.35,
        duration: 200,
        ease: "Quad.Out",
        yoyo: true,
      });
    }
  }

  public flashEntity(entity: RenderedEntity): void {
    entity.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(120, () => {
      if (entity.sprite.active) entity.sprite.clearTint();
    });
  }

  public showFloatingText(x: number, y: number, text: string, color: string): void {
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: "IBM Plex Mono",
        fontSize: "12px",
        color,
        stroke: "#1a1310",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.scene.tweens.add({
      targets: label,
      y: y - 16,
      alpha: 0,
      ease: "Cubic.Out",
      duration: 450,
      onComplete: () => label.destroy(),
    });
  }

  // -------------------------------------------------------------------------
  // Mob UI
  // -------------------------------------------------------------------------

  public setMobHealth(entity: RenderedEntity, health: number): void {
    if (!entity.mobUi) return;
    entity.mobUi.currentHp = Phaser.Math.Clamp(health, 0, entity.mobUi.maxHp);
    const ratio = entity.mobUi.maxHp > 0 ? entity.mobUi.currentHp / entity.mobUi.maxHp : 0;
    entity.mobUi.hpBarFill.width = Math.max(0, Math.round(32 * ratio));
    entity.mobUi.hpBarBack.setVisible(!entity.dead);
    entity.mobUi.hpBarFill.setVisible(!entity.dead && ratio > 0);
    entity.mobUi.levelTag.setVisible(!entity.dead);
  }

  public refreshMobTargetUi(
    localX: number,
    localY: number,
    attackRange: number,
  ): void {
    this.currentTargetMobId = this.findPreferredMobTargetId(localX, localY, attackRange);
    const pulse = 1 + Math.sin(this.scene.time.now / 120) * 0.08;
    for (const [mobId, entity] of this.mobs.entries()) {
      const aura = entity.mobUi?.aura;
      if (!aura) continue;
      const isPrimaryTarget = mobId === this.currentTargetMobId && !entity.dead;
      aura.setVisible(!entity.dead);
      aura.setFillStyle(0xb81f28, isPrimaryTarget ? 0.26 : 0.11);
      aura.setStrokeStyle(1.5, 0xff6666, isPrimaryTarget ? 0.95 : 0.4);
      aura.setScale(isPrimaryTarget ? pulse : 1);
    }
  }

  // -------------------------------------------------------------------------
  // Gather effects
  // -------------------------------------------------------------------------

  public syncGatherAnimation(
    node: ResourceNodeEntity,
    localEntity: RenderedEntity,
  ): void {
    const { feedback } = node.definition;
    const key = `${node.definition.type}:${feedback.impactShape}:${feedback.pulseIntervalMs}`;
    if (this.gatherAnimKey !== key) {
      this.gatherAnimKey = key;
      this.nextGatherAnimAt = 0;
    }
    if (this.scene.time.now < this.nextGatherAnimAt) return;

    const facing = this.facingFromDelta(
      node.worldX - localEntity.sprite.x,
      node.worldY - localEntity.sprite.y,
      localEntity.facing,
    );
    this.nextGatherAnimAt = this.scene.time.now + feedback.pulseIntervalMs;
    this.playAction(localEntity, "attack", { facing, force: true, lockForDuration: true });
    this.spawnGatherSwingEffect(feedback, facing, localEntity.sprite);
    this.spawnGatherImpactEffect(feedback, node.worldX, node.worldY - 10);
    node.shakeTree();
    if (node.definition.category === "woodcutting") {
      this.spawnLeavesEffect(node.worldX, node.worldY - 20);
    }
  }

  private spawnLeavesEffect(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const leaf = this.scene.add.graphics();
      const ox = (Math.random() - 0.5) * 28;
      leaf.setPosition(x + ox, y);
      leaf.setDepth(y - this.getWorldMinY() + 5);
      leaf.fillStyle(0x4a8c2a, 0.9);
      leaf.fillRect(-2, -2, 4, 4);
      this.scene.tweens.add({
        targets: leaf,
        y: y + 30 + Math.random() * 16,
        x: leaf.x + (Math.random() - 0.5) * 22,
        alpha: 0,
        angle: (Math.random() - 0.5) * 100,
        duration: 400 + Math.random() * 200,
        delay: i * 55,
        ease: "Quad.In",
        onComplete: () => leaf.destroy(),
      });
    }
  }

  public clearGatherAnimation(): void {
    this.gatherAnimKey = null;
    this.nextGatherAnimAt = 0;
  }

  public spawnGatherSwingEffect(
    feedback: ResourceGatherFeedback,
    facing: Facing,
    localSprite: Phaser.GameObjects.Sprite,
  ): void {
    const swing = this.scene.add.graphics();
    const dir = this.directionVectorForFacing(facing);
    const isSparks = feedback.impactShape === "sparks";
    swing.setPosition(
      localSprite.x + dir.x * 14,
      localSprite.y - 10 + dir.y * 10,
    );
    swing.setDepth(localSprite.depth + 0.2);
    swing.lineStyle(isSparks ? 4 : 3, feedback.swingColor, 0.95);

    if (facing === "left" || facing === "right") {
      const start = facing === "right" ? -1.1 : Math.PI + 0.15;
      const end = facing === "right" ? 0.65 : Math.PI - 0.65;
      swing.beginPath();
      swing.arc(0, 0, isSparks ? 16 : 18, start, end, false);
      swing.strokePath();
    } else {
      const start = facing === "down" ? 0.2 : Math.PI;
      const end = facing === "down" ? Math.PI - 0.2 : Math.PI * 2 - 0.2;
      swing.beginPath();
      swing.arc(0, 0, isSparks ? 14 : 16, start, end, false);
      swing.strokePath();
    }

    this.scene.tweens.add({
      targets: swing,
      alpha: 0,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: isSparks ? 170 : 210,
      ease: "Cubic.Out",
      onComplete: () => swing.destroy(),
    });
  }

  public spawnGatherImpactEffect(
    feedback: ResourceGatherFeedback,
    x: number,
    y: number,
  ): void {
    const impact = this.scene.add.graphics();
    impact.setPosition(x, y);
    impact.setDepth(y - this.getWorldMinY() + 6);
    const isSparks = feedback.impactShape === "sparks";

    if (isSparks) {
      impact.lineStyle(2, feedback.impactColor, 0.95);
      for (const [dx, dy] of [
        [0, -10], [9, -4], [10, 6], [-8, -3], [-9, 7],
      ] as const) {
        impact.beginPath();
        impact.moveTo(0, 0);
        impact.lineTo(dx, dy);
        impact.strokePath();
      }
    } else {
      impact.fillStyle(feedback.impactColor, 0.95);
      for (const [dx, dy, size] of [
        [0, -8, 4], [8, -3, 3], [-7, -1, 3], [6, 6, 2], [-5, 7, 2],
      ] as const) {
        impact.fillRect(dx, dy, size, size);
      }
    }

    this.scene.tweens.add({
      targets: impact,
      alpha: 0,
      y: y - (isSparks ? 8 : 5),
      duration: isSparks ? 180 : 220,
      ease: "Quad.Out",
      onComplete: () => impact.destroy(),
    });
  }

  // -------------------------------------------------------------------------
  // Resolution helpers
  // -------------------------------------------------------------------------

  public resolveEntity(
    entityId: string,
    localId: string,
  ): RenderedEntity | null {
    if (this.local && this.local.id === entityId && this.local.id === localId) {
      return this.local;
    }
    return this.mobs.get(entityId) ?? this.remotes.get(entityId) ?? null;
  }

  public resolveMobVisual(mobType: MobType): VisualKey {
    const key = MOB_PRESENTATION[mobType]?.visualKey;
    if (key && key in VISUAL_SPECS) return key as VisualKey;
    return "goblin";
  }

  public resolvePlayerVisual(classId: string): PlayerVisualKey {
    if (KNOWN_PLAYER_VISUALS.has(classId as PlayerVisualKey)) {
      return classId as PlayerVisualKey;
    }
    return "warrior";
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private createMobUi(mobType: MobType, x: number, y: number): MobUi {
    const definition = MOB_PRESENTATION[mobType];
    const aura = this.scene.add
      .ellipse(x, y + 16, 32, 14, definition.auraColor, 0.15)
      .setStrokeStyle(1.5, 0xff5a5a, 0.45);
    const hpBarBack = this.scene.add
      .rectangle(x, y - 28, 34, 5, 0x120707, 0.92)
      .setStrokeStyle(1, 0x3a1717, 0.9);
    const hpBarFill = this.scene.add
      .rectangle(x - 16, y - 28, 32, 3, definition.hpBarColor, 0.96)
      .setOrigin(0, 0.5);
    const levelTag = this.scene.add
      .text(x, y - 38, `Lv.${definition.level} ${definition.name}`, {
        fontFamily: "IBM Plex Mono",
        fontSize: "10px",
        color: "#ffd8a8",
        stroke: "#140908",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    return {
      mobType,
      currentHp: definition.maxHealth,
      maxHp: definition.maxHealth,
      levelTag,
      hpBarBack,
      hpBarFill,
      aura,
    };
  }

  private positionMobUi(entity: RenderedEntity, x: number, y: number): void {
    if (!entity.mobUi) return;
    entity.mobUi.aura.setPosition(x, y + 17);
    entity.mobUi.hpBarBack.setPosition(x, y - 28);
    entity.mobUi.hpBarFill.setPosition(x - 16, y - 28);
    entity.mobUi.levelTag.setPosition(x, y - 38);
  }

  private findPreferredMobTargetId(
    localX: number,
    localY: number,
    range: number,
  ): string | null {
    if (!this.local || this.local.dead || this.mobs.size === 0) return null;

    let bestInRangeId: string | null = null;
    let bestInRangeDist = Number.POSITIVE_INFINITY;
    let fallbackId: string | null = null;
    let fallbackDist = Number.POSITIVE_INFINITY;

    for (const [mobId, entity] of this.mobs.entries()) {
      if (this.pendingDeadMobs.has(mobId) || entity.dead) continue;
      const dist = Phaser.Math.Distance.Between(localX, localY, entity.sprite.x, entity.sprite.y);
      if (dist < fallbackDist) {
        fallbackDist = dist;
        fallbackId = mobId;
      }
      if (dist <= range && dist < bestInRangeDist) {
        bestInRangeDist = dist;
        bestInRangeId = mobId;
      }
    }
    return bestInRangeId ?? fallbackId;
  }

  private getAnimationDurationMs(visual: VisualKey, action: AnimAction): number {
    const spec = VISUAL_SPECS[visual];
    if (action === "hurt" || action === "death") {
      const single = spec.single[action];
      return Math.ceil((single.frames / single.fps) * 1000);
    }
    const directional = spec.directional[action];
    return Math.ceil((directional.frames / directional.fps) * 1000);
  }

  private animKey(visual: VisualKey, action: DirectionalAction, facing: Facing): string;
  private animKey(visual: VisualKey, action: SingleAction): string;
  private animKey(visual: VisualKey, action: AnimAction, facing?: Facing): string {
    if (action === "hurt" || action === "death") return `${visual}:${action}`;
    return `${visual}:${action}:${facing ?? "right"}`;
  }

  private directionVectorForFacing(facing: Facing): { x: number; y: number } {
    switch (facing) {
      case "left":  return { x: -1, y:  0 };
      case "right": return { x:  1, y:  0 };
      case "up":    return { x:  0, y: -1 };
      case "down":  return { x:  0, y:  1 };
    }
  }
}
