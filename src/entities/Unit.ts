import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { UNIT_DEFS, type UnitDef, type UnitId, type Side } from '../data/units';
import { findPath, type TileXY } from '../utils/pathfinding';

type IsWalkable = (tx: number, ty: number) => boolean;

export interface UnitDeps {
  mapWidthTiles: number;
  mapHeightTiles: number;
  isWalkable: IsWalkable;
  // Returns the closest hostile target within visualRange of (x, y), or
  // null. Phase 4: soldiers find dummy bandits, bandits find player units.
  // Phase 5 raid AI will reuse this.
  findEnemy: (forSide: Side, x: number, y: number, withinTiles: number) => Unit | null;
}

export type UnitState =
  | { kind: 'idle' }
  | { kind: 'moving'; goal: TileXY; pursuing?: Unit }
  | { kind: 'attacking'; target: Unit };

let nextId = 0;

// Generic 2D combat unit shared by Soldier and Bandit. Health bar shows
// only when damaged. Attack is instantaneous (no projectiles in MVP per
// spec §6.4) — a quick line flash visualises the hit.
export class Unit {
  readonly instanceId: number;
  readonly def: UnitDef;
  readonly side: Side;
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
    this.hp = this.def.hpMax;
    this.deps = deps;

    const wx = tileX * TILE_SIZE + TILE_SIZE / 2;
    const wy = tileY * TILE_SIZE + TILE_SIZE / 2;

    this.sprite = scene.add
      .sprite(wx, wy, this.def.textureKey)
      .setOrigin(0.5, 0.9)
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

  // Player command: walk to a tile, attacking en route. If a unit/dummy is
  // at the goal, treat it as a target.
  attackMove(goal: TileXY, target?: Unit): void {
    if (target && target.isAlive && target.side !== this.side) {
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
    // Guard / attack-move both auto-attack visible enemies in range.
    const range = this.def.rangeTiles;
    const enemy = this.deps.findEnemy(this.side, this.sprite.x, this.sprite.y, Math.max(range, 5));
    if (!enemy) return;
    if (this.tileDistanceTo(enemy) <= range) {
      this.state = { kind: 'attacking', target: enemy };
    } else if (this.stance === 'attack-move') {
      this.state = { kind: 'moving', goal: { tx: enemy.tileX, ty: enemy.tileY }, pursuing: enemy };
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

  private applyHit(target: Unit): void {
    target.takeDamage(this.def.damage);
    // Visualise attack as a 80ms line from attacker to target.
    this.flashTimer = 0.08;
    this.flashLine.clear();
    this.flashLine.lineStyle(2, this.side === 'player' ? 0xfff0a0 : 0xff6060, 1);
    this.flashLine.lineBetween(this.sprite.x, this.sprite.y - 6, target.worldX, target.worldY - 6);
  }

  takeDamage(amount: number): void {
    if (!this._alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this._alive = false;
      this.scene.events.emit('unit-died', this);
      this.destroy();
      return;
    }
    this.drawHpBar();
  }

  private drawHpBar(): void {
    if (this.hp >= this.def.hpMax) {
      this.hpBar.clear();
      return;
    }
    const W = 18;
    const H = 3;
    const x = this.sprite.x - W / 2;
    const y = this.sprite.y - this.sprite.displayHeight * 0.95;
    const ratio = Math.max(0, this.hp / this.def.hpMax);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(x - 1, y - 1, W + 2, H + 2);
    this.hpBar.fillStyle(this.side === 'player' ? 0x60c060 : 0xc06060, 1);
    this.hpBar.fillRect(x, y, Math.max(0, Math.floor(W * ratio)), H);
  }

  private tileDistanceTo(other: Unit): number {
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
    for (let i = 1; i < path.length; i++) {
      this.path.push({
        x: path[i].tx * TILE_SIZE + TILE_SIZE / 2,
        y: path[i].ty * TILE_SIZE + TILE_SIZE / 2,
      });
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.hpBar.destroy();
    this.flashLine.destroy();
    if (this.ring) this.ring.destroy();
  }
}
