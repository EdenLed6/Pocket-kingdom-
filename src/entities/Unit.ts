import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { UNIT_DEFS, type UnitDef, type UnitId, type Side } from '../data/units';
import { findPath, type TileXY } from '../utils/pathfinding';
import { AudioSystem } from '../systems/AudioSystem';
import { JuiceSystem, JUICE_COLORS } from '../systems/JuiceSystem';
import { TechSystem } from '../systems/TechSystem';

type IsWalkable = (tx: number, ty: number) => boolean;

// Anything a Unit can target / damage. Both Unit (its own kind) and
// Building (Phase 5c — bandits attacking the Town Hall) match this
// shape structurally.
export interface Targetable {
  isAlive: boolean;
  takeDamage(amount: number): void;
  worldX: number;
  worldY: number;
  tileX: number;
  tileY: number;
}

export interface UnitDeps {
  mapWidthTiles: number;
  mapHeightTiles: number;
  isWalkable: IsWalkable;
  // Closest hostile UNIT within range, or null.
  findEnemy: (forSide: Side, x: number, y: number, withinTiles: number) => Unit | null;
  // Closest hostile BUILDING within range, or null. Bandits use this to
  // pick a Town Hall (or other player building) once they're done with
  // any units en route.
  findEnemyBuilding: (forSide: Side, x: number, y: number, withinTiles: number) => Targetable | null;
}

export type UnitState =
  | { kind: 'idle' }
  | { kind: 'moving'; goal: TileXY; pursuing?: Targetable }
  | { kind: 'attacking'; target: Targetable };

let nextId = 0;

// Generic 2D combat unit shared by Soldier and Bandit. Health bar shows
// only when damaged. Attack is instantaneous (no projectiles in MVP per
// spec §6.4) — a quick line flash visualises the hit.
export class Unit {
  readonly instanceId: number;
  readonly def: UnitDef;
  readonly side: Side;
  // hpMax may exceed def.hpMax when the player has researched Discipline;
  // captured at construction so a mid-game unlock doesn't retro-buff
  // already-spawned units.
  readonly hpMax: number;
  hp: number;
  private state: UnitState = { kind: 'idle' };
  private cooldownSec = 0;
  private path: { x: number; y: number }[] = [];
  private deps: UnitDeps;
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private hpBar: Phaser.GameObjects.Graphics;
  private flashTimer = 0;
  private flashLine: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Sprite | null = null;
  private _selected = false;
  private _alive = true;
  // Player-given stance. For Phase 4 only 'guard' (default) and
  // 'attack-move' (player tap) are wired. Patrol/follow per §4.6 land later.
  private stance: 'guard' | 'attack-move' = 'guard';

  constructor(scene: Phaser.Scene, id: UnitId, tileX: number, tileY: number, deps: UnitDeps) {
    this.scene = scene;
    this.instanceId = nextId++;
    this.def = UNIT_DEFS[id];
    this.side = this.def.side;
    const hpMult = this.side === 'player' ? TechSystem.unitHpMultiplier() : 1;
    this.hpMax = Math.floor(this.def.hpMax * hpMult);
    this.hp = this.hpMax;
    this.deps = deps;

    const wx = tileX * TILE_SIZE + TILE_SIZE / 2;
    const wy = tileY * TILE_SIZE + TILE_SIZE / 2;

    // Tiny Swords frames: 192×192 for most, 320×320 for Lancer. Scale
    // so the silhouette sits roughly one tile wide (TILE_SIZE = 64).
    const isLancer = id === 'spearman' || id === 'bandit_raider';
    const scale = isLancer ? 0.28 : 0.4;
    this.sprite = scene.add
      .sprite(wx, wy, this.def.textureKey)
      .setOrigin(0.5, 0.85)
      .setScale(scale)
      .setDepth(wy)
      .setInteractive({ useHandCursor: true });
    this.sprite.setData('kind', 'unit').setData('unit', this);

    this.hpBar = scene.add.graphics().setDepth(wy + 1);
    this.flashLine = scene.add.graphics().setDepth(wy + 2);
  }

