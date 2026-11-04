import { isGroundTextureId, type SurfaceCellDef } from '../config/groundSurfaces';
import { CAMP_CLEAR_RADIUS, dropLegacyWalls, type MapBuildingPlacement, type MapCampDef, type MapDef, type WallLineDef } from '../config/mapDef';
import type { ResourcePileDef } from '../config/resourceNodes';
import { CAMP_KINDS } from '../data/camps';
import { SLOPE_SHAPES, TERRAIN_LEVEL_MAX, TERRAIN_LEVEL_MIN, type SlopeShape, type TerrainElevationCellDef } from '../config/terrainElevation';
import { BUILDINGS } from '../data/buildings';
import { WALL_TYPES } from '../data/walls';
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
    // Niveau d'unite explicite (MapUnitPlacement.level) : ecrit seulement
    // s'il existe (cartes sans niveau inchangees).
    playerUnits: state.units.filter((u) => u.team === 'player').map(({ unitId, x, z, level }) => ({ unitId, x, z, ...(level !== undefined ? { level } : {}) })),
    enemyUnits: state.units.filter((u) => u.team === 'enemy').map(({ unitId, x, z, level }) => ({ unitId, x, z, ...(level !== undefined ? { level } : {}) })),
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
    // Murs V2 (MapDef.walls) : geometrie de chaque ligne (A, B, famille,
    // portes), jamais ses segments ; champ absent sans mur.
    ...(state.walls.length > 0 ? { walls: state.walls.map(({ id: _id, ...line }) => ({ ...line, ...(line.gates && line.gates.length > 0 ? { gates: [...line.gates] } : {}) })) } : {}),
    // Relief (MapDef.elevationCells) ecrit seulement s'il existe : une carte
    // plate reste identique a avant ce champ.
    ...(state.elevationCells.length > 0 ? { elevationCells: state.elevationCells } : {}),
    // Hauteurs logiques de la sculpture (MapDef.reliefLogic) : seulement
    // celles qui ne se deduisent pas du relief, champ absent sinon.
    ...(state.reliefLogicEntries.length > 0 ? { reliefLogic: state.reliefLogicEntries } : {}),
    // Surfaces peintes (MapDef.surfaceCells) : seulement les cases peintes,
    // jamais la surface par defaut ; champ absent s'il n'y en a aucune.
    ...(state.surfaceCells.length > 0 ? { surfaceCells: state.surfaceCells } : {}),
    // Elements de carte Survie et metadonnees (2026-11-03) : l'etat CONCRET
    // de la carte (camps, tas, barils) ; la graine n'est qu'une origine.
    ...featureLists(state),
    ...(state.survivalRules ? { survivalRules: state.survivalRules } : {}),
    // Camp de depart (2026-11-04) : preset et rotation seulement (le reste
    // est derive, config/startingBase.ts).
    ...(state.startingBase ? { startingBase: { preset: state.startingBase.preset, rotation: state.startingBase.rotation } } : {}),
    ...(state.generator ? { generator: { ...state.generator } } : {}),
  };
}

/** Camps, petits tas et objets destructibles de l'editeur, dans leur ordre
 *  (indice d'un tas = son identifiant en jeu) ; listes vides omises. */
