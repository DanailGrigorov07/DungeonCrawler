import { FiniteStateMachine } from "./fsm.js";

/** Distance thresholds (pixels), per assignment examples */
export const BOT_DIST_CHASE = 100;
export const BOT_DIST_ATTACK = 30;
export const BOT_DIST_FLEE_SAFE = 200;
/** Gunner starts shooting inside this range */
const GUNNER_ATTACK_RANGE = 200;

export class Bot {
  /**
   * @param {number} x
   * @param {number} y
   * @param {{ x: number; y: number }[]} waypoints
   * @param {{ variant?: "grunt" | "brute" | "gunner" }} [options]
   */
  constructor(x, y, waypoints, options = {}) {
    this.spawnX = x;
    this.spawnY = y;
    this.x = x;
    this.y = y;
    this.waypoints = waypoints;
    this.wpIndex = 0;
    this.variant = options.variant ?? "grunt";
    this.radius = 16;
    this.speedPatrol = this.variant === "brute" ? 75 : 90;
    this.speedChase = this.variant === "brute" ? 125 : this.variant === "gunner" ? 110 : 150;
    this.speedFlee = this.variant === "brute" ? 140 : 155;
    this.maxHealth = this.variant === "brute" ? 52 : this.variant === "gunner" ? 36 : 40;
    this.health = this.maxHealth;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.deadTimer = 0;
    this.idleTimer = 0;
    this.alive = true;
    this.markRemoved = false;

    this.hitFlash = 0;
    this.kbX = 0;
    this.kbY = 0;

    this.fsm = new FiniteStateMachine("IDLE", { debug: false });
    this._registerStates();
    this.fsm.begin();
  }

  _registerStates() {
    this.fsm
      .addState("IDLE", {
        enter: () => {
          this.idleTimer = 0.25;
        },
        update: (dt, ctx) => {
          this._applyKnockback(dt, ctx);
          if (this._dieIfNoHealth()) return;
          this.idleTimer -= dt;
          if (this.idleTimer <= 0) this.fsm.transition("PATROL", "idleEnd");
        },
      })
      .addState("PATROL", {
        update: (dt, ctx) => {
          this._applyKnockback(dt, ctx);
          if (this._dieIfNoHealth()) return;
          const { player, collisionMap } = ctx;
          const dist = Math.hypot(player.x - this.x, player.y - this.y);
          if (dist < BOT_DIST_CHASE && this.health / this.maxHealth < 0.2) {
            this.fsm.transition("FLEE", "health<20%");
            return;
          }
          if (dist < BOT_DIST_CHASE) {
            this.fsm.transition("CHASE", "playerDistance<100");
            return;
          }
          this._patrolMove(dt, collisionMap);
        },
      })
      .addState("CHASE", {
        update: (dt, ctx) => {
          this._applyKnockback(dt, ctx);
          if (this._dieIfNoHealth()) return;
          const { player, collisionMap } = ctx;
          const dist = Math.hypot(player.x - this.x, player.y - this.y);
          if (this.health / this.maxHealth < 0.2) {
            this.fsm.transition("FLEE", "health<20%");
            return;
          }
          const inAttack =
            this.variant === "gunner"
              ? dist < GUNNER_ATTACK_RANGE
              : dist < BOT_DIST_ATTACK;
          if (inAttack) {
            this.fsm.transition("ATTACK", "inAttackRange");
            return;
          }
          if (dist > BOT_DIST_FLEE_SAFE) {
            this.fsm.transition("PATROL", "playerDistance>200");
            return;
          }
          this._moveToward(player.x, player.y, this.speedChase, dt, collisionMap);
        },
      })
      .addState("ATTACK", {
        enter: () => {
          this.attackTimer = this.variant === "gunner" ? 0.5 : 0.35;
          this.attackCooldown = this.variant === "gunner" ? 0.45 : 0.5;
        },
        update: (dt, ctx) => {
          this._applyKnockback(dt, ctx);
          if (this._dieIfNoHealth()) return;
          const { player, collisionMap } = ctx;
          const dist = Math.hypot(player.x - this.x, player.y - this.y);
          if (this.health / this.maxHealth < 0.2) {
            this.fsm.transition("FLEE", "health<20%");
            return;
          }
          if (this.variant === "gunner") {
            this.attackTimer -= dt;
            this.attackCooldown -= dt;
            if (this.attackCooldown <= 0) {
              ctx.spawnEnemyBullet?.(this.x, this.y, player);
              this.attackCooldown = 0.55;
            }
            if (dist > GUNNER_ATTACK_RANGE + 40) {
              this.fsm.transition("CHASE", "outOfGunRange");
              return;
            }
            if (this.attackTimer <= 0) {
              this.attackTimer = 0.5;
            }
          } else {
            this.attackTimer -= dt;
            this.attackCooldown -= dt;
            if (dist <= BOT_DIST_ATTACK + 4 && this.attackCooldown <= 0) {
              ctx.damagePlayer(8);
              this.attackCooldown = 0.55;
              ctx.onBotHitPlayer?.(this);
            }
            if (dist > BOT_DIST_ATTACK + 8) {
              this.fsm.transition("CHASE", "outOfMelee");
              return;
            }
            if (this.attackTimer <= 0) {
              if (dist < BOT_DIST_ATTACK) {
                this.attackTimer = 0.35;
              } else {
                this.fsm.transition("CHASE", "attackEnd");
              }
            }
          }
        },
      })
      .addState("FLEE", {
        update: (dt, ctx) => {
          this._applyKnockback(dt, ctx);
          if (this._dieIfNoHealth()) return;
          const { player, collisionMap } = ctx;
          const dist = Math.hypot(player.x - this.x, player.y - this.y);
          if (dist > BOT_DIST_FLEE_SAFE) {
            this.fsm.transition("PATROL", "playerDistance>200");
            return;
          }
          const ax = this.x - player.x;
          const ay = this.y - player.y;
          const len = Math.hypot(ax, ay) || 1;
          const vx = (ax / len) * this.speedFlee * dt;
          const vy = (ay / len) * this.speedFlee * dt;
          collisionMap.moveEntity(this, vx, vy);
          collisionMap.clampToWorld(this);
        },
      })
      .addState("DEAD", {
        enter: () => {
          this.alive = false;
          this.deadTimer = 1.35;
        },
        update: (dt) => {
          this.deadTimer -= dt;
          if (this.deadTimer <= 0) {
            this.markRemoved = true;
          }
        },
      });
  }

