export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  kind: 'upgrade' | 'supply';
  /** For supplies: stock id and amount (g for solids, mL for liquids). */
  supply?: { stockId: string; amount: number };
}

export const SHOP: ShopItem[] = [
  {
    id: 'precision_balance',
    name: 'Precision balance',
    description: 'Reads to 0.01 g instead of 0.1 g.',
    price: 100,
    kind: 'upgrade',
  },
  {
    id: 'ph_meter',
    name: 'pH meter',
    description: 'Reads pH to two decimals instead of guessing from indicator paper.',
    price: 90,
    kind: 'upgrade',
  },
  {
    id: 'kclo3_250',
    name: 'Potassium chlorate, 250 g',
    description: 'Refill for the oxygen generator.',
    price: 30,
    kind: 'supply',
    supply: { stockId: 'kclo3', amount: 250 },
  },
  {
    id: 'water_1l',
    name: 'Distilled water, 1 L',
    description: 'Lab-grade. Not for drinking (coolant traces).',
    price: 10,
    kind: 'supply',
    supply: { stockId: 'water', amount: 1000 },
  },
];
