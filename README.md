# Depth Run

A compact **top-down dungeon** built with **HTML5 Canvas** and **JavaScript (ES modules)**. Cross **three short floors** by reaching the **EXIT** portal on each map; the final portal wins the run. **Grunt** and **brute** enemies use the same **FSM** (six states: IDLE, PATROL, CHASE, ATTACK, FLEE, DEAD)—brutes are slower but tougher.

Repository: [github.com/DanailGrigorov07/DungeonCrawler](https://github.com/DanailGrigorov07/DungeonCrawler)

![FSM diagram](docs/fsm-diagram.svg)

## Run locally (required — do not open `index.html` with double-click)

This project uses **JavaScript ES modules** (`import` / `export`). Browsers block those when you open the page as `file:///...`, so **Play will not work** and the console will show a **CORS** error.

**Windows:** double-click **`run-game.bat`** in this folder. It runs **`run-game.ps1`**, which starts Python’s server and **only opens the browser after port 8765 is listening** (avoids `ERR_CONNECTION_REFUSED` from opening too early).

**If you see `ERR_CONNECTION_REFUSED`:** wait a few seconds and **refresh**; or check the black **server** window — if Python crashed or says **“Address already in use”**, another app is using port **8765** (close it or change the `$port` value in [`run-game.ps1`](run-game.ps1)). Windows Firewall may also ask permission the first time Python runs.

**Manual:** in this folder run `python -m http.server 8765`, wait until you see **Serving HTTP**, then open **http://127.0.0.1:8765** in your browser.

## Play online (GitHub Pages)

After you enable **GitHub Pages** for this repo (Settings → Pages → deploy from `main` / root or `/docs`), the game will be available at:

**https://danailgrigorov07.github.io/DungeonCrawler/**

*(URL assumes the default `username.github.io/repository` pattern.)*

## How to play

- **Move:** `WASD` or arrow keys  
- **Aim:** mouse cursor (or touch drag on mobile)  
- **Shoot:** hold **left mouse** (or touch and hold)  
- **Zoom:** mouse **wheel**  
- **Pause:** `ESC` (also pauses when the window loses focus or the tab is hidden)  
- **Right-click:** toggle quick help (also use the Help button)

**Goal:** find and enter the **EXIT** portal on each floor (placement is **random** on valid floor tiles, biased toward the **right** side of the map). **Pickups:** green orbs restore health; gold coins add score (they **pulse** visually; collection range is unchanged). **Combat:** destroy bots for points; avoid melee range. **Gunners** (magenta enemies) **shoot pink projectiles** that differ from your shots. **Dash:** **double-tap** `W` / `A` / `S` / `D` (or arrow keys) to dash in that direction (no invulnerability). **Progress:** your **current HP carries** between floors (except a fresh run from the menu). Floors use **tile maps** with corridors, side rooms, and dead ends; **player spawn**, **enemies**, **pickups**, and **patrol routes** are randomized each run from walkable tiles (enemies favor **dead ends** and **open room** cells when possible).

## Implemented events

| Event | Role in this game |
|-------|-------------------|
| `load` | Canvas sizing, initial UI, default aim position |
| `resize` | Responsive canvas; fit-to-screen scale for the dungeon map |
| `keydown` | Movement keys, `ESC` to pause |
| `keyup` | Release movement keys |
| `click` | Play, Resume, Restart, Victory → Menu, Mute, Help |
| `mousemove` | Aim direction in world space (with zoom correction) |
| `mousedown` / `mouseup` | Hold to fire |
| `contextmenu` | Right-click toggles help (`preventDefault`) |
| `wheel` | Zoom in/out on the battlefield |
| `focus` / `blur` | `focus` refreshes mute label; `blur` pauses while playing |
| `visibilitychange` | Pauses when the tab is hidden |
| `touchstart` / `touchmove` / `touchend` | Mobile aim and firing |
| `requestAnimationFrame` | Main game loop |
| `setTimeout` | Auto-hide help toast (and similar UI timers) |
| `setInterval` | Periodic HUD aim label refresh |
| Custom `gameStart` | UI when a run starts |
| Custom `gameOver` | Game over screen with score |
| Custom `levelUp` | Entered the exit portal — next floor |
| Custom `gameVictory` | Cleared the final floor |

## Bot AI (FSM behavior)

- **IDLE:** Short spawn delay before taking up a patrol route.  
- **PATROL:** Follows **randomly generated patrol waypoints** along corridors. If the player enters **100px**, the bot **chases**. If health drops below **20%** while the player is close, it **flees** instead of chasing.  
- **CHASE:** Moves toward the player. Enters **attack** within **30px**. Returns to **patrol** if the player moves beyond **200px**. Drops to **flee** if health is below **20%**.  
- **ATTACK:** Melee damage window; repeats the swing timer while still in range, otherwise returns to chase.  
- **FLEE:** Runs away until the player is beyond **200px**, then resumes **patrol**.  
- **DEAD:** Corpse timer, then the entity is removed. Each floor spawns bots from [`js/levels.js`](js/levels.js) data at **random valid positions** (see [`js/mapAnalysis.js`](js/mapAnalysis.js)).

**Variants:** **grunt** (melee), **brute** (tougher melee), **gunner** (ranged; uses the same FSM states, but **ATTACK** fires projectiles at the player).

The FSM class lives in [`js/fsm.js`](js/fsm.js). Bot logic is in [`js/bot.js`](js/bot.js). Walls use [`js/collision.js`](js/collision.js).

## Transition table

| Current state | Input / condition | Next state | Action |
|---------------|-------------------|------------|--------|
| IDLE | `idleTimer <= 0` | PATROL | Begin waypoint loop |
| PATROL | `playerDistance < 100` and `health >= 20%` | CHASE | Pursue player |
| PATROL | `playerDistance < 100` and `health < 20%` | FLEE | Escape |
| CHASE | `playerDistance < 30` | ATTACK | Start melee window |
| CHASE | `playerDistance > 200` | PATROL | Resume route |
| CHASE | `health < 20%` | FLEE | Escape |
| ATTACK | `health < 20%` | FLEE | Escape |
| ATTACK | `playerDistance > melee range` | CHASE | Close distance |
| ATTACK | attack window ends and still in range | ATTACK | Continue combo (timer reset) |
| FLEE | `playerDistance > 200` | PATROL | Resume route |
| *Any* | `health <= 0` | DEAD | Stop threats; corpse timer |
| DEAD | corpse timer ends | *(remove)* | Bot removed; new floor loads new bots from data |

## Technologies

- HTML5 Canvas 2D context  
- JavaScript ES6 modules (classes, arrow functions, `const` / `let`)  
- Web Audio API for procedural BGM/SFX  
- Tile-based collision (`TileMap`) for dungeon walls  

## Local development

Same rule as above: always use `http://localhost`, not `file://`. On Windows you can use [`run-game.bat`](run-game.bat). Other options:

```bash
# Python 3
python -m http.server 8080

# Node (npx)
npx serve .
```

Then open the URL shown (for example `http://localhost:8080`).

## Project structure

- [`index.html`](index.html) — Canvas and UI overlays  
- [`css/styles.css`](css/styles.css) — Layout and screens  
- [`js/main.js`](js/main.js) — Event wiring  
- [`js/game.js`](js/game.js) — Loop, floors, portal, pickups, rendering  
- [`js/levels.js`](js/levels.js) — Dungeon tile layouts, portal size, bot variants, pickup kinds (positions chosen at runtime)  
- [`js/mapAnalysis.js`](js/mapAnalysis.js) — Floor topology, random spawns, portal anchors, patrol generation  
- [`js/collision.js`](js/collision.js) — Tile map + circle-vs-wall  
- [`js/fsm.js`](js/fsm.js) — Reusable `FiniteStateMachine`  
- [`js/bot.js`](js/bot.js) — Enemy + FSM states  
- [`js/player.js`](js/player.js) — Player movement  
- [`js/input.js`](js/input.js) — Input state  
- [`js/audio.js`](js/audio.js) — Audio and mute persistence  
