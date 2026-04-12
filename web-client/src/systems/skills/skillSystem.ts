import Phaser from "phaser";
import {
  SKILL_DEFINITIONS,
  skillForClass,
  type SkillDefinition,
  type SkillId,
} from "@myth-of-rune/shared";
import type { CharacterClassId } from "@myth-of-rune/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveBuff {
  type: "speed" | "combat";
  endsAtMs: number;
  /** Multiplicative modifier applied on top of base stat. */
  multiplier: number;
}

// ─── SkillSystem ──────────────────────────────────────────────────────────────

export class SkillSystem {
  public readonly skillId: SkillId | null;
  public readonly definition: SkillDefinition | null;

  private lastUsedAt = 0;
  private activeBuff: ActiveBuff | null = null;

  /** Phaser-side cooldown arc graphic (fixed to camera). */
  private overlayContainer: Phaser.GameObjects.Container | null = null;
  private cooldownArc: Phaser.GameObjects.Graphics | null = null;
  private readyGlow: Phaser.GameObjects.Graphics | null = null;
  private skillLabel: Phaser.GameObjects.Text | null = null;
  private cooldownText: Phaser.GameObjects.Text | null = null;
  private keyLabel: Phaser.GameObjects.Text | null = null;
  private lockedOverlay: Phaser.GameObjects.Text | null = null;
  private wasReady = false;

  constructor(
    classId: CharacterClassId,
    private readonly scene: Phaser.Scene,
  ) {
    this.skillId = skillForClass(classId);
    this.definition = this.skillId ? SKILL_DEFINITIONS[this.skillId] : null;
    if (this.definition) {
      this.buildOverlay();
    }
  }

  // ── Gameplay ─────────────────────────────────────────────────────────────────

  get speedMultiplier(): number {
    if (
      this.activeBuff?.type === "speed" &&
      this.scene.time.now < this.activeBuff.endsAtMs
    ) {
      return this.activeBuff.multiplier;
    }
    return 1;
  }

  isUnlocked(level: number): boolean {
    return !!this.definition && level >= this.definition.unlockLevel;
  }

  canActivate(level: number): boolean {
    if (!this.definition || !this.isUnlocked(level)) return false;
    return this.scene.time.now - this.lastUsedAt >= this.definition.cooldownMs;
  }

  /** Returns the skill ID if activated, null if blocked. */
  tryActivate(level: number): SkillId | null {
    if (!this.canActivate(level) || !this.skillId || !this.definition) return null;

    this.lastUsedAt = this.scene.time.now;

    if (this.definition.effectType === "mobility") {
      this.activeBuff = {
        type: "speed",
        endsAtMs: this.scene.time.now + this.definition.buffDurationMs,
        multiplier: this.definition.buffMultiplier ?? 2.0,
      };
    } else if (this.definition.effectType === "buff") {
      this.activeBuff = {
        type: "combat",
        endsAtMs: this.scene.time.now + this.definition.buffDurationMs,
        multiplier: this.definition.buffMultiplier ?? 1.35,
      };
    }

    return this.skillId;
  }

  /** Must be called each frame. Returns true if the skill just became ready. */
  update(level: number): boolean {
    if (this.activeBuff && this.scene.time.now >= this.activeBuff.endsAtMs) {
      this.activeBuff = null;
    }
    this.refreshOverlay(level);

    const isReady = this.canActivate(level);
    const justReady = isReady && !this.wasReady;
    this.wasReady = isReady;
    return justReady;
  }

  remainingCooldownMs(): number {
    if (!this.definition) return 0;
    return Math.max(0, this.definition.cooldownMs - (this.scene.time.now - this.lastUsedAt));
  }

  destroy(): void {
    this.overlayContainer?.destroy();
    this.overlayContainer = null;
    this.cooldownArc = null;
    this.readyGlow = null;
    this.skillLabel = null;
    this.cooldownText = null;
    this.keyLabel = null;
    this.lockedOverlay = null;
  }

  // ── Overlay ───────────────────────────────────────────────────────────────────

