import * as THREE from 'three';
import { GROUND_TEXTURES } from '../config/groundSurfaces';
import { GROUND_SURFACES, type GroundSurfaceId } from './groundSurfaces';
import { lookSurfaceTint } from './look';
import { groundTextureUrl } from './textures';

/**
 * MATIERE DU SOL (`?groundLook=`, 2026-10-30) : le dessus du
 * sol lu comme une matiere plutot que comme un PNG repete. Purement visuel :
 * cartes, surfaces peintes, relief, pointage et jeu ne le voient jamais.
 *
 * - `baseline` (defaut) : le rendu actuel, rien n'est change.
 * - `macro` : herbes et terres prennent leur MATIERE PRINCIPALE (herbe
 *   classique, terre battue) a la couleur moyenne de la surface peinte (une
 *   herbe dense reste plus sombre, mais c'est la meme herbe), et une
 *   variation de grande echelle (4 a 12 cases) les eclaircit, les assombrit,
 *   les rechauffe ou les seche par larges zones douces : couleur de sommet
 *   calculee en coordonnees MONDE (meme point, meme valeur, quels que soient
 *   la case, le morceau, la pente ou la levre), jamais par case.
 * - `layered` : `macro`, plus une seconde lecture de la meme texture,
 *   tournee et beaucoup plus grande, melangee legerement (casse la
 *   repetition du motif ; seule modification du shader), et de rares
 *   accents larges (zones plus seches et plus claires).
 * - `living` (2026-10-30, seconde passe) : `layered`, plus :
 *   - UNE herbe : herbe par defaut, classique, dense, prairie (et les herbes
 *     ecartees) sont la meme matiere, sous une seule teinte du preset
 *     `?look=` (celle de l'herbe par defaut), dessinee d'un seul tenant. Dense
 *     et prairie sont des ETATS (plus sombre et plus riche ; plus claire et
 *     plus seche), portes par les sommets et dont le contour est bruite au
 *     pixel : aucune transition Irregular entre deux herbes. Meme chose pour
 *     les terres (terre par defaut = terre battue) ;
 *   - de rares ACCENTS (1,5 a 5 cases) : polygones doux epars, calcules au
 *     pixel en coordonnees monde (plaque seche, herbe plus claire, herbe
 *     usee ; terre tassee, plus claire, plus rouge), une meme maille pour
 *     l'herbe et la terre ;
 *   - une herbe un peu plus seche, par endroits, pres des terres (bord de
 *     chemin, abords d'une cour).
 *   Seul mode a une palette Surface simplifiee et des vignettes calculees
 *   (editor/editorUI.ts).
 *
 * - `rich` (2026-10-31, en comparaison) : `living`, plus des PLAQUES de
 *   matiere a l'interieur de chaque surface (deux champs de bruit deformes,
 *   seuilles en zones a bord net : herbe plus grasse, plus terne, plus
 *   terreuse ; terre plus seche, plus tassee, plus rouge ; etc.) et un leger
 *   mouchetis qui casse la repetition du motif, au pixel, en coordonnees
 *   monde (jamais par case).
 *
 * Direction retenue (Antoine, 2026-10-30) : `living`, avec `?look=stylized`
 * (combinaison de reference). Le defaut reste `baseline` ; les autres
 * valeurs restent comme temoins de debug.
 *
 * Catalogue elargi (2026-10-31) : paves, sable, sol rocheux et sol volcanique
 * sont des matieres a part (seconde lecture et variation macro en `living`,
 * plaques en `rich`) ; eau et lave ont leur propre shader anime dans tous
 * les modes (applyGroundLayer, attachGroundClock).
 *
 * Les flancs et les textures ecartees (mixtes, terre en strates) ne sont pas
 * touches. Deterministe (hash de positions monde, jamais Math.random ; seule
 * l'animation de l'eau et de la lave suit l'horloge, rendu seulement).
 */
export type GroundLook = 'baseline' | 'macro' | 'layered' | 'living' | 'rich';
export const GROUND_LOOKS: readonly GroundLook[] = ['baseline', 'macro', 'layered', 'living', 'rich'];
let groundLook: GroundLook = 'baseline';

/** Matiere appliquee aux plateaux construits ensuite (main.ts : `?groundLook=`). */
export function setGroundLook(next: GroundLook): void {
  groundLook = next;
  renderDefs.clear();
}

/** Matiere courante. */
export function currentGroundLook(): GroundLook {
  return groundLook;
}

/** `living` ou `rich` (meme base : herbes unifiees, etats, accents ; palette
 *  Surface simplifiee de l'editeur, editor/editorUI.ts). */
export function groundLookIsLiving(): boolean {
  return groundLook === 'living' || groundLook === 'rich';
}

type Rgb = readonly [number, number, number];

