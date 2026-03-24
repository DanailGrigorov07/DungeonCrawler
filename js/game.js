import { Player } from "./player.js";
import { Bot } from "./bot.js";
import { Boss } from "./boss.js";
import {
  LEVELS,
  buildTileMap,
  buildTileMapFromTiles,
  cloneTilesFromRows,
  tileCenter,
  portalWorldRect,
} from "./levels.js";
import { circleRectOverlapPortal } from "./collision.js";
import {
  analyzeFloorTopology,
  filterLeftSpawnZone,
  pickEnemySpawnCells,
  generatePatrolWaypoints,
  pickPickupCells,
  pickRandom,
  resolvePortalPlacement,
  placeRandomCoverBlocks,
  pickBossSpawnCell,
  getSpawnableFloor,
} from "./mapAnalysis.js";

/** Shuffle floors 0–2; boss (index 3) is always last. */
function shuffleRunOrder() {
  const a = [0, 1, 2];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.concat([3]);
}

export class Game {
  constructor(canvas, audio, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.audio = audio;
    this.onHudUpdate = options.onHudUpdate ?? (() => {});
    /** @type {(mode: string) => void} */
    this.onScreenChange = options.onScreenChange ?? (() => {});

    this.collisionMap = null;
    this.worldW = 800;
    this.worldH = 600;

    this.player = new Player(400, 300);
    this.bots = [];
    this.bullets = [];
    /** @type {{ x: number; y: number; kind: string; r: number; collected: boolean }[]} */
    this.pickups = [];
    /** @type {{ x: number; y: number; w: number; h: number } | null} */
    this.portalRect = null;

    this.levelIndex = 0;
    /** Progress 0..3 within a run (floor number − 1). */
    this.runLevelIndex = 0;
    /** Order of LEVELS indices: three dungeon maps shuffled, then boss. */
    this.levelSequence = /** @type {number[]} */ ([0, 1, 2, 3]);
    this.score = 0;
    this.zoom = 1;
    this.minZoom = 0.55;
    this.maxZoom = 1.6;

    /** Fit-to-screen scale (before user zoom). */
    this.viewScale = 1;
    this.viewOffX = 0;
    this.viewOffY = 0;

    this.running = false;
    this.paused = false;
    this.lastTime = 0;
    this.rafId = 0;

    this._loop = this._loop.bind(this);
  }

  /** @deprecated use worldW — kept for older callers */
  get arena() {
    return { width: this.worldW, height: this.worldH };
  }

