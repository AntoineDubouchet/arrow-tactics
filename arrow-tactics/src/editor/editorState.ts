import { isCollidableObstacle, obstacleBounds, obstacleCenter, PLACEMENT_ROWS, type ObstacleBounds, type ObstacleDef } from '../config/constants';
import {
  BALLISTA_PLACEMENT_TILES,
  buildCellIndex,
  cellKey,
  computeBallistaObstacle,
  computePlayerArrowOrigin,
  DEFAULT_MAP,
  resolveMapCells,
  snapBallistaOrigin,
  type MapDef,
  type MapUnitPlacement,
  type TerrainCellDef,
  type TerrainType,
} from '../config/mapDef';
import {
  buildTerritoryIndex,
  isFootprintOwnedBy,
  resolveMapTerritory,
  territoryOwnerAtPoint,
  type TerritoryCell,
  type TerritoryIndex,
  type TerritoryTeam,
} from '../config/territory';
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
 * camp n'est PAS choisi explicitement dans l'asset browser : c'est le
 * proprietaire de la case dans le territoire (voir territoryOwnerAt) — case
 * bleue -> joueur, case rouge -> ennemi, case neutre -> pose refusee.
 * `team` est recalcule a chaque deplacement ; il n'est jamais recalcule au
 * chargement ni quand on repeint le territoire sous l'unite.
 */
export interface EditorUnit {
  id: number;
  unitId: string;
  team: Team;
  x: number;
  z: number;
}

/** Une selection d'UNITES est un ensemble ordonne d'unites, toujours
 *  normalise par selectUnits : une seule unite = `unit`, deux ou plus =
 *  `unit-group` (jamais un groupe a un membre). `ids[0]` sert d'ANCRE pour
 *  un deplacement de groupe. Decors et Baliste
 *  restent des selections a part, jamais melangees a des unites. */
export type EditorSelection =
  | { kind: 'obstacle'; id: number }
  | { kind: 'unit'; id: number }
  | { kind: 'unit-group'; ids: number[] }
  /** La Baliste (unique, toujours presente) : deplacable, jamais supprimee
   *  ni tournee. */
  | { kind: 'ballista' }
  | null;

export type EditorTool =
  | { type: 'select' }
  | { type: 'place-obstacle'; template: PlacementTemplate }
  | { type: 'place-unit'; unitId: string }
  | { type: 'add-cell'; terrain: TerrainType }
  | { type: 'remove-cell' }
  /** Pinceau de territoire : `team` peint la case pour ce camp, `null`
   *  l'efface (case neutre). */
  | { type: 'paint-territory'; team: TerritoryTeam | null };

/** Proprietaire de la Baliste de la carte : toujours le joueur (meme camp
 *  que spawnBallistaBuilding en jeu) ; son placement interactif exige une
 *  empreinte entierement dans ce territoire. */
export const EDITOR_BALLISTA_OWNER: TerritoryTeam = 'player';

/** Les deux rectangles se chevauchent (un simple contact de bord ne compte
 *  pas). */
