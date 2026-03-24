/**
 * Web Audio: BGM drone + short SFX. Mute persisted in localStorage.
 */
const STORAGE_KEY = "depthRunMuted";

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmOsc = null;
    this.bgmGain = null;
    this._loadMute();
  }

  _loadMute() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      this.muted = false;
    }
  }

  _saveMute() {
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  ensureContext() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
  }

  async resume() {
    this.ensureContext();
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }

  startBgm() {
    this.ensureContext();
    if (!this.ctx || this.muted) return;
    this.stopBgm();
    const t = this.ctx.currentTime;
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.08, t);
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, t);
    osc.connect(this.bgmGain);
    this.bgmGain.connect(this.ctx.destination);
    osc.start(t);
    this.bgmOsc = osc;
  }

  stopBgm() {
    if (this.bgmOsc) {
      try {
        this.bgmOsc.stop();
      } catch {
        /* ignore */
      }
      this.bgmOsc.disconnect();
      this.bgmOsc = null;
    }
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }
  }

  playTone(freq, duration, gain = 0.12) {
    this.ensureContext();
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + duration);
  }

  playShoot() {
    this.playTone(880, 0.05, 0.06);
  }

  playHit() {
    this.playTone(220, 0.08, 0.1);
  }

  playPlayerHit() {
    this.playTone(120, 0.12, 0.12);
  }

  playGameOver() {
    this.playTone(90, 0.35, 0.1);
  }

  playLevelUp() {
    this.playTone(523, 0.08, 0.08);
    setTimeout(() => this.playTone(659, 0.08, 0.08), 80);
  }

  setMuted(muted) {
    this.muted = muted;
    this._saveMute();
    if (this.muted) {
      this.stopBgm();
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
