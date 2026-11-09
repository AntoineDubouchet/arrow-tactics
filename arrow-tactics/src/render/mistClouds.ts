import * as THREE from 'three';
import { setFogEdgeSeed } from './fogEdge';
import { mistShared } from './groundMist';

/**
 * MIST CLOUDS — RENDU OFFICIEL (2026-11-08, Graphic Lab « Mist Clouds » clos, DESIGN_DECISIONS.md
 * A6 ; passe « brouillard a trois niveaux » du meme jour, EN COURS DE VALIDATION : voir le rapport,
 * la documentation produit n'est pas encore a jour). Grandes nappes de brume aeriennes : masses,
 * profondeur, environnement, et desormais REPRESENTATION VISUELLE DU BROUILLARD DE GUERRE.
 * Distinctes de la Ground Mist (render/groundMist.ts, voile par materiau au ras du sol : integration
 * basse, pieds des objets, fog explore, ancrage ; validee et intacte).
 *
 * REGLE PRINCIPALE : la densite des nappes suit la visibilite GAMEPLAY du pixel, lue dans la grille du
 * brouillard de guerre deja resolue (FogOfWar.texture : la meme que l'assombrissement, aucune logique
 * parallele, aucune liste d'unites, aucun rayon esthetique, aucun centre de camp) :
 * - case VISIBLE (Heros, unites, batiments, Baliste, toute source de vision) : nappes FAIBLES
 *   (FOG_LEVELS.visible de REFERENCE : un peu d'humidite, quelques nappes fines, terrain lisible) ;
 * - case EXPLOREE hors vision : nappes FORTES (FOG_LEVELS.explored, REFERENCE entiere) : la bande
 *   atmospherique principale, entre la vision reelle et le noir ;
 * - case INEXPLOREE : le noir du brouillard reste souverain ; des nappes atmospheriques attenuees
 *   (uCloudUnseen, render/fogOfWar.ts) sont posees dessus, jamais plus presentes que la bande
 *   exploree ; la surface est ignoree (hauteur ramenee au sol), rien de ce qui est dessous n'est
 *   devine.
 * Lecture : CLAIR -> BRUME FORTE -> NOIR. Transitions (lisiere, render/fogEdge.ts, 2026-11-09) :
 * distances signees aux lisieres lues dans la grille, deplacees par un bruit en espace monde biaise
 * vers l'interieur (la lisiere visuelle, commune a l'assombrissement et aux nappes, est continue et
 * irreguliere, et deborde sur le terrain visible, jamais l'inverse) ; la densite visible n'est
 * atteinte qu'a quelques cases a l'interieur, pour qu'une unite qui entre en vision soit encore
 * enveloppee. La GRILLE reste seule juge de la visibilite gameplay (FogOfWar.isVisible).
 *
 * SECOND FACTEUR (2026-11-08, VALIDE) : la presence locale de nos BATIMENTS CONSTRUITS
 * (render/mistClearance.ts : carte de clairiere en espace monde, union des empreintes reelles, fondu
 * doux ; palissades et portes exclues, chantiers exclus). Pres d'un batiment, la densite d'une case
 * connue (VISIBLE comme EXPLOREE hors vision) est ramenee progressivement vers CLEARANCE_LEVEL, sous
 * le niveau visible : le coeur bati parait epargne par la brume, la zone visible non batie reste
 * legerement brumeuse, la zone exploree hors vision fortement brumeuse ; en zone INEXPLOREE le
 * facteur est nul (rien n'est revele : le noir et sa matiere restent ceux du brouillard). Effet
 * esthetique seulement : aucune vision gameplay, la grille du brouillard n'est pas touchee.
 *
 * Technique : aucun mesh, aucun draw call. La passe plein ecran du brouillard de guerre
 * (render/fogOfWar.ts, FogOfWarPass) connait deja, pour chaque pixel, la position monde de la
 * surface rendue et la direction de vue (camera orthographique : direction constante). Trois
 * couches horizontales EPAISSES (bas, haut) sont intersectees par la ligne de vue : la part de
 * l'epaisseur situee devant la surface donne l'absorption (un tronc ou un pieu disparait
 * progressivement vers le bas, une cime ou un toit au-dessus de la couche reste net : aucune ligne de
 * coupe), et la forme de la nappe est lue a la position MONDE de la couche sur cette ligne de vue
 * (parallaxe correcte quand la camera tourne : les nappes appartiennent au monde). Forme : bruit de
 * valeur a tres basse frequence (3 octaves, 22 a 40 cases pour la grande forme), seuils larges
 * (contours doux, trous, masses). Sources chaudes : memes 4 sources que la Ground Mist (uniforms
 * partages, lecture seule), avec une portee verticale pour montrer la lumiere un peu plus haut dans
 * l'air ; aucune lumiere en zone inexploree. Brouillard de guerre : les nappes sont composees AVANT
 * l'assombrissement de la passe, donc assombries en zone exploree comme le sol qu'elles couvrent
 * (rien de revele). Derive lente, directions differentes par couche.
 *
 * Lisibilite : une unite peut etre partiellement voilee par une nappe dense (zone exploree hors
 * vision surtout), c'est assume. Les reperes de jeu prioritaires (plaque de placement, anneaux,
 * marqueurs de ralliement : GAMEPLAY_OVERLAY_LAYER, render/fogOfWar.ts) et les barres HTML restent
 * au-dessus.
 *
 * `?mistClouds=` : `on` (= `reference`, DEFAUT sans parametre) | `off` (comparaison : passe du
 * brouillard strictement identique a celle d'avant les nappes) | `subtle` | `strong` (limites).
 * `?mistCloudsRes=full` : nappes par pixel au lieu de la passe demi-resolution (mistCloudsHalfRes,
 * defaut). `?mistUnitMask=on` : masque local de densite autour des unites visibles (outil de
 * comparaison, NON retenu pour le rendu normal : voir UNIT_MASK). Deterministe : decalage de bruit
 * tire de la graine de la carte, aucun Math.random.
 */
