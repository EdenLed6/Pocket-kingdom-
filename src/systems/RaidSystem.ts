import Phaser from 'phaser';
import { BALANCE } from '../data/balance';
import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES } from '../data/tiles';
import type { UnitId } from '../data/units';

export type BanditId = Extract<UnitId, 'bandit_grunt' | 'bandit_archer' | 'bandit_raider'>;

export interface RaidDeps {
  // RaidSystem hands a unit id + tile coords to GameScene; GameScene
  // creates the actual Unit, pushes onto its list, and orders an
  // attack-move toward the Town Hall.
  spawnBandit: (id: BanditId, tileX: number, tileY: number) => void;
  // Source-of-truth for the start-of-game wall clock so the difficulty
  // ramp is monotonic across pauses (currently this.scene.time.now / 1000
  // is fine — refresh resets the game).
  elapsedSec: () => number;
}

interface BanditCost {
  id: BanditId;
  cost: number;
}

// Power cost of each bandit type, per §4.7.4. Used by the greedy
// composition algorithm.
const POWER_COST: Record<BanditId, number> = {
  bandit_raider: 50,
  bandit_archer: 22,
  bandit_grunt: 15,
};

// §6.5: schedules + spawns raids. Reads pPlayer (PowerSystem updates
// every 5s), picks a random map edge, computes composition by §4.7.4
// greedy, and emits one bandit per composition entry.
//
// Phase 5b ships without the warning UI (§4.7.5 banner+arrow lands in
// 5e); for now the raid summary is logged to console for tuning.
export class RaidSystem {
  private scene: Phaser.Scene;
  private deps: RaidDeps;
  private raidCount = 0;
  private nextTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, deps: RaidDeps) {
    this.scene = scene;
    this.deps = deps;
    this.scheduleNext();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy());
  }

  destroy(): void {
    if (this.nextTimer) {
      this.nextTimer.remove();
      this.nextTimer = null;
    }
  }

  // Schedule the next raid. firstRaidAtSec for the first one, then a
  // random delay within [intervalMinSec, intervalMaxSec].
  private scheduleNext(): void {
    const isFirst = this.raidCount === 0;
    const delaySec = isFirst
      ? BALANCE.raid.firstRaidAtSec
      : Phaser.Math.Between(BALANCE.raid.intervalMinSec, BALANCE.raid.intervalMaxSec);
    this.nextTimer = this.scene.time.delayedCall(delaySec * 1000, () => {
      this.spawnRaid();
      this.raidCount += 1;
      this.scheduleNext();
    });
  }

  private spawnRaid(): void {
    const elapsed = this.deps.elapsedSec();
    const pPlayer = (this.scene.registry.get('pPlayer') as number) ?? 0;

    // Difficulty multiplier per §4.7.3.
    let mult = 1.0;
    for (const tier of BALANCE.raid.difficultyTiers) {
      if (elapsed < tier.untilSec) {
        mult = tier.mult;
        break;
      }
    }

    let pRaid = Math.floor(pPlayer * mult);
    pRaid = Math.max(BALANCE.raid.minPower, pRaid);
    const cap = Math.floor(pPlayer * BALANCE.raid.powerCapMultiplier);
    if (cap > 0) pRaid = Math.min(cap, pRaid);

    const composition = this.composeRaid(pRaid);
    const edge = this.pickEdge();

    console.log(
      `[RAID #${this.raidCount + 1}] t=${elapsed.toFixed(0)}s pPlayer=${pPlayer} ` +
        `mult=${mult} pRaid=${pRaid} count=${composition.length} ` +
        `edge=${edge.side}@(${edge.tx},${edge.ty})`,
    );

    // §4.7.5: 10-second pre-spawn warning. Emits an event UIScene picks
    // up to draw the banner + arrow + countdown. The actual bandit spawn
    // fires after warningLeadSec.
    const ui = this.scene.scene.get('UI');
    ui.events.emit('raid-warning', {
      side: edge.side,
      tx: edge.tx,
      ty: edge.ty,
      count: composition.length,
      leadSec: BALANCE.raid.warningLeadSec,
    });
    this.scene.time.delayedCall(BALANCE.raid.warningLeadSec * 1000, () => {
      composition.forEach((entry, i) => {
        const dx = (i % 5) - 2;
        const dy = Math.floor(i / 5);
        const t = this.offsetEdge(edge, dx, dy);
        this.deps.spawnBandit(entry.id, t.tx, t.ty);
      });
      ui.events.emit('raid-warning-end');
    });
  }

  // §4.7.4 greedy: try raiders first, then archers, then fill with grunts.
  // Stochastic gates make each raid's composition feel different.
  private composeRaid(pRaid: number): BanditCost[] {
    const out: BanditCost[] = [];
    let remaining = pRaid;
    while (remaining > POWER_COST.bandit_raider && Math.random() < 0.3) {
      out.push({ id: 'bandit_raider', cost: POWER_COST.bandit_raider });
      remaining -= POWER_COST.bandit_raider;
      if (out.length >= BALANCE.raid.maxRaidUnitCount) return out;
    }
    while (remaining > POWER_COST.bandit_archer && Math.random() < 0.5) {
      out.push({ id: 'bandit_archer', cost: POWER_COST.bandit_archer });
      remaining -= POWER_COST.bandit_archer;
      if (out.length >= BALANCE.raid.maxRaidUnitCount) return out;
    }
    while (remaining > POWER_COST.bandit_grunt) {
      out.push({ id: 'bandit_grunt', cost: POWER_COST.bandit_grunt });
      remaining -= POWER_COST.bandit_grunt;
      if (out.length >= BALANCE.raid.maxRaidUnitCount) return out;
    }
    return out;
  }

  private pickEdge(): { side: 'top' | 'bottom' | 'left' | 'right'; tx: number; ty: number } {
    const sides = ['top', 'bottom', 'left', 'right'] as const;
    const side = sides[Math.floor(Math.random() * 4)];
    let tx = 0;
    let ty = 0;
    if (side === 'top') {
      tx = Phaser.Math.Between(2, MAP_WIDTH_TILES - 3);
      ty = 0;
    } else if (side === 'bottom') {
      tx = Phaser.Math.Between(2, MAP_WIDTH_TILES - 3);
      ty = MAP_HEIGHT_TILES - 1;
    } else if (side === 'left') {
      tx = 0;
      ty = Phaser.Math.Between(2, MAP_HEIGHT_TILES - 3);
    } else {
      tx = MAP_WIDTH_TILES - 1;
      ty = Phaser.Math.Between(2, MAP_HEIGHT_TILES - 3);
    }
    return { side, tx, ty };
  }

  private offsetEdge(
    edge: { side: 'top' | 'bottom' | 'left' | 'right'; tx: number; ty: number },
    dx: number,
    dy: number,
  ): { tx: number; ty: number } {
    let tx = edge.tx;
    let ty = edge.ty;
    if (edge.side === 'top' || edge.side === 'bottom') {
      tx = edge.tx + dx;
      ty = edge.ty + (edge.side === 'top' ? dy : -dy);
    } else {
      tx = edge.tx + (edge.side === 'left' ? dy : -dy);
      ty = edge.ty + dx;
    }
    tx = Phaser.Math.Clamp(tx, 0, MAP_WIDTH_TILES - 1);
    ty = Phaser.Math.Clamp(ty, 0, MAP_HEIGHT_TILES - 1);
    return { tx, ty };
  }
}
