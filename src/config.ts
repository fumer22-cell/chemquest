/** Global simulation constants. */

/** World grid size in simulation pixels. */
export const WORLD_W = 320;
export const WORLD_H = 180;
/** Screen pixels per simulation pixel. */
export const SCALE = 4;

/** Volume one liquid pixel represents (mL). A drop from a pipette is ~1 pixel. */
export const VOL_PER_PX = 0.05;
/** Powders pack loosely: bulk volume = true volume / packing. */
export const POWDER_PACKING = 0.6;

/** Lab seconds simulated per tick. 60 ticks/s → 15 lab s per real second at 1×. */
export const LAB_SECONDS_PER_TICK = 0.25;

/** Room temperature (°C). */
export const AMBIENT_C = 22;
