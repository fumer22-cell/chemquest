import { SURVIVAL } from '../data/scenario';

export type SurvivalStatus = 'ok' | 'o2-out' | 'water-out';

/** The crash-site life support: stored oxygen and drinking water, used up over time. */
export class LifeSupport {
  o2Mol = SURVIVAL.startO2Mol;
  waterML = SURVIVAL.startWaterML;
  goalReached = false;

  constructor(private cfg = SURVIVAL) {}

  o2Minutes(): number {
    return this.o2Mol / this.cfg.o2UseMolPerS / 60;
  }

  waterMinutes(): number {
    return this.waterML / this.cfg.waterUseMLPerS / 60;
  }

  addO2(mol: number): void {
    this.o2Mol += mol;
  }

  addWater(mL: number): void {
    this.waterML += mL;
  }

  goalProgress(): { o2: number; water: number } {
    return {
      o2: Math.min(1, this.o2Minutes() / this.cfg.goalO2Minutes),
      water: Math.min(1, this.waterML / this.cfg.goalWaterML),
    };
  }

  /** Advance time. Returns 'ok' or what ran out. Sets goalReached the first time both targets are met. */
  tick(dt: number): SurvivalStatus {
    this.o2Mol = Math.max(0, this.o2Mol - this.cfg.o2UseMolPerS * dt);
    this.waterML = Math.max(0, this.waterML - this.cfg.waterUseMLPerS * dt);
    if (this.o2Mol <= 0) return 'o2-out';
    if (this.waterML <= 0) return 'water-out';
    const p = this.goalProgress();
    if (p.o2 >= 1 && p.water >= 1) this.goalReached = true;
    return 'ok';
  }
}