export type MistCloudsMode = 'off' | 'subtle' | 'reference' | 'strong';

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const urlMode = params?.get('mistClouds') ?? null;
const mode: MistCloudsMode = urlMode === 'off' ? 'off' : urlMode === 'subtle' ? 'subtle' : urlMode === 'strong' ? 'strong' : 'reference';
const unitMaskOn = mode !== 'off' && params?.get('mistUnitMask') === 'on';
const halfRes = params?.get('mistCloudsRes') !== 'full';

export function mistCloudsMode(): MistCloudsMode {
  return mode;
}

/** Demi-resolution (DEFAUT, passe performance 2026-11-08) : les nappes sont calculees dans une passe
 *  dediee de la moitie de la taille puis recomposees avec un surechantillonnage guide par la
 *  profondeur (render/fogOfWar.ts, FogOfWarPass.cloudsHalfRes) : image quasi identique (ecart moyen
 *  < 0,4 niveau, au bruit de scintillement pres) pour environ 80 % de cout GPU en moins (+0,2 a
 *  +0,45 ms contre +1,8 a +2,2 ms par pixel, session mesuree sur GPU partage : ecart relatif
 *  seulement). `?mistCloudsRes=full` : evaluation par pixel dans la passe de composition
 *  (comparaison). Pas de quart de resolution. */
export function mistCloudsHalfRes(): boolean {
  return halfRes;
}

/** Masque local d'unites actif (`?mistUnitMask=on`, debug) : main.ts ne transmet les unites proches
 *  que dans ce cas. */
export function mistUnitMaskOn(): boolean {
  return unitMaskOn;
}

/** Couleur des nappes : la famille de la Ground Mist (#a8bdb9), un peu plus claire ; jamais blanc. */
const CLOUD_COLOR = 0xb9cac6;

/** Niveaux : gain d'alpha, seuil bas du bruit (plus bas = nappes plus larges), seuil haut. */
const LEVELS: Record<Exclude<MistCloudsMode, 'off'>, { gain: number; low: number; high: number }> = {
  subtle: { gain: 0.55, low: 0.5, high: 0.85 },
  reference: { gain: 1.0, low: 0.4, high: 0.78 },
  strong: { gain: 1.5, low: 0.28, high: 0.7 },
};

/** Facteur de densite par etat du brouillard de guerre (part de l'intensite REFERENCE) : case
 *  visible FAIBLE, case exploree hors vision FORTE (c'est LA bande atmospherique principale, entre
 *  la vision reelle et le noir), case jamais exploree (meme densite, mais posee attenuee sur le noir :
 *  jamais plus importante que la bande exploree). PROVISOIRE (lecture revue le 2026-11-08 :
 *  CLAIR -> BRUME FORTE -> NOIR ; cibles d'Antoine ~0,22, 0,95 a 1,05, noir souverain). */
