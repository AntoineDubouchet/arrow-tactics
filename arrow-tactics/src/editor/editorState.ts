import { isCollidableObstacle, obstacleCenter, type ObstacleDef } from '../config/constants';
import {
  buildCellIndex,
  cellKey,
  DEFAULT_MAP,
  resolveMapCells,
  type MapDef,
  type MapUnitPlacement,
  type TerrainCellDef,
  type TerrainType,
} from '../config/mapDef';
import type { Team } from '../sim/entity';

/**
 * Etat de l'editeur de maps (chantier en cours, voir CLAUDE.md) : les
 * obstacles et les unites places, la selection courante, l'outil actif. Pure
 * donnee, zero Three.js ici — meme esprit de separation que sim/ (voir
 * World), meme si l'editeur n'est pas la simulation de bataille : ca permet
 * de tester la logique de placement/selection sans navigateur, et de
 * brancher un futur MapSerializer sans toucher a cette classe.
 *
 * Un id stable par objet (pas juste son index dans le tableau) est necessaire
 * des cette etape : le rendu doit pouvoir retrouver "quel objet a ete clique"
 * via un tag sur le mesh (userData), et l'index seul ne survivrait pas a une
 * suppression au milieu du tableau. Obstacles et unites partagent le meme
 * compteur d'id (nextId) : leurs id ne se collisionnent jamais, meme si les
 * deux listes sont manipulees separement.
 */

export interface EditorObstacle extends ObstacleDef {
  id: number;
}

/** Gabarit d'obstacle a placer, choisi dans l'asset browser : pas encore un
 *  EditorObstacle (pas de position tant qu'on n'a pas clique sur le
 *  plateau). */
export type PlacementTemplate = Omit<ObstacleDef, 'cornerX' | 'cornerZ' | 'x' | 'z'>;

/**
 * Unite placee dans l'editeur (bestiaire du jeu, voir data/units.ts). Le
 * camp n'est PAS choisi explicitement dans l'asset browser : demande
 * d'Antoine (2026-08-08) — une unite posee du cote bleu du plateau (z >= 0)
 * devient automatiquement bleue, posee du cote rouge elle devient rouge,
 * exactement comme au deroulement normal d'une partie (voir main.ts,
 * startPlacement). `team` est recalcule a chaque deplacement, pas fige a la
 * pose.
 */
export interface EditorUnit {
  id: number;
  unitId: string;
  team: Team;
  x: number;
  z: number;
}

/** `unit-group` (2026-08-11, demande d'Antoine : "double clic = selectionner
 *  tout le meme type" dans l'editeur, meme geste que la phase de placement
 *  du vrai jeu) — `ids[0]` sert toujours d'ANCRE pour un deplacement de
 *  groupe (voir moveSelectedGroup), jamais juste un ensemble non ordonne. */
export type EditorSelection =
  | { kind: 'obstacle'; id: number }
  | { kind: 'unit'; id: number }
  | { kind: 'unit-group'; ids: number[] }
  | null;

export type EditorTool =
  | { type: 'select' }
  | { type: 'place-obstacle'; template: PlacementTemplate }
  | { type: 'place-unit'; unitId: string }
  | { type: 'add-cell'; terrain: TerrainType }
  | { type: 'remove-cell' };

/** Camp determine par la moitie du plateau : z >= 0 cote bleu (joueur), z < 0
 *  cote rouge (ennemi) — meme convention que les zones de placement du
 *  plateau (voir render/board.ts, createZonesGroup). */
function teamForZ(z: number): Team {
  return z >= 0 ? 'player' : 'enemy';
}

export class EditorState {
  obstacles: EditorObstacle[];
  units: EditorUnit[];
  /** Taille du brouillon en cours d'edition (en cases) — independante de la
   *  taille du plateau reellement en jeu tant que la carte n'est pas
   *  sauvegardee/testee (voir main.ts, rebuildEditorBoard). Modifiable via
   *  setSize (panneau "Taille" de l'editeur). */
  width: number;
  height: number;
  selection: EditorSelection = null;
  tool: EditorTool = { type: 'select' };

  /** Cellules de terrain du brouillon (2026-08-16, chantier map irrégulière,
   *  voir CLAUDE.md) — Map clée par "x,z" (voir config/mapDef.ts, cellKey)
   *  pour un lookup/toggle O(1). Initialisée depuis `resolveMapCells(source)` :
   *  une map SANS `cells` explicite (toute map antérieure à cette date)
   *  redevient donc un rectangle plein dès l'ouverture dans l'éditeur —
   *  exactement son apparence actuelle, aucune migration nécessaire. */
  private cellMap: Map<string, TerrainCellDef>;