const MAIN_GRASS: GroundSurfaceId = 'herbe-classique';
const MAIN_DIRT: GroundSurfaceId = 'terre-battue';
const GRASS_FAMILY: readonly GroundSurfaceId[] = ['grass', 'herbe-classique', 'herbe-prairie', 'herbe-dense', 'herbe-stylisee', 'herbe-pixel-net', 'herbe-pixel-touffes'];
const DIRT_FAMILY: readonly GroundSurfaceId[] = ['dirt', 'terre-battue'];
/** Matieres minerales du catalogue elargi (chacune la sienne). */
const MINERALS: readonly GroundSurfaceId[] = ['paves-gris', 'sable', 'roche-sol', 'sol-volcanique'];
/** Surfaces liquides : shader anime propre (eau, lave). */
const LIQUIDS: readonly GroundSurfaceId[] = ['eau', 'lave'];

/** Couleur moyenne LINEAIRE de chaque PNG (mesuree sur tous ses texels) : la
 *  matiere principale prend celle de la surface qu'elle remplace. A remesurer
 *  si un PNG change. */
const TEXTURE_MEAN: Partial<Record<GroundSurfaceId, Rgb>> = {
  grass: [0.0574, 0.173, 0.034],
  dirt: [0.1856, 0.0837, 0.0237],
  'herbe-classique': [0.0575, 0.1729, 0.034],
  'herbe-prairie': [0.0759, 0.2069, 0.0393],
  'herbe-dense': [0.0453, 0.1412, 0.0279],
  'herbe-stylisee': [0.0632, 0.1859, 0.036],
  'herbe-pixel-net': [0.0532, 0.1634, 0.0316],
  'herbe-pixel-touffes': [0.0552, 0.1681, 0.033],
  'terre-battue': [0.1969, 0.0963, 0.0359],
  'paves-gris': [0.2208, 0.202, 0.1728],
  sable: [0.6972, 0.549, 0.3034],
  'roche-sol': [0.2355, 0.223, 0.2005],
  'sol-volcanique': [0.0543, 0.0443, 0.0411],
};

/** Reglages (champs en cases ; amplitudes en fraction, lineaires). */
export const GROUND_LOOK_PARAMS = {
  /** Clarte : deux echelles melangees. */
  light: [
    { period: 9, angle: 0.52, salt: 1, weight: 0.7 },
    { period: 4.3, angle: 1.21, salt: 2, weight: 0.3 },
  ],
  /** Secheresse (plus chaud et plus clair d'un cote, plus vert de l'autre). */
  dry: { period: 12, angle: 2.03, salt: 3 },
  /** Accents de `layered` : larges taches rares (seuil doux sur le champ). */
  accent: { period: 14, angle: 0.87, salt: 4, from: 0.18, to: 0.45 },
  grass: { light: 0.32, dry: [0.22, 0.08, -0.18] as Rgb, accent: [0.16, 0.1, -0.08] as Rgb },
  dirt: { light: 0.24, dry: [0.08, 0.1, 0.15] as Rgb, accent: [0.1, 0.1, 0.12] as Rgb },
  /** Matieres minerales (`living`, `rich`) : variation plus discrete. */
  mineral: { light: 0.16, dry: [0.05, 0.04, 0.02] as Rgb, accent: [0, 0, 0] as Rgb },
  /** Seconde lecture de `layered` : echelle de la texture (plus petite =
   *  motif plus grand), rotation (radians), part du melange. */
  layer: { scale: 0.29, angle: 0.5, weight: 0.4 },
  /** `living` (multiplicateurs lineaires de la texture). */
  living: {
    /** Etats de l'herbe : dense (plus sombre, plus riche), prairie claire
     *  (plus claire, plus seche), usee pres d'une terre. */
    dense: [0.74, 0.82, 0.72] as Rgb,
    dry: [1.24, 1.14, 0.92] as Rgb,
    wear: [1.16, 1.06, 0.8] as Rgb,
    /** Portee (cases) de l'usure autour des cases de terre. */
    wearRadius: 1.5,
    /** Contour des etats : amplitude du seuil bruite, douceur ; usure :
     *  seuil moyen et son amplitude. */
    stateShape: [0.3, 0.18, 0.55, 0.25] as const,
    /** Accents : maille (cases), rotation de la maille (radians), part des
     *  accents a deux lobes, douceur du bord (cases) ; rayon (cases) et
     *  allongement, min et max. */
    accentShape: [5.5, 0.37, 0.65, 0.25] as const,
    accentSize: [0.8, 1.5, 1, 1.5] as const,
    /** Accents de l'herbe (plaque seche 40 %, herbe plus claire 35 %, herbe
     *  usee 25 %) et de la terre (tassee, plus claire, plus rouge) :
     *  multiplicateur et part de detail effacee ; presence (part des mailles
     *  qui en portent un) et poids des zones calmes. L'herbe en a peu et
     *  garde des zones calmes ; la terre, surface travaillee, en a plus. */
    grassAccents: [[1.24, 1.08, 0.58, 0], [1.2, 1.2, 1.08, 0], [1.5, 1.08, 1.2, 0]] as const,
    grassPresence: [0.9, 1] as const,
    dirtAccents: [[0.8, 0.78, 0.8, 0.6], [1.15, 1.15, 1.18, 0], [1.12, 0.9, 0.8, 0]] as const,
    dirtPresence: [0.8, 0] as const,
  },
  /** `rich` : plaques de matiere par famille. Trois tons (multiplicateurs
   *  lineaires : ton 1 et ton 2 de part et d'autre du champ principal, ton 3
   *  plus rare), puis forme : taille des plaques (cases), douceur du bord,
   *  part du ton 3, mouchetis (amplitude). */
  rich: {
    grass: { tones: [[0.86, 0.97, 0.8], [1.1, 1.05, 0.78], [1.14, 0.96, 0.72]] as const, shape: [3.2, 0.05, 0.75, 0.07] as const },
    dirt: { tones: [[1.1, 1.08, 1.06], [0.9, 0.87, 0.85], [1.1, 0.92, 0.84]] as const, shape: [2.6, 0.05, 0.6, 0.08] as const },
    'paves-gris': { tones: [[1.08, 1.07, 1.05], [0.9, 0.99, 0.84], [1.03, 0.94, 0.86]] as const, shape: [2.2, 0.06, 0.6, 0.05] as const },
    sable: { tones: [[1.06, 1.05, 1.02], [0.9, 0.88, 0.86], [1.05, 0.98, 0.9]] as const, shape: [3, 0.07, 0.5, 0.04] as const },
    'roche-sol': { tones: [[1.08, 1.07, 1.05], [0.93, 1.02, 0.86], [0.85, 0.84, 0.86]] as const, shape: [2.4, 0.05, 0.6, 0.07] as const },
    'sol-volcanique': { tones: [[1.22, 1.18, 1.14], [0.84, 0.82, 0.82], [1.22, 0.95, 0.84]] as const, shape: [2.8, 0.05, 0.6, 0.06] as const },
  },
};