  private buildOverlay(): void {
    if (!this.definition) return;
    const cam = this.scene.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height - 54;

    this.overlayContainer = this.scene.add
      .container(cx, cy)
      .setScrollFactor(0)
      .setDepth(60000);

    // Background box
    const bg = this.scene.add
      .rectangle(0, 0, 88, 36, 0x0a0e14, 0.82)
      .setStrokeStyle(1.5, 0x2a3a52, 0.9);
    this.overlayContainer.add(bg);

    // Cooldown arc (drawn each frame)
    this.cooldownArc = this.scene.add.graphics();
    this.overlayContainer.add(this.cooldownArc);

    // Ready glow
    this.readyGlow = this.scene.add.graphics();
    this.overlayContainer.add(this.readyGlow);

    // Key label "[Q]"
    this.keyLabel = this.scene.add
      .text(-38, 0, "[Q]", {
        fontFamily: "IBM Plex Mono",
        fontSize: "9px",
        color: "#8cb0d0",
      })
      .setOrigin(0.5);
    this.overlayContainer.add(this.keyLabel);

    // Skill name
    this.skillLabel = this.scene.add
      .text(8, -8, this.definition.name, {
        fontFamily: "IBM Plex Mono",
        fontSize: "9px",
        color: this.definition.color,
      })
      .setOrigin(0, 0.5);
    this.overlayContainer.add(this.skillLabel);

    // Cooldown countdown text
    this.cooldownText = this.scene.add
      .text(8, 6, "", {
        fontFamily: "IBM Plex Mono",
        fontSize: "9px",
        color: "#aaaaaa",
      })
      .setOrigin(0, 0.5);
    this.overlayContainer.add(this.cooldownText);

    // Locked overlay
    this.lockedOverlay = this.scene.add
      .text(0, 0, "BLOQ", {
        fontFamily: "IBM Plex Mono",
        fontSize: "10px",
        color: "#555555",
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.overlayContainer.add(this.lockedOverlay);
  }

  private refreshOverlay(level: number): void {
    if (!this.overlayContainer || !this.definition) return;
    const unlocked = this.isUnlocked(level);
    const remaining = this.remainingCooldownMs();
    const ratio = remaining / this.definition.cooldownMs;
    const ready = remaining <= 0 && unlocked;

    // Cooldown text
    if (this.cooldownText) {
      if (!unlocked) {
        this.cooldownText.setText(`Lv.${this.definition.unlockLevel}`);
        this.cooldownText.setColor("#555555");
      } else if (ready) {
        this.cooldownText.setText("Pronto!");
        this.cooldownText.setColor("#7fff9a");
      } else {
        const secs = Math.ceil(remaining / 1000);
        this.cooldownText.setText(`${secs}s`);
        this.cooldownText.setColor("#aaaaaa");
      }
    }

    // Cooldown arc
    if (this.cooldownArc) {
      this.cooldownArc.clear();
      if (!ready && unlocked && remaining > 0) {
        this.cooldownArc.lineStyle(2, 0x3a5a7a, 0.4);
        this.cooldownArc.beginPath();
        this.cooldownArc.arc(-36, 0, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, false);
        this.cooldownArc.strokePath();
        this.cooldownArc.lineStyle(2, 0x7ab8e0, 0.9);
        this.cooldownArc.beginPath();
        this.cooldownArc.arc(-36, 0, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - ratio), false);
        this.cooldownArc.strokePath();
      }
    }

    // Ready glow
    if (this.readyGlow) {
      this.readyGlow.clear();
      if (ready) {
        const pulse = 0.5 + Math.sin(this.scene.time.now / 220) * 0.5;
        this.readyGlow.lineStyle(2.5, Phaser.Display.Color.HexStringToColor(this.definition.color).color, pulse);
        this.readyGlow.strokeRect(-42, -16, 84, 32);
      }
    }

    // Locked dim
    if (this.lockedOverlay) {
      this.lockedOverlay.setVisible(!unlocked);
    }
  }
}
