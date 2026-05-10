import Phaser from 'phaser';
import { BALANCE } from '../data/balance';
import type { Worker } from '../entities/Worker';
import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';

// Lazy lookups so the system doesn't pin stale references when the scene
// recreates entities. Each callback returns the current snapshot.
export interface PowerDeps {
  workers: () => Worker[];
  playerUnits: () => Unit[];
  buildings: () => Building[];
  resourceTotal: () => number;
}

// Per spec §4.7.1 / §6.6:
//   P_player = Σ (building.hp_max × buildingHpWeight)
//            + workers × workerWeight
//            + Σ (soldier.cost_total × soldierCostWeight)
//            + (resource_stockpile_sum × stockpileWeight)
//   where soldier.cost_total = wood + stone + 2 × food.
//
// Recomputes every BALANCE.power.recomputeIntervalSec (5s by default).
// Caches the latest value on `this.current` and the scene registry as
// 'pPlayer' so RaidSystem (and a future debug HUD) can read it.
export class PowerSystem {
  private deps: PowerDeps;
  private scene: Phaser.Scene;
  private timer: Phaser.Time.TimerEvent | null = null;
  private current = 0;

  constructor(scene: Phaser.Scene, deps: PowerDeps) {
    this.scene = scene;
    this.deps = deps;
    this.recompute();
    this.timer = scene.time.addEvent({
      delay: BALANCE.power.recomputeIntervalSec * 1000,
      loop: true,
      callback: () => this.recompute(),
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy());
  }

  get value(): number {
    return this.current;
  }

  private recompute(): void {
    let total = 0;

    for (const b of this.deps.buildings()) {
      if (!b.isConstructed) continue;
      total += b.def.hpMax * BALANCE.power.buildingHpWeight;
    }

    total += this.deps.workers().length * BALANCE.power.workerWeight;

    for (const u of this.deps.playerUnits()) {
      if (!u.isAlive) continue;
      const c = u.def.cost ?? {};
      const costTotal = (c.wood ?? 0) + (c.stone ?? 0) + 2 * (c.food ?? 0);
      total += costTotal * BALANCE.power.soldierCostWeight;
    }

    total += this.deps.resourceTotal() * BALANCE.power.stockpileWeight;

    this.current = Math.floor(total);
    this.scene.registry.set('pPlayer', this.current);
  }

  destroy(): void {
    if (this.timer) {
      this.timer.remove();
      this.timer = null;
    }
  }
}