  get isAlive(): boolean {
    return this._alive;
  }
  get worldX(): number {
    return this.sprite.x;
  }
  get worldY(): number {
    return this.sprite.y;
  }
  get tileX(): number {
    return Math.floor(this.sprite.x / TILE_SIZE);
  }
  get tileY(): number {
    return Math.floor(this.sprite.y / TILE_SIZE);
  }
  get isSelected(): boolean {
    return this._selected;
  }

  setSelected(value: boolean): void {
    this._selected = value;
    if (value && !this.ring) {
      this.ring = this.scene.add
        .sprite(this.sprite.x, this.sprite.y + 4, 'select-ring')
        .setDepth(this.sprite.depth - 1);
    }
    if (!value && this.ring) {
      this.ring.destroy();
      this.ring = null;
    }
  }

  // Player command: walk to a tile, attacking en route. Optionally pursue
  // a specific target (unit or building).
  attackMove(goal: TileXY, target?: Targetable): void {
    if (target && target.isAlive) {
      this.state = { kind: 'moving', goal: { tx: target.tileX, ty: target.tileY }, pursuing: target };
    } else {
      this.state = { kind: 'moving', goal };
    }
    this.stance = 'attack-move';
    this.computePath(this.state.goal);
  }

  // Simulation tick.
  update(dtSec: number): void {
    if (!this._alive) return;
    if (this.cooldownSec > 0) this.cooldownSec = Math.max(0, this.cooldownSec - dtSec);
    if (this.flashTimer > 0) {
      this.flashTimer -= dtSec;
      if (this.flashTimer <= 0) this.flashLine.clear();
    }

    this.sprite.setDepth(this.sprite.y);
    if (this.ring) this.ring.setPosition(this.sprite.x, this.sprite.y + 4).setDepth(this.sprite.y - 1);
    // Phase 4: each unit has at minimum an idle bob animation. Run / attack
    // anims wait until we extract those spritesheets too.
    const idleAnim = `${this.def.id}_idle`;
    if (this.scene.anims.exists(idleAnim)) this.sprite.play(idleAnim, true);

    switch (this.state.kind) {
      case 'idle':
        this.acquireOpportuneTarget();
        return;
      case 'moving':
        this.tickMoving(dtSec);
        return;
      case 'attacking':
        this.tickAttacking(dtSec);
        return;
    }
  }

  private acquireOpportuneTarget(): void {
    // Prefer hostile units (closer threat). If none in range, look for an
    // enemy building (bandits attacking the Town Hall use this path).
    const range = this.def.rangeTiles;
    const search = Math.max(range, 5);
    let target: Targetable | null =
      this.deps.findEnemy(this.side, this.sprite.x, this.sprite.y, search);
    if (!target) {
      target = this.deps.findEnemyBuilding(this.side, this.sprite.x, this.sprite.y, search);
    }
    if (!target) return;
    if (this.tileDistanceTo(target) <= range) {
      this.state = { kind: 'attacking', target };
    } else if (this.stance === 'attack-move') {
      this.state = { kind: 'moving', goal: { tx: target.tileX, ty: target.tileY }, pursuing: target };
      this.computePath(this.state.goal);
    }
  }

