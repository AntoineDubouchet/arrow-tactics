import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Team } from '../sim/entity';

/**
 * Unites Toon RTS — LABORATOIRE (2026-11-01), jamais par defaut :
 * `?toonUnits=human` remplace visuellement le Fantassin, l'Archer, le Mage et
 * la Sentinelle ; une liste (`?toonUnits=fantassin,sentinelle`) n'en remplace
 * que certains. Exception : l'Oracle, le Piquier et le Vengeur, sans modele
 * officiel, sont en Toon RTS des que leur asset est present (`defaultOn`),
 * sinon ils reprennent le Mage (Oracle) ou le Fantassin officiel ;
 * `&toonMix=1` n'en remplace qu'un sur deux (comparaison avec les unites
 * officielles) ; `&toonColors=green,orange` choisit les palettes du joueur et
 * de l'ennemi. Remplacement purement graphique : stats, collisions,
 * simulation et IA inchanges.
 *
 * Assets de `public/assets/units/toon/`, produits par `tools/toon-units/`
 * depuis un pack Toon RTS (pieces et dossier d'animations par unite, voir
 * `units.json`) : un GLB par unite (un maillage skinne, un materiau, tous les
 * clips du pack), textures PARTAGEES par source (`wk_albedo.png`,
 * `wk_team_mask.png` : atlas neutre et masque des zones d'equipe).
 *
 * Couleur d'equipe : l'atlas neutre est multiplie par la teinte de la palette
 * dans les zones du masque (shader). La PALETTE (TOON_PALETTES) est distincte
 * de l'identite du camp : `teamPalette` ne fait que choisir une palette par
 * camp.
 */
const DIR = '/assets/units/toon';

export type ToonUnitKind = 'fantassin' | 'archer' | 'mage' | 'sentinel' | 'oracle' | 'piquier' | 'vengeur';

/** Clip du GLB pour un etat du jeu (UnitViews) et vitesse de lecture,
 *  purement visuelle : cooldowns et vitesses de deplacement restent ceux de
 *  la simulation. */
interface ClipRole {
  clip: string;
  timeScale: number;
  loop: boolean;
  /** Recadencage en deux segments (vitesse 1) : l'instant `release` du clip
   *  tombe a `releaseAt` s, la fin du clip a `endAt` s. */
  retime?: { release: number; releaseAt: number; endAt: number };
}

interface ToonUnitDef {
  file: string;
  /** Prefixe des textures partagees (une paire par source du pipeline). */
  textures: string;
  roles: Record<string, ClipRole>;
  /** Part du clip `cast` ou le sort part (UnitViews ; defaut : celle du Mage officiel). */
  castReleaseFraction?: number;
  /** Os ou poser le repere `RightHand` (origine visuelle des fleches, main.ts). */
  arrowHandBone?: string;
  /** Echelle par rapport aux autres unites de la source (defaut 1) : rendu seulement, la collision reste `stats.radius`. */
  scale?: number;
  /** Unite sans modele officiel : Toon RTS sans `?toonUnits=`, jamais alternee par `toonMix`. */
  defaultOn?: boolean;
}

const loop = (clip: string, timeScale = 1): ClipRole => ({ clip, timeScale, loop: true });
const once = (clip: string, timeScale = 1): ClipRole => ({ clip, timeScale, loop: false });

/** Repos hors combat, garde en combat, deplacement (course du pack : pied
 *  d'appui a ~2,0 cases/s a vitesse 1, voir tools/toon-units/README.md),
 *  chutes (cles `knockdown*`, variante tiree au hasard par UnitViews). */
const COMMON_ROLES = {
  idle: loop('idle'),
  combatIdle: loop('combatIdle'),
  knockdownA: once('deathA'),
  knockdownB: once('deathB'),
};

