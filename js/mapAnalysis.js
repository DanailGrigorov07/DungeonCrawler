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
  const sizeAttempts = [
    [preferredTw, preferredTh],
    [2, Math.min(preferredTh, 3)],
    [2, 2],
    [1, 2],
    [1, 1],
  ];
  for (const [tw, th] of sizeAttempts) {
    if (tw < 1 || th < 1) continue;
    const a = pickRandomPortalAnchor(tiles, tw, th);
    if (a) return { anchor: a, tw, th };
  }
  const topo = analyzeFloorTopology(tiles);
  const minTx = Math.floor(topo.cols * 0.45);
  const right = topo.floor.filter((c) => c.tx >= minTx);
  const pool = right.length ? right : topo.floor;
  const c = pickRandom(pool);
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
 * Prefer dead ends and room interiors; fall back to any floor tile.
 * Relaxes distance rules if not enough spots exist.
 * @param {{ deadEnds: Cell[]; roomInteriors: Cell[]; floor: Cell[] }} topology
 * @param {Cell} playerCell
 * @param {Cell} portalAnchor
 * @param {number} portalTw
 * @param {number} portalTh
 * @param {number} count
 */
export function pickEnemySpawnCells(
  topology,
  playerCell,
  portalAnchor,
  portalTw,
  portalTh,
  count,
) {
  const pool = [];
  const seen = new Set();
  const pushUnique = (c) => {
    const k = `${c.tx},${c.ty}`;
    if (seen.has(k)) return;
    seen.add(k);
    pool.push(c);
  };

  for (const c of topology.deadEnds) pushUnique(c);
  for (const c of topology.roomInteriors) pushUnique(c);
  for (const c of topology.floor) pushUnique(c);

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