  private nextId = 1;

  /** Par defaut, repart de la map actuelle : l'editeur sert d'abord a
   *  AJUSTER ce qui existe deja, pas a repartir d'une carte vide. Un appelant
   *  peut fournir une autre MapDef (voir main.ts, chargement d'un fichier
   *  sauvegarde) pour reprendre l'edition d'une carte precedemment exportee. */
  constructor(source: MapDef = DEFAULT_MAP) {
    this.obstacles = source.obstacles.map((o) => ({ ...o, id: this.nextId++ }));
    this.units = [
      ...source.playerUnits.map((u) => this.toEditorUnit(u, 'player')),
      ...source.enemyUnits.map((u) => this.toEditorUnit(u, 'enemy')),
    ];
    this.width = source.width;
    this.height = source.height;
    this.cellMap = buildCellIndex(resolveMapCells(source));
  }

  /** Cellules RÉELLEMENT présentes — nouveau tableau à chaque appel (le
   *  rendu en a besoin comme une liste stable le temps d'une frame, jamais
   *  muté en place). */
  get cells(): TerrainCellDef[] {
    return [...this.cellMap.values()];
  }

  hasCellAt(x: number, z: number): boolean {
    return this.cellMap.has(cellKey(x, z));
  }

  /** Vrai si AUCUNE cellule n'existe encore à (x, z) — condition de
   *  validité de l'outil "Ajouter case" (Part AF : aperçu vert/rouge),
   *  partagée avec `addCell` pour ne jamais diverger. */
  canAddCell(x: number, z: number): boolean {
    return !this.cellMap.has(cellKey(x, z));
  }

  /** Ajoute EXACTEMENT une cellule — refuse (renvoie false) si une cellule
   *  existe déjà à cette position (Part Y : "exactement UNE nouvelle case",
   *  jamais un remplacement silencieux du type existant). */
  addCell(x: number, z: number, terrain: TerrainType): boolean {
    if (!this.canAddCell(x, z)) return false;
    this.cellMap.set(cellKey(x, z), { x, z, terrain });
    return true;
  }

  /** Vrai si la cellule existe ET peut être supprimée (Part AE, V1 :
   *  "interdire la suppression tant qu'une unité ou un objet bloquant
   *  occupe la cellule") — un prop traversable (voir isCollidableObstacle)
   *  n'empêche jamais rien. Partagée entre `removeCell` (action réelle) et
   *  l'aperçu vert/rouge de l'outil (Part AF), pour ne jamais diverger. */
  canRemoveCell(x: number, z: number): boolean {
    if (!this.cellMap.has(cellKey(x, z))) return false;

    const occupiedByUnit = this.units.some((u) => Math.floor(u.x) === x && Math.floor(u.z) === z);
    if (occupiedByUnit) return false;

    const occupiedByObstacle = this.obstacles.some((o) => {
      if (!isCollidableObstacle(o)) return false;
      const center = obstacleCenter(o);
      return Math.floor(center.x) === x && Math.floor(center.z) === z;
    });
    return !occupiedByObstacle;
  }

  /** Supprime une cellule — voir canRemoveCell pour les conditions de refus. */
  removeCell(x: number, z: number): boolean {
    if (!this.canRemoveCell(x, z)) return false;
    this.cellMap.delete(cellKey(x, z));
    return true;
  }

  private toEditorUnit(u: MapUnitPlacement, team: Team): EditorUnit {
    return { id: this.nextId++, unitId: u.unitId, team, x: u.x, z: u.z };
  }

