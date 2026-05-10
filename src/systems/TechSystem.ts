import type { ResourceType } from '../data/balance';
import { TECH_DEFS, type TechId } from '../data/tech';

// Singleton holding the player's unlocked techs. Effects are applied via
// multiplier / bonus getters so gameplay code stays declarative:
//   const t = node.gatherTimeSec * TechSystem.gatherTimeMultiplier(resource);
//
// The set is reset on game-over / new game by GameScene calling reset().
// Save/load round-trips through serialize() / hydrate().

class _TechSystem {
  private unlocked = new Set<TechId>();
  // One-shot techs that mutate world state on unlock (e.g. forester
  // bumps caps); GameScene reads this list once via consumeOneShots()
  // when a tech is purchased so it can apply the delta itself. We keep
  // the queue here so the unlock path can call this from any scene.
  private oneShotQueue: TechId[] = [];

  has(id: TechId): boolean {
    return this.unlocked.has(id);
  }

  list(): TechId[] {
    return Array.from(this.unlocked);
  }

  unlock(id: TechId): void {
    if (this.unlocked.has(id)) return;
    this.unlocked.add(id);
    if (id === 'forester') this.oneShotQueue.push(id);
  }

  reset(): void {
    this.unlocked.clear();
    this.oneShotQueue.length = 0;
  }

  hydrate(ids: TechId[] | undefined): void {
    this.unlocked.clear();
    this.oneShotQueue.length = 0;
    if (!ids) return;
    for (const id of ids) {
      if (id in TECH_DEFS) this.unlocked.add(id);
    }
    // Note: we do NOT re-queue forester on hydrate because the cap bonus
    // was already applied to the saved cap values.
  }

  serialize(): TechId[] {
    return this.list();
  }

  // ---- effect getters ------------------------------------------------------

  // Multiplier for time-to-gather. <1 = faster.
  gatherTimeMultiplier(resource: ResourceType): number {
    if (resource === 'wood' && this.unlocked.has('sharper_axes')) return 0.7;
    if (resource === 'stone' && this.unlocked.has('quarry_tools')) return 0.7;
    return 1;
  }

  carryCapacityBonus(): number {
    return this.unlocked.has('logistics') ? 2 : 0;
  }

  // Multiplier applied to a Unit's hpMax at construction.
  unitHpMultiplier(): number {
    return this.unlocked.has('discipline') ? 1.2 : 1;
  }

  // Multiplier applied to a Building's hpMax at construction.
  buildingHpMultiplier(): number {
    return this.unlocked.has('reinforced_walls') ? 1.3 : 1;
  }

  // Forester one-shot: returns the cap delta to add per resource. Empty
  // object if forester wasn't just unlocked.
  consumeOneShotCapBonus(): Partial<Record<ResourceType, number>> {
    if (!this.oneShotQueue.includes('forester')) return {};
    this.oneShotQueue = this.oneShotQueue.filter((id) => id !== 'forester');
    return { wood: 50, food: 30 };
  }
}

export const TechSystem = new _TechSystem();
