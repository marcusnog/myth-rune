import Phaser from "phaser";
import type { WeatherSystem, WeatherType } from "../weather/weatherSystem";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BiomeType = "forest" | "snow" | "blizzard" | "village" | "lake" | "mountain";

export interface BiomeZone {
  type: BiomeType;
  /** Pixel bounds relative to worldMinX / worldMinY */
  relX: number;
  relY: number;
  relWidth: number;
  relHeight: number;
  weather: WeatherType;
  /** Hex color tint overlay, null for none */
  tint: number | null;
  tintAlpha: number;
  label: string;
}

// ─── Zone Definitions ─────────────────────────────────────────────────────────
// Coordinates are in map-pixels relative to worldMinX/worldMinY.
// The map is typically ~4096×4096px (128×128 tiles × 32px).
// The player spawns near map-center (tile 64,64 = relX~2048, relY~2048).
// Snow biome is in the northern portion (low relY).

export const BIOME_ZONES: readonly BiomeZone[] = [
  {
    type: "mountain",
    // Northern mountain range (collision ring)
    relX: 128, relY: 64, relWidth: 704, relHeight: 736,
    weather: "snow",
    tint: 0x8b9ba8,
    tintAlpha: 0.22,
    label: "Montanhas Geladas",
  },
  {
    type: "blizzard",
    // Upper-left corner — deepest snow zone
    relX: 0,
    relY: 0,
    relWidth: 1664,
    relHeight: 896,
    weather: "blizzard",
    tint: 0x7fafc8,
    tintAlpha: 0.28,
    label: "Tempestade Polar",
  },
  {
    type: "snow",
    // Full northern strip (excluding blizzard overlap above)
    relX: 0,
    relY: 0,
    relWidth: 4096,
    relHeight: 1088,
    weather: "snow",
    tint: 0x9bbcde,
    tintAlpha: 0.18,
    label: "Terras de Gelo",
  },
  {
    type: "lake",
    // Southeast lake
    relX: 2816, relY: 2816, relWidth: 768, relHeight: 768,
    weather: "light_rain",
    tint: 0x6b8fa0,
    tintAlpha: 0.15,
    label: "Lago da Neblina",
  },
];

// ─── BiomeSystem ──────────────────────────────────────────────────────────────

export class BiomeSystem {
  private currentBiome: BiomeType = "forest";
  private overlay: Phaser.GameObjects.Rectangle | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly weatherSystem: WeatherSystem,
    private readonly worldMinX: number,
    private readonly worldMinY: number,
    private readonly onBiomeEnter: (biome: BiomeType, label: string) => void,
  ) {}

  /** Call each frame with the local player's world-space position. */
  update(playerX: number, playerY: number): void {
    const relX = playerX - this.worldMinX;
    const relY = playerY - this.worldMinY;

    let matched: BiomeZone | null = null;
    for (const zone of BIOME_ZONES) {
      if (
        relX >= zone.relX &&
        relX < zone.relX + zone.relWidth &&
        relY >= zone.relY &&
        relY < zone.relY + zone.relHeight
      ) {
        matched = zone;
        break; // zones are ordered priority-first
      }
    }

    const newBiome: BiomeType = matched?.type ?? "forest";
    if (newBiome === this.currentBiome) return;

    this.currentBiome = newBiome;
    this.applyBiome(matched);
    this.onBiomeEnter(newBiome, matched?.label ?? "");
  }

  get current(): BiomeType {
    return this.currentBiome;
  }

  destroy(): void {
    this.overlay?.destroy();
    this.overlay = null;
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private applyBiome(zone: BiomeZone | null): void {
    const weather = zone?.weather ?? "none";
    this.weatherSystem.transitionTo(weather, 2500);
    this.applyTintOverlay(zone?.tint ?? null, zone?.tintAlpha ?? 0);
  }

  private applyTintOverlay(tint: number | null, alpha: number): void {
    const cam = this.scene.cameras.main;
    const vw = cam.width;
    const vh = cam.height;

    if (!tint || alpha <= 0) {
      if (this.overlay) {
        this.scene.tweens.add({
          targets: this.overlay,
          alpha: 0,
          duration: 2000,
          onComplete: () => this.overlay?.setVisible(false),
        });
      }
      return;
    }

    if (!this.overlay) {
      this.overlay = this.scene.add
        .rectangle(vw / 2, vh / 2, vw + 80, vh + 80, tint, 0)
        .setScrollFactor(0)
        .setDepth(49997);
    } else {
      this.overlay.setFillStyle(tint, 0);
    }

    this.overlay.setVisible(true);
    this.scene.tweens.add({
      targets: this.overlay,
      alpha,
      duration: 2500,
    });
  }
}
