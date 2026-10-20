import { simEvents } from '../sim/events';

/**
 * Placeholder sounds synthesised with WebAudio: a filtered-noise pour whose
 * volume follows the pour rate, and little sine "blips" for bubbles.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private pourGain: GainNode | null = null;
  private pourLevel = 0;
  private lastBlip = 0;
  muted = false;

  /** Browsers only allow audio after a user gesture. */
  unlock(): void {
    if (this.ctx) return;
    try {
      const ctx = new AudioContext();
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(bp).connect(gain).connect(ctx.destination);
      src.start();
      this.ctx = ctx;
      this.pourGain = gain;
    } catch {
      this.ctx = null;
    }
  }

  /** Call once per frame. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.pourGain) return;
    const target = this.muted ? 0 : Math.min(0.18, simEvents.pour * 0.01);
    this.pourLevel += (target - this.pourLevel) * 0.25;
    this.pourGain.gain.setTargetAtTime(this.pourLevel, ctx.currentTime, 0.03);
    const now = ctx.currentTime;
    if (!this.muted && simEvents.bubble > 0 && now - this.lastBlip > 0.05 + Math.random() * 0.12 / Math.min(4, simEvents.bubble)) {
      this.lastBlip = now;
      this.blip(250 + Math.random() * 500, 0.05);
    }
  }

  blip(freq: number, vol: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq * 1.8, ctx.currentTime + 0.06);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.1);
  }

  /** Soft click for UI events / glass clinks. */
  clink(): void {
    this.blip(1800 + Math.random() * 600, 0.04);
  }
}
