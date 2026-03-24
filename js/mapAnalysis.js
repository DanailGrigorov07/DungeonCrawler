/**
 * Scans tile maps (0 floor, 1 wall) for spawn points, dead ends, and room-like cells.
 */
import { tileCenter } from "./levels.js";

/** @typedef {{ tx: number; ty: number }} Cell */

/**
 * @param {number[][]} tiles
 */
export function cardinalFloorCount(tiles, tx, ty) {
  const rows = tiles.length;
  const cols = tiles[0].length;
  let c = 0;
  if (ty > 0 && tiles[ty - 1][tx] === 0) c++;
  if (ty < rows - 1 && tiles[ty + 1][tx] === 0) c++;
  if (tx > 0 && tiles[ty][tx - 1] === 0) c++;
  if (tx < cols - 1 && tiles[ty][tx + 1] === 0) c++;
  return c;
}

/**
 * Dead end = floor tile with exactly one cardinal floor neighbor (corridor tip).
 * Room interior = floor with four cardinal floor neighbors (open square / hall).
 * @param {number[][]} tiles
 */
export function analyzeFloorTopology(tiles) {
  const rows = tiles.length;
  const cols = tiles[0].length;
  /** @type {Cell[]} */
  const floor = [];
  /** @type {Cell[]} */
  const deadEnds = [];
  /** @type {Cell[]} */
  const roomInteriors = [];

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (tiles[ty][tx] !== 0) continue;
      floor.push({ tx, ty });
      const n = cardinalFloorCount(tiles, tx, ty);
      if (n === 1) deadEnds.push({ tx, ty });
      if (n === 4) roomInteriors.push({ tx, ty });
    }
  }

  return { floor, deadEnds, roomInteriors, cols, rows };
}

/**
 * Cells that belong to any 2×2 block of floor (small “box” rooms / alcoves).
 * @param {number[][]} tiles
 * @returns {Set<string>}
 */
export function cellsIn2x2FloorBlocks(tiles) {
  const rows = tiles.length;
  const cols = tiles[0].length;
  const s = new Set();
  for (let ty = 0; ty < rows - 1; ty++) {
    for (let tx = 0; tx < cols - 1; tx++) {
      if (
        tiles[ty][tx] === 0 &&
        tiles[ty][tx + 1] === 0 &&
        tiles[ty + 1][tx] === 0 &&
        tiles[ty + 1][tx + 1] === 0
      ) {
        s.add(`${tx},${ty}`);
        s.add(`${tx + 1},${ty}`);
        s.add(`${tx},${ty + 1}`);
        s.add(`${tx + 1},${ty + 1}`);
      }
    }
  }
  return s;
}

/**
 * Corridor / junction tiles only: excludes dead ends, 4-neighbor room centers, and 2×2 floor boxes.
 * @param {{ floor: Cell[]; deadEnds: Cell[]; roomInteriors: Cell[] }} topology
 * @param {number[][]} tiles
 */
export function getSpawnableFloor(topology, tiles) {
  const bad = new Set();
  for (const c of topology.deadEnds) bad.add(`${c.tx},${c.ty}`);
  for (const c of topology.roomInteriors) bad.add(`${c.tx},${c.ty}`);
  for (const k of cellsIn2x2FloorBlocks(tiles)) bad.add(k);
  const out = topology.floor.filter((c) => !bad.has(`${c.tx},${c.ty}`));
  return out.length ? out : topology.floor;
}

/**
 * @param {Cell} anchor
 * @param {number} tw
 * @param {number} th
 * @param {Set<string>} spawnableKeys
 */
function portalRectSpawnSafe(anchor, tw, th, spawnableKeys) {
  for (let dy = 0; dy < th; dy++) {
    for (let dx = 0; dx < tw; dx++) {
      if (!spawnableKeys.has(`${anchor.tx + dx},${anchor.ty + dy}`)) return false;
    }
  }
  return true;
}

/**
 * @param {Cell[]} cells
 * @param {Cell} portalAnchor
 * @param {number} tw
 * @param {number} th
 */
export function filterOutPortalArea(cells, portalAnchor, tw, th) {
  return cells.filter((c) => {
    if (
      c.tx >= portalAnchor.tx &&
      c.tx < portalAnchor.tx + tw &&
      c.ty >= portalAnchor.ty &&
      c.ty < portalAnchor.ty + th
    ) {
      return false;
    }
    return true;
  });
}

/**
 * @param {number[][]} tiles
 * @param {number} tw
 * @param {number} th
 * @param {{ minTxFrac?: number }} [opts]
 */
export function findPortalAnchors(tiles, tw, th, opts = {}) {
  const minTxFrac = opts.minTxFrac ?? 0.52;
  const rows = tiles.length;
  const cols = tiles[0].length;
  const minTx = Math.floor(cols * minTxFrac);
  /** @type {Cell[]} */
  const anchors = [];
  for (let ty = 1; ty <= rows - th - 1; ty++) {
    for (let tx = Math.max(1, minTx); tx <= cols - tw - 1; tx++) {
      let ok = true;
      for (let dy = 0; dy < th && ok; dy++) {
        for (let dx = 0; dx < tw && ok; dx++) {
          if (tiles[ty + dy][tx + dx] !== 0) ok = false;
        }
      }
      if (ok) anchors.push({ tx, ty });
    }
  }
  return anchors;
}