function boundsOverlap(a: ObstacleBounds, b: ObstacleBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Position et camp d'une unite, pour annuler / retablir un deplacement. */
export interface EditorUnitState {
  id: number;
  x: number;
  z: number;
  team: Team;
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

  /** Centre de la Baliste du brouillon (voir MapDef.ballista). */
  ballista: { x: number; z: number };
  /** Faux tant que la Baliste n'a jamais ete deplacee dans l'editeur (map
   *  sans champ `ballista`) : la position suit alors le repli historique
   *  computePlayerArrowOrigin, y compris apres un changement de taille, et
   *  l'export n'ecrit aucun champ — une ancienne map rouverte puis
   *  reenregistree reste identique. Vrai des qu'elle est deplacee ou si la
   *  map en definit une. */
  ballistaExplicit: boolean;

  /** Territoire EXPLICITE du brouillon (voir MapDef.territory), copie de la
   *  map chargee — `undefined` si elle n'en avait pas (repli historique, et
   *  aucun champ a l'export), `[]` s'il est explicitement vide. Modifie
   *  uniquement par paintTerritoryCell / restoreTerritory / removeCell. */
  territory: TerritoryCell[] | undefined;

  /** Index du territoire resolu (voir territoryOwnerAt), construit a la
   *  demande et invalide par toute modification du territoire ou des
   *  cellules (le repli historique depend des cellules). */
  private territoryIndexCache: TerritoryIndex | null = null;

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
    this.territory = source.territory?.map((c) => ({ x: c.x, z: c.z, team: c.team }));

    this.ballistaExplicit = source.ballista !== undefined;
    this.ballista = source.ballista ? { x: source.ballista.x, z: source.ballista.z } : computePlayerArrowOrigin(source);
    // Position chargee invalide (fichier modifie a la main, carte dont les
    // cases ont change...) : la valide la plus proche sur la grille de la
    // Baliste. Le repli historique d'une map SANS champ n'est jamais deplace
    // automatiquement (comportement inchange pour les anciennes maps).
    if (this.ballistaExplicit && !this.canPlaceBallistaAt(this.ballista.x, this.ballista.z)) {
      const nearest = this.findNearestValidBallistaOrigin(this.ballista.x, this.ballista.z);
      if (nearest) {
        console.warn(`Position de Baliste invalide (${this.ballista.x}, ${this.ballista.z}) : deplacee en (${nearest.x}, ${nearest.z}).`);
        this.ballista = nearest;
      } else {
        console.warn(`Position de Baliste invalide (${this.ballista.x}, ${this.ballista.z}) et aucune position valide trouvee : conservee telle quelle.`);
      }
    }
  }

  /** Rectangle de collision de la Baliste centree en (x, z) — l'empreinte
   *  REELLE de la bataille (computeBallistaObstacle), jamais une autre
   *  taille. */
  private ballistaBoundsAt(x: number, z: number): ObstacleBounds {
    return obstacleBounds(computeBallistaObstacle({ x, z }));
  }

  /** Vrai si le point (x, z) est dans l'empreinte de la Baliste actuelle
   *  (bord exclu). */
  isInsideBallista(x: number, z: number): boolean {
    const b = this.ballistaBoundsAt(this.ballista.x, this.ballista.z);
    return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
  }

  /** Vrai si la case (x, z) est sous l'empreinte de la Baliste actuelle. */
  private isCellUnderBallista(x: number, z: number): boolean {
    return boundsOverlap({ minX: x, maxX: x + 1, minZ: z, maxZ: z + 1 }, this.ballistaBoundsAt(this.ballista.x, this.ballista.z));
  }

  /** Vrai si la Baliste peut etre centree en (x, z) : toutes les cases sous
   *  son empreinte existent (donc ni hors du plateau ni au-dessus d'un
   *  trou), aucun obstacle COLLIDABLE ne la chevauche et aucune unite n'a son
   *  centre dedans. Validite GEOMETRIQUE seulement, sans territoire : sert a
   *  relocaliser une position chargee invalide, sans jamais deplacer une
   *  Baliste chargee hors du territoire joueur (voir canMoveBallistaTo pour
   *  un deplacement interactif). */
  canPlaceBallistaAt(x: number, z: number): boolean {
    const b = this.ballistaBoundsAt(x, z);
    for (let cz = Math.floor(b.minZ); cz < b.maxZ; cz++) {
      for (let cx = Math.floor(b.minX); cx < b.maxX; cx++) {
        if (!this.hasCellAt(cx, cz)) return false;
      }
    }
    if (this.obstacles.some((o) => isCollidableObstacle(o) && boundsOverlap(b, obstacleBounds(o)))) return false;
    return !this.units.some((u) => u.x > b.minX && u.x < b.maxX && u.z > b.minZ && u.z < b.maxZ);
  }

  /** Position valide la plus proche de (x, z) sur la grille de la Baliste,
   *  ou null. Deterministe : anneaux de distance croissante autour du point
   *  cale, candidats tries par distance puis z puis x. */
  private findNearestValidBallistaOrigin(x: number, z: number): { x: number; z: number } | null {
    const start = snapBallistaOrigin(x, z);
    const maxRing = Math.max(this.width, this.height);
    for (let ring = 0; ring <= maxRing; ring++) {
      const candidates: { x: number; z: number; d: number }[] = [];
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const c = { x: start.x + dx, z: start.z + dz };
          candidates.push({ ...c, d: (c.x - x) ** 2 + (c.z - z) ** 2 });
        }
      }
      candidates.sort((a, b) => a.d - b.d || a.z - b.z || a.x - b.x);
      const found = candidates.find((c) => this.canPlaceBallistaAt(c.x, c.z));
      if (found) return { x: found.x, z: found.z };
    }
    return null;
  }

  /** Vrai si les BALLISTA_PLACEMENT_TILES × BALLISTA_PLACEMENT_TILES cases
   *  de placement de la Baliste centree en (x, z) (centre cale par
   *  snapBallistaOrigin) appartiennent toutes au joueur. */
  isBallistaFootprintInPlayerTerritory(x: number, z: number): boolean {
    const cornerX = Math.round(x - BALLISTA_PLACEMENT_TILES / 2);
    const cornerZ = Math.round(z - BALLISTA_PLACEMENT_TILES / 2);
    return isFootprintOwnedBy(this.territoryIndex(), EDITOR_BALLISTA_OWNER, cornerX, cornerZ, BALLISTA_PLACEMENT_TILES, BALLISTA_PLACEMENT_TILES);
  }

  /** Validite d'un deplacement INTERACTIF de la Baliste vers (x, z) (centre
   *  deja cale) : regles geometriques de canPlaceBallistaAt ET empreinte de
   *  placement entierement en territoire joueur. SOURCE UNIQUE partagee par
   *  le deplacement et son apercu. */
  canMoveBallistaTo(x: number, z: number): boolean {
    return this.canPlaceBallistaAt(x, z) && this.isBallistaFootprintInPlayerTerritory(x, z);
  }

  /** Deplace la Baliste vers la position calee sur sa grille la plus proche
   *  de (x, z), si elle est valide (canMoveBallistaTo) — la rend explicite.
   *  Renvoie false (rien ne change) si la position est invalide ou
   *  identique. */
  moveBallista(x: number, z: number): boolean {
    const target = snapBallistaOrigin(x, z);
    if (target.x === this.ballista.x && target.z === this.ballista.z) return false;
    if (!this.canMoveBallistaTo(target.x, target.z)) return false;
    this.ballista = target;
    this.ballistaExplicit = true;
    return true;
  }

  /** Ecrit directement position et statut explicite — annuler/retablir
   *  (voir main.ts), sans validation : on revient a un etat deja valide. */
  setBallista(position: { x: number; z: number }, explicit: boolean): void {
    this.ballista = { x: position.x, z: position.z };
    this.ballistaExplicit = explicit;
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
    this.invalidateTerritoryIndex();
    return true;
  }

  /** Vrai si la cellule existe ET peut être supprimée (Part AE, V1 :
   *  "interdire la suppression tant qu'une unité ou un objet bloquant
   *  occupe la cellule") — un prop traversable (voir isCollidableObstacle)
   *  n'empêche jamais rien. Partagée entre `removeCell` (action réelle) et
   *  l'aperçu vert/rouge de l'outil (Part AF), pour ne jamais diverger. */
  canRemoveCell(x: number, z: number): boolean {
    if (!this.cellMap.has(cellKey(x, z))) return false;
    // Case necessaire sous la Baliste.
    if (this.isCellUnderBallista(x, z)) return false;

    const occupiedByUnit = this.units.some((u) => Math.floor(u.x) === x && Math.floor(u.z) === z);
    if (occupiedByUnit) return false;

    const occupiedByObstacle = this.obstacles.some((o) => {
      if (!isCollidableObstacle(o)) return false;
      const center = obstacleCenter(o);
      return Math.floor(center.x) === x && Math.floor(center.z) === z;
    });
    return !occupiedByObstacle;
  }

  /** Supprime une cellule — voir canRemoveCell pour les conditions de refus.
   *  Retire aussi sa case de territoire explicite : aucun territoire ne
   *  reste sur une case qui n'existe plus. */
  removeCell(x: number, z: number): boolean {
    if (!this.canRemoveCell(x, z)) return false;
    this.cellMap.delete(cellKey(x, z));
    if (this.territory) this.territory = this.territory.filter((c) => c.x !== x || c.z !== z);
    this.invalidateTerritoryIndex();
    return true;
  }

  /** Territoire affiche et peint par l'editeur : l'explicite s'il existe,
   *  sinon les bandes historiques de profondeur PLACEMENT_ROWS (l'editeur
   *  n'a pas de run), limitees aux cellules existantes. */
  resolvedTerritory(): TerritoryCell[] {
    return resolveMapTerritory({ width: this.width, height: this.height, cells: this.cells, territory: this.territory }, PLACEMENT_ROWS);
  }

  /** Camp proprietaire de la case qui contient le point (x, z), d'apres le
   *  territoire resolu (explicite, sinon repli historique) — null si la case
   *  est neutre ou absente. SOURCE UNIQUE du camp des unites de l'editeur
   *  (pose, deplacement, apercus). */
  territoryOwnerAt(x: number, z: number): TerritoryTeam | null {
    return territoryOwnerAtPoint(this.territoryIndex(), x, z);
  }

  private territoryIndex(): TerritoryIndex {
    if (!this.territoryIndexCache) this.territoryIndexCache = buildTerritoryIndex(this.resolvedTerritory());
    return this.territoryIndexCache;
  }

  private invalidateTerritoryIndex(): void {
    this.territoryIndexCache = null;
  }

  /** Vrai si la case (x, z) — coordonnees entieres de case — existe et peut
   *  donc recevoir du territoire. */
  canPaintTerritoryAt(x: number, z: number): boolean {
    return Number.isInteger(x) && Number.isInteger(z) && this.hasCellAt(x, z);
  }

  /** Donne la case (x, z) a `team`, ou la rend neutre (`null`). Renvoie
   *  false si rien ne change (case absente, ou deja dans cet etat).
   *  Territoire encore implicite (`undefined`) : le premier vrai changement
   *  part d'une copie du territoire affiche (repli historique), jamais d'un
   *  territoire vide. Une seule entree par case apres ecriture ; une case
   *  repeinte garde sa place dans la liste, une nouvelle case va a la fin. */
  paintTerritoryCell(x: number, z: number, team: TerritoryTeam | null): boolean {
    if (!this.canPaintTerritoryAt(x, z)) return false;
    const current = this.territory ?? this.resolvedTerritory();
    const isCell = (c: TerritoryCell) => c.x === x && c.z === z;
    const entries = current.filter(isCell);
    const owner = entries.length > 0 ? entries[entries.length - 1]!.team : null;
    if (owner === team && entries.length <= 1) return false;
    const index = current.findIndex(isCell);
    const next = current.filter((c) => !isCell(c));
    if (team) next.splice(index >= 0 ? index : next.length, 0, { x, z, team });
    this.territory = next;
    this.invalidateTerritoryIndex();
    return true;
  }

  /** Copie de l'etat du territoire explicite (`undefined` compris), pour
   *  annuler / retablir. */
  territorySnapshot(): TerritoryCell[] | undefined {
    return this.territory?.map((c) => ({ x: c.x, z: c.z, team: c.team }));
  }

  /** Remet le territoire exactement dans un etat capture par
   *  territorySnapshot (annuler / retablir), sans validation. */
  restoreTerritory(snapshot: TerritoryCell[] | undefined): void {
    this.territory = snapshot?.map((c) => ({ x: c.x, z: c.z, team: c.team }));
    this.invalidateTerritoryIndex();
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
    this.invalidateTerritoryIndex();
    // Baliste jamais deplacee : elle suit le repli historique du coin, comme
    // le ferait "Tester le scenario" sur la map exportee (sans champ).
    if (!this.ballistaExplicit) this.ballista = computePlayerArrowOrigin(this);
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

  /** Unites de la selection de groupe courante, ou null si la selection
   *  n'est pas un groupe. */
  get selectedUnitGroup(): EditorUnit[] | null {
    if (this.selection?.kind !== 'unit-group') return null;
    const ids = new Set(this.selection.ids);
    return this.units.filter((u) => ids.has(u.id));
  }

  select(selection: EditorSelection): void {
    this.selection = selection;
  }

  /** Ids des unites selectionnees, dans l'ordre de selection ; vide si la
   *  selection n'est pas une selection d'unites. */
  get selectedUnitIds(): number[] {
    const sel = this.selection;
    if (sel?.kind === 'unit') return [sel.id];
    if (sel?.kind === 'unit-group') return [...sel.ids];
    return [];
  }

  /** Remplace la selection par ces unites (ids inconnus ignores, doublons
   *  retires, ordre conserve) : aucune -> rien, une -> `unit`, plusieurs ->
   *  `unit-group`. Remplace aussi une selection de decor ou de Baliste. */
  selectUnits(ids: Iterable<number>): void {
    const existing = new Set(this.units.map((u) => u.id));
    const unique = [...new Set(ids)].filter((id) => existing.has(id));
    if (unique.length === 0) this.selection = null;
    else if (unique.length === 1) this.selection = { kind: 'unit', id: unique[0]! };
    else this.selection = { kind: 'unit-group', ids: unique };
  }

  /** Ajoute l'unite a la selection d'unites si elle n'y est pas, l'en retire
   *  sinon. Depuis une selection de decor ou de Baliste, demarre une
   *  nouvelle selection d'unites. */
  toggleUnitSelection(id: number): void {
    const ids = this.selectedUnitIds;
    this.selectUnits(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
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
   *  existante appartenant à un camp (case neutre interdite), aucun obstacle
   *  COLLIDABLE (rocher, arbre, bâtiment — jamais
   *  un prop traversable, voir isCollidableObstacle) et aucune autre unité
   *  déjà sur cette même case (2026-08-16, demande explicite : "aucune
   *  unité incompatible déjà présente" / "aucun bâtiment n'occupe cette
   *  cellule"). SOURCE UNIQUE partagée par la preview visuelle (case verte/
   *  rouge, voir editor/editorScene.ts buildCellPreview) et placeUnitAt
   *  ci-dessous — la preview ne doit JAMAIS promettre un résultat que le
   *  clic ne tiendrait pas. `ignoreUnitIds` : unités en cours de
   *  déplacement, dont la case actuelle ne bloque pas. */
  canPlaceUnitAt(x: number, z: number, ignoreUnitIds?: ReadonlySet<number>): boolean {
    const cellX = Math.floor(x);
    const cellZ = Math.floor(z);
    if (!this.hasCellAt(cellX, cellZ)) return false;
    // Case neutre : interdite aux unites (le camp vient du territoire).
    if (this.territoryOwnerAt(x, z) === null) return false;
    if (this.isInsideBallista(x, z)) return false;

    const onObstacle = this.obstacles.some((o) => {
      if (!isCollidableObstacle(o)) return false;
      const center = obstacleCenter(o);
      return Math.floor(center.x) === cellX && Math.floor(center.z) === cellZ;
    });
    if (onObstacle) return false;

    return !this.units.some((u) => !ignoreUnitIds?.has(u.id) && Math.floor(u.x) === cellX && Math.floor(u.z) === cellZ);
  }

  /** Place une nouvelle unite au point donne — son camp est celui de la case
   *  dans le territoire (voir territoryOwnerAt), pas choisi dans l'asset
   *  browser. Refuse (voir canPlaceUnitAt) si aucune cellule de terrain
   *  n'existe à cet endroit, si la case est neutre, si un obstacle/bâtiment
   *  occupe déjà la case, ou si une autre unité y est déjà posée. */
  placeUnitAt(x: number, z: number): EditorUnit | null {
    if (this.tool.type !== 'place-unit') return null;
    if (!this.canPlaceUnitAt(x, z)) return null;
    const team = this.territoryOwnerAt(x, z);
    if (!team) return null;
    const unit: EditorUnit = { id: this.nextId++, unitId: this.tool.unitId, team, x, z };
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

  /** Ecrit uniquement la rotation d'un obstacle (normalisee dans [0, 2π)),
   *  sans toucher a sa position — utilise par la poignee de rotation de
   *  l'anneau et par Ctrl+molette. */
  setObstacleRotation(id: number, rotationY: number): void {
    const o = this.obstacles.find((obstacle) => obstacle.id === id);
    if (!o) return;
    const fullTurn = Math.PI * 2;
    o.rotationY = ((rotationY % fullTurn) + fullTurn) % fullTurn;
  }

  /** Applique un deplacement d'unites deja valide (voir main.ts,
   *  planEditorUnitMove, meme calcul que l'apercu) et donne a chaque unite
   *  deplacee le camp de sa case d'arrivee (territoryOwnerAt) : une unite
   *  amenee en territoire adverse change de camp. Le plan valide n'arrive
   *  jamais sur une case neutre (canPlaceUnitAt) ; par prudence, le camp est
   *  alors conserve. Renvoie l'etat de chaque unite avant et apres, pour
   *  l'historique. */
  moveUnits(moves: readonly { id: number; x: number; z: number }[]): { before: EditorUnitState[]; after: EditorUnitState[] } {
    const before: EditorUnitState[] = [];
    const after: EditorUnitState[] = [];
    for (const move of moves) {
      const u = this.units.find((unit) => unit.id === move.id);
      if (!u) continue;
      before.push({ id: u.id, x: u.x, z: u.z, team: u.team });
      u.x = move.x;
      u.z = move.z;
      u.team = this.territoryOwnerAt(move.x, move.z) ?? u.team;
      after.push({ id: u.id, x: u.x, z: u.z, team: u.team });
    }
    return { before, after };
  }

  /** Remet ces unites exactement dans cet etat (annuler / retablir). */
  setUnitStates(states: readonly EditorUnitState[]): void {
    for (const state of states) {
      const u = this.units.find((unit) => unit.id === state.id);
      if (!u) continue;
      u.x = state.x;
      u.z = state.z;
      u.team = state.team;
    }
  }

  rotateSelected(deltaRad: number): void {
    const o = this.selectedObstacle;
    if (!o) return;
    o.rotationY = ((o.rotationY ?? 0) + deltaRad + Math.PI * 2) % (Math.PI * 2);
  }

  deleteSelected(): void {
    const sel = this.selection;
    // La Baliste est unique et toujours presente : jamais supprimee.
    if (!sel || sel.kind === 'ballista') return;
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
