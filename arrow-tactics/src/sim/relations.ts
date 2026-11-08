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
 *  monde ; detruite : plus d'emprise du tout (breche). Verrouillee fermee par le
 *  joueur (2026-11-08, `locked`) : elle bloque aussi ses allies, trajets et
 *  collision compris, jusqu'au retour en mode automatique. */
export function canUnitPassGate(unit: { team: string }, gate: { owner: string; built: boolean; locked?: boolean }): boolean {
  return gate.built && gate.locked !== true && areAllied(unit.team, gate.owner);
}
