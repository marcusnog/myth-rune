import Phaser from "phaser";
import {
  RESOURCE_NODE_DEFINITIONS,
  type ResourceNodeDefinition,
  type ResourceNodeMapConfig,
  type ResourceNodeState,
} from "../../data/resources";

interface ResourceNodeCreateParams {
  scene: Phaser.Scene;
  textureKey: string;
  worldMinX: number;
  worldMinY: number;
  tileWidth: number;
  tileHeight: number;
  config: ResourceNodeMapConfig;
}

export class ResourceNodeEntity {
  public readonly id: string;
  public readonly definition: ResourceNodeDefinition;
  public readonly tileX: number;
  public readonly tileY: number;
  public readonly gatherTimeMs: number;
  public readonly respawnTimeMs: number;
  public readonly yieldItemId: ResourceNodeDefinition["yieldItemId"];
  public readonly yieldAmount: number;
  public readonly maxQuantity: number;
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly relativeDepth: number;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly focusRing: Phaser.GameObjects.Ellipse;
  private readonly baseImages: Phaser.GameObjects.Image[] = [];
  private readonly topImages: Phaser.GameObjects.Image[] = [];
  private collectTween: Phaser.Tweens.Tween | null = null;
  private respawnTimer: Phaser.Time.TimerEvent | null = null;
  private state: ResourceNodeState = "available";
  private remainingQuantity: number;
  private focused = false;
  private shaking = false;

  public constructor(params: ResourceNodeCreateParams) {
    this.scene = params.scene;
    this.id = params.config.nodeId;
    this.definition = RESOURCE_NODE_DEFINITIONS[params.config.type];
    this.tileX = params.config.tileX;
    this.tileY = params.config.tileY;
    this.gatherTimeMs = params.config.gatherTimeMs;
    this.respawnTimeMs = params.config.respawnTimeMs;
    this.yieldItemId = params.config.yieldItemId ?? this.definition.yieldItemId;
    this.yieldAmount = params.config.yieldAmount ?? this.definition.yieldAmount;
    this.maxQuantity = params.config.quantity;
    this.remainingQuantity = params.config.quantity;
    this.worldX =
      params.worldMinX + (this.tileX + this.definition.footprintWidth / 2) * params.tileWidth;
    this.worldY = params.worldMinY + (this.tileY + 1) * params.tileHeight - 2;
    this.relativeDepth = this.worldY - params.worldMinY;

    this.shadow = params.scene.add
      .ellipse(
        this.worldX,
        this.worldY - 5,
        this.definition.shadowSize.width,
        this.definition.shadowSize.height,
        0x000000,
        0.28,
      )
      .setDepth(this.relativeDepth - 1.6);

    this.focusRing = params.scene.add
      .ellipse(
        this.worldX,
        this.worldY - 4,
        this.definition.shadowSize.width + 6,
        this.definition.shadowSize.height + 4,
        0x000000,
        0,
      )
      .setStrokeStyle(1.5, 0xffdc86, 0.95)
      .setDepth(this.relativeDepth - 1.4)
      .setVisible(false);

    for (const part of this.definition.baseParts) {
      const usesRuntimePlacement =
        typeof part.originX === "number" || typeof part.originY === "number";
      const image = params.scene.add
        .image(
          usesRuntimePlacement
            ? this.worldX + (part.offsetX ?? 0)
            : params.worldMinX + (this.tileX + part.dx) * params.tileWidth,
          usesRuntimePlacement
            ? this.worldY + (part.offsetY ?? 0)
            : params.worldMinY + (this.tileY + part.dy) * params.tileHeight,
          params.textureKey,
          part.frame,
        )
        .setOrigin(part.originX ?? 0, part.originY ?? 0)
        .setDepth(this.relativeDepth + (part.depthBias ?? 0.2));
      image.setDataEnabled();
      image.setData("originY", image.y);
      this.baseImages.push(image);
    }

    for (const part of this.definition.topParts) {
      const usesRuntimePlacement =
        typeof part.originX === "number" || typeof part.originY === "number";
      const image = params.scene.add
        .image(
          usesRuntimePlacement
            ? this.worldX + (part.offsetX ?? 0)
            : params.worldMinX + (this.tileX + part.dx) * params.tileWidth,
          usesRuntimePlacement
            ? this.worldY + (part.offsetY ?? 0)
            : params.worldMinY + (this.tileY + part.dy) * params.tileHeight,
          params.textureKey,
          part.frame,
        )
        .setOrigin(part.originX ?? 0, part.originY ?? 0)
        .setDepth(10002 + this.relativeDepth + (part.depthBias ?? 0));
      image.setDataEnabled();
      image.setData("originY", image.y);
      this.topImages.push(image);
    }

    this.applyVisualState();
  }

  public destroy(): void {
    this.respawnTimer?.remove(false);
    this.stopCollectingAnimation();
    this.shadow.destroy();
    this.focusRing.destroy();
    for (const image of this.baseImages) {
      image.destroy();
    }
    for (const image of this.topImages) {
      image.destroy();
    }
  }

  public isAvailable(): boolean {
    return this.state === "available" && this.remainingQuantity > 0;
  }

  public isCollecting(): boolean {
    return this.state === "collecting";
  }

