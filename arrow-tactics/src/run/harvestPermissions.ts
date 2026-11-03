import { getBuilding } from '../data/buildings';

/**
 * Droits de recolte avancee (2026-11-01, Hero RTS) : couper les vrais
 * arbres, exploiter les gros gisements de pierre. Sans eux, le Heros ne
 * ramasse que les petits tas au sol. Un batiment TERMINE (pas un chantier),
 * vivant, du joueur, dont la fiche porte `unlocksHarvest` les ouvre (Scierie :
 * `trees`, Camp de mineur : `deposits`) ; il en suffit d'un.
 *
 * 2026-11-02 : resolus d'apres les batiments PRESENTS DANS LE MONDE, avant
 * chaque pas (main.ts) — meme regle pour la Survie generee, une carte
 * dessinee ou « Tester le scenario » ; un chantier termine ouvre la recolte,
 * la destruction du dernier la ferme. La simulation ne recoit que le
 * resultat (World.harvestPermissions).
 */
export interface HarvestPermissions {
  canHarvestTrees: boolean;
  canMineDeposits: boolean;
}

export function harvestPermissionsOf(entities: Iterable<{ isBuilding: boolean; team: string; alive: boolean; construction: unknown; destructible: string | null; unitId: string }>): HarvestPermissions {
  let canHarvestTrees = false;
  let canMineDeposits = false;
  for (const e of entities) {
    if (!e.isBuilding || e.team !== 'player' || !e.alive || e.construction || e.destructible) continue;
    const unlock = getBuilding(e.unitId).unlocksHarvest;
    if (unlock === 'trees') canHarvestTrees = true;
    else if (unlock === 'deposits') canMineDeposits = true;
  }
  return { canHarvestTrees, canMineDeposits };
}
