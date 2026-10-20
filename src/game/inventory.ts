/** Products carried between levels. Stored in this browser only. */
export interface InventoryItem {
  id: string;
  name: string;
  grams: number;
  /** Mass fraction of the target compound. */
  purity: number;
  /** Composition in grams, so later levels can use it as starting material. */
  composition: Record<string, number>;
  madeAt: number;
}

const KEY = 'chemquest.inventory.v1';

export function loadInventory(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as InventoryItem[]) : [];
  } catch {
    return [];
  }
}

export function addToInventory(item: InventoryItem): void {
  try {
    const all = loadInventory();
    all.push(item);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-20)));
  } catch {
    // Storage unavailable (private window, sandbox): the run still counts.
  }
}