  private tickMoving(dtSec: number): void {
    if (this.state.kind !== 'moving') return;
    const speed = this.def.speedPxPerSec;
    let budget = speed * dtSec;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0];
      const dx = next.x - this.sprite.x;
      const dy = next.y - this.sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        this.sprite.x = next.x;
        this.sprite.y = next.y;
        budget -= dist;
        this.path.shift();
      } else {
        this.sprite.x += (dx / dist) * budget;
        this.sprite.y += (dy / dist) * budget;
        budget = 0;
      }
    }

    // If we have a pursuing target and it's now in range, switch to attack.
    const pursue = this.state.pursuing;
    if (pursue && pursue.isAlive && this.tileDistanceTo(pursue) <= this.def.rangeTiles) {
      this.state = { kind: 'attacking', target: pursue };
      this.path = [];
      return;
    }
    if (pursue && !pursue.isAlive) {
      this.state = { kind: 'idle' };
      this.path = [];
      return;
    }

    if (this.path.length === 0) {
      this.state = { kind: 'idle' };
    }
  }

  private tickAttacking(dtSec: number): void {
    if (this.state.kind !== 'attacking') return;
    const t = this.state.target;
    if (!t.isAlive) {
      this.state = { kind: 'idle' };
      return;
    }
    const dist = this.tileDistanceTo(t);
    if (dist > this.def.rangeTiles) {
      // Target moved out of range; chase if attack-move stance.
      if (this.stance === 'attack-move') {
        this.state = { kind: 'moving', goal: { tx: t.tileX, ty: t.tileY }, pursuing: t };
        this.computePath(this.state.goal);
      } else {
        this.state = { kind: 'idle' };
      }
      return;
    }
    if (this.cooldownSec > 0) {
      // Faking dt unused warning suppression while waiting.
      void dtSec;
      return;
    }
    this.applyHit(t);
    this.cooldownSec = this.def.attackCooldownSec;
  }

  private applyHit(target: Targetable): void {
    target.takeDamage(this.def.damage);
    // Visualise attack as a 80ms line from attacker to target.
    this.flashTimer = 0.08;
    this.flashLine.clear();
    this.flashLine.lineStyle(2, this.side === 'player' ? 0xfff0a0 : 0xff6060, 1);
    this.flashLine.lineBetween(this.sprite.x, this.sprite.y - 6, target.worldX, target.worldY - 6);
    // rangeTiles >= 2 reads as ranged (archer); 1 reads as melee.
    AudioSystem.play(this.def.rangeTiles >= 2 ? 'arrow' : 'sword');
  }

  takeDamage(amount: number): void {
    if (!this._alive) return;
    this.hp -= amount;
    const bloodColor = this.side === 'player' ? JUICE_COLORS.blood_player : JUICE_COLORS.blood_enemy;
    if (this.hp <= 0) {
      this._alive = false;
      AudioSystem.play('die');
      JuiceSystem.burst(this.scene, this.sprite.x, this.sprite.y, bloodColor, {
        count: 10,
        speedPxPerSec: 110,
        lifeMs: 480,
        size: 2.5,
      });
      this.scene.events.emit('unit-died', this);
      this.destroy();
      return;
    }
    AudioSystem.play('hurt');
    JuiceSystem.flash(this.sprite, 70);
    JuiceSystem.burst(this.scene, this.sprite.x, this.sprite.y - 4, bloodColor, {
      count: 4,
      speedPxPerSec: 60,
      lifeMs: 260,
    });
    this.drawHpBar();
  }

  private drawHpBar(): void {
    if (this.hp >= this.hpMax) {
      this.hpBar.clear();
      return;
    }
    const W = 18;
    const H = 3;
    const x = this.sprite.x - W / 2;
    const y = this.sprite.y - this.sprite.displayHeight * 0.95;
    const ratio = Math.max(0, this.hp / this.hpMax);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(x - 1, y - 1, W + 2, H + 2);
    this.hpBar.fillStyle(this.side === 'player' ? 0x60c060 : 0xc06060, 1);
    this.hpBar.fillRect(x, y, Math.max(0, Math.floor(W * ratio)), H);
  }

  private tileDistanceTo(other: Targetable): number {
    return Math.max(
      Math.abs(this.tileX - other.tileX),
      Math.abs(this.tileY - other.tileY),
    );
  }

  private computePath(goal: TileXY): void {
    const start: TileXY = { tx: this.tileX, ty: this.tileY };
    const path = findPath(
      start,
      goal,
      this.deps.mapWidthTiles,
      this.deps.mapHeightTiles,
      this.deps.isWalkable,
    );
    if (!path) {
      this.path = [];
      return;
    }
    this.path = [];
    let lastDx = 0;
    let lastDy = 0;
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].tx - path[i - 1].tx;
      const dy = path[i].ty - path[i - 1].ty;
      const point = {
        x: path[i].tx * TILE_SIZE + TILE_SIZE / 2,
        y: path[i].ty * TILE_SIZE + TILE_SIZE / 2,
      };
      if (i > 1 && dx === lastDx && dy === lastDy) {
        this.path[this.path.length - 1] = point;
      } else {
        this.path.push(point);
      }
      lastDx = dx;
      lastDy = dy;
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.hpBar.destroy();
    this.flashLine.destroy();
    if (this.ring) this.ring.destroy();
  }
}
