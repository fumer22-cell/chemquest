# ChemQuest — pixel organic lab

A Noita-style falling-sand lab simulator for learning organic synthesis.
TypeScript + Vite + Canvas 2D, no backend.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Vitest: chemistry data, lots, pouring/heating conservation
npm run build
```

## Controls

- **Left-drag** glassware to move it.
- **Right-drag** (or hold it and use the mouse wheel, or **Q**/**E**) to tilt and pour.
- Let go and it rights itself and settles on whatever is below (bench, hot plate, bath, balance, shelf).
- Hover anything to read it.

## Architecture

```
src/config.ts        grid size, mL per pixel, lab seconds per tick
src/data/            content you edit: substances (with sourced values + comments), glassware
src/chem/            exact amounts: Lot (moles per substance, one phase), formula parsing
src/sim/             simulation engine (no DOM):
  grid.ts            typed-array cellular grid (kind, lot, temperature per pixel)
  physics.ts         falling-sand motion with gravity in any direction
  heat.ts            per-pixel heat diffusion and cooling to room air
  container.ts       glassware with its own local grid; tilt = rotated gravity;
                     boiling/evaporation/condensation; keeps pixels in step with exact amounts
  world.ts           shared world grid for pour streams, spills and steam; equipment; supports
src/render/          320×180 pixel buffer scaled 4×, blurred emissive layer for heat glow
src/ui/              input, readings, structure panel (SmilesDrawer), placeholder sounds
src/modes/           Sandbox now; Aspirin level and Challenge mode next
```

### How amounts and pixels relate

Each container holds exact amounts in a liquid lot and a solid lot (moles of
each substance). Every liquid pixel is a 0.05 mL share of the liquid lot. A
pixel that leaves through the mouth carries its share as a small parcel through
the world grid and merges into whatever it lands in, so pouring conserves mass
exactly. When chemistry changes the amounts (dissolving, crystallising,
reacting, evaporating), the container adds, removes or re-tags pixels to match.
