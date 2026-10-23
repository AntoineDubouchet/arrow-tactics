import type { MapBuildingPlacement, MapDef } from '../config/mapDef';
import { BUILDINGS } from '../data/buildings';
import type { TerritoryCell } from '../config/territory';
import type { EditorState } from './editorState';

/**
 * Construit une MapDef exportable a partir de l'etat de l'editeur : taille,
 * obstacles ET unites viennent tous de l'etat (voir EditorState.setSize,
 * .obstacles, .units) ; seuls le nom/la version viennent de la map de base
 * chargee en entrant dans l'editeur.
 */
export function exportMapDef(state: EditorState, base: MapDef): MapDef {
  // `id` est un detail interne a l'editeur (retrouver quel mesh appartient a
  // quel obstacle/unite au clic, voir editorScene.ts) : aucun sens en dehors
  // de la session d'edition, jamais serialise. `team` d'une unite non plus :
  // il est RECALCULE au chargement depuis playerUnits/enemyUnits (voir
  // EditorState.toEditorUnit) plutot que sauvegarde : seules les listes
  // playerUnits / enemyUnits portent le camp dans le fichier.
  return {
    name: base.name,
    version: base.version,
    width: state.width,
    height: state.height,
    // Cellules de terrain REELLEMENT presentes (2026-08-16, chantier map
    // irreguliere) — sauvegarde la liste sparse telle quelle, JAMAIS une
    // matrice pleine reconstituee : une map sans aucun trou/extension
    // (l'immense majorite des cas aujourd'hui) reste indiscernable d'avant
    // ce chantier au chargement (voir resolveMapCells, repli si `cells` est
    // absent) — mais ici on l'ecrit toujours explicitement, ce qui est deja
    // le comportement le plus honnete (ce que l'editeur contient VRAIMENT).
    cells: state.cells,
    obstacles: state.obstacles.map(({ id: _id, ...obstacle }) => obstacle),
    // Positions CONTINUES conservees telles quelles (Part S : "ne convertis
    // pas en cellX/cellZ") — playerUnits/enemyUnits utilisaient deja x/z
    // continus avant ce chantier, aucun changement necessaire ici.
    playerUnits: state.units.filter((u) => u.team === 'player').map(({ unitId, x, z }) => ({ unitId, x, z })),
    enemyUnits: state.units.filter((u) => u.team === 'enemy').map(({ unitId, x, z }) => ({ unitId, x, z })),
    // Position de la Baliste ecrite SEULEMENT si elle a ete posee/deplacee
    // (voir EditorState.ballistaExplicit) : une map qui n'en avait pas reste
    // sans champ, et garde le repli historique au chargement.
    ...(state.ballistaExplicit ? { ballista: { x: state.ballista.x, z: state.ballista.z } } : {}),
    // Territoire ecrit SEULEMENT s'il est explicite dans l'etat (meme vide) :
    // une map qui n'en avait pas reste sans champ — le repli des bandes
    // historiques n'est jamais materialise par un simple enregistrement.
    ...(state.territory !== undefined ? { territory: state.territory.map((c) => ({ x: c.x, z: c.z, team: c.team })) } : {}),
    // Batiments gameplay de scenario (voir MapDef.buildings), dans l'ordre de
    // pose : ecrits seulement s'il y en a, une map sans batiment reste
    // identique a avant ce champ.
    ...(state.buildings.length > 0
      ? { buildings: state.buildings.map(({ buildingId, team, x, z, rotationY }) => ({ buildingId, team, x, z, ...(rotationY ? { rotationY } : {}) })) }
      : {}),
  };
}

/** Declenche le telechargement navigateur d'une MapDef en .json — pas de
 *  backend, Antoine recupere le fichier comme n'importe quel telechargement
 *  et peut le garder/le renommer/le rouvrir plus tard avec "Charger". */
