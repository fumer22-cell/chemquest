/** Counters the sound and UI layers read each frame (then reset). */
export const simEvents = {
  /** Particles that left a container this frame (pouring). */
  pour: 0,
  /** Bubbles of vapour formed this frame (boiling). */
  bubble: 0,
};

export function resetSimEvents(): void {
  simEvents.pour = 0;
  simEvents.bubble = 0;
}
