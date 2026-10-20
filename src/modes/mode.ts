import type { Renderer } from '../render/renderer';
import type { Container } from '../sim/container';
import type { Tool } from '../sim/tools';
import type { World } from '../sim/world';
import type { Sfx } from '../ui/audio';
import type { Input } from '../ui/input';
import type { MoleculeBar } from '../ui/structure';

export interface AppContext {
  world: World;
  renderer: Renderer;
  input: Input;
  molecules: MoleculeBar;
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
  /** Molecules the structure bar follows (the reaction's key species). */
  focus?: string[];
  /** The vessel the structure bar shows before anything has been poured. */
  defaultWorking?(ctx: AppContext): Container | null;
  /** Tooltip for a hovered tool. */
  toolTooltip?(t: Tool, ctx: AppContext): string;
  /** A tool was used (pipette squeeze). */
  toolAct?(t: Tool, ctx: AppContext, fine: boolean): void;
  /** A click (no drag) on the canvas. */
  click?(c: Container | null, x: number, y: number, ctx: AppContext): void;
}