/** Famille de plaques (`rich`) d'une matiere dessinee. */
function richOf(id: GroundSurfaceId): { tones: readonly (readonly [number, number, number])[]; shape: readonly [number, number, number, number] } | null {
  const R = GROUND_LOOK_PARAMS.rich;
  if (GRASS_FAMILY.includes(id)) return R.grass;
  if (DIRT_FAMILY.includes(id)) return R.dirt;
  return id in R ? R[id as keyof typeof R] : null;
}

interface SurfaceRender {
  texture: () => THREE.Texture;
  color: Rgb;
  tiles: number;
}

const renderDefs = new Map<GroundSurfaceId, SurfaceRender>();

/** Surface dont le dessus est DESSINE (mesh, materiau, transitions) : en
 *  `living`, toutes les herbes sont l'herbe principale et toutes les terres
 *  la terre battue (leurs etats passent par les sommets, voir GroundStates) ;
 *  sinon la surface elle-meme. */
export function groundRenderSurface(id: GroundSurfaceId): GroundSurfaceId {
  if (!groundLookIsLiving()) return id;
  return GRASS_FAMILY.includes(id) ? MAIN_GRASS : DIRT_FAMILY.includes(id) ? MAIN_DIRT : id;
}

/** Definition rendue d'une surface : la sienne en `baseline`, sinon sa
 *  matiere principale a sa couleur moyenne (texture, cycle et couleur) ; en
 *  `living`, sa matiere principale telle quelle. */
export function groundSurfaceDef(id: GroundSurfaceId): SurfaceRender {
  if (groundLookIsLiving()) return GROUND_SURFACES[groundRenderSurface(id)];
  const def = GROUND_SURFACES[id];
  const main = groundLook === 'baseline' ? null : GRASS_FAMILY.includes(id) ? MAIN_GRASS : DIRT_FAMILY.includes(id) ? MAIN_DIRT : null;
  if (!main || main === id) return def;
  let out = renderDefs.get(id);
  if (!out) {
    const m = GROUND_SURFACES[main];
    const a = TEXTURE_MEAN[id]!;
    const b = TEXTURE_MEAN[main]!;
    out = { texture: m.texture, tiles: m.tiles, color: [def.color[0] * a[0] / b[0], def.color[1] * a[1] / b[1], def.color[2] * a[2] / b[2]] };
    renderDefs.set(id, out);
  }
  return out;
}

/** Multiplicateur du preset `?look=` (render/look.ts) pour le dessus de la
 *  surface `id` : en `living`, un seul par famille (celui de l'herbe par
 *  defaut pour toutes les herbes, celui de la terre battue pour les terres) ;
 *  sinon celui de la surface. */
export function groundLookTint(id: GroundSurfaceId): Rgb {
  if (groundLookIsLiving()) {
    if (GRASS_FAMILY.includes(id)) return lookSurfaceTint('grass');
    if (DIRT_FAMILY.includes(id)) return lookSurfaceTint(MAIN_DIRT);
  }
  return lookSurfaceTint(id);
}