  /** Change la taille du brouillon (en cases, minimum 1×1) — ne touche pas
   *  aux obstacles/unites deja poses, meme si certains se retrouvent hors des
   *  nouvelles limites : a Antoine de les ajuster/supprimer, pas de
   *  suppression automatique (choix explicite, voir CLAUDE.md).
   *
   *  2026-08-16 : REMPLIT (jamais ne retire) les cellules manquantes du
   *  nouveau rectangle en 'grass' — "Taille" reste une façon rapide de
   *  garantir AU MOINS un rectangle plein, l'outil Ajouter/Supprimer case
   *  donnant ensuite un contrôle fin par-dessus. Une cellule déjà présente
   *  (y compris hors du nouveau rectangle, ou déjà en 'dirt') n'est jamais
   *  touchée. */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));

    const halfW = Math.floor(this.width / 2);
    const halfH = Math.floor(this.height / 2);
    for (let iz = 0; iz < this.height; iz++) {
      for (let ix = 0; ix < this.width; ix++) {
        const x = ix - halfW;
        const z = iz - halfH;
        const key = cellKey(x, z);
        if (!this.cellMap.has(key)) this.cellMap.set(key, { x, z, terrain: 'grass' });
      }
    }
  }

  get selectedObstacle(): EditorObstacle | null {
    const sel = this.selection;
    if (sel?.kind !== 'obstacle') return null;
    return this.obstacles.find((o) => o.id === sel.id) ?? null;
  }

  get selectedUnit(): EditorUnit | null {
    const sel = this.selection;
    if (sel?.kind !== 'unit') return null;
    return this.units.find((u) => u.id === sel.id) ?? null;
  }

  /** Unites de la selection de groupe courante (voir selectSameTypeUnits),
   *  ou null si la selection n'est pas un groupe. */
  get selectedUnitGroup(): EditorUnit[] | null {
    if (this.selection?.kind !== 'unit-group') return null;
    const ids = new Set(this.selection.ids);
    return this.units.filter((u) => ids.has(u.id));
  }

  select(selection: EditorSelection): void {
    this.selection = selection;
  }

  /** Selectionne toutes les unites du MEME TYPE que `anchorId`, plafonnees
   *  aux `max` plus proches de son point de reference (pas juste les
   *  premieres trouvees dans le tableau) — meme convention que la phase de
   *  placement du jeu reel (voir main.ts, selectSameTypeGroup). Une seule
   *  unite de ce type retombe sur une selection SIMPLE, pas un groupe a un
   *  seul membre. */
  selectSameTypeUnits(anchorId: number, max: number): void {
    const anchor = this.units.find((u) => u.id === anchorId);
    if (!anchor) return;

    const sameType = this.units
      .filter((u) => u.unitId === anchor.unitId)
      .sort((a, b) => {
        const da = (a.x - anchor.x) ** 2 + (a.z - anchor.z) ** 2;
        const db = (b.x - anchor.x) ** 2 + (b.z - anchor.z) ** 2;
        return da - db;
      })
      .slice(0, max)
      .map((u) => u.id);

    this.selection = sameType.length <= 1 ? { kind: 'unit', id: anchorId } : { kind: 'unit-group', ids: sameType };
  }

  setTool(tool: EditorTool): void {
    this.tool = tool;
    this.selection = null;
  }

  /** Place une nouvelle instance du gabarit actif à la position CONTINUE
   *  donnée (2026-08-16, placement libre des décors — voir CLAUDE.md) : les
   *  obstacles ne sont plus jamais posés sur un coin de case, `x`/`z`
   *  suivent exactement l'intersection raycaster → terrain, sans arrondi.
   *  Revient à l'outil sélection ensuite — un clic place un objet, pas un
   *  tampon continu (choix conservé depuis l'origine de l'éditeur). */
  placeAt(x: number, z: number): EditorObstacle | null {
    if (this.tool.type !== 'place-obstacle') return null;
    const obstacle: EditorObstacle = { ...this.tool.template, x, z, id: this.nextId++ };
    this.obstacles.push(obstacle);
    this.tool = { type: 'select' };
    this.selection = { kind: 'obstacle', id: obstacle.id };
    return obstacle;
  }

  /** Vrai si une UNITE peut être placée à (x, z) — cellule de terrain
   *  existante, aucun obstacle COLLIDABLE (rocher, arbre, bâtiment — jamais
   *  un prop traversable, voir isCollidableObstacle) et aucune autre unité
   *  déjà sur cette même case (2026-08-16, demande explicite : "aucune
   *  unité incompatible déjà présente" / "aucun bâtiment n'occupe cette
   *  cellule"). SOURCE UNIQUE partagée par la preview visuelle (case verte/
   *  rouge, voir editor/editorScene.ts buildCellPreview) et placeUnitAt
   *  ci-dessous — la preview ne doit JAMAIS promettre un résultat que le
   *  clic ne tiendrait pas. */
  canPlaceUnitAt(x: number, z: number): boolean {
    const cellX = Math.floor(x);
    const cellZ = Math.floor(z);
    if (!this.hasCellAt(cellX, cellZ)) return false;

    const onObstacle = this.obstacles.some((o) => {
      if (!isCollidableObstacle(o)) return false;
      const center = obstacleCenter(o);
      return Math.floor(center.x) === cellX && Math.floor(center.z) === cellZ;
    });
    if (onObstacle) return false;

    return !this.units.some((u) => Math.floor(u.x) === cellX && Math.floor(u.z) === cellZ);
  }

  /** Place une nouvelle unite au point donne — le camp est deduit de la
   *  position (voir teamForZ), pas choisi dans l'asset browser. Refuse
   *  (voir canPlaceUnitAt) si aucune cellule de terrain n'existe à cet
   *  endroit, si un obstacle/bâtiment occupe déjà la case, ou si une autre
   *  unité y est déjà posée — jamais dans un trou ni superposée. */
  placeUnitAt(x: number, z: number): EditorUnit | null {
    if (this.tool.type !== 'place-unit') return null;
    if (!this.canPlaceUnitAt(x, z)) return null;
    const unit: EditorUnit = { id: this.nextId++, unitId: this.tool.unitId, team: teamForZ(z), x, z };
    this.units.push(unit);
    this.tool = { type: 'select' };
    this.selection = { kind: 'unit', id: unit.id };
    return unit;
  }

  /** Déplace librement l'obstacle sélectionné (position continue, plus de
   *  snap sur la grille — voir placeAt). */
  moveSelected(x: number, z: number): void {
    const o = this.selectedObstacle;
    if (!o) return;
    o.x = x;
    o.z = z;
  }

  /** Écrit directement position ET rotation d'un obstacle par id — utilisé
   *  par TransformControls (voir main.ts) : le gizmo manipule le mesh Three
   *  directement, cette méthode répercute le résultat dans `EditorState`
   *  (source de vérité pour la sauvegarde), qu'il s'agisse ou non de
   *  l'obstacle actuellement `selected` (en pratique toujours le cas, le
   *  gizmo n'est jamais attaché à autre chose que la sélection courante,
   *  mais ne PAS dépendre de `this.selection` ici évite un couplage
   *  implicite inutile). */
  setObstacleTransform(id: number, x: number, z: number, rotationY: number): void {
    const o = this.obstacles.find((obstacle) => obstacle.id === id);
    if (!o) return;
    o.x = x;
    o.z = z;
    o.rotationY = rotationY;
  }

  /** Deplace l'unite selectionnee et recalcule son camp — une unite trainee
   *  de l'autre cote du plateau doit changer de couleur, pas garder son
   *  camp d'origine. Refuse silencieusement (Part AL) si la case cible n'a
   *  aucune cellule de terrain — l'unite reste ou elle etait. */
  moveSelectedUnit(x: number, z: number): void {
    const u = this.selectedUnit;
    if (!u) return;
    if (!this.hasCellAt(Math.floor(x), Math.floor(z))) return;
    u.x = x;
    u.z = z;
    u.team = teamForZ(z);
  }

  /** Deplace tout le groupe d'un seul bloc : `ids[0]` sert d'ANCRE, son
   *  deplacement exact (en cases entieres) est applique tel quel a tous les
   *  autres membres — preserve la formation relative, meme principe que
   *  main.ts/computeGroupPreview pour la phase de placement. Contrairement a
   *  la placement, AUCUNE validation d'OCCUPATION (l'editeur n'en a jamais
   *  eu, voir CLAUDE.md — a Antoine d'ajuster les chevauchements a la main) —
   *  mais REFUSE tout le mouvement (tout-ou-rien) si UN SEUL membre finirait
   *  hors d'une cellule existante (Part AL). Chaque unite deplacee recalcule
   *  son propre camp individuellement, pas un camp de groupe unique. */
  moveSelectedGroup(x: number, z: number): void {
    if (this.selection?.kind !== 'unit-group') return;
    const ids = this.selection.ids;
    const anchor = this.units.find((u) => u.id === ids[0]);
    if (!anchor) return;

    const deltaX = x - anchor.x;
    const deltaZ = z - anchor.z;
    const members = ids.map((id) => this.units.find((unit) => unit.id === id)).filter((u): u is EditorUnit => u !== undefined);
    const allOnValidCells = members.every((u) => this.hasCellAt(Math.floor(u.x + deltaX), Math.floor(u.z + deltaZ)));
    if (!allOnValidCells) return;

    for (const u of members) {
      u.x += deltaX;
      u.z += deltaZ;
      u.team = teamForZ(u.z);
    }
  }

  rotateSelected(deltaRad: number): void {
    const o = this.selectedObstacle;
    if (!o) return;
    o.rotationY = ((o.rotationY ?? 0) + deltaRad + Math.PI * 2) % (Math.PI * 2);
  }

  deleteSelected(): void {
    const sel = this.selection;
    if (!sel) return;
    if (sel.kind === 'obstacle') {
      this.obstacles = this.obstacles.filter((o) => o.id !== sel.id);
    } else if (sel.kind === 'unit') {
      this.units = this.units.filter((u) => u.id !== sel.id);
    } else {
      const ids = new Set(sel.ids);
      this.units = this.units.filter((u) => !ids.has(u.id));
    }
    this.selection = null;
  }
}
