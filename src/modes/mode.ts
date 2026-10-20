import type { Renderer } from '../render/renderer';
import type { Container } from '../sim/container';
import type { World } from '../sim/world';
import type { Sfx } from '../ui/audio';
import type { Input } from '../ui/input';
import type { StructurePanel } from '../ui/structure';

export interface AppContext {
  world: World;
  renderer: Renderer;
  input: Input;
  structure: StructurePanel;
  panel: HTMLElement;
  sfx: Sfx;
  /** Sim ticks per frame (fast-forward). */
  speed: number;
}

export interface Mode {
  id: string;
  title: string;
  /** Build the world and the side panel. */
  enter(ctx: AppContext): void;
  /** Per frame, after the simulation step. */
  frame?(ctx: AppContext): void;
  /** Slow UI refresh (~8 Hz). */
  refresh?(ctx: AppContext): void;
  /** Tooltip text for a hovered container. */
  tooltip(c: Container, ctx: AppContext): string;
  /** A click (no drag) on the canvas. */
  click?(c: Container | null, x: number, y: number, ctx: AppContext): void;
}