  /**
   * @param {object} ctx
   */
  _applyKnockback(dt, ctx) {
    const collisionMap = ctx.collisionMap;
    if (!collisionMap) return;
    if (Math.abs(this.kbX) > 0.5 || Math.abs(this.kbY) > 0.5) {
      collisionMap.moveEntity(this, this.kbX * dt, this.kbY * dt);
      this.kbX *= Math.pow(0.15, dt * 60);
      this.kbY *= Math.pow(0.15, dt * 60);
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  _dieIfNoHealth() {
    if (this.health <= 0) {
      this.fsm.transition("DEAD", "health<=0");
      return true;
    }
    return false;
  }

  /**
   * @param {import("./collision.js").TileMap} collisionMap
   */
  _patrolMove(dt, collisionMap) {
    if (this.waypoints.length === 0) return;
    const target = this.waypoints[this.wpIndex];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) {
      this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
      return;
    }
    this._moveToward(target.x, target.y, this.speedPatrol, dt, collisionMap);
  }

  /**
   * @param {import("./collision.js").TileMap} collisionMap
   */
  _moveToward(tx, ty, speed, dt, collisionMap) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx / len) * speed * dt;
    const vy = (dy / len) * speed * dt;
    collisionMap.moveEntity(this, vx, vy);
    collisionMap.clampToWorld(this);
  }

  /**
   * @param {number} amount
   * @param {number} [fromX] bullet position (knockback away from this)
   * @param {number} [fromY]
   */
  takeDamage(amount, fromX, fromY) {
    this.health = Math.max(0, this.health - amount);
    this.hitFlash = 0.14;
    if (fromX != null && fromY != null) {
      const kx = this.x - fromX;
      const ky = this.y - fromY;
      const len = Math.hypot(kx, ky) || 1;
      this.kbX += (kx / len) * 180;
      this.kbY += (ky / len) * 180;
    }
  }

  update(dt, context) {
    this.fsm.update(dt, context);
  }
}
