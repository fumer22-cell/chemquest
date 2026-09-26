import { MINERALS, type MineralDef, type TestKind } from '../data/minerals';
import { equationString, getSubstance, prettyFormula } from '../chem';
import type { ReactionEvent } from '../chem/reactor';

export interface ReactionEntry {
  id: string;
  equation: string;
  name: string;
  observation: string;
  exothermic: boolean;
  timesSeen: number;
}

export interface SampleEntry {
  mineral: MineralDef;
  tests: Partial<Record<TestKind, string>>;
  identified: boolean;
}

export type JournalChange =
  | { kind: 'substance'; id: string }
  | { kind: 'reaction'; id: string }
  | { kind: 'test'; mineralId: string; test: TestKind; result: string }
  | { kind: 'identified'; mineralId: string }
  | { kind: 'observation'; text: string };

/**
 * The player's knowledge. Nothing appears here until it has been seen,
 * measured or deduced in-game.
 */
export class Journal {
  readonly substances = new Map<string, string>(); // id → how discovered
  readonly reactions = new Map<string, ReactionEntry>();
  readonly samples = new Map<string, SampleEntry>();
  readonly observations: string[] = [];
  readonly notes: { id: string; title: string; text: string }[] = [];
  /** Reactions seen with a not-yet-identified mineral: revealed once it is identified. */
  private pending = new Map<string, ReactionEvent>();

  constructor(private onChange: (c: JournalChange) => void = () => {}) {}

  knowsSubstance(id: string): boolean {
    return this.substances.has(id);
  }

  recordSubstance(id: string, how: string): void {
    if (this.substances.has(id)) return;
    this.substances.set(id, how);
    this.onChange({ kind: 'substance', id });
  }

  recordReaction(ev: ReactionEvent): void {
    const r = ev.reaction;
    const hidden = [...r.reactants, ...r.products].filter((t) => this.isHiddenMineral(t.id));
    if (hidden.length) {
      if (!this.pending.has(r.id)) this.pending.set(r.id, ev);
      return;
    }
    const existing = this.reactions.get(r.id);
    if (existing) {
      existing.timesSeen++;
      return;
    }
    this.reactions.set(r.id, {
      id: r.id,
      name: r.name,
      equation: equationString(r, prettyFormula),
      observation: r.observation,
      exothermic: r.deltaH < 0,
      timesSeen: 1,
    });
    for (const t of [...r.reactants, ...r.products]) {
      if (!this.isHiddenMineral(t.id)) this.recordSubstance(t.id, `seen in: ${r.name}`);
    }
    this.onChange({ kind: 'reaction', id: r.id });
  }

  addObservation(text: string): void {
    if (this.observations.includes(text)) return;
    this.observations.push(text);
    this.onChange({ kind: 'observation', text });
  }

  addNote(note: { id: string; title: string; text: string }): void {
    if (this.notes.some((n) => n.id === note.id)) return;
    this.notes.push(note);
  }

  sample(mineralId: string): SampleEntry {
    let s = this.samples.get(mineralId);
    if (!s) {
      const mineral = MINERALS.find((m) => m.id === mineralId)!;
      s = { mineral, tests: {}, identified: false };
      this.samples.set(mineralId, s);
    }
    return s;
  }

  /** Record a test result; returns true if this identified the mineral. */
  recordTest(mineralId: string, test: TestKind, result: string, overwrite = false): boolean {
    const s = this.sample(mineralId);
    if (s.tests[test] && !overwrite) return false;
    if (s.tests[test] === result) return false;
    s.tests[test] = result;
    this.onChange({ kind: 'test', mineralId, test, result });
    if (!s.identified && s.mineral.identifyAfter.every((t) => s.tests[t])) {
      s.identified = true;
      this.recordSubstance(s.mineral.substanceId, `identified ${s.mineral.label} (${s.mineral.mineralName})`);
      this.onChange({ kind: 'identified', mineralId });
      for (const [id, ev] of [...this.pending]) {
        this.pending.delete(id);
        this.recordReaction(ev);
      }
      return true;
    }
    return false;
  }

  /** A mineral substance whose sample hasn't been identified yet. */
  isHiddenMineral(substanceId: string): boolean {
    const m = MINERALS.find((x) => x.substanceId === substanceId);
    return !!m && !this.samples.get(m.id)?.identified;
  }

  /** How the player refers to a substance given what they know. */
  displayName(substanceId: string): string {
    const m = MINERALS.find((x) => x.substanceId === substanceId);
    if (m && !this.samples.get(m.id)?.identified) return `${m.label}`;
    if (!this.substances.has(substanceId)) return 'unknown substance';
    const s = getSubstance(substanceId);
    return `${s.name} (${prettyFormula(s.formula)})`;
  }
}