const FOG_LEVELS = { visible: 0.22, explored: 1.0, unexplored: 1.0 };

/** Luminosite des nappes posees sur le noir de l'inexplore (part de leur couleur) : matiere
 *  atmospherique sombre au-dessus de l'inconnu, nettement plus discrete que la bande exploree
 *  (nappes x 0,55 par l'assombrissement). */
const UNSEEN_CLOUD = 0.22;

/** Niveau de densite vers lequel une case connue (visible ou exploree hors vision) est ramenee au
 *  contact d'un batiment construit du joueur (render/mistClearance.ts). Sous FOG_LEVELS.visible
 *  (0,22) : la zone batie parait epargnee par la brume, la zone visible non batie garde son leger
 *  voile. Decision du 2026-11-08 (docs/DESIGN_DECISIONS.md A6) ; 0,26 (au-dessus du visible) a ete
 *  essaye et n'avait aucun effet dans le camp, entierement vu par ses propres batiments. */
const CLEARANCE_LEVEL = 0.08;

/** Couches : bas, haut (unites monde au-dessus du sol), taille de la grande forme (cases), alpha.
 *  (Passe 2 : une couche haute a 0,19 ou 0,176 a ete mesuree sans effet sur la lisibilite d'une
 *  unite au coeur d'une nappe, qui vient du cumul des couches basse et moyenne ; 0,22 conserve.) */
const LAYERS: readonly [number, number, number, number][] = [
  [0.2, 1.0, 22, 0.75],
  [0.8, 1.9, 30, 0.5],
  [1.5, 2.8, 40, 0.22],
];
/** Derive (cases par seconde) et decalage (cases) par couche. */
const DRIFT: readonly [number, number, number, number][] = [
  [0.11, 0.05, 0, 0],
  [0.07, -0.09, 211, 97],
  [-0.05, 0.08, 53, 389],
];

/** Sources chaudes dans les nappes : (x) hausse d'alpha a t = 1 (passe 1 : 0,5, qui rendait la couche
 *  basse opaque sous une source ; passe 2 : 0,15 : la lumiere colore l'air sans en faire un mur),
 *  (y) part de teinte chaude, (z) hausse de luminance. */
const WARM = { alpha: 0.15, tint: 0.85, bright: 0.45 };

/** Masque local autour des unites visibles (passe 3, `?mistUnitMask=on` seulement ; rendu normal :
 *  force 0, boucle du shader sautee) : dans un rayon court autour d'une unite, et SEULEMENT sur les
 *  surfaces au-dessus du sol (le corps de l'unite, pas le terrain : aucune bulle claire au sol),
 *  l'alpha de chaque couche est reduit de `strength`. Rayon = rayon de collision + `inner` (plein) a
 *  + `outer` (nul), hauteur au-dessus du sol de l'unite de `h0` (nul) a `h1` (plein). Au plus
 *  MAX_UNITS unites, les plus proches du point vise (main.ts). Non retenu : cout GPU non mesure
 *  (boucle par fragment sur une passe plein ecran), ne sauve pas les unites basses, coeurs opaques
 *  rares, informations prioritaires deja protegees par les reperes rendus apres la passe ; la
 *  faiblesse des nappes en zone visible fait l'essentiel du travail depuis la passe trois niveaux. */
const UNIT_MASK = { strength: 0.35, inner: 0.25, outer: 1.0, h0: 0.12, h1: 0.45 };
const MAX_UNITS = 12;

