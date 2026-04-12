import Phaser from "phaser";
import type { BiomeType } from "../biome/biomeSystem";

const PARTICLE_TEXTURE_KEY = "vfx:footstep-particle";
const MOVEMENT_THRESHOLD = 16;
const MIN_FRAME_DISTANCE = 0.35;
const STEP_DISTANCE = 18;
const FOOT_OFFSET = 5;
const FOOT_FORWARD_OFFSET = 1.5;
const FOOT_GROUND_Y_OFFSET = 18;
const FOOTPRINT_FADE_MS = 1900;
const MAX_FOOTPRINTS = 18;
const FOOTPRINT_PRIME_DISTANCE = STEP_DISTANCE * 0.5;

interface FootstepProfile {
  burstCount: number;
  particleTint: number;
  particleDepthOffset: number;
  footprintTint: number | null;
  footprintAlpha: number;
}

const FOOTSTEP_PROFILES: Record<BiomeType, FootstepProfile> = {
  forest: {
    burstCount: 5,
    particleTint: 0x7d6848,
    particleDepthOffset: -2.8,
    footprintTint: null,
    footprintAlpha: 0,
  },
  village: {
    burstCount: 4,
    particleTint: 0x9f9587,
    particleDepthOffset: -2.8,
    footprintTint: null,
    footprintAlpha: 0,
  },
  snow: {
    burstCount: 6,
    particleTint: 0xf5fbff,
    particleDepthOffset: -2.9,
    footprintTint: 0xd8e7f2,
    footprintAlpha: 0.45,
  },
  blizzard: {
    burstCount: 8,
    particleTint: 0xffffff,
    particleDepthOffset: -2.9,
    footprintTint: 0xe6f1f8,
    footprintAlpha: 0.52,
  },
};

