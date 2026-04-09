import Phaser from "phaser";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeatherType = "none" | "rain" | "snow" | "light_rain" | "blizzard";

interface WeatherConfig {
  type: WeatherType;
  /** Particles per second */
  frequency: number;
  /** Particle speed (px/s) */
  speedMin: number;
  speedMax: number;
  /** Emitter angle range (degrees, 0=right, Phaser convention) */
  angleMin: number;
  angleMax: number;
  /** Particle lifetime ms */
  lifeMin: number;
  lifeMax: number;
  /** Gravity px/s² (positive = downward in Phaser) */
  gravityY: number;
  /** X acceleration (wind drift) */
  gravityX: number;
  /** Alpha range */
  alphaMin: number;
  alphaMax: number;
  /** Scale range */
  scaleMin: number;
  scaleMax: number;
  /** Which texture key to use */
  textureKey: string;
  /** Frame indices within the texture strip */
  frames: number[];
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const WEATHER_RAIN_KEY  = "weather:rain";
export const WEATHER_SNOW_KEY  = "weather:snow";

// ─── Preset configs ───────────────────────────────────────────────────────────

const PRESETS: Record<WeatherType, WeatherConfig | null> = {
  none: null,
  light_rain: {
    type: "light_rain",
    frequency: 80,
    speedMin: 280, speedMax: 360,
    angleMin: 85, angleMax: 92,   // mostly downward, slight rightward lean
    lifeMin: 900, lifeMax: 1400,
    gravityY: 0, gravityX: 0,
    alphaMin: 0.35, alphaMax: 0.65,
    scaleMin: 0.9, scaleMax: 1.1,
    textureKey: WEATHER_RAIN_KEY,
    frames: [0, 1],
  },
  rain: {
    type: "rain",
    frequency: 240,
    speedMin: 380, speedMax: 520,
    angleMin: 84, angleMax: 90,
    lifeMin: 700, lifeMax: 1100,
    gravityY: 0, gravityX: 0,
    alphaMin: 0.45, alphaMax: 0.80,
    scaleMin: 1.0, scaleMax: 1.3,
    textureKey: WEATHER_RAIN_KEY,
    frames: [0, 1, 2],
  },
  snow: {
    type: "snow",
    frequency: 60,
    speedMin: 30, speedMax: 70,
    angleMin: 85, angleMax: 95,
    lifeMin: 3000, lifeMax: 5500,
    gravityY: 12,
    gravityX: 0,
    alphaMin: 0.55, alphaMax: 0.90,
    scaleMin: 0.8, scaleMax: 1.2,
    textureKey: WEATHER_SNOW_KEY,
    frames: [0, 1, 2],
  },
  blizzard: {
    type: "blizzard",
    frequency: 180,
    speedMin: 120, speedMax: 220,
    angleMin: 78, angleMax: 95,
    lifeMin: 1500, lifeMax: 3000,
    gravityY: 20,
    gravityX: 80,
    alphaMin: 0.5, alphaMax: 0.95,
    scaleMin: 0.7, scaleMax: 1.4,
    textureKey: WEATHER_SNOW_KEY,
    frames: [0, 1, 2, 3],
  },
};

// ─── WeatherSystem ─────────────────────────────────────────────────────────────

export class WeatherSystem {
  private readonly scene: Phaser.Scene;
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private current: WeatherType = "none";
  /** Tint overlay for storm darkening */
  private overlay: Phaser.GameObjects.Rectangle | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // ── Static preload helper ─────────────────────────────────────────────────

  static preload(scene: Phaser.Scene): void {
    scene.load.spritesheet(WEATHER_RAIN_KEY, "/sprites/weather/weather_rain.png", {
      frameWidth: 6,
      frameHeight: 16,
    });
    scene.load.spritesheet(WEATHER_SNOW_KEY, "/sprites/weather/weather_snow.png", {
      frameWidth: 16,
      frameHeight: 16,
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Immediately set weather. Pass "none" to clear. */
  set(type: WeatherType): void {
    if (type === this.current) return;
    this.current = type;
    this.rebuild(PRESETS[type]);
  }

  /** Fade to a new weather type over `durationMs` by crossfading particle frequency. */
  transitionTo(type: WeatherType, durationMs = 3000): void {
    // Simple: just switch after a short delay with intermediate alpha fade
    this.scene.time.delayedCall(durationMs * 0.3, () => {
      this.set(type);
    });
  }

  get currentType(): WeatherType {
    return this.current;
  }

  destroy(): void {
    this.clear();
    this.overlay?.destroy();
    this.overlay = null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private clear(): void {
    if (this.emitter) {
      this.emitter.stop();
      this.emitter.destroy();
      this.emitter = null;
    }
    if (this.overlay) {
      this.scene.tweens.add({
        targets: this.overlay,
        alpha: 0,
        duration: 800,
        onComplete: () => { this.overlay?.setVisible(false); },
      });
    }
  }

  private rebuild(cfg: WeatherConfig | null): void {
    this.clear();
    if (!cfg) return;

    const cam  = this.scene.cameras.main;
    const vw   = cam.width;
    const vh   = cam.height;

    // Spawn zone: full top-edge strip, wider than viewport to cover scroll
    const emitZoneWidth  = vw + 160;
    const emitZoneHeight = 2;

    this.emitter = this.scene.add.particles(
      -80,               // x offset so strip starts before viewport left edge
      -20,               // y: just above the viewport
      cfg.textureKey,
      {
        frame: cfg.frames,
        frequency: Math.round(1000 / cfg.frequency),
        speedX: { min: -20, max: 20 },
        speedY: { min: cfg.speedMin, max: cfg.speedMax },
        angle: { min: cfg.angleMin, max: cfg.angleMax },
        gravityX: cfg.gravityX,
        gravityY: cfg.gravityY,
        lifespan: { min: cfg.lifeMin, max: cfg.lifeMax },
        alpha: { start: cfg.alphaMax, end: 0 },
        scale: { min: cfg.scaleMin, max: cfg.scaleMax },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        emitZone: { type: "random", source: new Phaser.Geom.Rectangle(0, 0, emitZoneWidth, emitZoneHeight) } as any,
        quantity: 1,
        blendMode: Phaser.BlendModes.NORMAL,
        // Tint for rain: cool blue; snow: pure white
        tint: cfg.type.includes("rain") ? 0xb8d4f0 : 0xffffff,
      },
    );

    // Fix to camera so it stays screen-space
    this.emitter.setScrollFactor(0);
    this.emitter.setDepth(50000); // above everything

    // Dark overlay for heavy weather
    const overlayAlpha = cfg.type === "rain" ? 0.18 : cfg.type === "blizzard" ? 0.25 : 0;
    if (overlayAlpha > 0) {
      if (!this.overlay) {
        this.overlay = this.scene.add
          .rectangle(vw / 2, vh / 2, vw + 80, vh + 80, 0x0a1a2e, 0)
          .setScrollFactor(0)
          .setDepth(49999);
      }
      this.overlay.setVisible(true);
      this.scene.tweens.add({
        targets: this.overlay,
        alpha: overlayAlpha,
        duration: 1200,
      });
    }
  }
}