export const mistCloudUniforms = {
  uCloudTime: { value: 0 },
  uCloudSeed: { value: new THREE.Vector2() },
  uCloudGain: { value: 0 },
  uCloudLow: { value: 0.5 },
  uCloudHigh: { value: 0.8 },
  uCloudColor: { value: new THREE.Color(CLOUD_COLOR) },
  uCloudLayer: { value: LAYERS.map((l) => new THREE.Vector4(...l)) },
  uCloudDrift: { value: DRIFT.map((d) => new THREE.Vector4(...d)) },
  uCloudWarm: { value: new THREE.Vector3(WARM.alpha, WARM.tint, WARM.bright) },
  /** Grille du brouillard de guerre (FogOfWar.texture : 0 inexplore, 128 explore, 255 visible) et
   *  son rectangle monde (coin x, z, taille en cases), remplis par FogOfWarPass a chaque image. */
  tCloudFog: { value: null as THREE.Texture | null },
  uCloudFogRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  /** Facteur de densite : visible, explore hors vision, inexplore (FOG_LEVELS). */
  uCloudFogLevel: { value: new THREE.Vector3(FOG_LEVELS.visible, FOG_LEVELS.explored, FOG_LEVELS.unexplored) },
  uCloudUnseen: { value: UNSEEN_CLOUD },
  /** Carte de clairiere des batiments construits (render/mistClearance.ts : R 0..1) et son rectangle
   *  monde (coin x, z, taille en cases), fournis par main.ts (setMistClearanceMap) ; (x) facteur
   *  actif 0/1, (y) niveau cible CLEARANCE_LEVEL. */
  tCloudClear: { value: null as THREE.Texture | null },
  uCloudClearRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uCloudClear: { value: new THREE.Vector2(0, CLEARANCE_LEVEL) },
  /** Unites visibles proches (x, z, y du sol, rayon de collision) et leur nombre. */
  uCloudUnits: { value: Array.from({ length: MAX_UNITS }, () => new THREE.Vector4()) },
  uCloudUnitCount: { value: 0 },
  uCloudUnitMask: { value: new THREE.Vector4(unitMaskOn ? UNIT_MASK.strength : 0, UNIT_MASK.inner, UNIT_MASK.outer, 0) },
  uCloudUnitHeight: { value: new THREE.Vector2(UNIT_MASK.h0, UNIT_MASK.h1) },
  /** Memes sources que la Ground Mist (render/groundMist.ts, setMistLights), lecture seule. */
  uCloudLightPos: mistShared.uMistLightPos,
  uCloudLightCol: mistShared.uMistLightCol,
};

if (mode !== 'off') {
  const level = LEVELS[mode];
  mistCloudUniforms.uCloudGain.value = level.gain;
  mistCloudUniforms.uCloudLow.value = level.low;
  mistCloudUniforms.uCloudHigh.value = level.high;
}

/** Carte en cours : graine (decalage du bruit). Appele par main.ts au chargement d'une carte. (La
 *  poche claire centree sur le camp a ete retiree le 2026-11-08 : la clarte du village vient
 *  uniquement de sa visibilite gameplay, comme partout ailleurs.) */
export function setMistCloudsScene(seed: number): void {
  const s = seed >>> 0;
  mistCloudUniforms.uCloudSeed.value.set((s % 883) * 1.71, ((s >>> 9) % 907) * 1.13);
  setFogEdgeSeed(seed);
}

/** Carte de clairiere des batiments construits du joueur (render/mistClearance.ts), ou null (facteur
 *  coupe) ; appele par main.ts quand la grille du brouillard est (re)creee. */
export function setMistClearanceMap(map: { texture: THREE.Texture; rect: THREE.Vector4 } | null): void {
  mistCloudUniforms.tCloudClear.value = map ? map.texture : null;
  mistCloudUniforms.uCloudClear.value.x = map ? 1 : 0;
  if (map) mistCloudUniforms.uCloudClearRect.value.copy(map.rect);
}

/** Unites visibles les plus proches du point vise (au plus MAX_UNITS, le surplus ignore), pour le
 *  masque local ; appele par main.ts a chaque image quand `mistUnitMaskOn()`. */
export function setMistCloudUnits(units: readonly { x: number; z: number; y: number; radius: number }[]): void {
  const n = Math.min(units.length, MAX_UNITS);
  for (let i = 0; i < n; i++) {
    const u = units[i]!;
    mistCloudUniforms.uCloudUnits.value[i]!.set(u.x, u.z, u.y, u.radius);
  }
  mistCloudUniforms.uCloudUnitCount.value = n;
}

/** Horloge cosmetique (rendu seulement), avancee par la passe a chaque image. */
export function tickMistClouds(): void {
  mistCloudUniforms.uCloudTime.value = (performance.now() / 1000) % 100000;
}

/** Declarations et fonctions GLSL (fragment de la passe plein ecran). `mistCloudsLayers(world,
 *  forward)` : couleur premultipliee et couverture des nappes devant la surface (rgb = somme des
 *  couches composees « over », a = couverture), `world` surface rendue (ou point du plan y = 0 sur la
 *  ligne de vue pour le fond), `forward` direction de vue (vers le bas) ; la densite suit l'etat du
 *  brouillard de guerre a la verticale du pixel (cloudFogLevel). */