const SEED = 0x6a09e667;
function hash2(i: number, j: number, salt: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(salt, 0x1b873593) ^ SEED;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit de valeur lisse dans [-1, 1] au point monde (x, z) : reseau de
 *  `period` cases, tourne de `angle` (jamais aligne sur la grille),
 *  interpolation quintique (aucune arete visible). */
function field(x: number, z: number, f: { period: number; angle: number; salt: number }): number {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const u = (x * c - z * s) / f.period + f.salt * 0.371;
  const v = (x * s + z * c) / f.period + f.salt * 0.613;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const q = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const fu = q(u - i);
  const fv = q(v - j);
  const a = hash2(i, j, f.salt) + (hash2(i + 1, j, f.salt) - hash2(i, j, f.salt)) * fu;
  const b = hash2(i, j + 1, f.salt) + (hash2(i + 1, j + 1, f.salt) - hash2(i, j + 1, f.salt)) * fu;
  return (a + (b - a) * fv) * 2 - 1;
}

const ONE: Rgb = [1, 1, 1];
const ZERO: Rgb = [0, 0, 0];

/** Multiplicateur (lineaire) de la couleur de sommet du dessus de la surface
 *  `id` au point monde (x, z) : [1, 1, 1] en `baseline` et hors des herbes et
 *  des terres (et des matieres minerales en `living` et `rich`). */
export function groundMacro(id: GroundSurfaceId, x: number, z: number): Rgb {
  if (groundLook === 'baseline') return ONE;
  const P = GROUND_LOOK_PARAMS;
  const k = GRASS_FAMILY.includes(id) ? P.grass : DIRT_FAMILY.includes(id) ? P.dirt : groundLookIsLiving() && MINERALS.includes(id) ? P.mineral : null;
  if (!k) return ONE;
  let light = 0;
  for (const f of P.light) light += f.weight * field(x, z, f);
  const dry = field(x, z, P.dry);
  let accent = 0;
  if (groundLook === 'layered') {
    const t = Math.min(1, Math.max(0, (field(x, z, P.accent) - P.accent.from) / (P.accent.to - P.accent.from)));
    accent = t * t * (3 - 2 * t);
  }
  const l = 1 + k.light * light;
  return [
    l * (1 + k.dry[0] * dry) * (1 + k.accent[0] * accent),
    l * (1 + k.dry[1] * dry) * (1 + k.accent[1] * accent),
    l * (1 + k.dry[2] * dry) * (1 + k.accent[2] * accent),
  ];
}

/** Surfaces des cases de la carte entiere (TerrainContext, render/terrainCells.ts). */
export interface GroundStateSource {
  surfaceAt(x: number, z: number): GroundSurfaceId | undefined;
}

/**
 * ETATS de l'herbe en `living`, par sommet (attribut `groundState`) : part
 * d'herbe dense, part de prairie claire (parmi les herbes qui touchent le
 * coin) et proximite d'une terre (1 au bord d'une case de terre, 0 a
 * `wearRadius` cases). Calcules aux coins de la grille depuis la carte
 * entiere (un morceau du sol a les memes que le plateau d'un seul tenant),
 * interpoles a l'interieur d'une case ; le shader en tire un contour bruite.
 * Un objet par construction (cache des coins).
 */
export class GroundStates {
  private readonly corners = new Map<string, Rgb>();

  constructor(private readonly src: GroundStateSource) {}

  /** Etat au point (x, z) d'un sommet du dessus dessine en `surface`, ramene
   *  dans la case (cx, cz) (une levre prolonge son bord) ; [0, 0, 0] pour la
   *  terre, null hors des deux matieres (pas d'attribut). */
  at(surface: GroundSurfaceId, x: number, z: number, cx: number, cz: number): Rgb | null {
    if (surface === MAIN_DIRT) return ZERO;
    if (surface !== MAIN_GRASS) return null;
    const u = Math.min(1, Math.max(0, x - cx));
    const v = Math.min(1, Math.max(0, z - cz));
    const a = this.corner(cx, cz);
    const b = this.corner(cx + 1, cz);
    const c = this.corner(cx, cz + 1);
    const d = this.corner(cx + 1, cz + 1);
    const at = (k: number) => (a[k]! * (1 - u) + b[k]! * u) * (1 - v) + (c[k]! * (1 - u) + d[k]! * u) * v;
    return [at(0), at(1), at(2)];
  }

  private corner(vx: number, vz: number): Rgb {
    const key = `${vx},${vz}`;
    const cached = this.corners.get(key);
    if (cached) return cached;
    const radius = GROUND_LOOK_PARAMS.living.wearRadius;
    const reach = Math.floor(radius);
    let grass = 0;
    let dense = 0;
    let dry = 0;
    let near = Infinity;
    for (let cz = vz - 1 - reach; cz <= vz + reach; cz++) {
      for (let cx = vx - 1 - reach; cx <= vx + reach; cx++) {
        const s = this.src.surfaceAt(cx, cz);
        if (!s) continue;
        if (cx >= vx - 1 && cx <= vx && cz >= vz - 1 && cz <= vz && GRASS_FAMILY.includes(s)) {
          grass++;
          if (s === 'herbe-dense') dense++;
          else if (s === 'herbe-prairie') dry++;
        }
        if (DIRT_FAMILY.includes(s)) near = Math.min(near, Math.hypot(Math.max(cx - vx, 0, vx - cx - 1), Math.max(cz - vz, 0, vz - cz - 1)));
      }
    }
    const out: Rgb = [grass ? dense / grass : 0, grass ? dry / grass : 0, Math.max(0, 1 - near / radius)];
    this.corners.set(key, out);
    return out;
  }
}

/** Etats de la carte `src` en `living`, sinon null (aucun attribut). */
export function groundStates(src: GroundStateSource): GroundStates | null {
  return groundLookIsLiving() ? new GroundStates(src) : null;
}

/** Rayon (cases) des cases a redessiner autour d'une case repeinte
 *  (render/terrainChunks.ts) : 1 (transitions), plus en `living` et `rich`
 *  (etats et usure lus jusqu'a wearRadius). */
export function groundRepaintReach(): number {
  return groundLookIsLiving() ? Math.floor(GROUND_LOOK_PARAMS.living.wearRadius) + 1 : 1;
}

/** Bruit et hash des shaders du sol (`living`, `rich`, eau, lave). Hash
 *  entier : memes valeurs sur toutes les cartes graphiques. */
const GROUND_NOISE_GLSL = `
uint groundHash( uint x ) {
	x ^= x >> 16u;
	x *= 0x7feb352du;
	x ^= x >> 15u;
	x *= 0x846ca68bu;
	x ^= x >> 16u;
	return x;
}
uint groundSeed( ivec2 c, uint salt ) {
	return groundHash( uint( c.x + 32768 ) * 0x27d4eb2du ^ groundHash( uint( c.y + 32768 ) * 0x165667b1u ^ salt ) );
}
float groundRand( inout uint s ) {
	s = groundHash( s );
	return float( s >> 8u ) * ( 1.0 / 16777216.0 );
}
float groundNoise( vec2 p, uint salt ) {
	vec2 i = floor( p );
	vec2 f = p - i;
	vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
	ivec2 c = ivec2( i );
	float a = float( groundSeed( c, salt ) >> 8u );
	float b = float( groundSeed( c + ivec2( 1, 0 ), salt ) >> 8u );
	float d = float( groundSeed( c + ivec2( 0, 1 ), salt ) >> 8u );
	float e = float( groundSeed( c + ivec2( 1, 1 ), salt ) >> 8u );
	return mix( mix( a, b, u.x ), mix( d, e, u.x ), u.y ) * ( 2.0 / 16777216.0 ) - 1.0;
}`;

/** Shader `living` : declarations et fonctions (voir le commentaire du
 *  module). `rich` : plaques de matiere en plus (GROUND_PATCHES). */
const LIVING_FRAGMENT_HEAD = `
varying vec3 vGroundState;
varying vec2 vGroundXZ;
uniform vec3 groundStateColors[ 3 ];
uniform vec4 groundAccentColors[ 3 ];
uniform vec3 groundTexMean;
uniform vec2 groundAccentPresence;
uniform vec4 groundStateShape;
uniform vec4 groundAccentShape;
uniform vec4 groundAccentSize;
uniform vec2 groundGain;
${GROUND_NOISE_GLSL}
#ifdef GROUND_PATCHES
uniform vec3 groundPatchColors[ 3 ];
uniform vec4 groundPatchShape;
// Plaques de matiere : deux champs deformes (aucun axe, aucune case), seuilles
// en zones a bord net (douceur groundPatchShape.y), puis mouchetis moyen.
vec3 groundPatches( vec2 p ) {
	vec2 q = p / groundPatchShape.x;
	vec2 w = vec2( groundNoise( q * 0.7, 31u ), groundNoise( q * 0.7 + 5.3, 32u ) ) * 0.65;
	float a = groundNoise( q + w, 33u ) * 0.7 + groundNoise( q * 2.3 + w, 34u ) * 0.3;
	float b = groundNoise( q * 0.8 - w, 35u ) * 0.7 + groundNoise( q * 2.1, 36u ) * 0.3;
	float s = groundPatchShape.y;
	vec3 k = mix( vec3( 1.0 ), groundPatchColors[ 0 ], smoothstep( 0.16 - s, 0.16 + s, a ) );
	k *= mix( vec3( 1.0 ), groundPatchColors[ 1 ], smoothstep( 0.2 - s, 0.2 + s, -a ) );
	k *= mix( vec3( 1.0 ), groundPatchColors[ 2 ], smoothstep( 0.38 - s, 0.38 + s, b ) * groundPatchShape.z );
	float m = groundNoise( p * 1.7, 37u ) * 0.6 + groundNoise( p * 4.1, 38u ) * 0.4;
	return k * ( 1.0 + m * groundPatchShape.w );
}
#endif
// Pentagone convexe irregulier de rayon ~r autour de l'origine (distance signee).
float groundPolygon( vec2 e, float r, inout uint s ) {
	float phi = groundRand( s ) * 6.28318;
	float sdf = -1e3;
	for ( int n = 0; n < 5; n ++ ) {
		float a = phi + float( n ) * 1.25664 + ( groundRand( s ) - 0.5 ) * 0.5;
		sdf = max( sdf, dot( e, vec2( cos( a ), sin( a ) ) ) - r * ( 0.85 + 0.3 * groundRand( s ) ) );
	}
	return sdf;
}
vec3 groundLiving( vec3 tex ) {
	vec2 p = vGroundXZ;
	vec3 k = vec3( 1.0 );
	// Etats de l'herbe : seuil bruite sur la part interpolee aux sommets ;
	// usure par endroits seulement (portions d'environ 2 a 4 cases).
	float tD = 0.5 + groundStateShape.x * groundNoise( p * 0.7, 11u );
	float tP = 0.5 + groundStateShape.x * groundNoise( p * 0.7, 12u );
	float tW = groundStateShape.z + groundStateShape.w * groundNoise( p * 0.85, 13u );
	float dense = smoothstep( tD - groundStateShape.y, tD + groundStateShape.y, vGroundState.x );
	float dry = smoothstep( tP - groundStateShape.y, tP + groundStateShape.y, vGroundState.y );
	float wear = smoothstep( tW - 0.2, tW + 0.2, vGroundState.z ) * smoothstep( 0.1, 0.45, groundNoise( p * 0.2, 14u ) );
	k *= mix( vec3( 1.0 ), groundStateColors[ 0 ], dense * groundGain.y );
	k *= mix( vec3( 1.0 ), groundStateColors[ 1 ], dry * groundGain.y );
	k *= mix( vec3( 1.0 ), groundStateColors[ 2 ], wear * groundGain.y );
#ifdef GROUND_PATCHES
	k *= groundPatches( p );
#endif
	// Accents : au plus un par maille d'un reseau tourne (polygone doux, parfois
	// deux lobes), present selon un tirage et, pour l'herbe, hors des zones calmes.
	float cell = groundAccentShape.x;
	float soft = groundAccentShape.w;
	float ca = cos( groundAccentShape.y );
	float sa = sin( groundAccentShape.y );
	vec2 q = mat2( ca, sa, -sa, ca ) * p / cell;
	ivec2 base = ivec2( floor( q ) );
	float flatten = 0.0;
	for ( int j = -1; j <= 1; j ++ ) {
		for ( int i = -1; i <= 1; i ++ ) {
			ivec2 g = base + ivec2( i, j );
			uint s = groundSeed( g, 21u );
			float presence = groundRand( s );
			if ( presence > groundAccentPresence.x ) continue;
			float calm = mix( 1.0, smoothstep( -0.25, 0.35, groundNoise( ( vec2( g ) + 0.5 ) * 0.37, 22u ) ), groundAccentPresence.y );
			if ( presence > groundAccentPresence.x * calm ) continue;
			vec2 center = vec2( g ) + 0.2 + 0.6 * vec2( groundRand( s ), groundRand( s ) );
			vec2 d = ( q - center ) * cell;
			float r = mix( groundAccentSize.x, groundAccentSize.y, groundRand( s ) );
			float el = mix( groundAccentSize.z, groundAccentSize.w, groundRand( s ) );
			float reach = 2.4 * r * el + soft;
			if ( dot( d, d ) > reach * reach ) continue;
			float th = groundRand( s ) * 6.28318;
			vec2 e = mat2( cos( th ), sin( th ), -sin( th ), cos( th ) ) * d;
			e.x /= el;
			float sdf = groundPolygon( e, r, s );
			if ( groundRand( s ) < groundAccentShape.z ) {
				float la = groundRand( s ) * 6.28318;
				vec2 off = vec2( cos( la ), sin( la ) ) * r * mix( 0.55, 0.95, groundRand( s ) );
				sdf = min( sdf, groundPolygon( e - off, r * mix( 0.45, 0.75, groundRand( s ) ), s ) );
			}
			float m = ( 1.0 - smoothstep( -soft, soft, sdf ) ) * mix( 0.6, 1.0, groundRand( s ) ) * groundGain.x;
			float t = groundRand( s );
			vec4 accent = groundAccentColors[ t < 0.4 ? 0 : t < 0.75 ? 1 : 2 ];
			k *= mix( vec3( 1.0 ), accent.rgb, m );
			flatten = max( flatten, accent.a * m );
		}
	}
	return mix( tex, groundTexMean, flatten ) * k;
}`;

/** Reglages communs a tous les materiaux `living` (memes objets : en changer
 *  un les change tous ; `groundGain` = accents, etats, a 1). */
const livingShared = {
  groundStateShape: { value: new THREE.Vector4() },
  groundAccentShape: { value: new THREE.Vector4() },
  groundAccentSize: { value: new THREE.Vector4() },
  groundGain: { value: new THREE.Vector2(1, 1) },
};

/** `layered` : seconde lecture de la texture du materiau (herbes et terres
 *  seulement), dans le meme repere monde que la premiere (UV), tournee et
 *  agrandie, melangee a la premiere. `living` : la meme, puis etats de
 *  l'herbe, usure et accents (voir le commentaire du module) ; matieres
 *  minerales : seconde lecture seulement. `rich` : `living`, plus les plaques
 *  de matiere (minerales comprises). Eau et lave : leur shader anime, dans
 *  tous les modes (applyLiquid). Aucun effet sinon. */
export function applyGroundLayer(material: THREE.MeshLambertMaterial, id: GroundSurfaceId): void {
  if (LIQUIDS.includes(id)) {
    applyLiquid(material, id);
    return;
  }
  const living = groundLookIsLiving();
  const mineral = living && MINERALS.includes(id);
  if (!(groundLook === 'layered' || living) || !(GRASS_FAMILY.includes(id) || DIRT_FAMILY.includes(id) || mineral)) return;
  const { scale, angle } = GROUND_LOOK_PARAMS.layer;
  // Paves et dalles : pas de seconde lecture (deux motifs de pierres decales se dedoubleraient).
  const weight = id === 'paves-gris' || id === 'roche-sol' ? 0 : GROUND_LOOK_PARAMS.layer.weight;
  const f = (v: number) => v.toFixed(5);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const layer = `vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	vec2 groundLayerUv = mat2( ${f(c)}, ${f(s)}, ${f(-s)}, ${f(c)} ) * vMapUv * ${f(scale)} + vec2( 0.37, 0.61 );
	sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, texture2D( map, groundLayerUv ).rgb, ${f(weight)} );`;
  if (!living) {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
	${layer}
	diffuseColor *= sampledDiffuseColor;
#endif`,
      );
    };
    material.customProgramCacheKey = () => `ground-layer-${scale}-${angle}-${weight}`;
    return;
  }
  const L = GROUND_LOOK_PARAMS.living;
  livingShared.groundStateShape.value.set(...L.stateShape);
  livingShared.groundAccentShape.value.set(...L.accentShape);
  livingShared.groundAccentSize.value.set(...L.accentSize);
  const grass = GRASS_FAMILY.includes(id);
  // Minerales : ni etats ni accents (presence nulle) ; leur couleur moyenne pour `groundTexMean`.
  const rich = groundLook === 'rich' ? richOf(groundRenderSurface(id)) : null;
  const uniforms = {
    ...livingShared,
    groundStateColors: { value: (grass ? [L.dense, L.dry, L.wear] : [ONE, ONE, ONE]).map((v) => new THREE.Vector3(...v)) },
    groundAccentColors: { value: (grass ? L.grassAccents : L.dirtAccents).map((v) => new THREE.Vector4(...v)) },
    groundAccentPresence: { value: new THREE.Vector2(...(grass ? L.grassPresence : mineral ? [0, 0] : L.dirtPresence)) },
    groundTexMean: { value: new THREE.Vector3(...TEXTURE_MEAN[groundRenderSurface(id)]!) },
    ...(rich ? { groundPatchColors: { value: rich.tones.map((v) => new THREE.Vector3(...v)) }, groundPatchShape: { value: new THREE.Vector4(...rich.shape) } } : {}),
  };
  // Lus par les outils de laboratoire (reglage a chaud).
  material.userData['groundLiving'] = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 groundState;\nvarying vec3 vGroundState;\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGroundState = groundState;\n\tvGroundXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>${rich ? '\n#define GROUND_PATCHES' : ''}${LIVING_FRAGMENT_HEAD}`).replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
	${layer}
	sampledDiffuseColor.rgb = groundLiving( sampledDiffuseColor.rgb );
	diffuseColor *= sampledDiffuseColor;
#endif`,
    );
  };
  material.customProgramCacheKey = () => `ground-living-${scale}-${angle}-${weight}${rich ? '-rich' : ''}`;
}

