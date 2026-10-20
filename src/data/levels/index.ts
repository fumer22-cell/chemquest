/**
 * Level roadmap. Only Aspirin has a procedure so far; the rest are stubs to be
 * filled in. `uses` lists products from earlier levels (persistent inventory).
 */
export interface LevelStub {
  id: string;
  title: string;
  target: string;
  /** SMILES of the target, for the structure display. */
  smiles: string;
  reaction: string;
  uses?: string[];
  status: 'playable' | 'planned';
}

export const LEVELS: LevelStub[] = [
  { id: 'aspirin', title: 'Aspirin', target: 'acetylsalicylic acid', smiles: 'CC(=O)Oc1ccccc1C(=O)O', reaction: 'Acetylation of a phenol (esterification with an anhydride)', status: 'playable' },
  { id: 'acetaminophen', title: 'Acetaminophen', target: 'paracetamol', smiles: 'CC(=O)Nc1ccc(O)cc1', reaction: 'Acetylation of an amine (amide formation)', status: 'planned' },
  { id: 'phenacetin', title: 'Phenacetin', target: 'phenacetin', smiles: 'CCOc1ccc(NC(C)=O)cc1', reaction: 'Williamson ether synthesis', uses: ['acetaminophen'], status: 'planned' },
  { id: 'benzhydrol', title: 'Benzhydrol', target: 'diphenylmethanol', smiles: 'OC(c1ccccc1)c1ccccc1', reaction: 'Grignard addition to benzaldehyde', status: 'planned' },
  { id: 'lidocaine', title: 'Lidocaine', target: 'lidocaine', smiles: 'CCN(CC)CC(=O)Nc1c(C)cccc1C', reaction: 'Amide formation, then SN2 with diethylamine', status: 'planned' },
  { id: 'diphenhydramine', title: 'Diphenhydramine', target: 'diphenhydramine', smiles: 'CN(C)CCOC(c1ccccc1)c1ccccc1', reaction: 'Ether formation from benzhydrol (finale)', uses: ['benzhydrol'], status: 'planned' },
];