export const MIST_CLOUDS_GLSL = /* glsl */ `
uniform float uCloudTime;
uniform vec2 uCloudSeed;
uniform float uCloudGain;
uniform float uCloudLow;
uniform float uCloudHigh;
uniform vec3 uCloudColor;
uniform vec4 uCloudLayer[3];
uniform vec4 uCloudDrift[3];
uniform vec3 uCloudWarm;
uniform sampler2D tCloudFog;
uniform vec4 uCloudFogRect;
uniform vec3 uCloudFogLevel;
uniform float uCloudUnseen;
uniform sampler2D tCloudClear;
uniform vec4 uCloudClearRect;
uniform vec2 uCloudClear;
uniform vec4 uCloudUnits[${MAX_UNITS}];
uniform int uCloudUnitCount;
uniform vec4 uCloudUnitMask;
uniform vec2 uCloudUnitHeight;
uniform mat4 uCloudLightPos;
uniform mat4 uCloudLightCol;

float cloudHash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
float cloudNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x), mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Grande forme, forme moyenne, detail large : jamais de grain.
float cloudFbm(vec2 p) {
  return cloudNoise(p) * 0.58 + cloudNoise(p * 2.13 + vec2(11.7, 5.3)) * 0.28 + cloudNoise(p * 4.7 + vec2(3.1, 17.9)) * 0.14;
}
// Clairiere des batiments construits du joueur (render/mistClearance.ts) au point \`xz\` : 0 sans
// carte, hors de son rectangle ou loin de tout batiment, 1 au contact. La carte est deja un fondu
// doux (distance a l'empreinte reelle, union) ; ses seuils ondulent avec le meme bruit lent que la
// frontiere du brouillard (bordure organique, jamais un cercle propre autour d'une Maison).
float cloudClearance(vec2 xz) {
  if (uCloudClear.x <= 0.0) return 0.0;
  vec2 uv = (xz - uCloudClearRect.xy) / uCloudClearRect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  float raw = texture2D(tCloudClear, uv).r;
  if (raw <= 0.0) return 0.0;
  float e = (cloudNoise(xz * 0.3 + uCloudSeed + vec2(37.0, 11.0)) - 0.5) * 0.3;
  return smoothstep(0.08 + e, 0.92 + e, raw) * uCloudClear.x;
}
// Facteur de densite des nappes selon la visibilite GAMEPLAY du pixel (uCloudFogLevel) : case
// visible FAIBLE, exploree hors vision FORTE, inexploree (sur le noir). Lisiere (render/fogEdge.ts,
// 2026-11-09) : la grille porte les distances signees du point aux lisieres du visible et de
// l'explore ; deplacees par le bruit de lisiere (espace monde, biaise vers l'interieur), elles
// donnent une frontiere continue et irreguliere, la meme que celle de l'assombrissement. La densite
// VISIBLE n'est atteinte qu'a uFogEdge.w cases a l'interieur de la lisiere deplacee : une unite qui
// entre dans sa premiere case visible (affichee par la grille) est encore enveloppee par les nappes
// (la densite est lue au xz de la surface rendue, son corps compris) et se precise en avancant. Hors
// de la grille : inexplore. \`known\` : 0 au coeur de l'inexplore, 1 des que la case est connue.
// Second facteur : la clairiere des batiments construits (cloudClearance) ramene le niveau vers
// uCloudClear.y (sous le niveau visible), SEULEMENT la ou la case est connue (\`explored\` : nul au
// coeur de l'inexplore, rien n'est revele) et jamais au-dessus du niveau deja atteint (min).
float cloudFogLevel(vec2 xz, out float known) {
  vec2 uv = (xz - uCloudFogRect.xy) / uCloudFogRect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { known = 0.0; return uCloudFogLevel.z; }
  vec2 fd = fogEdgeDistances(texture2D(tCloudFog, uv)) + fogEdgeShift(xz);
  known = smoothstep(-1.0, 0.5, fd.y);
  float explored = smoothstep(-uFogEdge.z, uFogEdge.z, fd.y);
  float visible = smoothstep(0.0, uFogEdge.w, fd.x);
  float level = mix(mix(uCloudFogLevel.z, uCloudFogLevel.y, explored), uCloudFogLevel.x, visible);
  float clear = cloudClearance(xz) * explored;
  return mix(level, min(level, uCloudClear.y), clear);
}
// Sources chaudes : teinte et luminance de la nappe pres d'une source, avec une portee verticale ;
// \`known\` eteint tout en zone inexploree (aucune lumiere ne revele l'inconnu).
vec3 cloudLit(vec2 xz, float h, vec3 base, inout float alpha, float known) {
  float warm = 0.0;
  vec3 warmColor = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 L = uCloudLightPos[i];
    if (L.w <= 0.0) continue;
    float w = 1.0 - smoothstep(0.0, L.w * 1.6, distance(xz, L.xz));
    w *= w * (1.0 - smoothstep(0.0, 2.6, abs(h - L.y)));
    warm += w;
    warmColor += uCloudLightCol[i].rgb * w;
  }
  if (warm <= 0.0) return base;
  float t = clamp(warm, 0.0, 1.0) * known;
  alpha *= 1.0 + uCloudWarm.x * t;
  return mix(base, warmColor / warm, uCloudWarm.y * t) * (1.0 + uCloudWarm.z * t);
}
vec4 mistCloudsLayers(vec3 world, vec3 forward) {
  vec4 acc = vec4(0.0);
  if (uCloudGain <= 0.0) return acc;
  float known;
  float level = cloudFogLevel(world.xz, known);
  // Inexplore : la surface n'existe pas pour les nappes (hauteur ramenee au sol) : ni silhouette, ni
  // toit, ni relief ne modifie l'epaisseur traversee, rien n'est devine sous le noir.
  float ys = world.y * known;
  if (ys >= uCloudLayer[2].y) return acc;
  // Masque local (debug, force 0 en rendu normal : boucle sautee) : corps des unites visibles
  // proches (surfaces au-dessus de leur sol, dans un rayon court), jamais le terrain autour.
  float keep = 1.0;
  if (uCloudUnitMask.x > 0.0) {
    float body = 0.0;
    for (int i = 0; i < ${MAX_UNITS}; i++) {
      if (i >= uCloudUnitCount) break;
      vec4 U = uCloudUnits[i];
      float w = 1.0 - smoothstep(U.w + uCloudUnitMask.y, U.w + uCloudUnitMask.z, distance(world.xz, U.xy));
      body = max(body, w * smoothstep(uCloudUnitHeight.x, uCloudUnitHeight.y, world.y - U.z));
    }
    keep = 1.0 - uCloudUnitMask.x * body;
  }
  for (int k = 0; k < 3; k++) {
    vec4 Lr = uCloudLayer[k];
    float bottom = max(Lr.x, ys);
    if (bottom >= Lr.y) continue;
    // Part de l'epaisseur de la couche devant la surface (absorption progressive, aucune coupe).
    float through = smoothstep(0.0, 1.0, (Lr.y - bottom) / (Lr.y - Lr.x));
    float hm = (bottom + Lr.y) * 0.5;
    // Point de la couche sur la ligne de vue (monde) : la nappe appartient au monde (ne depend que
    // du rayon du pixel, jamais de la surface).
    vec3 P = world - forward * ((hm - world.y) / (-forward.y));
    vec4 D = uCloudDrift[k];
    vec2 q = (P.xz + D.zw + uCloudSeed + D.xy * uCloudTime) / Lr.z;
    // Contraste : le bruit combine reste groupe autour de 0,5 ; l'etirer donne des coeurs denses et
    // de vrais trous (masses et vides, pas une couronne uniforme).
    float n = (cloudFbm(q) - 0.5) * 1.9 + 0.5;
    float s = smoothstep(uCloudLow, uCloudHigh, n);
    float a = s * Lr.w * uCloudGain * level * through * keep;
    if (a <= 0.002) continue;
    vec3 c = cloudLit(P.xz, hm, uCloudColor, a, known);
    a = clamp(a, 0.0, 1.0);
    acc = acc * (1.0 - a) + vec4(c * a, a);
  }
  return acc;
}
void mistClouds(inout vec3 color, vec3 world, vec3 forward) {
  vec4 cl = mistCloudsLayers(world, forward);
  color = color * (1.0 - cl.a) + cl.rgb;
}`;
