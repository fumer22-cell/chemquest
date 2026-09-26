import { AMBIENT_K, EPS, R_LATM } from './constants';
import { Mixture } from './mixture';
import { getSubstance } from './registry';

/** Ideal gas: P = nRT / V  (atm, mol, K, L). */
export function pressureAtm(mol: number, temperatureK: number, volumeL: number): number {
  return (mol * R_LATM * temperatureK) / volumeL;
}

/** Ideal gas: n = PV / RT. */
export function molesFromPressure(atm: number, volumeL: number, temperatureK: number): number {
  return (atm * volumeL) / (R_LATM * temperatureK);
}

export interface AddGasResult {
  ruptured: boolean;
  /** Gas lost to the atmosphere if the tank ruptured, mol. */
  lost: Record<string, number>;
  peakAtm: number;
}

/**
 * A rigid gas vessel held at a fixed temperature (tanks sit in the cold outside air
 * or a thermostatted rack). Exceeding the rated pressure ruptures it: contents are lost.
 */
export class GasTank {
  readonly contents = new Mixture();

  constructor(
    public name: string,
    public volumeL: number,
    public ratedAtm: number,
    public temperatureK: number = AMBIENT_K,
  ) {
    this.contents.temperatureK = temperatureK;
  }

  /** Fill with a pure gas to a pressure (used for starting conditions). */
  static filled(name: string, volumeL: number, ratedAtm: number, gas: string, atm: number, T = AMBIENT_K): GasTank {
    const t = new GasTank(name, volumeL, ratedAtm, T);
    t.contents.add(gas, molesFromPressure(atm, volumeL, T));
    return t;
  }

  totalMoles(): number {
    return this.contents.ids().reduce((s, id) => s + this.contents.moles(id), 0);
  }

  pressureAtm(): number {
    return pressureAtm(this.totalMoles(), this.temperatureK, this.volumeL);
  }

  /** Dalton's law: partial pressure of one gas. */
  partialPressureAtm(id: string): number {
    return pressureAtm(this.contents.moles(id), this.temperatureK, this.volumeL);
  }

  moleFraction(id: string): number {
    const t = this.totalMoles();
    return t > EPS ? this.contents.moles(id) / t : 0;
  }

  addGas(gases: Record<string, number>): AddGasResult {
    for (const [id, mol] of Object.entries(gases)) {
      if (getSubstance(id).state !== 'gas') continue;
      this.contents.add(id, mol);
    }
    this.contents.temperatureK = this.temperatureK;
    const peak = this.pressureAtm();
    if (peak > this.ratedAtm) {
      const lost = this.contents.amounts();
      this.contents.clear();
      this.contents.temperatureK = this.temperatureK;
      return { ruptured: true, lost, peakAtm: peak };
    }
    return { ruptured: false, lost: {}, peakAtm: peak };
  }

  /** Withdraw `mol` total, proportionally from every gas in the tank. */
  withdraw(mol: number): Mixture {
    const t = this.totalMoles();
    return this.contents.take(t > EPS ? mol / t : 0);
  }

  /** Let gas flow to a lower-pressure vessel for dt seconds through a valve. */
  flowTo(target: GasTank, dt: number, conductance: number): Mixture {
    const dp = this.pressureAtm() - target.pressureAtm();
    if (dp <= 0) return new Mixture();
    // Don't overshoot equalisation.
    const nEq = (dp / (R_LATM * this.temperatureK / this.volumeL + R_LATM * target.temperatureK / target.volumeL));
    const mol = Math.min(nEq, conductance * dp * dt);
    return this.withdraw(mol);
  }

  vent(): Record<string, number> {
    const a = this.contents.amounts();
    this.contents.clear();
    this.contents.temperatureK = this.temperatureK;
    return a;
  }
}
