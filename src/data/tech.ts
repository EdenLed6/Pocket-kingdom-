import type { ResourceType } from './balance';
import type { BuildingId } from './buildings';

// Stretch goal §12 "Tech tree" — flat, no prerequisites between techs (we
// only gate on requiresBuilding so unlocks feel grounded). Each tech is a
// one-shot purchase with permanent effect; TechSystem applies the deltas
// at the right moments.

export type TechId =
  | 'sharper_axes'
  | 'quarry_tools'
  | 'forester'
  | 'discipline'
  | 'reinforced_walls'
  | 'logistics';

export interface TechDef {
  id: TechId;
  name: string;
  description: string;
  cost: Partial<Record<ResourceType, number>>;
  // Optional: must have at least one *constructed* building of this id
  // before this tech is purchasable. Keeps the early game from leaping
  // ahead via raw food.
  requiresBuilding?: BuildingId;
}

export const TECH_DEFS: Record<TechId, TechDef> = {
  sharper_axes: {
    id: 'sharper_axes',
    name: 'Sharper Axes',
    description: 'Workers chop wood 30% faster.',
    cost: { wood: 80, stone: 30 },
  },
  quarry_tools: {
    id: 'quarry_tools',
    name: 'Quarry Tools',
    description: 'Workers mine stone 30% faster.',
    cost: { wood: 60, stone: 60 },
    requiresBuilding: 'quarry',
  },
  forester: {
    id: 'forester',
    name: 'Forester',
    description: '+50 wood cap, +30 food cap (one-time).',
    cost: { wood: 100, food: 40 },
  },
  discipline: {
    id: 'discipline',
    name: 'Discipline',
    description: 'New units +20% HP.',
    cost: { food: 100, stone: 50 },
    requiresBuilding: 'barracks',
  },
  reinforced_walls: {
    id: 'reinforced_walls',
    name: 'Reinforced Walls',
    description: 'New buildings +30% HP.',
    cost: { stone: 150, wood: 60 },
  },
  logistics: {
    id: 'logistics',
    name: 'Logistics',
    description: 'Workers carry +2 per trip.',
    cost: { wood: 100, food: 60 },
  },
};

export const TECH_ORDER: TechId[] = [
  'sharper_axes',
  'quarry_tools',
  'logistics',
  'forester',
  'discipline',
  'reinforced_walls',
];