export class FootstepSystem {
  private readonly groundEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly snowEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly footprints: Phaser.GameObjects.Ellipse[] = [];
  private lastX: number | null = null;
  private lastY: number | null = null;
  private distanceSinceStep = FOOTPRINT_PRIME_DISTANCE;
  private nextFoot: "left" | "right" = "left";

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly getBiome: () => BiomeType,
  ) {
    this.ensureParticleTexture();
    this.groundEmitter = this.scene.add.particles(0, 0, PARTICLE_TEXTURE_KEY, {
      emitting: false,
      quantity: 1,
      lifespan: { min: 180, max: 320 },
      speedX: { min: -20, max: 20 },
      speedY: { min: -58, max: -14 },
      gravityY: 140,
      alpha: { start: 0.5, end: 0 },
      scale: { start: 0.8, end: 0.2 },
      angle: { min: 200, max: 340 },
      rotate: { min: -90, max: 90 },
      blendMode: Phaser.BlendModes.NORMAL,
    });
    this.snowEmitter = this.scene.add.particles(0, 0, PARTICLE_TEXTURE_KEY, {
      emitting: false,
      quantity: 1,
      lifespan: { min: 260, max: 480 },
      speedX: { min: -24, max: 24 },
      speedY: { min: -66, max: -20 },
      gravityY: 95,
      alpha: { start: 0.72, end: 0 },
      scale: { start: 0.95, end: 0.28 },
      angle: { min: 200, max: 340 },
      rotate: { min: -120, max: 120 },
      blendMode: Phaser.BlendModes.NORMAL,
    });
  }

  /** Called every frame from WorldScene.update, after handleLocalMovement. */
  public update(playerX: number, playerY: number, vx: number, vy: number): void {
    if (this.lastX === null || this.lastY === null) {
      this.lastX = playerX;
      this.lastY = playerY;
      return;
    }

    const moveX = playerX - this.lastX;
    const moveY = playerY - this.lastY;
    const frameDistance = Math.hypot(moveX, moveY);
    const speed = Math.hypot(vx, vy);

    if (speed < MOVEMENT_THRESHOLD || frameDistance < MIN_FRAME_DISTANCE) {
      this.resetStride(playerX, playerY);
      return;
    }

    const dirX = vx / speed;
    const dirY = vy / speed;
    let traversed = 0;

    while (this.distanceSinceStep + (frameDistance - traversed) >= STEP_DISTANCE) {
      const needed = STEP_DISTANCE - this.distanceSinceStep;
      traversed += needed;
      const progress = Phaser.Math.Clamp(traversed / frameDistance, 0, 1);
      const baseX = Phaser.Math.Linear(this.lastX, playerX, progress);
      const baseY = Phaser.Math.Linear(this.lastY, playerY, progress);
      this.spawnFootstep(baseX, baseY, dirX, dirY);
      this.distanceSinceStep = 0;
    }

    this.distanceSinceStep += frameDistance - traversed;
    this.lastX = playerX;
    this.lastY = playerY;
  }

  public destroy(): void {
    this.groundEmitter.stop();
    this.snowEmitter.stop();
    this.groundEmitter.destroy();
    this.snowEmitter.destroy();

    for (const footprint of this.footprints) {
      this.scene.tweens.killTweensOf(footprint);
      footprint.destroy();
    }
    this.footprints.length = 0;
  }

  private ensureParticleTexture(): void {
    if (this.scene.textures.exists(PARTICLE_TEXTURE_KEY)) {
      return;
    }

    const gfx = this.scene.add.graphics();
    gfx.setVisible(false);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(4, 4, 4);
    gfx.generateTexture(PARTICLE_TEXTURE_KEY, 8, 8);
    gfx.destroy();
  }

  private resetStride(playerX: number, playerY: number): void {
    this.distanceSinceStep = FOOTPRINT_PRIME_DISTANCE;
    this.nextFoot = "left";
    this.lastX = playerX;
    this.lastY = playerY;
  }

  private spawnFootstep(baseX: number, baseY: number, dirX: number, dirY: number): void {
    const profile = FOOTSTEP_PROFILES[this.getBiome()];
    const footSign = this.nextFoot === "left" ? -1 : 1;
    const perpX = -dirY;
    const perpY = dirX;
    const stepX =
      baseX + perpX * FOOT_OFFSET * footSign + dirX * FOOT_FORWARD_OFFSET;
    const stepY =
      baseY +
      FOOT_GROUND_Y_OFFSET +
      perpY * FOOT_OFFSET * footSign +
      dirY * FOOT_FORWARD_OFFSET;
    const depth = this.toRelativeDepth(stepY);
    const emitter = profile.footprintTint === null ? this.groundEmitter : this.snowEmitter;

    emitter.setParticleTint(profile.particleTint);
    emitter.setDepth(depth + profile.particleDepthOffset);
    emitter.explode(profile.burstCount, stepX, stepY);

    if (profile.footprintTint !== null) {
      this.spawnFootprint(stepX, stepY, dirX, dirY, depth, profile);
    }

    this.nextFoot = this.nextFoot === "left" ? "right" : "left";
  }

  private spawnFootprint(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    depth: number,
    profile: FootstepProfile,
  ): void {
    const footprint = this.scene.add
      .ellipse(x, y, 8, 4, profile.footprintTint ?? 0xffffff, profile.footprintAlpha)
      .setAngle(Phaser.Math.RadToDeg(Math.atan2(dirY, dirX)))
      .setDepth(depth - 3.4);

    this.footprints.push(footprint);
    if (this.footprints.length > MAX_FOOTPRINTS) {
      const oldest = this.footprints.shift();
      if (oldest) {
        this.scene.tweens.killTweensOf(oldest);
        oldest.destroy();
      }
    }

    this.scene.tweens.add({
      targets: footprint,
      alpha: 0,
      scaleX: 0.72,
      scaleY: 0.72,
      duration: FOOTPRINT_FADE_MS,
      ease: "Quad.easeOut",
      onComplete: () => {
        const idx = this.footprints.indexOf(footprint);
        if (idx >= 0) {
          this.footprints.splice(idx, 1);
        }
        footprint.destroy();
      },
    });
  }

  private toRelativeDepth(worldY: number): number {
    const sceneWithWorldMinY = this.scene as Phaser.Scene & { worldMinY?: number };
    return worldY - (sceneWithWorldMinY.worldMinY ?? 0);
  }
}
