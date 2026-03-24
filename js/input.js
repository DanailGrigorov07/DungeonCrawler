/**
 * Keyboard state from keydown/keyup; mouse position and buttons.
 * Double-tap a movement key (within ~280ms) sets pendingDashCode for a dash.
 */
export class InputManager {
  constructor() {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, buttons: 0 };
    this.wheelDeltaY = 0;
    /** @type {Map<string, number>} */
    this.lastKeyDownAt = new Map();
    /** @type {string | null} */
    this.pendingDashCode = null;
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /**
   * Call from keydown with e.repeat === false for movement keys only.
   * @param {string} code
   */
  registerKeyDownForDash(code) {
    const dashKeys = new Set([
      "KeyW",
      "KeyS",
      "KeyA",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ]);
    if (!dashKeys.has(code)) return;
    const now = performance.now();
    const last = this.lastKeyDownAt.get(code) ?? 0;
    if (now - last < 280 && now - last > 35) {
      this.pendingDashCode = code;
    }
    this.lastKeyDownAt.set(code, now);
  }

  /**
   * @returns {string | null}
   */
  consumeDash() {
    const c = this.pendingDashCode;
    this.pendingDashCode = null;
    return c;
  }

  consumeWheel() {
    const d = this.wheelDeltaY;
    this.wheelDeltaY = 0;
    return d;
  }
}