export const TOON_UNITS: Record<ToonUnitKind, ToonUnitDef> = {
  fantassin: {
    file: 'human_footman.glb',
    textures: 'wk',
    roles: {
      ...COMMON_ROLES,
      // 2,2 cases/s ; coup d'epee de 1,33 s ramene sous le cooldown de 1 s.
      walk: loop('run', 1.1),
      attack: once('attackA', 1.4),
    },
  },
  archer: {
    file: 'human_archer.glb',
    textures: 'wk',
    roles: {
      ...COMMON_ROLES,
      // 2,0 cases/s.
      walk: loop('run', 1),
      // Corde lachee vers 0,73 s du clip : a 1,2 s, quand la fleche visuelle
      // part (ARCHER_ATTACK_RELEASE_FRACTION x cooldown de 2 s) ; retombee a
      // vitesse quasi naturelle, finie a 1,75 s (pose de garde) avant le tir
      // suivant (cooldown de 2 s).
      attack: { ...once('attack'), retime: { release: 0.73, releaseAt: 1.2, endAt: 1.75 } },
    },
    arrowHandBone: 'Bip001_R_Hand',
  },
  mage: {
    file: 'human_mage.glb',
    textures: 'wk',
    roles: {
      ...COMMON_ROLES,
      // 1,8 case/s.
      walk: loop('run', 0.9),
      // Coup de baton (impact vers 0,4 s), cooldown de 2 s.
      attack: once('attackA', 1.3),
      // Baton projete en avant vers 0,45 s du clip de 1,33 s.
      cast: once('castA', 1),
    },
    castReleaseFraction: 0.34,
  },
  sentinel: {
    file: 'human_sentinel.glb',
    textures: 'wk',
    // Unite lourde : ~12 % plus haute que le Fantassin (mesure en garde, plumet
    // du Fantassin compris), 16 % plus large, pas davantage.
    scale: 1.15,
    roles: {
      ...COMMON_ROLES,
      // 1,65 case/s ; foulee agrandie de 15 % avec le modele.
      walk: loop('run', 0.72),
      // Coup de marteau par-dessus la tete (1,33 s), cooldown de 1,5 s.
      attack: once('attackA', 1),
    },
  },
  oracle: {
    file: 'human_oracle.glb',
    textures: 'wk',
    defaultOn: true,
    roles: {
      ...COMMON_ROLES,
      // 2,0 cases/s.
      walk: loop('run', 1),
      // Coup de baton de repli (impact vers 0,4 s), cooldown de 2 s.
      attack: once('attackA', 1.3),
      // Soin (clip de 1,33 s) : se ramasse, puis se redresse baton leve vers
      // l'avant ; le soin tombe a 0,8 s du clip (fin de l'incantation), le
      // retour au repos suit a vitesse naturelle.
      cast: once('castB', 1),
    },
    castReleaseFraction: 0.6,
  },
  piquier: {
    file: 'human_pikeman.glb',
    textures: 'wk',
    defaultOn: true,
    roles: {
      ...COMMON_ROLES,
      // 2,0 cases/s.
      walk: loop('run', 1),
      // Estoc (clip Spearman de 1,33 s, impact a 0,43 s) recadence sur le
      // gameplay : impact a 0,3 s (fin de l'elan, UnitStats.attackWindup),
      // geste fini a 1,1 s (cadence 1,2 s).
      attack: { ...once('attack'), retime: { release: 0.43, releaseAt: 0.3, endAt: 1.1 } },
    },
  },
  vengeur: {
    file: 'human_avenger.glb',
    textures: 'wk',
    defaultOn: true,
    roles: {
      ...COMMON_ROLES,
      // 2,6 cases/s.
      walk: loop('run', 1.3),
      // Deux gestes en alternance (UnitViews.playAttack), impact a 0,4 s dans
      // les deux clips de 1,33 s, recadences sur la cadence de 0,6 s : impact
      // a 0,2 s (fin de l'elan), geste fini a 0,58 s. Double frappe
      // par-dessus la tete (clip `attack` du Worker), puis revers (Infantry B).
      attack: { ...once('attackDouble'), retime: { release: 0.4, releaseAt: 0.2, endAt: 0.58 } },
      attackAlt: { ...once('attackB'), retime: { release: 0.4, releaseAt: 0.2, endAt: 0.58 } },
    },
  },
};

/** Groupes de `?toonUnits=` (et alias francais). */
const TOON_GROUPS: Record<string, readonly ToonUnitKind[]> = {
  human: ['piquier', 'fantassin', 'archer', 'mage', 'sentinel', 'oracle', 'vengeur'],
  sentinelle: ['sentinel'],
};

/** Teinte des zones d'equipe (sRGB, multiplie l'atlas neutre), ajustee sur
 *  les atlas de couleur du pack (moindres carres blanc x teinte dans le
 *  masque), sauf `orange` et `neutral` (gris clair, unites neutres), absents
 *  du pack. */
export const TOON_PALETTES = {
  blue: [0.114, 0.572, 1],
  red: [1, 0.217, 0.109],
  green: [0.069, 0.737, 0.391],
  purple: [0.531, 0.449, 0.697],
  orange: [1, 0.46, 0.06],
  neutral: [0.8, 0.8, 0.8],
  brown: [0.67, 0.446, 0.286],
  tan: [1, 0.556, 0.08],
  black: [0.318, 0.262, 0.283],
} as const satisfies Record<string, readonly [number, number, number]>;
export type ToonPaletteId = keyof typeof TOON_PALETTES;

