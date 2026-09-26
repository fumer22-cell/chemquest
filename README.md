# ChemQuest

A 2D top-down survival/crafting game where intro chemistry *is* the mechanic.
You're a chemist stranded on an alien planet: identify minerals, run real
reactions, and sell prepared solutions — no quizzes, just instruments.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # chemistry + game-logic unit tests (Vitest)
npm run build      # typecheck + production build to dist/
```

## Controls

- **World:** WASD / arrows to move, **E** to interact (collect minerals, enter the lab, talk to the merchant), **J** for the journal.
- **Lab:** click a shelf bottle (or a vessel's **From**) as the source, a vessel's **Into** as the target, then hold **Space** to pour (**Shift+Space** to drip). Keys **1–4** pick the target vessel. Hold the valve buttons to move gas (add **Shift** for fine control). **Esc** leaves.

## Milestone 1 content

- **Survival:** O₂ and water drain over time. Make oxygen by heating KClO₃ with a
  catalyst in the sealed flask (gas is piped to a 5 L tank that bursts above
  25 atm). Make water by burning H₂ and O₂ in the recombiner; its chamber has a
  single gauge, so the ratio has to come from partial pressures. Excess gas is
  purged, and igniting above 5 atm wrecks the chamber.
- **Mineral ID:** three unknown samples. Flame test, water and acid tests fill the journal; the journal names a mineral once enough evidence is in.
- **Trading post:** three molarity/dilution orders. The merchant measures volume and
  concentration: ±5% earns full pay, ±15% half pay. Credits buy a precision balance or a pH meter.

## Layout

```
src/chem/      pure chemistry engine (no Phaser): formula parsing, molar mass,
               Mixture (moles, solubility, volume, heat), reactor (limiting
               reagent, extent, ΔH), gas laws, pH, instruments, flame test
src/data/      content: elements.json, substances, reactions, minerals,
               orders, shop, scenario tuning — add content here
src/game/      game logic (no Phaser): lab bench, journal, life support,
               order grading, GameState
src/scenes/    Phaser scenes: World, Lab, TradingPost, Hud, Journal, End
src/ui/        small UI widgets (buttons, gauges)
tests/         Vitest suites
```

### How the engine models chemistry

- Every container holds a `Mixture`: amounts in **moles**, plus temperature.
  Grams, mL, molarity and pH are always derived from those moles, never stored.
- Molar masses are computed from formulas and `elements.json`.
- Water is the solvent. A solute dissolves up to its solubility limit and the
  rest stays solid. Undissolved solids take up volume according to their
  density, so displacement readings come out right.
- A reaction is data: coefficients, ΔH, conditions (min temperature, catalyst,
  water, spark, minimum molarity) and what the player sees. `react()` works out
  the extent ξ = min(nᵢ/νᵢ) to find the limiting reagent, leaves the excess
  behind, and turns ΔH plus heat of solution into a temperature change.
- Instruments round the hidden true state to their own resolution: 0.1 g
  balance, ±0.5 mL cylinder, rough beaker marks, gauges, pH paper or meter.