  public isInRange(playerX: number, playerY: number): boolean {
    return this.distanceTo(playerX, playerY) <= this.definition.interactDistance;
  }

  public canInteract(playerX: number, playerY: number): boolean {
    if (!this.isAvailable()) {
      return false;
    }
    return this.isInRange(playerX, playerY);
  }

  public distanceTo(playerX: number, playerY: number): number {
    return Phaser.Math.Distance.Between(playerX, playerY, this.worldX, this.worldY - 8);
  }

  public getPromptText(): string {
    return `${this.definition.actionLabel} ${this.definition.name} (${this.remainingQuantity})`;
  }

  public getRemainingQuantity(): number {
    return this.remainingQuantity;
  }

  public setFocused(focused: boolean): void {
    this.focused = focused;
    this.focusRing.setVisible(focused && this.isAvailable());
  }

  public shakeTree(): void {
    if (this.shaking) return;
    this.shaking = true;
    const allParts = [...this.baseImages, ...this.topImages];
    this.scene.tweens.add({
      targets: allParts,
      x: "+=5",
      duration: 55,
      ease: "Sine.InOut",
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.shaking = false;
      },
    });
  }

  public beginCollecting(): void {
    this.state = "collecting";
    this.applyVisualState();
  }

  public cancelCollecting(): void {
    this.state = this.remainingQuantity > 0 ? "available" : "exhausted";
    this.applyVisualState();
  }

  public finishCollecting(): boolean {
    if (this.remainingQuantity > 0) {
      this.remainingQuantity -= 1;
    }
    if (this.remainingQuantity <= 0) {
      this.state = "exhausted";
      this.applyVisualState();
      this.playFallEffect();
      this.scheduleRespawn();
      return true;
    }
    this.state = "available";
    this.applyVisualState();
    return false;
  }

  private playFallEffect(): void {
    // Restore visibility so the tween can animate from visible → invisible
    for (const image of [...this.baseImages, ...this.topImages]) {
      image.setAlpha(1).clearTint();
    }
    this.shadow.setFillStyle(0x000000, 0.28);

    const topTargets = this.topImages.length > 0 ? this.topImages : this.baseImages;
    this.scene.tweens.add({
      targets: topTargets,
      y: "+=22",
      alpha: 0,
      duration: 420,
      ease: "Quad.In",
    });
    if (this.topImages.length > 0) {
      this.scene.tweens.add({
        targets: this.baseImages,
        alpha: 0,
        duration: 280,
        delay: 180,
        ease: "Quad.In",
        onComplete: () => this.shadow.setFillStyle(0x000000, 0),
      });
    } else {
      this.scene.time.delayedCall(420, () => this.shadow.setFillStyle(0x000000, 0));
    }
  }

  private scheduleRespawn(): void {
    this.respawnTimer?.remove(false);
    this.respawnTimer = this.scene.time.delayedCall(this.respawnTimeMs, () => {
      this.remainingQuantity = this.maxQuantity;
      this.state = "available";
      // Reset y to origin above, then animate down into place
      for (const image of [...this.baseImages, ...this.topImages]) {
        const originY = image.getData("originY") as number;
        if (typeof originY === "number") {
          image.setY(originY - 14);
        }
        image.setAlpha(0).clearTint();
      }
      this.shadow.setFillStyle(0x000000, 0);
      this.scene.tweens.add({
        targets: [...this.baseImages, ...this.topImages],
        y: "+=14",
        alpha: 1,
        duration: 520,
        ease: "Quad.Out",
        onComplete: () => {
          this.shadow.setFillStyle(0x000000, 0.28);
          this.focusRing.setVisible(this.focused);
        },
      });
      this.respawnTimer = null;
    });
  }

  private applyVisualState(): void {
    const focusVisible = this.focused && this.state === "available";
    this.focusRing.setVisible(focusVisible);

    if (this.state === "collecting") {
      this.startCollectingAnimation();
      this.shadow.setFillStyle(0x000000, 0.36);
      for (const image of this.baseImages) {
        image.setAlpha(1).setTint(0xffd77a);
      }
      for (const image of this.topImages) {
        image.setAlpha(1).setTint(0xfff1b8);
      }
      return;
    }

    this.stopCollectingAnimation();

    if (this.state === "exhausted") {
      this.shadow.setFillStyle(0x000000, 0);
      for (const image of [...this.baseImages, ...this.topImages]) {
        image.setAlpha(0).clearTint();
      }
      return;
    }

    this.shadow.setFillStyle(0x000000, 0.28);
    for (const image of this.baseImages) {
      image.setAlpha(1).clearTint();
    }
    for (const image of this.topImages) {
      image.setAlpha(1).clearTint();
    }
  }

  private startCollectingAnimation(): void {
    if (this.collectTween) {
      return;
    }
    const animatedParts =
      this.topImages.length > 0 ? [...this.baseImages, ...this.topImages] : this.baseImages;
    this.collectTween = this.scene.tweens.add({
      targets: animatedParts,
      y: "-=2",
      duration: this.definition.category === "mining" ? 120 : 220,
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private stopCollectingAnimation(): void {
    this.collectTween?.remove();
    this.collectTween = null;
    for (const image of [...this.baseImages, ...this.topImages]) {
      const originY = image.getData("originY");
      if (typeof originY === "number") {
        image.setY(originY);
      }
    }
  }
}
