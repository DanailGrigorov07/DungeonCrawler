/**
 * Tile-based walls (1 = solid). Circle entities use axis-separated moves against walls.
 */
export class TileMap {
  /**
   * @param {number} tileSize
   * @param {number[][]} tiles rows[y][x], 0 floor 1 wall
   */
  constructor(tileSize, tiles) {
    this.tileSize = tileSize;
    this.tiles = tiles;
    this.rows = tiles.length;
    this.cols = tiles[0]?.length ?? 0;
    this.width = this.cols * tileSize;
    this.height = this.rows * tileSize;
  }

  isWallAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return true;
    return this.tiles[ty][tx] === 1;
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   */
  circleHitsWall(cx, cy, radius) {
    const ts = this.tileSize;
    const minTx = Math.floor((cx - radius) / ts);
    const maxTx = Math.floor((cx + radius) / ts);
    const minTy = Math.floor((cy - radius) / ts);
    const maxTy = Math.floor((cy + radius) / ts);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!this.isWallAt(tx, ty)) continue;
        const rx = tx * ts;
        const ry = ty * ts;
        if (circleRectOverlap(cx, cy, radius, rx, ry, ts, ts)) return true;
      }
    }
    return false;
  }

  /**
   * @param {{ x: number, y: number, radius: number }} e
   * @param {number} dx
   * @param {number} dy
   */
  moveEntity(e, dx, dy) {
    e.x += dx;
    if (this.circleHitsWall(e.x, e.y, e.radius)) e.x -= dx;
    e.y += dy;
    if (this.circleHitsWall(e.x, e.y, e.radius)) e.y -= dy;
  }

  /**
   * Keep entity inside world bounds (no walls outside map).
   * @param {{ x: number, y: number, radius: number }} e
   */
  clampToWorld(e) {
    e.x = Math.max(e.radius, Math.min(this.width - e.radius, e.x));
    e.y = Math.max(e.radius, Math.min(this.height - e.radius, e.y));
  }
}

function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} rx
 * @param {number} ry
 * @param {number} rw
 * @param {number} rh
 */
export function circleRectOverlapPortal(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