  /**
   * Screen (CSS px) to world coordinates.
   * @param {number} sx
   * @param {number} sy
   */
  screenToWorld(sx, sy) {
    const scale = this.viewScale * this.zoom;
    return {
      x: (sx - this.viewOffX) / scale,
      y: (sy - this.viewOffY) / scale,
    };
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    this.canvas.width = Math.floor(cw * dpr);
    this.canvas.height = Math.floor(ch * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ww = this.worldW;
    const wh = this.worldH;
    if (ww > 0 && wh > 0) {
      const fit = Math.min(cw / ww, ch / wh) * 0.98;
      this.viewScale = fit;
      const zw = ww * fit * this.zoom;
      const zh = wh * fit * this.zoom;
      this.viewOffX = (cw - zw) / 2;
      this.viewOffY = (ch - zh) / 2;
    }
  }

  /**
   * @param {number} index
   * @param {number | null} [carryHealth] previous HP when entering from a portal; omit for full health
   */
  loadLevel(index, carryHealth = null) {
    const def = LEVELS[index];
    if (!def) return;

    this.levelIndex = index;

    /** @type {number[][]} */
    let tiles;
    if (def.bossRoom) {
      tiles = cloneTilesFromRows(def.rows);
      placeRandomCoverBlocks(tiles);
      this.collisionMap = buildTileMapFromTiles(tiles);
    } else {
      this.collisionMap = buildTileMap(def);
      tiles = this.collisionMap.tiles;
    }

    this.worldW = this.collisionMap.width;
    this.worldH = this.collisionMap.height;

    const topo = analyzeFloorTopology(tiles);
    const spawnable = getSpawnableFloor(topo, tiles);

    let leftZone = filterLeftSpawnZone(spawnable, topo.cols);
    if (leftZone.length === 0) leftZone = spawnable;
    if (leftZone.length === 0) leftZone = topo.floor;
    const playerCell = pickRandom(leftZone);
    const sp = tileCenter(playerCell.tx, playerCell.ty);
    this.player = new Player(sp.x, sp.y);
    if (carryHealth != null) {
      this.player.health = Math.min(carryHealth, this.player.maxHealth);
    }

    if (def.bossRoom) {
      this.portalRect = null;
      const bossCell = pickBossSpawnCell(spawnable, playerCell);
      const bc = tileCenter(bossCell.tx, bossCell.ty);
      const reserved = new Set();
      reserved.add(`${playerCell.tx},${playerCell.ty}`);
      reserved.add(`${bossCell.tx},${bossCell.ty}`);
      const pickupCells = pickPickupCells(
        spawnable,
        reserved,
        def.pickups.length,
      );
      this.pickups = def.pickups
        .map((p, i) => {
          const cell = pickupCells[i];
          if (!cell) return null;
          const c = tileCenter(cell.tx, cell.ty);
          return {
            x: c.x,
            y: c.y,
            kind: p.kind,
            r: 10,
            collected: false,
          };
        })
        .filter((pu) => pu != null);
      this.bots = [new Boss(bc.x, bc.y)];
      this.bullets = [];
      return;
    }

    const portalSpec = def.portal;
    if (!portalSpec) return;

    const { anchor: portalAnchor, tw: portalTw, th: portalTh } =
      resolvePortalPlacement(tiles, portalSpec.tw, portalSpec.th);
    this.portalRect = portalWorldRect({
      tx: portalAnchor.tx,
      ty: portalAnchor.ty,
      tw: portalTw,
      th: portalTh,
    });

    /** @type {{ variant?: string }[]} */
    let botDefs = def.bots.map((b) => ({ ...b }));
    if (!def.bossRoom && this.runLevelIndex <= 2) {
      botDefs.push({ variant: "shotgun" });
    }

    const enemyCells = pickEnemySpawnCells(
      topo,
      tiles,
      playerCell,
      portalAnchor,
      portalTw,
      portalTh,
      botDefs.length,
    );

    const reserved = new Set();
    reserved.add(`${playerCell.tx},${playerCell.ty}`);
    for (let dy = 0; dy < portalTh; dy++) {
      for (let dx = 0; dx < portalTw; dx++) {
        reserved.add(`${portalAnchor.tx + dx},${portalAnchor.ty + dy}`);
      }
    }
    for (const ec of enemyCells) {
      reserved.add(`${ec.tx},${ec.ty}`);
    }

    const pickupCells = pickPickupCells(
      spawnable,
      reserved,
      def.pickups.length,
    );
    this.pickups = def.pickups
      .map((p, i) => {
        const cell = pickupCells[i];
        if (!cell) return null;
        const c = tileCenter(cell.tx, cell.ty);
        return {
          x: c.x,
          y: c.y,
          kind: p.kind,
          r: 10,
          collected: false,
        };
      })
      .filter((pu) => pu != null);

    this.bots = botDefs
      .map((b, i) => {
        const cell = enemyCells[i];
        if (!cell) return null;
        const c = tileCenter(cell.tx, cell.ty);
        const wps = generatePatrolWaypoints(tiles, cell.tx, cell.ty, 5);
        return new Bot(c.x, c.y, wps, { variant: b.variant ?? "grunt" });
      })
      .filter((bot) => bot != null);

    this.bullets = [];
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.score = 0;
    this.bullets = [];
    this.levelSequence = shuffleRunOrder();
    this.runLevelIndex = 0;
    this.loadLevel(this.levelSequence[0]);
    this.resize();

    this.audio.resume().then(() => this.audio.startBgm());
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._loop);

    document.dispatchEvent(
      new CustomEvent("gameStart", {
        detail: {
          level: this.runLevelIndex + 1,
          totalLevels: LEVELS.length,
        },
        bubbles: true,
      }),
    );
    this.onHudUpdate(this);
    this.onScreenChange("playing");
  }

  stopLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.running = false;
  }

  gameOver() {
    if (!this.running) return;
    this.stopLoop();
    this.audio.stopBgm();
    this.audio.playGameOver();
    document.dispatchEvent(
      new CustomEvent("gameOver", {
        detail: {
          score: this.score,
          level: this.runLevelIndex + 1,
        },
        bubbles: true,
      }),
    );
    this.onScreenChange("gameover");
  }

  victory() {
    if (!this.running) return;
    this.stopLoop();
    this.audio.stopBgm();
    this.audio.playLevelUp();
    document.dispatchEvent(
      new CustomEvent("gameVictory", {
        detail: { score: this.score },
        bubbles: true,
      }),
    );
    this.onScreenChange("victory");
  }

  pauseExternal() {
    if (!this.running || this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.onScreenChange("pause");
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    this.onScreenChange(this.paused ? "pause" : "playing");
    if (this.paused) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    } else {
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this._loop);
    }
  }

  applyZoom(deltaY) {
    const step = deltaY > 0 ? -0.06 : 0.06;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + step));
    this.resize();
  }

  _advanceLevelOrWin() {
    if (this.runLevelIndex >= this.levelSequence.length - 1) {
      this.victory();
      return;
    }
    const hp = this.player.health;
    this.runLevelIndex += 1;
    document.dispatchEvent(
      new CustomEvent("levelUp", {
        detail: {
          level: this.runLevelIndex + 1,
          totalLevels: LEVELS.length,
        },
        bubbles: true,
      }),
    );
    this.audio.playLevelUp();
    this.loadLevel(this.levelSequence[this.runLevelIndex], hp);
    this.resize();
    this.onHudUpdate(this);
  }

  _loop(now) {
    if (!this.running) return;
    if (this.paused) {
      this.rafId = 0;
      return;
    }

    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this._update(dt);
    this._draw();

    this.rafId = requestAnimationFrame(this._loop);
  }

  _damagePlayer(amount) {
    if (!this.running || this.paused) return;
    this.player.takeDamage(amount);
    this.audio.playPlayerHit();
    this.onHudUpdate(this);
    if (this.player.health <= 0) this.gameOver();
  }

  _update(dt) {
    if (!this.collisionMap) return;

    const input = this.input;
    this.player.aimAngle = Math.atan2(
      input.mouse.y - this.player.y,
      input.mouse.x - this.player.x,
    );

    this.player.update(dt, input, this.collisionMap);

    if (input.mouse.down && this.player.canFire()) {
      const spd = 420;
      this.bullets.push({
        x: this.player.x + Math.cos(this.player.aimAngle) * (this.player.radius + 2),
        y: this.player.y + Math.sin(this.player.aimAngle) * (this.player.radius + 2),
        vx: Math.cos(this.player.aimAngle) * spd,
        vy: Math.sin(this.player.aimAngle) * spd,
        life: 1.2,
        fromPlayer: true,
        r: 5,
      });
      this.player.resetFire();
      this.audio.playShoot();
    }

    const pr = this.portalRect;
    if (
      pr &&
      circleRectOverlapPortal(
        this.player.x,
        this.player.y,
        this.player.radius,
        pr.x,
        pr.y,
        pr.w,
        pr.h,
      )
    ) {
      this._advanceLevelOrWin();
      return;
    }

    for (const pu of this.pickups) {
      if (pu.collected) continue;
      const d = Math.hypot(pu.x - this.player.x, pu.y - this.player.y);
      if (d < pu.r + this.player.radius) {
        pu.collected = true;
        if (pu.kind === "health") {
          this.player.health = Math.min(
            this.player.maxHealth,
            this.player.health + 28,
          );
        } else if (pu.kind === "coin") {
          this.score += 50;
        }
        this.audio.playHit();
        this.onHudUpdate(this);
      }
    }

    const botCtx = {
      player: this.player,
      collisionMap: this.collisionMap,
      damagePlayer: (amt) => this._damagePlayer(amt),
      onBotHitPlayer: () => {},
      spawnEnemyBullet: (bx, by, player, opts) => {
        const ang = Math.atan2(player.y - by, player.x - bx);
        const spd = 265;
        const pushBullet = (px, py) => {
          this.bullets.push({
            x: px,
            y: py,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            life: 2.8,
            fromPlayer: false,
            r: 6,
          });
        };
        if (opts?.shotgun) {
          const perp = ang + Math.PI / 2;
          const sep = 8;
          for (const s of [-1, 1]) {
            pushBullet(
              bx + Math.cos(ang) * 24 + Math.cos(perp) * sep * s,
              by + Math.sin(ang) * 24 + Math.sin(perp) * sep * s,
            );
          }
        } else {
          pushBullet(bx + Math.cos(ang) * 24, by + Math.sin(ang) * 24);
        }
        this.audio.playTone(440, 0.04, 0.05);
      },
      spawnEnemyBulletAtAngle: (bx, by, angle) => {
        const spd = 292;
        this.bullets.push({
          x: bx + Math.cos(angle) * 26,
          y: by + Math.sin(angle) * 26,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 2.65,
          fromPlayer: false,
          r: 7,
        });
        this.audio.playTone(380, 0.028, 0.035);
      },
    };

    for (const b of this.bots) {
      b.update(dt, botCtx);
    }

    for (const bot of this.bots) {
      if (
        bot.variant === "boss" &&
        bot.alive &&
        /** @type {{ phase?: string }} */ (bot).phase === "charge"
      ) {
        const d = Math.hypot(bot.x - this.player.x, bot.y - this.player.y);
        if (d < bot.radius + this.player.radius + 1) {
          if (/** @type {{ chargeHitCooldown?: number }} */ (bot).chargeHitCooldown <= 0) {
            /** @type {{ chargeHitCooldown?: number }} */ (bot).chargeHitCooldown = 0.42;
            this._damagePlayer(12);
            this.audio.playTone(95, 0.07, 0.1);
          }
        }
      }
    }

    const map = this.collisionMap;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const p = this.bullets[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      let hit = false;
      const br = p.r ?? 4;

      if (
        p.x < 0 ||
        p.x > map.width ||
        p.y < 0 ||
        p.y > map.height ||
        map.circleHitsWall(p.x, p.y, br)
      ) {
        this.bullets.splice(i, 1);
        continue;
      }

      if (p.fromPlayer) {
        for (const bot of this.bots) {
          if (!bot.alive || bot.markRemoved) continue;
          const d = Math.hypot(p.x - bot.x, p.y - bot.y);
          if (d < bot.radius + br) {
            const hpBefore = bot.health;
            bot.takeDamage(12, p.x, p.y);
            hit = true;
            this.audio.playHit();
            if (hpBefore > 0 && bot.health <= 0) {
              this.score += bot.variant === "boss" ? 800 : 100;
              this.onHudUpdate(this);
              const lv = LEVELS[this.levelIndex];
              if (lv?.bossRoom && bot.variant === "boss") {
                this.victory();
              }
            }
            break;
          }
        }
      } else {
        const d = Math.hypot(p.x - this.player.x, p.y - this.player.y);
        if (d < this.player.radius + br) {
          this._damagePlayer(7);
          hit = true;
        }
      }

      if (hit || p.life <= 0) this.bullets.splice(i, 1);
    }

    this.bots = this.bots.filter((b) => !b.markRemoved);
  }

  _draw() {
    const ctx = this.ctx;
    const map = this.collisionMap;
    const w = this.worldW;
    const h = this.worldH;

    ctx.save();
    ctx.translate(this.viewOffX, this.viewOffY);
    ctx.scale(this.viewScale * this.zoom, this.viewScale * this.zoom);

    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, w, h);

    if (map) {
      const ts = map.tileSize;
      for (let ty = 0; ty < map.rows; ty++) {
        for (let tx = 0; tx < map.cols; tx++) {
          const wx = tx * ts;
          const wy = ty * ts;
          if (map.tiles[ty][tx] === 1) {
            const g = 0.08 + ((tx + ty) % 3) * 0.02;
            ctx.fillStyle = `rgb(${Math.floor(35 + g * 40)},${Math.floor(40 + g * 30)},${Math.floor(55 + g * 25)})`;
            ctx.fillRect(wx, wy, ts + 0.5, ts + 0.5);
            ctx.strokeStyle = "rgba(0,0,0,0.35)";
            ctx.lineWidth = 1;
            ctx.strokeRect(wx + 0.5, wy + 0.5, ts - 1, ts - 1);
          } else {
            ctx.fillStyle = (tx + ty) % 2 === 0 ? "#1a2230" : "#161d2a";
            ctx.fillRect(wx, wy, ts + 0.5, ts + 0.5);
          }
        }
      }
    }

    const t = performance.now() / 1000;
    if (this.portalRect) {
      const pr = this.portalRect;
      const pulse = 0.5 + Math.sin(t * 5) * 0.22;
      ctx.strokeStyle = `rgba(200, 160, 255, ${0.6 + pulse * 0.35})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(pr.x - 6, pr.y - 6, pr.w + 12, pr.h + 12);
      ctx.fillStyle = `rgba(90, 40, 180, ${0.55 + pulse * 0.2})`;
      ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
      ctx.strokeStyle = "rgba(230, 200, 255, 0.95)";
      ctx.lineWidth = 3;
      ctx.strokeRect(pr.x + 1, pr.y + 1, pr.w - 2, pr.h - 2);
      ctx.fillStyle = "rgba(255, 245, 255, 0.98)";
      ctx.font = `bold ${Math.max(12, pr.h * 0.38)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("EXIT", pr.x + pr.w / 2, pr.y + pr.h / 2);
    }

    const pulseR = (base) => base + Math.sin(t * 6) * 2.2;
    for (const pu of this.pickups) {
      if (pu.collected) continue;
      const rr = pulseR(pu.r);
      ctx.beginPath();
      if (pu.kind === "health") {
        ctx.fillStyle = "#3ddc84";
        ctx.arc(pu.x, pu.y, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = "#e8c048";
        ctx.arc(pu.x, pu.y, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(120,90,20,0.6)";
        ctx.stroke();
      }
    }

    for (const bot of this.bots) {
      const dr = bot.drawRadius ?? bot.radius;
      if (!bot.alive) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#4a5a6e";
        ctx.beginPath();
        ctx.arc(bot.x, bot.y, dr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      let hue = 140;
      if (bot.variant === "boss") {
        hue =
          /** @type {{ phase?: string }} */ (bot).phase === "vulnerable"
            ? 48
            : /** @type {{ phase?: string }} */ (bot).phase === "charge"
              ? 12
              : 278;
      } else if (bot.variant === "shotgun") hue = 312;
      else if (bot.fsm?.currentState === "FLEE") hue = 200;
      else if (bot.fsm?.currentState === "ATTACK") hue = 0;
      else if (bot.variant === "brute") hue = 25;
      else if (bot.variant === "gunner") hue = 285;
      const lit = bot.hitFlash > 0;
      ctx.fillStyle = `hsl(${hue}, ${lit ? 40 : 65}%, ${lit ? 78 : 42}%)`;
      ctx.beginPath();
      ctx.arc(bot.x, bot.y, dr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle =
        bot.variant === "boss" ? "rgba(255,200,255,0.45)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = bot.variant === "boss" ? 3 : 2;
      ctx.stroke();

      if (bot.variant === "boss" && /** @type {{ phase?: string }} */ (bot).phase === "charge") {
        const ca = /** @type {{ chargeAngle?: number }} */ (bot).chargeAngle ?? 0;
        ctx.strokeStyle = "rgba(255, 90, 35, 0.95)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(bot.x, bot.y, dr + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 220, 140, 0.55)";
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(
          bot.x - Math.cos(ca) * (dr + 26),
          bot.y - Math.sin(ca) * (dr + 26),
        );
        ctx.lineTo(
          bot.x + Math.cos(ca) * (dr + 4),
          bot.y + Math.sin(ca) * (dr + 4),
        );
        ctx.stroke();
        ctx.lineCap = "butt";
      }

      const barW = bot.variant === "boss" ? 44 : 36;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(bot.x - barW / 2, bot.y - dr - 10, barW, 5);
      ctx.fillStyle = "#3ddc84";
      ctx.fillRect(
        bot.x - barW / 2,
        bot.y - dr - 10,
        barW * (bot.health / bot.maxHealth),
        5,
      );
    }

    ctx.fillStyle = "#7eb8ff";
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,200,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.player.x, this.player.y);
    ctx.lineTo(
      this.player.x + Math.cos(this.player.aimAngle) * (this.player.radius + 14),
      this.player.y + Math.sin(this.player.aimAngle) * (this.player.radius + 14),
    );
    ctx.stroke();

    for (const p of this.bullets) {
      const br = p.r ?? 4;
      if (p.fromPlayer) {
        ctx.fillStyle = "rgba(255, 230, 120, 0.45)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, br + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff3a0";
        ctx.beginPath();
        ctx.arc(p.x, p.y, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,200,80,0.9)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(255, 80, 200, 0.5)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, br + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff66cc";
        ctx.beginPath();
        ctx.arc(p.x, p.y, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(180, 40, 140, 0.95)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
