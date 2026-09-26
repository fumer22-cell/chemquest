/** Trading post orders. The merchant measures what you deliver with their own instruments. */
export interface OrderDef {
  id: string;
  /** Substance whose molarity is graded. */
  soluteId: string;
  molarity: number;
  volumeML: number;
  pay: number;
  /** What the merchant says. */
  request: string;
}

export const ORDERS: OrderDef[] = [
  {
    id: 'hcl_05',
    soluteId: 'HCl',
    molarity: 0.5,
    volumeML: 500,
    pay: 50,
    request: '“My etching baths are empty. Bring me 500 mL of 0.50 M hydrochloric acid.”',
  },
  {
    id: 'nacl_1',
    soluteId: 'NaCl',
    molarity: 1.0,
    volumeML: 250,
    pay: 50,
    request: '“Salt brine for the hydroponics crew: 250 mL of 1.00 M sodium chloride.”',
  },
  {
    id: 'naoh_01',
    soluteId: 'NaOH',
    molarity: 0.1,
    volumeML: 100,
    pay: 60,
    request: '“A calibration standard: 100 mL of 0.100 M sodium hydroxide. Be precise.”',
  },
];

/** Relative error for full pay / half pay. Anything worse is rejected. */
export const ORDER_TOLERANCE = { full: 0.05, partial: 0.15, partialPayFraction: 0.5 };
