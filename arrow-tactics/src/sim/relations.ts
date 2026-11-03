/**
 * Relations entre camps (2026-11-02) : SOURCE UNIQUE de « qui est allie de
 * qui » pour les regles qui en dependent (portes des murs V2). Aujourd'hui
 * deux camps (Team) : allie = meme camp. Point d'extension pour de futures
 * factions, alliances ou le multijoueur : changer areAllied, pas ses
 * appelants. Les camps sont des chaines (identifiants de faction).
 */
export function areAllied(a: string, b: string): boolean {
  return a === b;
}

/** Une unite franchit une porte de mur V2 seulement si la porte est OUVERTE
 *  et si l'unite est alliee a son proprietaire. Fermee : elle bloque tout le
 *  monde ; ouverte : elle bloque toujours les hostiles ; detruite : plus
 *  d'emprise du tout (breche). */
export function canUnitPassGate(unit: { team: string }, gate: { owner: string; open: boolean }): boolean {
  return gate.open && areAllied(unit.team, gate.owner);
}
