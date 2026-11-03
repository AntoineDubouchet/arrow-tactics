import { getBuilding } from '../data/buildings';
import type { HarvestPermissions, HarvestTool } from '../data/resources';
import { areAllied } from '../sim/relations';

/**
 * Outils de recolte (2026-11-02) : couper les arbres (hache), extraire la
 * pierre et l'or des gros gisements (pioche). Sans eux, Heros et Villageois
 * vont jusqu'a la source mais n'en tirent rien ; les petits tas au sol se
 * ramassent toujours. Un batiment TERMINE (pas un chantier), vivant, allie du
 * camp, dont la fiche porte `unlocksTools` les donne (aujourd'hui : la
 * Forge, hache et pioche) ; il en suffit d'un.
 *
 * Resolus d'apres les batiments PRESENTS DANS LE MONDE, avant chaque pas
 * (main.ts) : meme regle pour la Survie generee, une carte dessinee ou
 * « Tester le scénario » ; la destruction de la derniere Forge les retire.
 * La simulation ne recoit que le resultat (World.harvestPermissions).
 */
export function harvestPermissionsOf(entities: Iterable<{ isBuilding: boolean; team: string; alive: boolean; construction: unknown; destructible: string | null; unitId: string }>, team: string): HarvestPermissions {
  const tools = new Set<HarvestTool>();
  for (const e of entities) {
    if (!e.isBuilding || !areAllied(e.team, team) || !e.alive || e.construction || e.destructible) continue;
    for (const tool of getBuilding(e.unitId).unlocksTools ?? []) tools.add(tool);
  }
  // Ordre stable (affichage, determinisme).
  return { tools: (['axe', 'pickaxe'] as const).filter((t) => tools.has(t)) };
}
