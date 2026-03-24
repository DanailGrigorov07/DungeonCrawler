/**
 * Arena boss: skirmish (move + shoot), charge (rush until blocked), vulnerable (3s, 2× damage, passive).
 */
export class Boss {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.variant = "boss";
    /** Collision radius — smaller than tile so the boss can move in corridors/arena. */
    this.radius = 17;
    /** Visual size on screen (draw only). */
    this.drawRadius = 26;
    this.chargeHitCooldown = 0;
    this.maxHealth = 420;
    this.health = this.maxHealth;
    this.alive = true;
    this.markRemoved = false;
    this.hitFlash = 0;
    this.kbX = 0;
    this.kbY = 0;
    this.deadTimer = 0;

    /** @type {"skirmish" | "charge" | "vulnerable"} */
    this.phase = "skirmish";
    this.phaseTimer = 0;
    this.chargeCooldown = 1.2 + Math.random() * 1.4;
    this.vulnerableCooldown = 5 + Math.random() * 4;

    this.wanderAngle = Math.random() * Math.PI * 2;
    this.moveTimer = 0;
    this.shootTimer = 0;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.patternFlip = 0;
    this.chargeAngle = 0;
  }

  /**
   * @param {object} ctx
   */
  _applyKnockback(dt, ctx) {
    const collisionMap = ctx.collisionMap;
    if (!collisionMap) return;
    if (Math.abs(this.kbX) > 0.5 || Math.abs(this.kbY) > 0.5) {
      collisionMap.moveEntity(this, this.kbX * dt, this.kbY * dt);
      this.kbX *= Math.pow(0.12, dt * 60);
      this.kbY *= Math.pow(0.12, dt * 60);
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  /**
   * @param {number} dt
   * @param {object} ctx
   */
  update(dt, ctx) {
    if (!this.alive) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.markRemoved = true;
      return;
    }

    const { player, collisionMap } = ctx;
    if (this.chargeHitCooldown > 0) this.chargeHitCooldown -= dt;
    this._applyKnockback(dt, ctx);

    if (this.health <= 0) {
      this.alive = false;
      this.deadTimer = 1.65;
      return;
    }

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.patternFlip += dt * 11;

    if (this.phase === "charge") {
      this._updateCharge(dt, ctx, player, collisionMap);
      return;
    }
    if (this.phase === "vulnerable") {
      this._updateVulnerable(dt, ctx, player, collisionMap);
      return;
    }

    this._updateSkirmish(dt, ctx, player, collisionMap, dist);
  }

  /**
   * @param {object} player
   * @param {import("./collision.js").TileMap} collisionMap
   */
  _updateCharge(dt, ctx, player, collisionMap) {
    this.phaseTimer -= dt;
    const ang = Math.atan2(player.y - this.y, player.x - this.x);
    this.chargeAngle = ang;
    /* Charge: 322 × (1 − 0.35) = 209.3 px/s */
    const spd = 209.3;
    const ox = this.x;
    const oy = this.y;
    collisionMap.moveEntity(this, Math.cos(ang) * spd * dt, Math.sin(ang) * spd * dt);
    const moved = Math.hypot(this.x - ox, this.y - oy);
    const expect = spd * dt;
    const blocked = moved < Math.max(0.8, expect * 0.18);
    if (blocked || this.phaseTimer <= 0) {
      this.phase = "skirmish";
      this.chargeCooldown = 6;
    }
  }

  /**
   * @param {object} player
   * @param {import("./collision.js").TileMap} collisionMap
   */
  _updateVulnerable(dt, ctx, player, collisionMap) {
    this.phaseTimer -= dt;
    const drift = 38.5;
    const ang = Math.atan2(player.y - this.y, player.x - this.x) + Math.PI * 0.92;
    collisionMap.moveEntity(
      this,
      Math.cos(ang) * drift * dt,
      Math.sin(ang) * drift * dt,
    );
    collisionMap.clampToWorld(this);
    if (this.phaseTimer <= 0) {
      this.phase = "skirmish";
      this.vulnerableCooldown = 11 + Math.random() * 9;
    }
  }

  /**
   * @param {object} player
   * @param {import("./collision.js").TileMap} collisionMap
   */
  _updateSkirmish(dt, ctx, player, collisionMap, dist) {
    this.chargeCooldown -= dt;
    this.vulnerableCooldown -= dt;

    if (this.chargeCooldown <= 0 && Math.random() < 0.42) {
      this.phase = "charge";
      this.phaseTimer = 1.35 + Math.random() * 0.55;
      this._updateCharge(dt, ctx, player, collisionMap);
      return;
    }
    if (this.vulnerableCooldown <= 0 && Math.random() < 0.14) {
      this.phase = "vulnerable";
      this.phaseTimer = 3;
      this.vulnerableCooldown = 999;
      return;
    }

    this.moveTimer -= dt;
    if (this.moveTimer <= 0) {
      this.moveTimer = 0.04 + Math.random() * 0.07;
      const toPlayer = Math.atan2(
        player.y - this.y,
        player.x - this.x,
      );
      const tang = toPlayer + (Math.PI / 2) * this.strafeSign;
      if (Math.random() < 0.48) this.strafeSign *= -1;
      this.wanderAngle =
        tang + Math.sin(this.patternFlip) * 0.9 + (Math.random() - 0.5) * 1.15;
      if (dist < 130 && Math.random() < 0.38) {
        this.wanderAngle = toPlayer + Math.PI + (Math.random() - 0.5) * 0.65;
      }
    }

    const sp = 202 + Math.sin(performance.now() * 0.01) * 31.5;
    const vx = Math.cos(this.wanderAngle) * sp * dt;
    const vy = Math.sin(this.wanderAngle) * sp * dt;
    collisionMap.moveEntity(this, vx, vy);
    collisionMap.clampToWorld(this);

    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      /* 20% slower fire rate → interval × 1.25: (0.1 + r×0.11) × 1.25 */
      this.shootTimer = 0.125 + Math.random() * 0.1375;
      const base = Math.atan2(player.y - this.y, player.x - this.x);
      const fan = Math.random() < 0.4 ? 5 : Math.random() < 0.55 ? 4 : 3;
      const spread = 0.42;
      for (let i = 0; i < fan; i++) {
        const t = fan <= 1 ? 0 : (i / (fan - 1) - 0.5) * 2;
        const a = base + t * spread;
        ctx.spawnEnemyBulletAtAngle?.(this.x, this.y, a);
      }
      if (Math.random() < 0.22) {
        for (let k = -2; k <= 2; k++) {
          ctx.spawnEnemyBulletAtAngle?.(
            this.x,
            this.y,
            base + k * 0.2 + (Math.random() - 0.5) * 0.08,
          );
        }
      }
    }
  }

  /**
   * @param {number} amount
   * @param {number} [fromX]
   * @param {number} [fromY]
   */
  takeDamage(amount, fromX, fromY) {
    let m = amount;
    if (this.phase === "vulnerable") m *= 2;
    this.health = Math.max(0, this.health - m);
    this.hitFlash = 0.14;
    if (fromX != null && fromY != null) {
      const kx = this.x - fromX;
      const ky = this.y - fromY;
      const len = Math.hypot(kx, ky) || 1;
      this.kbX += (kx / len) * 200;
      this.kbY += (ky / len) * 200;
    }
  }
}
