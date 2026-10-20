# ChemQuest — pixel organic lab

A Noita-style falling-sand lab simulator for learning organic synthesis.
TypeScript + Vite + Canvas 2D, no backend.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Vitest: chemistry data, lots, pouring/heating conservation
npm run build
```

## Modes

- **Level 1 · Aspirin** (instruction mode): the written procedure checks off as you
  work; deviate and the chemistry plays out. Finish for a debrief with yield,
  purity (melting point, ferric chloride test), time, and an explanation of
  every mistake.
- **Sandbox**: pour, heat, boil and chill freely.
- **Challenge (preview)**: the aspirin lab with no procedure, only the target.
- Roadmap stubs (no procedures yet): acetaminophen, phenacetin, benzhydrol
  (Grignard), lidocaine, diphenhydramine. See `src/data/levels/index.ts`.
  Finished products are saved to a per-browser inventory for later levels.

## Controls

- **Left-drag** glassware to move it. Let go and it rights itself and settles on
  whatever is below (bench, bath, balance, shelf, filter stand).
- **Right-drag** (or hold it and use the mouse wheel, or **Q**/**E**) to tilt and pour.
  Rock a held vessel quickly to shake stuck crystals loose.
- **Pipette**: click with the tip in a liquid to fill; click (or **Space** while
  holding) to release one 0.05 mL drop.
- **Spatula**: click with the tip in crystals to scoop 0.6 g (**Shift**+click for a
  pinch); click over another vessel to tip it out.
- **Glass rod**: drag inside a flask to stir; rub the glass to scratch and start crystallisation.
- **Equipment buttons** are on the equipment: TARE on the balance, − / + / ON on the
  bench front under the bath and hot plate (Shift for 1 °C steps), VAC on the filter
  stand, RUN on the melting-point apparatus.
- The spatula and pipette also pick up spills from the bench.
- Hover anything to read it. Use fast-forward while waiting.

## Structure bar and lab manual

- The top bar follows the molecule you are working on as it changes (salicylic acid →
  aspirin, with live proportions), shows what is in your hand, and predicts what
  adding it would do (e.g. "makes aspirin from salicylic acid", or a warning for
  side reactions).
- The side panel is a lab manual: one page per step with the procedure, **why** it is
  done, what each added reagent is for, the reaction, what to watch for, and safety.
  It turns to the current step on its own; nothing pauses the game.

## Architecture

```
src/config.ts        grid size, mL per pixel, lab seconds per tick
src/data/            content you edit: substances (with sourced values + comments), glassware,
  levels/aspirin.ts  quantities, temperatures, times, rate constants, steps, safety notes,
                     mistake explanations — all commented for checking
src/chem/kinetics.ts scripted reactions with rate laws (Arrhenius, catalyst factor), dissolving,
                     crystallisation with impurity inclusion vs cooling rate, wet cake, drying
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
src/modes/           Sandbox, Aspirin level (instruction + challenge preview)
src/levels/          aspirin debrief (yield, melting point model, mistake detection)
src/sim/tools.ts     pipette, spatula, glass rod
```

### How amounts and pixels relate

Each container holds exact amounts in a liquid lot and a solid lot (moles of
each substance). Every liquid pixel is a 0.05 mL share of the liquid lot. A
pixel that leaves through the mouth carries its share as a small parcel through
the world grid and merges into whatever it lands in, so pouring conserves mass
exactly. When chemistry changes the amounts (dissolving, crystallising,
reacting, evaporating), the container adds, removes or re-tags pixels to match.
