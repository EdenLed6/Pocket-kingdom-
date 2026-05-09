// 4-connected A* over a tile grid. Pure TS, no Phaser deps.

export interface TileXY {
  tx: number;
  ty: number;
}

type IsWalkable = (tx: number, ty: number) => boolean;

interface Node {
  tx: number;
  ty: number;
  g: number;
  f: number;
  parent: Node | null;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function key(tx: number, ty: number): number {
  // Fits 40x60 plus headroom; we never have negative coords.
  return ty * 4096 + tx;
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

// Returns a list of tile coords from start to goal (inclusive), or null if no
// path. The start tile is included so callers can decide whether to skip it.
export function findPath(
  start: TileXY,
  goal: TileXY,
  width: number,
  height: number,
  isWalkable: IsWalkable,
): TileXY[] | null {
  if (start.tx === goal.tx && start.ty === goal.ty) {
    return [{ tx: start.tx, ty: start.ty }];
  }

  // We allow goal to be unwalkable (e.g. a tree we want to walk INTO). Start
  // must be walkable, otherwise treat the unit as stuck.
  if (!isWalkable(start.tx, start.ty)) return null;

  const open = new Map<number, Node>();
  const closed = new Set<number>();
  const startNode: Node = {
    tx: start.tx,
    ty: start.ty,
    g: 0,
    f: manhattan(start.tx, start.ty, goal.tx, goal.ty),
    parent: null,
  };
  open.set(key(start.tx, start.ty), startNode);

  while (open.size > 0) {
    // Pick lowest-f node from open. Linear scan is fine for 40x60.
    let bestKey = -1;
    let best: Node | null = null;
    for (const [k, n] of open) {
      if (!best || n.f < best.f) {
        best = n;
        bestKey = k;
      }
    }
    if (!best) break;

    if (best.tx === goal.tx && best.ty === goal.ty) {
      const path: TileXY[] = [];
      let cur: Node | null = best;
      while (cur) {
        path.push({ tx: cur.tx, ty: cur.ty });
        cur = cur.parent;
      }
      return path.reverse();
    }

    open.delete(bestKey);
    closed.add(bestKey);

    for (const [dx, dy] of DIRS) {
      const nx = best.tx + dx;
      const ny = best.ty + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nKey = key(nx, ny);
      if (closed.has(nKey)) continue;
      // Goal is allowed to be unwalkable (target).
      const isGoal = nx === goal.tx && ny === goal.ty;
      if (!isGoal && !isWalkable(nx, ny)) continue;
      const tentativeG = best.g + 1;
      const existing = open.get(nKey);
      if (existing && tentativeG >= existing.g) continue;
      const node: Node = {
        tx: nx,
        ty: ny,
        g: tentativeG,
        f: tentativeG + manhattan(nx, ny, goal.tx, goal.ty),
        parent: best,
      };
      open.set(nKey, node);
    }
  }

  return null;
}
