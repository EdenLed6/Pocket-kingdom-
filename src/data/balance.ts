// All tunable numbers per Appendix A of the spec. Tune after Phase 5
// playtesting; do not pre-tune.

export const BALANCE = {
  startingResources: { wood: 50, stone: 30, food: 50 },
  startingWorkers: 3,

  worker: {
    hpMax: 20,
    speedPxPerSec: 60,
    carryCapacity: 5,
    gatherTimeSec: { wood: 3, stone: 4, food: 3 },
    yieldPerGather: { wood: 5, stone: 4, food: 4 },
    fleeRangeTiles: 4,
  },

  storage: {
    initialCap: { wood: 200, stone: 150, food: 200 },
    perWarehouse: { wood: 200, stone: 150, food: 200 },
  },

  foodConsumptionPer30Sec: { worker: 1, soldier: 2 },

  raid: {
    firstRaidAtSec: 180,
    intervalMinSec: 90,
    intervalMaxSec: 150,
    warningLeadSec: 10,
    minPower: 20,
    maxRaidUnitCount: 25,
    difficultyTiers: [
      { untilSec: 300, mult: 0.4 },
      { untilSec: 600, mult: 0.55 },
      { untilSec: 900, mult: 0.7 },
      { untilSec: 1200, mult: 0.85 },
      { untilSec: Infinity, mult: 1.0 },
    ],
    powerCapMultiplier: 1.1,
  },

  power: {
    buildingHpWeight: 0.5,
    workerWeight: 5,
    soldierCostWeight: 1.0,
    stockpileWeight: 0.05,
    recomputeIntervalSec: 5,
  },

  // Per §4.5: regrow / respawn cadence for resource nodes.
  nodes: {
    treeRegrowSec: 180,
    bushRegrowSec: 60,
    animalRespawnSec: 120,
    // Stone outcrops do NOT regrow; new ones spawn at edges (§4.5). Phase 3
    // initial set is static; edge respawn is deferred.
  },

  // Town Hall placeholder position (tile coords for the top-left of the 3x3
  // footprint). Center-bottom of the map per §4.5.
  townHall: {
    tileX: 19,
    tileY: 45,
    sizeTiles: 3,
  },
} as const;

export type ResourceType = 'wood' | 'stone' | 'food';
export type NodeKind = 'tree' | 'rock' | 'bush' | 'animal';

export const NODE_TO_RESOURCE: Record<NodeKind, ResourceType> = {
  tree: 'wood',
  rock: 'stone',
  bush: 'food',
  animal: 'food',
};