const teamPalette: Record<Team, ToonPaletteId> = { player: 'blue', enemy: 'red' };
const enabled = new Set<ToonUnitKind>();
let mix = false;
/** Unites construites par type en mode `toonMix` (alternance). */
const decisions: Partial<Record<ToonUnitKind, number>> = {};

/** Unites a remplacer (`human` ou liste), alternance et palettes
 *  (`joueur,ennemi`), avant le prechargement (main.ts). Un nom inconnu est
 *  ignore. */
export function configureToonUnits(units: string | null, alternate: boolean, colors?: string | null): void {
  for (const kind of Object.keys(TOON_UNITS) as ToonUnitKind[]) if (TOON_UNITS[kind].defaultOn) enabled.add(kind);
  for (const name of (units ?? '').split(',')) {
    for (const kind of TOON_GROUPS[name] ?? (name in TOON_UNITS ? [name as ToonUnitKind] : [])) enabled.add(kind);
  }
  mix = alternate;
  const [player, enemy] = (colors ?? '').split(',');
  if (player && player in TOON_PALETTES) teamPalette.player = player as ToonPaletteId;
  if (enemy && enemy in TOON_PALETTES) teamPalette.enemy = enemy as ToonPaletteId;
}

interface ToonUnitPrototype {
  scene: THREE.Group;
  /** Tous les clips du GLB. */
  clips: Map<string, THREE.AnimationClip>;
  /** Clip de chaque role (recadence si besoin). */
  roleClips: Map<string, THREE.AnimationClip>;
}

/** Copie de `clip` recadencee (voir ClipRole.retime), temps des cles remappes par morceaux. */
function retimeClip(clip: THREE.AnimationClip, { release, releaseAt, endAt }: NonNullable<ClipRole['retime']>): THREE.AnimationClip {
  const before = releaseAt / release;
  const after = (endAt - releaseAt) / (clip.duration - release);
  const tracks = clip.tracks.map((track) => {
    const copy = track.clone();
    copy.times = copy.times.map((t) => (t <= release ? t * before : releaseAt + (t - release) * after));
    return copy;
  });
  return new THREE.AnimationClip(`${clip.name}@${releaseAt}`, endAt, tracks);
}

interface ToonTextures {
  albedo: THREE.Texture;
  teamMask: THREE.Texture;
}

const prototypes: Partial<Record<ToonUnitKind, ToonUnitPrototype>> = {};
const textureSets = new Map<string, Promise<ToonTextures>>();
let loading: Promise<void> | null = null;
const loadedTextures = new Map<string, ToonTextures>();

const textureLoader = new THREE.TextureLoader();

async function loadTexture(url: string, srgb: boolean): Promise<THREE.Texture> {
  const texture = await textureLoader.loadAsync(url);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // Atlas exporte depuis Blender (origine des UV en bas, comme glTF).
  texture.flipY = false;
  return texture;
}

/** Textures d'une source, chargees une fois et partagees par ses unites. */
function texturesOf(prefix: string): Promise<ToonTextures> {
  let pending = textureSets.get(prefix);
  if (!pending) {
    pending = Promise.all([loadTexture(`${DIR}/${prefix}_albedo.png`, true), loadTexture(`${DIR}/${prefix}_team_mask.png`, false)]).then(([albedo, teamMask]) => {
      const set = { albedo, teamMask };
      loadedTextures.set(prefix, set);
      return set;
    });
    textureSets.set(prefix, pending);
  }
  return pending;
}

async function loadPrototype(kind: ToonUnitKind): Promise<void> {
  const def = TOON_UNITS[kind];
  const [gltf] = await Promise.all([new GLTFLoader().loadAsync(`${DIR}/${def.file}`), texturesOf(def.textures)]);
  const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
  const roleClips = new Map<string, THREE.AnimationClip>();
  for (const [name, role] of Object.entries(def.roles)) {
    const clip = clips.get(role.clip);
    if (!clip) throw new Error(`Clip ${role.clip} absent de ${def.file}`);
    roleClips.set(name, role.retime ? retimeClip(clip, role.retime) : clip);
  }
  if (def.arrowHandBone) {
    // Repere lu par main.ts (UnitViews.getBoneWorldPosition(id, 'RightHand')) : la fleche part de la main de corde.
    const hand = gltf.scene.getObjectByName(def.arrowHandBone);
    if (!hand) throw new Error(`Os ${def.arrowHandBone} absent de ${def.file}`);
    const marker = new THREE.Object3D();
    marker.name = 'RightHand';
    hand.add(marker);
  }
  prototypes[kind] = { scene: gltf.scene, clips, roleClips };
}

/**
 * Precharge les unites Toon RTS demandees. Ne rejette JAMAIS : une unite dont
 * le chargement echoue avertit et garde son modele officiel.
 */
