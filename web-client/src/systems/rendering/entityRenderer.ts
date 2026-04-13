import Phaser from "phaser";
import { MOB_PRESENTATION } from "../../data/mobs";
import type { ResourceGatherFeedback } from "../../data/resources";
import type { ResourceNodeEntity } from "../../entities/resourceNodes/resourceNode";
import {
  KNOWN_PLAYER_VISUALS,
  VISUAL_SPECS,
  type Facing,
  type DirectionalAction,
  type DirectionalAnimSpec,
  type GatherAction,
  type SingleAction,
  type SingleAnimSpec,
  type VisualRenderSpec,
  type VisualKey,
  type PlayerVisualKey,
} from "../../data/sprites";
import type { MobType } from "@myth-of-rune/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnimAction = DirectionalAction | GatherAction | SingleAction;

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
        this.registerDirectionalAnimationSet(visual, action, spec.directional[action]);
      }
      for (const action of Object.keys(spec.gather ?? {}) as GatherAction[]) {
        const directional = spec.gather?.[action];
        if (!directional) continue;
        this.registerDirectionalAnimationSet(visual, action, directional);
      }
      for (const action of ["hurt", "death"] as SingleAction[]) {
        const single = spec.single[action];
        const key = this.animKey(visual, action);
        if (this.scene.anims.exists(key)) continue;
        const frames = this.singleFrameRefs(spec.textureKey, spec.columns, single);
        this.scene.anims.create({
          key,
          frames,
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
    const render = this.renderSpecFor(params.visual);
    const shadow = this.scene.add.ellipse(
      params.x,
      params.y + render.shadowOffsetY,
      render.shadowWidth,
      render.shadowHeight,
      0x000000,
      0.3,
    );
    const sprite = this.scene.add.sprite(params.x, params.y, spec.textureKey);
    sprite.setScale(spec.scale);
    sprite.setOrigin(render.originX, render.originY);

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
        .circle(params.x, params.y + render.indicatorOffsetY, 13, 0x000000, 0)
        .setStrokeStyle(1.5, 0x9cf5cb, 0.9);
    }

    if (params.name) {
      entity.nameTag = this.scene.add
        .text(params.x, params.y + render.nameTagOffsetY, params.name, {
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
    const render = this.renderSpecFor(entity.visual);
    entity.sprite.setPosition(x, y);
    entity.shadow.setPosition(x, y + render.shadowOffsetY);
    entity.indicator?.setPosition(x, y + render.indicatorOffsetY);
    entity.nameTag?.setPosition(x, y + render.nameTagOffsetY);
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
    action: GatherAction,
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

    entity.sprite.setFlipX(
      action === "hurt" || action === "death"
        ? false
        : this.resolveDirectionalFlipX(entity.visual, action, facing),
    );
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

  public flashEntity(entity: RenderedEntity, heavy = false): void {
    // White flash first, then brief red damage tint
    entity.sprite.setTintFill(0xffffff);
    const whiteDuration = heavy ? 150 : 110;
    this.scene.time.delayedCall(whiteDuration, () => {
      if (!entity.sprite.active) return;
      entity.sprite.setTint(0xff8888);
      this.scene.time.delayedCall(80, () => {
        if (entity.sprite.active) entity.sprite.clearTint();
      });
    });
  }

  /**
   * Push the entity's sprite briefly in the direction away from `fromX/fromY`.
   * Only tweens the sprite — shadow and other elements follow on the next position update.
   */
  public knockbackEntity(entity: RenderedEntity, fromX: number, fromY: number): void {
    const dx = entity.sprite.x - fromX;
    const dy = entity.sprite.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const dist = 8;
    const origX = entity.sprite.x;
    const origY = entity.sprite.y;

    this.scene.tweens.add({
      targets: entity.sprite,
      x: origX + (dx / len) * dist,
      y: origY + (dy / len) * dist,
      duration: 55,
      ease: "Quad.Out",
      yoyo: true,
      onComplete: () => {
        if (entity.sprite.active) entity.sprite.setPosition(origX, origY);
      },
    });
  }

  public showFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    large = false,
  ): void {
    const fontSize = large ? "17px" : "12px";
    const strokeThickness = large ? 4 : 3;
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: "IBM Plex Mono",
        fontSize,
        color,
        stroke: "#1a1310",
        strokeThickness,
      })
      .setOrigin(0.5)
      .setDepth(y - this.getWorldMinY() + 52);

    if (large) {
      label.setScale(0.6);
      this.scene.tweens.add({
        targets: label,
        y: y - 26,
        alpha: 0,
        scaleX: 1.3,
        scaleY: 1.3,
        ease: "Cubic.Out",
        duration: 680,
        onComplete: () => label.destroy(),
      });
    } else {
      this.scene.tweens.add({
        targets: label,
        y: y - 16,
        alpha: 0,
        ease: "Cubic.Out",
        duration: 450,
        onComplete: () => label.destroy(),
      });
    }
  }

  public spawnArcaneProjectile(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): number {
    const distance = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
    const duration = Phaser.Math.Clamp((distance / 520) * 1000, 130, 420);
    const depth = Math.max(fromY, toY) - this.getWorldMinY() + 40;

    const orb = this.scene.add.graphics();
    orb.setPosition(fromX, fromY - 10).setDepth(depth);
    orb.fillStyle(0xcab8ff, 0.95);
    orb.fillCircle(0, 0, 7);
    orb.fillStyle(0x7dd3fc, 0.9);
    orb.fillCircle(0, 0, 4);

    const halo = this.scene.add.graphics();
    halo.setPosition(fromX, fromY - 10).setDepth(depth - 0.1);
    halo.lineStyle(2, 0x8b5cf6, 0.8);
    halo.strokeCircle(0, 0, 10);

    for (let i = 0; i < 6; i++) {
      this.scene.time.delayedCall(i * 28, () => {
        if (!orb.active) return;
        const mote = this.scene.add.graphics();
        mote.setPosition(orb.x, orb.y).setDepth(depth - 0.2);
        mote.fillStyle(i % 2 === 0 ? 0x93c5fd : 0xa78bfa, 0.75);
        mote.fillCircle(0, 0, 2.5);
        this.scene.tweens.add({
          targets: mote,
          alpha: 0,
          scaleX: 0.2,
          scaleY: 0.2,
          duration: 180,
          ease: "Quad.Out",
          onComplete: () => mote.destroy(),
        });
      });
    }

    this.scene.tweens.add({
      targets: [orb, halo],
      x: toX,
      y: toY - 10,
      duration,
      ease: "Cubic.Out",
      onComplete: () => {
        orb.destroy();
        halo.destroy();
      },
    });

    this.scene.tweens.add({
      targets: halo,
      scaleX: 0.45,
      scaleY: 0.45,
      alpha: 0.35,
      duration: 120,
      yoyo: true,
      repeat: Math.max(1, Math.floor(duration / 120)),
      ease: "Sine.InOut",
    });

    this.scene.time.delayedCall(duration, () => {
      const burst = this.scene.add.graphics();
      burst.setPosition(toX, toY - 10).setDepth(depth + 0.1);
      burst.lineStyle(2, 0x93c5fd, 0.95);
      burst.strokeCircle(0, 0, 10);
      burst.lineStyle(2, 0xc084fc, 0.9);
      for (const [dx, dy] of [
        [0, -14],
        [11, -5],
        [12, 8],
        [-10, -4],
        [-11, 9],
      ] as const) {
        burst.beginPath();
        burst.moveTo(0, 0);
        burst.lineTo(dx, dy);
        burst.strokePath();
      }
      this.scene.tweens.add({
        targets: burst,
        alpha: 0,
        scaleX: 1.6,
        scaleY: 1.6,
        duration: 180,
        ease: "Quad.Out",
        onComplete: () => burst.destroy(),
      });
    });

    return duration;
  }

  /** Spawn a class-skill visual burst at (x, y). */
  public spawnSkillEffect(
    skillId: string,
    x: number,
    y: number,
    facing: Facing = "right",
  ): void {
    const depth = y - this.getWorldMinY() + 55;

    if (skillId === "warrior_battle_cry") {
      this.spawnWarriorSkillEffect(x, y, depth);
    } else if (skillId === "mage_arcane_blast") {
      this.spawnMageSkillEffect(x, y, depth);
    } else if (skillId === "rogue_shadow_step") {
      this.spawnRogueSkillEffect(x, y, depth, facing);
    } else if (skillId === "archer_rain_of_arrows") {
      this.spawnArcherSkillEffect(x, y, depth);
    }
  }

  private spawnWarriorSkillEffect(x: number, y: number, depth: number): void {
    this.spawnBurstRings(x, y, depth, [0xe87c3c, 0xffd070], 2, 46);
    this.spawnSparks(x, y, depth, 0xffc05c, 10);
    for (let i = 0; i < 3; i++) {
      const slash = this.scene.add.graphics();
      slash.setPosition(x, y - 2).setDepth(depth + 0.2);
      slash.lineStyle(5, i % 2 === 0 ? 0x8fe7ff : 0xffd38a, 0.95);
      slash.beginPath();
      slash.arc(0, 0, 18 + i * 7, -1.2 + i * 0.7, 0.95 + i * 0.7, false);
      slash.strokePath();
      this.scene.tweens.add({
        targets: slash,
        angle: 95 + i * 20,
        alpha: 0,
        scaleX: 1.55,
        scaleY: 1.55,
        duration: 260 + i * 40,
        ease: "Cubic.Out",
        onComplete: () => slash.destroy(),
      });
    }
  }

  private spawnMageSkillEffect(x: number, y: number, depth: number): void {
    this.spawnBurstRings(x, y, depth, [0x8b5cf6, 0xc084fc], 3, 62);
    this.spawnSparks(x, y, depth, 0xc084fc, 12);

    const sigil = this.scene.add.graphics();
    sigil.setPosition(x, y + 4).setDepth(depth + 0.1);
    sigil.lineStyle(2, 0x93c5fd, 0.95);
    sigil.strokeCircle(0, 0, 24);
    sigil.strokeCircle(0, 0, 12);
    sigil.strokeRect(-17, -17, 34, 34);
    this.scene.tweens.add({
      targets: sigil,
      angle: 180,
      alpha: 0,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 520,
      ease: "Sine.Out",
      onComplete: () => sigil.destroy(),
    });

    for (let i = 0; i < 4; i++) {
      const orb = this.scene.add.graphics();
      const angle = (i / 4) * Math.PI * 2;
      orb.setPosition(x + Math.cos(angle) * 16, y - 8 + Math.sin(angle) * 16).setDepth(depth + 0.3);
      orb.fillStyle(i % 2 === 0 ? 0xc4b5fd : 0x7dd3fc, 1);
      orb.fillCircle(0, 0, 4);
      this.scene.tweens.add({
        targets: orb,
        x,
        y: y - 10,
        alpha: 0,
        duration: 240 + i * 30,
        ease: "Quad.Out",
        onComplete: () => orb.destroy(),
      });
    }
  }

  private spawnRogueSkillEffect(
    x: number,
    y: number,
    depth: number,
    facing: Facing,
  ): void {
    const dir = this.directionVectorForFacing(facing);
    this.spawnBurstRings(x, y, depth, [0x334155, 0x94a3b8], 2, 42);

    for (const rotation of [-35, 35]) {
      const slash = this.scene.add.graphics();
      slash.setPosition(x, y - 6).setDepth(depth + 0.25);
      slash.lineStyle(4, 0x8fe7ff, 0.95);
      slash.beginPath();
      slash.moveTo(-24, -12);
      slash.lineTo(24, 12);
      slash.strokePath();
      slash.angle = rotation;
      this.scene.tweens.add({
        targets: slash,
        alpha: 0,
        scaleX: 1.25,
        scaleY: 1.25,
        duration: 220,
        ease: "Quad.Out",
        onComplete: () => slash.destroy(),
      });
    }

    for (let i = 0; i < 5; i++) {
      const puff = this.scene.add.graphics();
      const ox = (Math.random() - 0.5) * 30;
      const oy = (Math.random() - 0.5) * 18;
      puff.setPosition(x + ox, y + oy).setDepth(depth);
      puff.fillStyle(0x0f172a, 0.68);
      puff.fillCircle(0, 0, 7 + Math.random() * 4);
      this.scene.tweens.add({
        targets: puff,
        x: puff.x + dir.x * 14,
        y: puff.y + dir.y * 10,
        alpha: 0,
        scaleX: 1.9,
        scaleY: 1.9,
        duration: 260 + i * 30,
        ease: "Quad.Out",
        onComplete: () => puff.destroy(),
      });
    }
  }

  private spawnArcherSkillEffect(x: number, y: number, depth: number): void {
    this.spawnBurstRings(x, y, depth, [0x4ade80, 0xa3e635], 2, 58);

    const marker = this.scene.add.graphics();
    marker.setPosition(x, y + 8).setDepth(depth + 0.05);
    marker.lineStyle(2, 0xb7f07a, 0.85);
    marker.strokeCircle(0, 0, 26);
    marker.beginPath();
    marker.moveTo(-20, 0);
    marker.lineTo(20, 0);
    marker.moveTo(0, -20);
    marker.lineTo(0, 20);
    marker.strokePath();
    this.scene.tweens.add({
      targets: marker,
      alpha: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 420,
      ease: "Quad.Out",
      onComplete: () => marker.destroy(),
    });

    for (let i = 0; i < 8; i++) {
      const ox = (Math.random() - 0.5) * 82;
      const startY = y - 50 - Math.random() * 28;
      const arrow = this.scene.add.graphics();
      arrow.setPosition(x + ox, startY).setDepth(depth + 0.2);
      arrow.lineStyle(2, 0x4ade80, 0.92);
      arrow.beginPath();
      arrow.moveTo(0, 0);
      arrow.lineTo(0, 18);
      arrow.lineTo(3, 12);
      arrow.strokePath();
      this.scene.tweens.add({
        targets: arrow,
        y: startY + 76,
        alpha: 0,
        duration: 260 + Math.random() * 140,
        delay: i * 35,
        ease: "Quad.In",
        onComplete: () => arrow.destroy(),
      });
    }
  }

  private spawnBurstRings(
    x: number,
    y: number,
    depth: number,
    colors: number[],
    count: number,
    maxRadius: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const ring = this.scene.add.graphics();
      ring.setPosition(x, y).setDepth(depth);
      ring.lineStyle(2.5, colors[i % colors.length]!, 1);
      ring.strokeCircle(0, 0, 14);
      this.scene.tweens.add({
        targets: ring,
        scaleX: maxRadius / 14,
        scaleY: maxRadius / 14,
        alpha: 0,
        duration: 420,
        delay: i * 80,
        ease: "Quad.Out",
        onComplete: () => ring.destroy(),
      });
    }
  }

  private spawnSparks(
    x: number,
    y: number,
    depth: number,
    color: number,
    count: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const spark = this.scene.add.graphics();
      spark.setPosition(x, y).setDepth(depth);
      spark.fillStyle(color, 1);
      spark.fillCircle(0, 0, 2.5);
      const dist = 38 + Math.random() * 24;
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 360,
        delay: Math.random() * 60,
        ease: "Quad.Out",
        onComplete: () => spark.destroy(),
      });
    }
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
    const gatherAction: GatherAction = node.definition.category;
    this.nextGatherAnimAt = this.scene.time.now + feedback.pulseIntervalMs;
    this.playAction(localEntity, gatherAction, { facing, force: true, lockForDuration: true });
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
    const render = this.renderSpecFor(definition.visualKey as VisualKey);
    const aura = this.scene.add
      .ellipse(x, y + render.mobAuraOffsetY, render.mobAuraWidth, render.mobAuraHeight, definition.auraColor, 0.15)
      .setStrokeStyle(1.5, 0xff5a5a, 0.45);
    const hpBarBack = this.scene.add
      .rectangle(x, y + render.hpBarOffsetY, 34, 5, 0x120707, 0.92)
      .setStrokeStyle(1, 0x3a1717, 0.9);
    const hpBarFill = this.scene.add
      .rectangle(x - 16, y + render.hpBarOffsetY, 32, 3, definition.hpBarColor, 0.96)
      .setOrigin(0, 0.5);
    const levelTag = this.scene.add
      .text(x, y + render.levelTagOffsetY, `Lv.${definition.level} ${definition.name}`, {
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
    const render = this.renderSpecFor(entity.visual);
    entity.mobUi.aura.setPosition(x, y + render.mobAuraOffsetY);
    entity.mobUi.hpBarBack.setPosition(x, y + render.hpBarOffsetY);
    entity.mobUi.hpBarFill.setPosition(x - 16, y + render.hpBarOffsetY);
    entity.mobUi.levelTag.setPosition(x, y + render.levelTagOffsetY);
  }

  private renderSpecFor(visual: VisualKey): Required<VisualRenderSpec> {
    const render = VISUAL_SPECS[visual].render;
    return {
      originX: render?.originX ?? 0.5,
      originY: render?.originY ?? 0.5,
      shadowOffsetY: render?.shadowOffsetY ?? 18,
      shadowWidth: render?.shadowWidth ?? 24,
      shadowHeight: render?.shadowHeight ?? 10,
      indicatorOffsetY: render?.indicatorOffsetY ?? 16,
      nameTagOffsetY: render?.nameTagOffsetY ?? -26,
      mobAuraOffsetY: render?.mobAuraOffsetY ?? 17,
      mobAuraWidth: render?.mobAuraWidth ?? 32,
      mobAuraHeight: render?.mobAuraHeight ?? 14,
      hpBarOffsetY: render?.hpBarOffsetY ?? -28,
      levelTagOffsetY: render?.levelTagOffsetY ?? -38,
    };
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
      return Math.ceil((this.singleFrameRefs(spec.textureKey, spec.columns, single).length / single.fps) * 1000);
    }
    const directional = this.resolveDirectionalSpec(visual, action);
    if (!directional) return 0;
    return Math.ceil(
      (this.directionalFrameRefs(spec.textureKey, spec.columns, directional, "right").length /
        directional.fps) *
        1000,
    );
  }

  private animKey(visual: VisualKey, action: DirectionalAction | GatherAction, facing: Facing): string;
  private animKey(visual: VisualKey, action: SingleAction): string;
  private animKey(visual: VisualKey, action: AnimAction, facing?: Facing): string {
    if (action === "hurt" || action === "death") return `${visual}:${action}`;
    return `${visual}:${action}:${facing ?? "right"}`;
  }

  private registerDirectionalAnimationSet(
    visual: VisualKey,
    action: DirectionalAction | GatherAction,
    directional: DirectionalAnimSpec,
  ): void {
    const spec = VISUAL_SPECS[visual];
    for (const facing of ["up", "down", "left", "right"] as Facing[]) {
      const key = this.animKey(visual, action, facing);
      if (this.scene.anims.exists(key)) continue;
      this.scene.anims.create({
        key,
        frames: this.directionalFrameRefs(spec.textureKey, spec.columns, directional, facing),
        frameRate: directional.fps,
        repeat: directional.loop ? -1 : 0,
      });
    }
  }

  private resolveDirectionalSpec(
    visual: VisualKey,
    action: DirectionalAction | GatherAction,
  ): DirectionalAnimSpec | null {
    const spec = VISUAL_SPECS[visual];
    if (action === "walk" || action === "idle" || action === "attack") {
      return spec.directional[action];
    }
    return spec.gather?.[action] ?? null;
  }

  private directionalFrameRefs(
    textureKey: string,
    columns: number,
    spec: DirectionalAnimSpec,
    facing: Facing,
  ): Phaser.Types.Animations.AnimationFrame[] {
    const sequence = spec.sequences?.[facing];
    if (sequence && sequence.length > 0) {
      return sequence.map((frame) => ({ key: textureKey, frame }));
    }

    const row = spec.rows?.[facing];
    const frames = spec.frames;
    if (typeof row !== "number" || typeof frames !== "number") {
      throw new Error(`Missing directional animation frames for ${textureKey}:${facing}`);
    }
    const start = row * columns;
    return this.scene.anims.generateFrameNumbers(textureKey, {
      start,
      end: start + frames - 1,
    });
  }

  private singleFrameRefs(
    textureKey: string,
    columns: number,
    spec: SingleAnimSpec,
  ): Phaser.Types.Animations.AnimationFrame[] {
    if (spec.sequence && spec.sequence.length > 0) {
      return spec.sequence.map((frame) => ({ key: textureKey, frame }));
    }

    if (typeof spec.row !== "number" || typeof spec.frames !== "number") {
      throw new Error(`Missing single animation frames for ${textureKey}`);
    }

    const start = spec.row * columns;
    return this.scene.anims.generateFrameNumbers(textureKey, {
      start,
      end: start + spec.frames - 1,
    });
  }

  private resolveDirectionalFlipX(
    visual: VisualKey,
    action: DirectionalAction | GatherAction,
    facing: Facing,
  ): boolean {
    return this.resolveDirectionalSpec(visual, action)?.flipX?.[facing] ?? false;
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