/** Horloge des liquides (secondes, rendu seulement), partagee par tous leurs
 *  materiaux ; avancee par attachGroundClock. */
const groundClock = { value: 0 };
const tickGroundClock = () => {
  groundClock.value = (performance.now() / 1000) % 3600;
};

/** Anime l'eau et la lave du groupe `group` (sol d'un plateau ou d'un
 *  morceau) : l'horloge avance avant le rendu de leurs meshes. */
export function attachGroundClock(group: THREE.Object3D): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.userData['groundLiquid']) o.onBeforeRender = tickGroundClock;
  });
}

/**
 * EAU et LAVE (rendu seulement, tous les modes) : la texture glisse
 * lentement (eau : deux lectures croisees, reflets ; lave : croute qui
 * derive, fissures incandescentes qui pulsent, lueur en emissif). Au bord
 * (transitions `lisiere` et `melange`, render/surfaceBlend.ts), la marge
 * portee par l'alpha des sommets donne l'ecume de l'eau et la croute
 * refroidie de la lave.
 */
function applyLiquid(material: THREE.MeshLambertMaterial, id: GroundSurfaceId): void {
  const lava = id === 'lave';
  material.userData['groundLiquid'] = true;
  const body = lava
    ? `vec3 groundLava = texture2D( map, vMapUv + fract( vec2( 0.008, 0.005 ) * groundTime ) ).rgb;
	float groundHot = clamp( ( groundLava.r - groundLava.b ) * 2.0 - 0.3, 0.0, 1.0 );
	float groundPulse = 0.7 + 0.3 * sin( groundTime * 1.6 + groundNoise( vGroundXZ * 0.5, 71u ) * 5.0 );
	float groundCool = 1.0;
#ifdef USE_COLOR_ALPHA
	groundCool = smoothstep( 0.0, 0.35, vColor.a - 0.5 );
#endif
	diffuseColor.rgb *= groundLava;
	totalEmissiveRadiance += groundLava * groundHot * groundPulse * groundCool * 1.6;`
    : `vec2 groundUvA = vMapUv + fract( vec2( 0.031, 0.017 ) * groundTime );
	vec2 groundUvB = mat2( 0.8, 0.6, -0.6, 0.8 ) * vMapUv * 1.31 + fract( vec2( -0.019, 0.027 ) * groundTime );
	vec3 groundWater = max( texture2D( map, groundUvA ).rgb, texture2D( map, groundUvB ).rgb );
	groundWater *= 1.0 + 0.12 * groundNoise( vGroundXZ * 0.22 + vec2( groundTime * 0.02, 0.0 ), 61u );
#ifdef USE_COLOR_ALPHA
	float groundFoam = 1.0 - smoothstep( 0.02, 0.16 + 0.06 * groundNoise( vGroundXZ * 3.0 + groundTime * 0.4, 62u ), vColor.a - 0.5 );
	groundWater = mix( groundWater, vec3( 0.75, 0.85, 0.85 ), groundFoam * 0.8 );
#endif
	diffuseColor.rgb *= groundWater;`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['groundTime'] = groundClock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGroundXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vGroundXZ;\nuniform float groundTime;${GROUND_NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP\n\t${body}\n#endif`);
  };
  material.customProgramCacheKey = () => `ground-liquid-${lava ? 'lave' : 'eau'}`;
}

