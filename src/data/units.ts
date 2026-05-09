// Soldier and bandit definitions per spec §4.6. Combat numbers live here
// (cost, hp, damage, range, speed, train time) so balance tuning is one
// edit. Attack cooldown is normalised across all units in Phase 4 since
// the spec only specifies it for towers (15 dmg / 2 s); revisit per-unit
// once §4.7 raids are in.

import type { ResourceType } from './balance';

export type UnitId =
  | 'spearman'
  | 'archer'
  | 'knight'
  | 'bandit_grunt'
  | 'bandit_archer'
  | 'bandit_raider';

export type Side = 'player' | 'enemy';

export interface UnitDef {
  id: UnitId;
  name: string;
  side: Side;
  hpMax: number;
  damage: number;
  rangeTiles: number;
  speedPxPerSec: number;
  attackCooldownSec: number;
  textureKey: string;
  // Player-trainable units have a cost + train time. Bandits have neither
  // (they're spawned by the raid system).
  cost?: Partial<Record<ResourceType, number>>;
  trainTimeSec?: number;
}

export const UNIT_DEFS: Record<UnitId, UnitDef> = {
  spearman: {
    id: 'spearman',
    name: 'Spearman',
    side: 'player',
    hpMax: 50,
    damage: 8,
    rangeTiles: 1,
    speedPxPerSec: 60,
    attackCooldownSec: 1.2,
    textureKey: 'u_spearman',
    cost: { wood: 30, stone: 10, food: 20 },
    trainTimeSec: 15,
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    side: 'player',
    hpMax: 35,
    damage: 12,
    rangeTiles: 5,
    speedPxPerSec: 70,
    attackCooldownSec: 1.4,
    textureKey: 'u_archer',
    cost: { wood: 20, stone: 10, food: 30 },
    trainTimeSec: 18,
  },
  knight: {
    id: 'knight',
    name: 'Knight',
    side: 'player',
    hpMax: 120,
    damage: 18,
    rangeTiles: 1,
    speedPxPerSec: 50,
    attackCooldownSec: 1.5,
    textureKey: 'u_knight',
    cost: { wood: 60, stone: 50, food: 50 },
    trainTimeSec: 30,
  },
  bandit_grunt: {
    id: 'bandit_grunt',
    name: 'Bandit',
    side: 'enemy',
    hpMax: 30,
    damage: 6,
    rangeTiles: 1,
    speedPxPerSec: 65,
    attackCooldownSec: 1.4,
    textureKey: 'u_bandit_grunt',
  },
  bandit_archer: {
    id: 'bandit_archer',
    name: 'Bandit Archer',
    side: 'enemy',
    hpMax: 25,
    damage: 9,
    rangeTiles: 4,
    speedPxPerSec: 60,
    attackCooldownSec: 1.5,
    textureKey: 'u_bandit_archer',
  },
  bandit_raider: {
    id: 'bandit_raider',
    name: 'Raider',
    side: 'enemy',
    hpMax: 80,
    damage: 14,
    rangeTiles: 1,
    speedPxPerSec: 70,
    attackCooldownSec: 1.5,
    textureKey: 'u_bandit_raider',
  },
};

export const PLAYER_UNIT_ORDER: UnitId[] = ['spearman', 'archer', 'knight'];
