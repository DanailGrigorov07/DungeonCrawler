import { AudioManager } from "./audio.js";
import { Game } from "./game.js";
import { InputManager } from "./input.js";
import { LEVELS } from "./levels.js";

const canvas = document.getElementById("game-canvas");
const audio = new AudioManager();

const input = new InputManager();

const hudHealth = document.getElementById("hud-health");
const hudScore = document.getElementById("hud-score");
const hudLevel = document.getElementById("hud-level");
const hudAim = document.getElementById("hud-aim");
const hudZoom = document.getElementById("hud-zoom");
const hud = document.getElementById("hud");
const screenMenu = document.getElementById("screen-menu");
const screenPause = document.getElementById("screen-pause");
const screenGameOver = document.getElementById("screen-gameover");
const screenVictory = document.getElementById("screen-victory");
const goScore = document.getElementById("go-score");
const vicScore = document.getElementById("vic-score");
const btnPlay = document.getElementById("btn-play");
const btnResume = document.getElementById("btn-resume");
const btnRestart = document.getElementById("btn-restart");
const btnVictoryMenu = document.getElementById("btn-victory-menu");
const btnMute = document.getElementById("btn-mute");
const btnHelp = document.getElementById("btn-help");
const toastHelp = document.getElementById("toast-help");

function updateMouseScreen(game, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const w = game.screenToWorld(sx, sy);
  input.mouse.x = w.x;
  input.mouse.y = w.y;
}

const game = new Game(canvas, audio, {
  onHudUpdate: (g) => {
    hudHealth.textContent = `HP: ${Math.max(0, Math.ceil(g.player.health))}`;
    hudScore.textContent = `Score: ${g.score}`;
    hudLevel.textContent = `Floor: ${g.levelIndex + 1} / ${LEVELS.length}`;
    hudZoom.textContent = `Zoom: ${g.zoom.toFixed(2)}x`;
  },
  onScreenChange: (mode) => {
    screenMenu.classList.toggle("hidden", mode !== "menu");
    screenPause.classList.toggle("hidden", mode !== "pause");
    screenGameOver.classList.toggle("hidden", mode !== "gameover");
    screenVictory.classList.toggle("hidden", mode !== "victory");
    const showHud = mode === "playing" || mode === "pause";
    hud.classList.toggle("hidden", !showHud);
  },
});

game.input = input;

function syncMuteLabel() {
  btnMute.textContent = audio.muted ? "Sound: Off" : "Sound: On";
}

/** Periodic HUD refresh for aim label (setInterval) */
setInterval(() => {
  if (game.running && !game.paused) {
    hudAim.textContent = `Aim: ${Math.round((game.player.aimAngle * 180) / Math.PI)}°`;
  }
}, 200);

// --- load: initialize canvas and game wiring
window.addEventListener("load", () => {
  game.resize();
  syncMuteLabel();
  input.mouse.x = game.worldW / 2;
  input.mouse.y = game.worldH / 2;
  game.onScreenChange("menu");
});

// --- resize: responsive canvas backing store
window.addEventListener("resize", () => {
  game.resize();
});

// --- focus / blur: pause when window loses focus
window.addEventListener("blur", () => {
  game.pauseExternal();
});

window.addEventListener("focus", () => {
  syncMuteLabel();
});

// --- visibilitychange: pause when tab hidden
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") game.pauseExternal();
});

// --- keydown: movement, ESC pause, double-tap dash
window.addEventListener("keydown", (e) => {
  if (!e.repeat) input.registerKeyDownForDash(e.code);
  input.keys.add(e.code);
  if (e.code === "Escape" && game.running) {
    e.preventDefault();
    game.togglePause();
  }
});

// --- keyup: release keys
window.addEventListener("keyup", (e) => {
  input.keys.delete(e.code);
});

// --- click: Play, Resume, Restart, Mute, Help
btnPlay.addEventListener("click", () => {
  screenMenu.classList.add("hidden");
  game.start();
});

btnResume.addEventListener("click", () => {
  if (game.paused) game.togglePause();
});

btnRestart.addEventListener("click", () => {
  screenGameOver.classList.add("hidden");
  game.start();
});

btnVictoryMenu.addEventListener("click", () => {
  screenVictory.classList.add("hidden");
  game.onScreenChange("menu");
});

btnMute.addEventListener("click", () => {
  audio.toggleMute();
  syncMuteLabel();
  if (!audio.muted && game.running) audio.startBgm();
  else audio.stopBgm();
});

let helpHideTimer = 0;
btnHelp.addEventListener("click", () => {
  toastHelp.classList.remove("hidden");
  clearTimeout(helpHideTimer);
  helpHideTimer = setTimeout(() => toastHelp.classList.add("hidden"), 3500);
});

// --- mousemove: aim direction
canvas.addEventListener("mousemove", (e) => {
  updateMouseScreen(game, e.clientX, e.clientY);
});

// --- mousedown / mouseup: hold to fire
canvas.addEventListener("mousedown", (e) => {
  input.mouse.down = true;
  input.mouse.buttons = e.buttons;
  updateMouseScreen(game, e.clientX, e.clientY);
});

canvas.addEventListener("mouseup", (e) => {
  input.mouse.down = false;
  input.mouse.buttons = e.buttons;
});

canvas.addEventListener("mouseleave", () => {
  input.mouse.down = false;
});

// --- contextmenu: right-click toggles help (with preventDefault)
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  toastHelp.classList.toggle("hidden");
  if (!toastHelp.classList.contains("hidden")) {
    clearTimeout(helpHideTimer);
    helpHideTimer = setTimeout(() => toastHelp.classList.add("hidden"), 4000);
  }
});

// --- wheel: zoom
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    game.applyZoom(e.deltaY);
    game.onHudUpdate(game);
  },
  { passive: false },
);

// --- touchstart / touchmove / touchend: mobile aim + fire (bonus)
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    input.mouse.down = true;
    updateMouseScreen(game, t.clientX, t.clientY);
  },
  { passive: false },
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    updateMouseScreen(game, t.clientX, t.clientY);
  },
  { passive: false },
);

canvas.addEventListener("touchend", (e) => {
  input.mouse.down = e.touches.length > 0;
  if (e.changedTouches[0]) {
    updateMouseScreen(game, e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }
});

// --- Custom events: gameStart, gameOver, levelUp, gameVictory
document.addEventListener("gameOver", (ev) => {
  const d = ev.detail;
  goScore.textContent = `Score: ${d.score} — Floor: ${d.level}`;
});

document.addEventListener("levelUp", (ev) => {
  const lv = ev.detail?.level ?? game.levelIndex + 1;
  hudLevel.textContent = `Floor: ${lv} / ${LEVELS.length}`;
});

document.addEventListener("gameVictory", (ev) => {
  const d = ev.detail;
  vicScore.textContent = `Score: ${d.score}`;
});
