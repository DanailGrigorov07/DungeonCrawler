export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 14;
    this.speed = 220;
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.aimAngle = 0;
    this.fireCooldown = 0;
    this.fireRate = 0.18;
    /** dash velocity (world units / s) */
    this.dashVx = 0;
    this.dashVy = 0;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  /**
   * @param {import("./collision.js").TileMap} collisionMap
   */
  update(dt, input, collisionMap) {
    const dashCode = input.consumeDash?.() ?? null;
    if (dashCode) {
      const m = dashDirFromCode(dashCode);
      if (m) {
        const dashSpeed = 520;
        this.dashVx = m[0] * dashSpeed;
        this.dashVy = m[1] * dashSpeed;
      }
    }

    const dax = this.dashVx * dt;
    const day = this.dashVy * dt;
    if (Math.abs(this.dashVx) > 8 || Math.abs(this.dashVy) > 8) {
      collisionMap.moveEntity(this, dax, day);
      this.dashVx *= Math.pow(0.02, dt / 0.14);
      this.dashVy *= Math.pow(0.02, dt / 0.14);
    } else {
      this.dashVx = 0;
      this.dashVy = 0;
    }

    let dx = 0;
    let dy = 0;
    if (input.isDown("KeyW") || input.isDown("ArrowUp")) dy -= 1;
    if (input.isDown("KeyS") || input.isDown("ArrowDown")) dy += 1;
    if (input.isDown("KeyA") || input.isDown("ArrowLeft")) dx -= 1;
    if (input.isDown("KeyD") || input.isDown("ArrowRight")) dx += 1;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx = (dx / len) * this.speed * dt;
      dy = (dy / len) * this.speed * dt;
      collisionMap.moveEntity(this, dx, dy);
    }
    collisionMap.clampToWorld(this);

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
  }

  canFire() {
    return this.fireCooldown <= 0;
  }

  resetFire() {
    this.fireCooldown = this.fireRate;
  }
}

/** @returns {[number, number] | null} unit direction */
function dashDirFromCode(code) {
  switch (code) {
    case "KeyW":
    case "ArrowUp":
      return [0, -1];
    case "KeyS":
    case "ArrowDown":
      return [0, 1];
    case "KeyA":
    case "ArrowLeft":
      return [-1, 0];
    case "KeyD":
    case "ArrowRight":
      return [1, 0];
    default:
      return null;
  }
}