export function downloadMapDef(map: MapDef): void {
  const json = JSON.stringify(map, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${map.name || 'map'}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Lit un fichier .json choisi par Antoine et le valide a minima (les champs
 *  attendus sont bien presents) avant de le rendre au reste de l'editeur —
 *  un fichier au mauvais format doit echouer proprement, pas planter le
 *  rendu avec une MapDef a moitie vide. */
export async function loadMapDefFromFile(file: File): Promise<MapDef> {
  const text = await file.text();
  const data = JSON.parse(text) as Partial<MapDef>;

  if (
    typeof data.width !== 'number' ||
    typeof data.height !== 'number' ||
    !Array.isArray(data.obstacles) ||
    !Array.isArray(data.playerUnits) ||
    !Array.isArray(data.enemyUnits)
  ) {
    throw new Error('Fichier de map invalide : champs manquants.');
  }

  return {
    name: data.name ?? file.name.replace(/\.json$/i, ''),
    version: data.version ?? 1,
    width: data.width,
    height: data.height,
    // `cells` est OPTIONNEL (voir MapDef.cells) — absent sur toute map
    // sauvegardee avant le 2026-08-16 (Part T : "les anciennes maps doivent
    // continuer a charger"), pas de validation stricte de sa forme ici (deja
    // le niveau de rigueur du reste de cette fonction, qui ne valide pas non
    // plus la forme individuelle de chaque obstacle/unite).
    cells: Array.isArray(data.cells) ? data.cells : undefined,
    obstacles: data.obstacles,
    playerUnits: data.playerUnits,
    enemyUnits: data.enemyUnits,
    // `ballista` OPTIONNEL (voir MapDef.ballista) — lu explicitement (cette
    // fonction reconstruit la map champ par champ : un champ oublie ici
    // serait perdu au chargement) et conserve seulement si x et z sont des
    // nombres finis.
    ...(isFinitePoint(data.ballista) ? { ballista: { x: data.ballista.x, z: data.ballista.z } } : {}),
    // `territory` OPTIONNEL (voir MapDef.territory) : conserve s'il est un
    // tableau (meme vide), entrees invalides ecartees ; absent ou d'un autre
    // type -> pas de champ, donc repli sur les bandes historiques.
    ...(Array.isArray(data.territory) ? { territory: readTerritory(data.territory) } : {}),
    // `buildings` OPTIONNEL (voir MapDef.buildings) : absent -> aucun
    // batiment de scenario ; entrees invalides ecartees.
    ...(Array.isArray(data.buildings) ? { buildings: readBuildings(data.buildings) } : {}),
  };
}

/** Batiments de scenario valides : batiment gameplay connu et posable (emprise
 *  definie), camp joueur ou ennemi, centre fini. */
function readBuildings(entries: unknown[]): MapBuildingPlacement[] {
  const buildings: MapBuildingPlacement[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { buildingId, team, x, z, rotationY } = entry as Record<string, unknown>;
    if (typeof buildingId !== 'string' || BUILDINGS[buildingId]?.footprintTilesX === undefined) continue;
    if ((team !== 'player' && team !== 'enemy') || !isFinitePoint({ x, z })) continue;
    // Rotation optionnelle (muraille) : ignoree si elle n'est pas un nombre fini.
    const rotation = typeof rotationY === 'number' && Number.isFinite(rotationY) && rotationY !== 0 ? { rotationY } : {};
    buildings.push({ buildingId, team, x: x as number, z: z as number, ...rotation });
  }
  if (buildings.length < entries.length) console.warn(`Bâtiments : ${entries.length - buildings.length} entrée(s) invalide(s) ignorée(s).`);
  return buildings;
}

/** Garde les seules entrees bien formees (x/z entiers, camp connu), copiees
 *  champ par champ ; avertit en console si certaines sont ecartees. */
function readTerritory(entries: unknown[]): TerritoryCell[] {
  const territory: TerritoryCell[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { x, z, team } = entry as Record<string, unknown>;
    if (!Number.isInteger(x) || !Number.isInteger(z) || (team !== 'player' && team !== 'enemy')) continue;
    territory.push({ x: x as number, z: z as number, team });
  }
  if (territory.length < entries.length) console.warn(`Territoire : ${entries.length - territory.length} case(s) invalide(s) ignoree(s).`);
  return territory;
}

function isFinitePoint(value: unknown): value is { x: number; z: number } {
  if (typeof value !== 'object' || value === null) return false;
  const { x, z } = value as Record<string, unknown>;
  return typeof x === 'number' && Number.isFinite(x) && typeof z === 'number' && Number.isFinite(z);
}
