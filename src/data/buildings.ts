// All building definitions per spec §4.4. Functional effects are wired up in
// later phase 3 sub-commits and beyond; placement / construction works for
// every building from this commit onward.

import type { ResourceType } from './balance';

export type BuildingId =
  | 'town_hall'
  | 'house'
  | 'lumber_mill'
  | 'quarry'
  | 'farm'
  | 'hunters_lodge'
  | 'barracks'
  | 'wall'
  | 'tower'
  | 'warehouse';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  // Footprint in tiles. 1×1, 2×2, or 3×3 (§4.4).
  footprint: { w: number; h: number };
  cost: Partial<Record<ResourceType, number>>;
  buildTimeSec: number;
  hpMax: number;
  // Optional list of building IDs that must already be constructed
  // somewhere on the map before this one can be built. Multiple entries
  // are AND-joined; for OR-joins (e.g. warehouse needs Lumber Mill OR
  // Quarry) we use prereqsAny instead.
  prereqs?: BuildingId[];
  prereqsAny?: BuildingId[];
}

export const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  town_hall: {
    id: 'town_hall',
    name: 'Town Hall',
    footprint: { w: 3, h: 3 },
    cost: {},
    // Pre-built at game start via Building.markPrebuilt(); buildTimeSec
    // is non-zero only to keep the construction-progress math safe if it
    // ever flows through.
    buildTimeSec: 1,
    hpMax: 500,
  },
  house: {
    id: 'house',
    name: 'House',
    footprint: { w: 2, h: 2 },
    cost: { wood: 30 },
    buildTimeSec: 15,
    hpMax: 100,
  },
  lumber_mill: {
    id: 'lumber_mill',
    name: 'Lumber Mill',
    footprint: { w: 2, h: 2 },
    cost: { wood: 50, stone: 20 },
    buildTimeSec: 25,
    hpMax: 150,
  },
  quarry: {
    id: 'quarry',
    name: 'Quarry',
    footprint: { w: 2, h: 2 },
    cost: { wood: 40, stone: 30 },
    buildTimeSec: 25,
    hpMax: 150,
  },
  farm: {
    id: 'farm',
    name: 'Farm',
    footprint: { w: 2, h: 2 },
    cost: { wood: 40 },
    buildTimeSec: 20,
    hpMax: 80,
  },
  hunters_lodge: {
    id: 'hunters_lodge',
    name: "Hunter's Lodge",
    footprint: { w: 2, h: 2 },
    cost: { wood: 50, stone: 10 },
    buildTimeSec: 25,
    hpMax: 120,
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    footprint: { w: 3, h: 3 },
    cost: { wood: 80, stone: 40 },
    buildTimeSec: 35,
    hpMax: 200,
    prereqs: ['house'],
  },
  wall: {
    id: 'wall',
    name: 'Wall',
    footprint: { w: 1, h: 1 },
    cost: { stone: 10 },
    buildTimeSec: 5,
    hpMax: 200,
  },
  tower: {
    id: 'tower',
    name: 'Tower',
    footprint: { w: 2, h: 2 },
    cost: { wood: 30, stone: 60 },
    buildTimeSec: 30,
    hpMax: 250,
    prereqs: ['barracks'],
  },
  warehouse: {
    id: 'warehouse',
    name: 'Warehouse',
    footprint: { w: 2, h: 2 },
    cost: { wood: 60, stone: 30 },
    buildTimeSec: 25,
    hpMax: 150,
    prereqsAny: ['lumber_mill', 'quarry'],
  },
};

// Order of cards in the Build Menu drawer.
export const BUILDING_ORDER: BuildingId[] = [
  'house',
  'farm',
  'lumber_mill',
  'quarry',
  'warehouse',
  'hunters_lodge',
  'barracks',
  'wall',
  'tower',
];
