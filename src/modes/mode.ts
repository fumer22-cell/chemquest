import type { Renderer } from '../render/renderer';
import type { Container } from '../sim/container';
import type { Tool } from '../sim/tools';
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
  /** Simulation paused (e.g. while a dialog is open). */
  paused: boolean;
  /** Restart the current mode from scratch. */
  restart: () => void;
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
  /** Tooltip for a hovered tool. */
  toolTooltip?(t: Tool, ctx: AppContext): string;
  /** A tool was used (pipette squeeze). */
  toolAct?(t: Tool, ctx: AppContext, fine: boolean): void;
  /** A click (no drag) on the canvas. */
  click?(c: Container | null, x: number, y: number, ctx: AppContext): void;
}