export async function preloadToonUnits(): Promise<void> {
  if (!loading) {
    loading = Promise.all(
      [...enabled].map((kind) =>
        loadPrototype(kind).catch((error: unknown) => console.warn(`Unite Toon RTS ${kind} : chargement impossible, modele officiel conserve.`, error)),
      ),
    ).then(() => undefined);
  }
  await loading;
}

/** Vrai si la prochaine unite `kind` construite doit etre la Toon RTS. */
export function useToonUnit(kind: ToonUnitKind): boolean {
  if (!prototypes[kind] || !enabled.has(kind)) return false;
  if (!mix || TOON_UNITS[kind].defaultOn) return true;
  const n = decisions[kind] ?? 0;
  decisions[kind] = n + 1;
  return n % 2 === 0;
}

/** Materiau d'une instance (le flash d'impact et le fondu de mort le
 *  modifient) : atlas neutre de la source, teinte de la palette dans les
 *  zones du masque. Emissif nul au repos, comme les autres unites riggees. */
export function createToonUnitMaterial(textures: string, palette: ToonPaletteId): THREE.MeshStandardMaterial {
  const set = loadedTextures.get(textures);
  if (!set) throw new Error(`Textures Toon RTS ${textures} non prechargees.`);
  const material = new THREE.MeshStandardMaterial({ map: set.albedo, metalness: 0, roughness: 1, emissiveIntensity: 0 });
  const [r, g, b] = TOON_PALETTES[palette];
  const tint = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  material.userData['toonPalette'] = palette;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['toonTeamMask'] = { value: set.teamMask };
    shader.uniforms['toonTeamTint'] = { value: tint };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D toonTeamMask;\nuniform vec3 toonTeamTint;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	sampledDiffuseColor.rgb *= mix( vec3( 1.0 ), toonTeamTint, texture2D( toonTeamMask, vMapUv ).r );
	diffuseColor *= sampledDiffuseColor;
#endif`,
      );
  };
  material.customProgramCacheKey = () => 'toon-unit-team';
  return material;
}

/** Hauteur en jeu (casque compris) d'un humain du pack, celle du Footman
 *  V2 ; le squelette natif mesure 1,557 m. Meme echelle pour toutes les
 *  unites d'une source : leurs proportions restent coherentes. */
const TOON_UNIT_MODEL_SCALE = 1.15 / 1.557;

/** Fondu d'entree et de sortie de l'attaque, lu par UnitViews. */
const ATTACK_FADE_SECONDS = 0.1;

/** Clone une instance — memes conventions que les autres unites riggees :
 *  SkeletonUtils.clone, materiau propre a l'instance, facingFix sur un
 *  groupe enfant (avant natif en +Z). Posee sur la premiere image du repos :
 *  jamais en pose de liaison (bras ecartes), meme hors combat (apercus). */
export function buildToonUnitModel(kind: ToonUnitKind, team: Team, palette: ToonPaletteId = teamPalette[team]): THREE.Group {
  const prototype = prototypes[kind];
  if (!prototype) throw new Error(`Unite Toon RTS ${kind} non prechargee.`);
  const def = TOON_UNITS[kind];
  const group = cloneSkinned(prototype.scene) as THREE.Group;
  const material = createToonUnitMaterial(def.textures, palette);
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Boite du clone a la pose de liaison : trop etroite pour une chute ou une attaque.
    mesh.frustumCulled = false;
  });

  const facingFix = new THREE.Group();
  facingFix.rotation.y = Math.PI;
  facingFix.add(group);
  const root = new THREE.Group();
  root.add(facingFix);
  root.scale.setScalar(TOON_UNIT_MODEL_SCALE * (def.scale ?? 1));

  const mixer = new THREE.AnimationMixer(group);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const [role, { timeScale, loop: looping }] of Object.entries(def.roles)) {
    const action = mixer.clipAction(prototype.roleClips.get(role)!);
    action.timeScale = timeScale;
    if (!looping) {
      // Fin de clip figee jusqu'au fondu decide par UnitViews (attaque, sort, chute).
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions[role] = action;
  }
  actions['idle']!.play();
  mixer.update(0);
  root.userData['riggedMixer'] = mixer;
  root.userData['riggedActions'] = actions;
  root.userData['riggedAttackFadeSeconds'] = ATTACK_FADE_SECONDS;
  if (def.castReleaseFraction !== undefined) root.userData['riggedCastReleaseFraction'] = def.castReleaseFraction;
  return root;
}

/** Tous les clips d'une unite chargee (laboratoire, outils de test). */
export function toonUnitClips(kind: ToonUnitKind): ReadonlyMap<string, THREE.AnimationClip> {
  return prototypes[kind]?.clips ?? new Map();
}