/**
 * If right-side anchors are empty, retry with a lower fraction.
 * @param {number[][]} tiles
 * @param {number} tw
 * @param {number} th
 */
export function pickRandomPortalAnchor(tiles, tw, th) {
  let anchors = findPortalAnchors(tiles, tw, th, { minTxFrac: 0.52 });
  if (anchors.length === 0) anchors = findPortalAnchors(tiles, tw, th, { minTxFrac: 0.35 });
  if (anchors.length === 0) anchors = findPortalAnchors(tiles, tw, th, { minTxFrac: 0 });
  if (anchors.length === 0) return null;
  return anchors[Math.floor(Math.random() * anchors.length)];
}

/**
 * Prefer right-side floor rectangles; shrink portal if needed; last resort 1×1 on the right half.
 * @param {number[][]} tiles
 * @param {number} preferredTw
 * @param {number} preferredTh
 * @returns {{ anchor: Cell; tw: number; th: number }}
 */
export function resolvePortalPlacement(tiles, preferredTw, preferredTh) {
  const topo = analyzeFloorTopology(tiles);
  const spawnable = getSpawnableFloor(topo, tiles);
  const spawnKeys = new Set(spawnable.map((c) => `${c.tx},${c.ty}`));

  const sizeAttempts = [
    [preferredTw, preferredTh],
    [2, Math.min(preferredTh, 3)],
    [2, 2],
    [1, 2],
    [1, 1],
  ];
  for (const [tw, th] of sizeAttempts) {
    if (tw < 1 || th < 1) continue;
    let anchors = findPortalAnchors(tiles, tw, th, { minTxFrac: 0.52 }).filter((a) =>
      portalRectSpawnSafe(a, tw, th, spawnKeys),
    );
    if (anchors.length === 0)
      anchors = findPortalAnchors(tiles, tw, th, { minTxFrac: 0.35 }).filter((a) =>
        portalRectSpawnSafe(a, tw, th, spawnKeys),
      );
    if (anchors.length === 0)
      anchors = findPortalAnchors(tiles, tw, th, { minTxFrac: 0 }).filter((a) =>
        portalRectSpawnSafe(a, tw, th, spawnKeys),
      );
    if (anchors.length === 0) anchors = findPortalAnchors(tiles, tw, th, { minTxFrac: 0.52 });
    if (anchors.length === 0) anchors = findPortalAnchors(tiles, tw, th, { minTxFrac: 0.35 });
    if (anchors.length === 0) anchors = findPortalAnchors(tiles, tw, th, { minTxFrac: 0 });
    if (anchors.length > 0) {
      const a = anchors[Math.floor(Math.random() * anchors.length)];
      return { anchor: a, tw, th };
    }
  }
  const minTx = Math.floor(topo.cols * 0.45);
  const right = spawnable.filter((c) => c.tx >= minTx);
  const pool = right.length ? right : spawnable;
  const c = pickRandom(pool.length ? pool : topo.floor);
  return { anchor: c, tw: 1, th: 1 };
}

/**
 * Prefer left side of the map for player entry.
 * @param {Cell[]} floor
 * @param {number} cols
 * @param {number} [leftFrac]
 */
export function filterLeftSpawnZone(floor, cols, leftFrac = 0.4) {
  const maxTx = Math.max(2, Math.floor(cols * leftFrac));
  return floor.filter((c) => c.tx >= 1 && c.tx <= maxTx);
}

/**
 * @template T
 * @param {T[]} arr
 */
export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * @param {Cell} a
 * @param {Cell} b
 */
export function manhattan(a, b) {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
}

/**
 * @param {Cell} cell
 * @param {Cell[]} occupied
 * @param {number} minDist
 */
export function isFarFromAll(cell, occupied, minDist) {
  for (const o of occupied) {
    if (manhattan(cell, o) < minDist) return false;
  }
  return true;
}

/**
 * Picks enemy spawns on corridor/junction tiles only (not dead ends or box rooms).
 * Relaxes distance rules if not enough spots exist.
 * @param {{ deadEnds: Cell[]; roomInteriors: Cell[]; floor: Cell[] }} topology
 * @param {number[][]} tiles
 * @param {Cell} playerCell
 * @param {Cell} portalAnchor
 * @param {number} portalTw
 * @param {number} portalTh
 * @param {number} count
 */
