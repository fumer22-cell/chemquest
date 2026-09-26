import { ORDER_TOLERANCE, type OrderDef } from '../data/orders';
import { getSubstance, type Mixture } from '../chem';

export interface Grade {
  result: 'full' | 'partial' | 'rejected';
  payment: number;
  measuredVolumeML: number;
  measuredMolarity: number;
  contaminants: string[];
  reason: string;
}

/** The merchant's analysis of a delivered solution. */
export function gradeDelivery(order: OrderDef, mix: Mixture, tol = ORDER_TOLERANCE): Grade {
  const volume = mix.liquidVolumeML();
  const molarity = mix.molarity(order.soluteId);
  const target = order.molarity * (order.volumeML / 1000);
  const contaminants: string[] = [];
  for (const id of mix.ids()) {
    if (id === 'H2O' || id === order.soluteId) continue;
    const s = getSubstance(id);
    const undissolvedG = mix.undissolvedMoles(id) * s.molarMass;
    if (mix.dissolvedMoles(id) > 0.02 * target || undissolvedG > 0.1) contaminants.push(id);
  }
  if (mix.undissolvedMoles(order.soluteId) * getSubstance(order.soluteId).molarMass > 0.1) {
    contaminants.push(`undissolved ${order.soluteId}`);
  }
  const base = { measuredVolumeML: volume, measuredMolarity: molarity, contaminants };
  if (volume < 1) return { ...base, result: 'rejected', payment: 0, reason: 'The bottle is empty.' };
  if (contaminants.length) {
    return { ...base, result: 'rejected', payment: 0, reason: 'Contaminated — I can’t sell this.' };
  }
  const volErr = Math.abs(volume - order.volumeML) / order.volumeML;
  const cErr = Math.abs(molarity - order.molarity) / order.molarity;
  const err = Math.max(volErr, cErr);
  if (err <= tol.full) return { ...base, result: 'full', payment: order.pay, reason: 'Perfect. Pleasure doing business.' };
  if (err <= tol.partial) {
    return {
      ...base,
      result: 'partial',
      payment: Math.round(order.pay * tol.partialPayFraction),
      reason: 'Close enough to use, not close enough for full price.',
    };
  }
  return {
    ...base,
    result: 'rejected',
    payment: 0,
    reason: volErr > cErr ? 'That’s not the volume I asked for.' : 'The concentration is way off.',
  };
}
