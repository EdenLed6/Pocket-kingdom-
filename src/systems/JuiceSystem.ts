import Phaser from 'phaser';

// Tiny visual juice helpers: particle bursts, screen shake, hit-flash.
// We use ad-hoc Graphics circles + tweens instead of Phaser's particle
// emitter so we don't have to register textures up front. Total memory
// per burst is bounded (count circles, all destroyed in <1s).

export interface BurstOptions {
  count?: number;
  speedPxPerSec?: number;
  lifeMs?: number;
  size?: number; // base radius before per-particle jitter
  arcUpPx?: number; // gentle vertical lift; 0 = pure radial
}

export const JuiceSystem = {
  // Spawn `count` tiny circles at (x, y) that fly outward in random
  // directions and fade. Used for chop/mine/death/hit-impact effects.
  burst(
    scene: Phaser.Scene,
    x: number,
    y: number,
    color: number,
    opts: BurstOptions = {},
  ): void {
    const {
      count = 6,
      speedPxPerSec = 90,
      lifeMs = 380,
      size = 2,
      arcUpPx = 18,
    } = opts;
    const lifeSec = lifeMs / 1000;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speedPxPerSec * (0.5 + Math.random() * 0.9);
      const dx = Math.cos(angle) * v * lifeSec;
      const dy = Math.sin(angle) * v * lifeSec - arcUpPx;
      const radius = size + Math.random() * size;
      const c = scene.add
        .circle(x, y, radius, color, 1)
        .setDepth(1000);
      scene.tweens.add({
        targets: c,
        x: x + dx,
        y: y + dy,
        alpha: 0,
        scale: 0.3,
        duration: lifeMs,
        ease: 'Cubic.easeOut',
        onComplete: () => c.destroy(),
      });
    }
  },

  // Camera shake. Intensity is a fraction of viewport (0.005 = 0.5%).
  // Default values tuned to be "felt but not nauseating" on a 540×960
  // canvas — multiple shakes in quick succession are clamped by Phaser
  // automatically.
  shake(scene: Phaser.Scene, intensity = 0.006, durMs = 180): void {
    scene.cameras.main.shake(durMs, intensity);
  },

  // White hit-flash on a sprite. Safe to call on sprites that don't use
  // setTint; if you call it on a tinted sprite the tint will be lost
  // when the flash clears. Phaser 4: setTint + setTintMode(FILL) replaces
  // the old setTintFill(color) signature.
  flash(
    sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
    durMs = 80,
  ): void {
    if (!sprite || !sprite.scene) return;
    sprite.setTint(0xffffff);
    sprite.setTintMode(Phaser.TintModes.FILL);
    sprite.scene.time.delayedCall(durMs, () => {
      if (sprite && sprite.scene && sprite.active) {
        sprite.clearTint();
        sprite.setTintMode(Phaser.TintModes.MULTIPLY);
      }
    });
  },
};

// Burst color palette by event type — kept here so call sites stay readable.
export const JUICE_COLORS = {
  wood: 0x6b4226,
  stone: 0x9a9a9a,
  food: 0xff8060,
  blood_player: 0xff5050,
  blood_enemy: 0xc04040,
  build_dust: 0xd2c19a,
  spark: 0xffe070,
} as const;
