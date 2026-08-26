/**
 * PRNG deterministe (mulberry32). Meme seed => meme suite de jets => une
 * bataille rejouable a l'identique, miss compris. Sans ca, Math.random()
 * casserait le determinisme que la boucle a pas fixe protege depuis l'etape 1,
 * et on ne pourrait jamais simuler des milliers de combats pour equilibrer.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Flottant dans [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/** Genere une graine non deterministe, pour varier une bataille d'un lancement a l'autre. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