function featureLists(state: EditorState): Pick<MapDef, 'camps' | 'resourcePiles' | 'destructibles'> {
  const camps = state.features.flatMap((f) => (f.kind === 'camp' ? [structuredClone(f.camp)] : []));
  const piles = state.features.flatMap((f) => (f.kind === 'pile' ? [{ ...f.pile }] : []));
  const destructibles = state.features.flatMap((f) => (f.kind === 'destructible' ? [{ ...f.destructible }] : []));
  return {
    ...(camps.length > 0 ? { camps } : {}),
    ...(piles.length > 0 ? { resourcePiles: piles } : {}),
    ...(destructibles.length > 0 ? { destructibles } : {}),
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

  const campsRead = Array.isArray(data.camps) ? readCamps(data.camps) : null;
  const map: MapDef = {
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
    // `walls` OPTIONNEL (MapDef.walls, murs V2).
    ...(Array.isArray(data.walls) ? { walls: readWalls(data.walls) } : {}),
    // `elevationCells` OPTIONNEL (voir MapDef.elevationCells) : absent ->
    // carte plate ; entrees invalides ecartees.
    ...(Array.isArray(data.elevationCells) ? { elevationCells: readElevation(data.elevationCells) } : {}),
    // `reliefLogic` OPTIONNEL (voir MapDef.reliefLogic) : entrees invalides
    // ecartees.
    ...(Array.isArray(data.reliefLogic) ? { reliefLogic: readReliefLogic(data.reliefLogic) } : {}),
    // `surfaceCells` OPTIONNEL (voir MapDef.surfaceCells) : absent -> surface
    // par defaut partout ; entrees invalides (identifiant inconnu) ecartees.
    ...(Array.isArray(data.surfaceCells) ? { surfaceCells: readSurfaceCells(data.surfaceCells) } : {}),
    // Elements de carte Survie et metadonnees (2026-11-03) : OPTIONNELS,
    // entrees invalides ecartees (avant : ignores au chargement).
    ...(Array.isArray(data.resourcePiles) ? { resourcePiles: readResourcePiles(data.resourcePiles) } : {}),
    ...(campsRead ? { camps: campsRead.camps } : {}),
    ...(Array.isArray(data.destructibles) ? { destructibles: readDestructibles(data.destructibles) } : {}),
    ...(data.survivalRules === 'hero-rts' ? { survivalRules: 'hero-rts' as const } : {}),
    ...(isGenerator(data.generator) ? { generator: { kind: 'survival-procedural' as const, seed: data.generator.seed } } : {}),
    ...(isStartingBase(data.startingBase) ? { startingBase: { preset: data.startingBase.preset, rotation: data.startingBase.rotation ?? 0 } } : {}),
  };
  return readLegacyCampCleanup(map, campsRead?.legacy ?? []);
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readResourcePiles(entries: unknown[]): ResourcePileDef[] {
  const out: ResourcePileDef[] = [];
  for (const entry of entries) {
    const { x, z, resource, amount } = (entry ?? {}) as Record<string, unknown>;
    if (!finite(x) || !finite(z) || (resource !== 'wood' && resource !== 'stone') || !Number.isInteger(amount) || (amount as number) <= 0) continue;
    out.push({ x, z, resource, amount: amount as number });
  }
  if (out.length < entries.length) console.warn(`Petits tas : ${entries.length - out.length} entree(s) invalide(s) ignoree(s).`);
  return out;
}

/** Camps semantiques (2026-11-03) : type, centre, niveau, orientation,
 *  overrides de gardes. Un camp d'un fichier plus ancien (coffre, postes,
 *  rayon ecrits) est accepte : seuls type, centre et niveau sont repris, le
 *  reste se derive (data/campLayout.ts) ; `legacy` le signale pour retirer
 *  son decor et ses barils des listes concretes (readLegacyCampCleanup). */
function readCamps(entries: unknown[]): { camps: MapCampDef[]; legacy: MapCampDef[] } {
  const camps: MapCampDef[] = [];
  const legacy: MapCampDef[] = [];
  for (const entry of entries) {
    const c = (entry ?? {}) as Record<string, unknown>;
    if (typeof c.kind !== 'string' || !CAMP_KINDS[c.kind] || !finite(c.x) || !finite(c.z)) continue;
    const overrides = Array.isArray(c.guardOverrides) ? (c.guardOverrides as Record<string, unknown>[]).map((g) => (Number.isInteger(g?.level) ? { level: g.level as number } : {})) : null;
    const camp: MapCampDef = {
      kind: c.kind,
      x: c.x,
      z: c.z,
      ...(Number.isInteger(c.level) ? { level: c.level as number } : {}),
      ...(finite(c.facing) ? { facing: c.facing } : {}),
      ...(overrides && overrides.some((g) => g.level !== undefined) ? { guardOverrides: overrides } : {}),
    };
    camps.push(camp);
    if ('chest' in c || 'guardPosts' in c || 'radius' in c) legacy.push(camp);
  }
  if (camps.length < entries.length) console.warn(`Camps : ${entries.length - camps.length} entree(s) invalide(s) ignoree(s).`);
  return { camps, legacy };
}

/** Fichier d'avant les camps semantiques : le decor (props) et les barils
 *  ecrits dans la clairiere d'un camp lui appartenaient ; ils sont retires
 *  (le camp les derive de nouveau), le reste de la carte est intact. */
function readLegacyCampCleanup(map: MapDef, legacy: readonly MapCampDef[]): MapDef {
  if (legacy.length === 0) return map;
  const near = (x: number, z: number) => legacy.some((c) => Math.hypot(x - c.x, z - c.z) <= CAMP_CLEAR_RADIUS + 1);
  const obstacles = map.obstacles.filter((o) => !(o.kind === 'prop' && near(o.x ?? 0, o.z ?? 0)));
  const destructibles = (map.destructibles ?? []).filter((d) => !(d.kind === 'barrel' && near(d.x, d.z)));
  console.warn(`Camps : ${legacy.length} camp(s) d'un ancien format converti(s) ; ${map.obstacles.length - obstacles.length} decor(s) et ${(map.destructibles ?? []).length - destructibles.length} baril(s) de camp retires (derives du camp).`);
  return { ...map, obstacles, ...(map.destructibles ? { destructibles } : {}) };
}

function readDestructibles(entries: unknown[]): { kind: string; x: number; z: number }[] {
  const out: { kind: string; x: number; z: number }[] = [];
  for (const entry of entries) {
    const { kind, x, z } = (entry ?? {}) as Record<string, unknown>;
    if (typeof kind !== 'string' || !BUILDINGS[kind] || !finite(x) || !finite(z)) continue;
    out.push({ kind, x, z });
  }
  if (out.length < entries.length) console.warn(`Objets destructibles : ${entries.length - out.length} entree(s) invalide(s) ignoree(s).`);
  return out;
}

function isGenerator(v: unknown): v is { kind: 'survival-procedural'; seed: number } {
  const g = (v ?? {}) as Record<string, unknown>;
  return g.kind === 'survival-procedural' && Number.isInteger(g.seed);
}

function readReliefLogic(entries: unknown[]): { x: number; z: number; level: number }[] {
  const out: { x: number; z: number; level: number }[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { x, z, level } = entry as Record<string, unknown>;
    if (!Number.isInteger(x) || !Number.isInteger(z) || !Number.isInteger(level)) continue;
    if ((level as number) < TERRAIN_LEVEL_MIN || (level as number) > TERRAIN_LEVEL_MAX) continue;
    out.push({ x: x as number, z: z as number, level: level as number });
  }
  if (out.length < entries.length) console.warn(`Relief logique : ${entries.length - out.length} sommet(s) invalide(s) ignore(s).`);
  return out;
}

/** Surfaces peintes valides : x/z entiers, identifiant connu
 *  (config/groundSurfaces.ts) ; une seule entree par case (la derniere). */
function readSurfaceCells(entries: unknown[]): SurfaceCellDef[] {
  const cells = new Map<string, SurfaceCellDef>();
  let invalid = 0;
  for (const entry of entries) {
    const { x, z, surface } = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    if (!Number.isInteger(x) || !Number.isInteger(z) || !isGroundTextureId(surface)) {
      invalid++;
      continue;
    }
    cells.set(`${x},${z}`, { x: x as number, z: z as number, surface });
  }
  if (invalid > 0) console.warn(`Surfaces : ${invalid} case(s) invalide(s) ignoree(s).`);
  return [...cells.values()];
}

function readElevation(entries: unknown[]): TerrainElevationCellDef[] {
  const cells: TerrainElevationCellDef[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { x, z, level, slope } = entry as Record<string, unknown>;
    if (!Number.isInteger(x) || !Number.isInteger(z) || !Number.isInteger(level)) continue;
    const l = level as number;
    const hasSlope = slope !== undefined;
    if (hasSlope && !SLOPE_SHAPES.includes(slope as SlopeShape)) continue;
    // Pente : de level a level + 1, donc level <= MAX - 1.
    if (l < TERRAIN_LEVEL_MIN || l > (hasSlope ? TERRAIN_LEVEL_MAX - 1 : TERRAIN_LEVEL_MAX)) continue;
    cells.push({ x: x as number, z: z as number, level: l, ...(hasSlope ? { slope: slope as SlopeShape } : {}) });
  }
  if (cells.length < entries.length) console.warn(`Relief : ${entries.length - cells.length} case(s) invalide(s) ignoree(s).`);
  return cells;
}

/** Batiments de scenario valides : batiment gameplay connu et posable (emprise
 *  definie), camp joueur ou ennemi, centre fini. */
function readBuildings(source: unknown[]): MapBuildingPlacement[] {
  const buildings: MapBuildingPlacement[] = [];
  // Wall V1 supprime (2026-11-02) : ses pieces sont retirees avant tout,
  // avec un journal de migration (dropLegacyWalls).
  const entries = dropLegacyWalls(source.map((e) => (typeof e === 'object' && e !== null ? (e as { buildingId: string }) : { buildingId: '' })));
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { buildingId, team, x, z, rotationY } = entry as Record<string, unknown>;
    if (typeof buildingId !== 'string' || BUILDINGS[buildingId]?.footprintTilesX === undefined) continue;
    if ((team !== 'player' && team !== 'enemy') || !isFinitePoint({ x, z })) continue;
    // Rotation optionnelle : ignoree si elle n'est pas un nombre fini.
    const rotation = typeof rotationY === 'number' && Number.isFinite(rotationY) && rotationY !== 0 ? { rotationY } : {};
    buildings.push({ buildingId, team, x: x as number, z: z as number, ...rotation });
  }
  if (buildings.length < entries.length) console.warn(`Bâtiments : ${entries.length - buildings.length} entrée(s) invalide(s) ignorée(s).`);
  return buildings;
}

/** Lignes de mur valides : famille connue (data/walls.ts), extremites
 *  finies, camp connu ou absent, rangs de porte entiers. */
function readWalls(entries: unknown[]): WallLineDef[] {
  const walls: WallLineDef[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { type, ax, az, bx, bz, team, gates, openGates } = entry as Record<string, unknown>;
    if (typeof type !== 'string' || !WALL_TYPES[type]) continue;
    if (!isFinitePoint({ x: ax, z: az }) || !isFinitePoint({ x: bx, z: bz })) continue;
    if (team !== undefined && team !== 'player' && team !== 'enemy') continue;
    const gateList = Array.isArray(gates) ? gates.filter((g): g is number => Number.isInteger(g) && (g as number) >= 0) : [];
    walls.push({ type, ax: ax as number, az: az as number, bx: bx as number, bz: bz as number, ...(team ? { team } : {}), ...(gateList.length > 0 ? { gates: gateList } : {}), ...(openGates === true ? { openGates: true } : {}) });
  }
  if (walls.length < entries.length) console.warn(`Murs : ${entries.length - walls.length} ligne(s) invalide(s) ignorée(s).`);
  return walls;
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

/** `startingBase` bien forme : preset (chaine), rotation entiere 0..3 ou absente. */
function isStartingBase(v: unknown): v is { preset: string; rotation?: number } {
  const o = (v ?? {}) as Record<string, unknown>;
  return typeof o.preset === 'string' && (o.rotation === undefined || (Number.isInteger(o.rotation) && (o.rotation as number) >= 0 && (o.rotation as number) <= 3));
}
