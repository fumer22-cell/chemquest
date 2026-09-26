/** Minimal typed event emitter (keeps game logic free of Phaser). */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<(p: never) => void>>();

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => set!.delete(fn as (p: never) => void);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers.get(event)?.forEach((fn) => (fn as (p: Events[K]) => void)(payload));
  }

  clear(): void {
    this.handlers.clear();
  }
}
