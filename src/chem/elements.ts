import data from '../data/elements.json';

export interface FlameInfo {
  color: string;
  description: string;
}

export interface Element {
  symbol: string;
  name: string;
  number: number;
  mass: number;
  group: number;
  period: number;
  category: string;
  flame: FlameInfo | null;
}

const bySymbol = new Map<string, Element>(
  (data.elements as Element[]).map((e) => [e.symbol, e]),
);

export function getElement(symbol: string): Element {
  const el = bySymbol.get(symbol);
  if (!el) throw new Error(`Unknown element: ${symbol}`);
  return el;
}

export function hasElement(symbol: string): boolean {
  return bySymbol.has(symbol);
}

export function allElements(): Element[] {
  return [...bySymbol.values()];
}
