import type { MapDef } from '../config/mapDef';
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
  // EditorState.toEditorUnit) plutot que sauvegarde, pour rester coherent
  // meme si le format de map evolue plus tard (un camp qui viendrait a se
  // determiner autrement que par la moitie du plateau).
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
  };
}