export function pickEnemySpawnCells(
  topology,
  tiles,
  playerCell,
  portalAnchor,
  portalTw,
  portalTh,
  count,
) {
  let pool = getSpawnableFloor(topology, tiles);
  if (pool.length === 0) pool = topology.floor;

  const blocked = new Set();
  const blockCell = (c) => blocked.add(`${c.tx},${c.ty}`);
  blockCell(playerCell);
  for (let dy = 0; dy < portalTh; dy++) {
    for (let dx = 0; dx < portalTw; dx++) {
      blockCell({ tx: portalAnchor.tx + dx, ty: portalAnchor.ty + dy });
    }
  }

  /** @type {Cell[]} */
  const chosen = [];
  /** @type {Cell[]} */
  const occupied = [playerCell];

  let attempt = 0;
  while (chosen.length < count && attempt < count * 20) {
    attempt += 1;
    const minP = Math.max(0, 6 - Math.floor(attempt / 6));
    const minB = Math.max(0, 5 - Math.floor(attempt / 8));
    const candidates = pool.filter((c) => {
      if (blocked.has(`${c.tx},${c.ty}`)) return false;
      if (manhattan(c, playerCell) < minP) return false;
      if (!isFarFromAll(c, occupied, minB)) return false;
      return true;
    });
    if (candidates.length === 0) continue;
    const c = pickRandom(candidates);
    chosen.push(c);
    occupied.push(c);
    blockCell(c);
  }

  return chosen;
}

/**
 * Random patrol route: start tile + random walk on floor.
 * @param {number[][]} tiles
 * @param {number} sx
 * @param {number} sy
 * @param {number} len
 */
export function generatePatrolWaypoints(tiles, sx, sy, len = 4) {
  const rows = tiles.length;
  const cols = tiles[0].length;
  /** @type {{ x: number; y: number }[]} */
  const wps = [];
  let cx = sx;
  let cy = sy;
  wps.push(tileCenter(sx, sy));
  for (let i = 1; i < len; i++) {
    const neighbors = [
      { tx: cx, ty: cy - 1 },
      { tx: cx, ty: cy + 1 },
      { tx: cx - 1, ty: cy },
      { tx: cx + 1, ty: cy },
    ].filter(
      (p) =>
        p.ty >= 0 &&
        p.ty < rows &&
        p.tx >= 0 &&
        p.tx < cols &&
        tiles[p.ty][p.tx] === 0,
    );
    if (neighbors.length === 0) break;
    const n = pickRandom(neighbors);
    cx = n.tx;
    cy = n.ty;
    wps.push(tileCenter(cx, cy));
  }
  return wps;
}

/**
 * Random floor cells for pickups, excluding reserved tiles.
 * @param {Cell[]} floor
 * @param {Set<string>} reserved
 * @param {number} count
 */
export function pickPickupCells(floor, reserved, count) {
  const pool = floor.filter((c) => !reserved.has(`${c.tx},${c.ty}`));
  const out = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const c = pool.splice(idx, 1)[0];
    out.push(c);
    reserved.add(`${c.tx},${c.ty}`);
  }
  return out;
}

/**
 * Floor cell for boss spawn — far from the player.
 * @param {Cell[]} floor
 * @param {Cell} playerCell
 * @param {number} [minDist]
 */
export function pickBossSpawnCell(floor, playerCell, minDist = 14) {
  const pool = floor.filter((c) => manhattan(c, playerCell) >= minDist);
  if (pool.length === 0) {
    let best = floor[0];
    let bestD = -1;
    for (const c of floor) {
      const d = manhattan(c, playerCell);
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }
  return pickRandom(pool);
}

/**
 * Places random solid cover: each piece is 1×1, 2×1, 1×2, or 2×2 tiles (no larger).
 * At least `minCount` pieces; total count is random up to `maxCount`.
 * @param {number[][]} tiles — mutated in place (0 floor, 1 wall)
 * @param {{ minCount?: number; maxCount?: number }} [opts]
 */
export function placeRandomCoverBlocks(tiles, opts = {}) {
  const minCount = opts.minCount ?? 4;
  const maxCount = opts.maxCount ?? 14;
  const targetCount = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
  const rows = tiles.length;
  const cols = tiles[0].length;
  let placed = 0;
  let attempts = 0;
  while (placed < targetCount && attempts < 800) {
    attempts += 1;
    // Only 1×1 or 2×2 blocks (no 1×2 / 2×1 strips)
    const big = Math.random() < 0.45;
    const w = big ? 2 : 1;
    const h = big ? 2 : 1;
    const margin = 1;
    const maxTx = cols - w - margin;
    const maxTy = rows - h - margin;
    if (maxTx < margin || maxTy < margin) break;
    const tx = margin + Math.floor(Math.random() * (maxTx - margin + 1));
    const ty = margin + Math.floor(Math.random() * (maxTy - margin + 1));
    let ok = true;
    for (let dy = 0; dy < h && ok; dy++) {
      for (let dx = 0; dx < w && ok; dx++) {
        if (tiles[ty + dy][tx + dx] !== 0) ok = false;
      }
    }
    if (!ok) continue;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        tiles[ty + dy][tx + dx] = 1;
      }
    }
    placed += 1;
  }
}