/** Eclairement d'un sol plat (lineaire, deja divise par pi : ce que
 *  multiplie l'albedo), fourni par la scene (main.ts) : vignettes. */
let swatchLight: Rgb = [0.65, 0.65, 0.65];

export function setGroundSwatchLight(light: Rgb): void {
  swatchLight = light;
}

/** Couleur RENDUE (lineaire) d'un texel blanc de la surface `id` en
 *  `living`, sur un sol plat au niveau 0, hors variation : couleur et teinte
 *  de sa matiere, son etat, l'eclairement de la scene. */
function swatchFactor(id: GroundSurfaceId): Rgb {
  const render = groundRenderSurface(id);
  const color = GROUND_SURFACES[render].color;
  const tint = groundLookTint(render);
  const L = GROUND_LOOK_PARAMS.living;
  const state = id === 'herbe-dense' ? L.dense : id === 'herbe-prairie' ? L.dry : ONE;
  const at = (k: 0 | 1 | 2) => color[k] * tint[k] * state[k] * swatchLight[k];
  return [at(0), at(1), at(2)];
}

/** Vignette de l'outil Surface en `living` (URL d'image) : la texture de la
 *  matiere de la surface, a sa couleur rendue (swatchFactor) — la meme
 *  texture pour toutes les herbes, comme en jeu. Calculee une fois. */
export async function groundSwatchUrl(id: GroundSurfaceId): Promise<string> {
  const render = groundRenderSurface(id);
  const file = GROUND_TEXTURES.find((t) => t.id === render)?.file;
  const img = new Image();
  img.src = groundTextureUrl(file ? `variants/${file}` : 'ground_grass.png');
  await img.decode();
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.drawImage(img, 0, 0, size, size);
  const data = g.getImageData(0, 0, size, size);
  const k = swatchFactor(id);
  const decode = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const encode = (v: number) => Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  for (let i = 0; i < data.data.length; i += 4) {
    for (let c = 0; c < 3; c++) data.data[i + c] = encode(decode(data.data[i + c]!) * k[c]!);
  }
  g.putImageData(data, 0, 0);
  return canvas.toDataURL();
}
