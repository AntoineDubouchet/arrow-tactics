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

/** Une unite franchit une porte de mur V2 si elle est alliee a son proprietaire et
 *  si la porte est batie (2026-11-06, portes automatiques : une porte fermee s'ouvre
 *  devant un allie, sim/systems/doors.ts, donc ses chemins passent par elle). Elle
 *  bloque toujours les hostiles, ouverte ou fermee ; un chantier bloque tout le
 *  monde ; detruite : plus d'emprise du tout (breche). */
export function canUnitPassGate(unit: { team: string }, gate: { owner: string; built: boolean }): boolean {
  return gate.built && areAllied(unit.team, gate.owner);
}
