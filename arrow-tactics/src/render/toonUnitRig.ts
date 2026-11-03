import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { FACTION_PALETTES, LOCAL_PLAYER_COLOR, type VisualFaction } from '../config/factions';
import type { Team } from '../sim/entity';

/**
 * Unites Toon RTS — laboratoire (2026-11-01) devenu le roster par defaut
 * (2026-11-02 : tout le roster humain est `defaultOn`, voir plus bas) :
 * `?toonUnits=human` remplace visuellement le Fantassin, l'Archer, le Mage et
 * la Sentinelle ; une liste (`?toonUnits=fantassin,sentinelle`) n'en remplace
 * que certains. Exception : l'Oracle, le Piquier et le Vengeur, sans modele
 * officiel, sont en Toon RTS des que leur asset est present (`defaultOn`),
 * sinon ils reprennent le Mage (Oracle) ou le Fantassin officiel ; de meme,
 * depuis le 2026-11-02, l'Archer, l'Homme d'armes (Fantassin), le Mage et la
 * Sentinelle (repli : leurs anciens modeles Meshy / Footman V2) ;
 * `?toonUnits=barbarian` habille Fantassin, Vengeur, Archer, Mage et
 * Sentinelle en Guerrier, Berserker, Chasseur, Chaman et Brute barbares
 * (`skins`, deux camps) ; `?toonUnits=human,barbarian` garde les humains
 * pour le joueur et met les barbares en face ;
 * `&toonMix=1` n'en remplace qu'un sur deux (comparaison avec les unites
 * officielles) ; `&toonColors=green,orange` choisit les palettes du joueur et
 * de l'ennemi. Remplacement purement graphique : stats, collisions,
 * simulation et IA inchanges.
 *
 * Assets de `public/assets/units/toon/`, produits par `tools/toon-units/`
 * depuis un pack Toon RTS (pieces et dossier d'animations par unite, voir
 * `units.json`) : un GLB par unite (un maillage skinne, un materiau, tous les
 * clips du pack), textures PARTAGEES par source (`wk_albedo.png`,
 * `wk_team_mask.png` : atlas neutre et masque des zones d'equipe ; `brb_*`
 * pour les Barbares).
 *
 * Couleur d'equipe : l'atlas neutre est multiplie par la teinte de la palette
 * dans les zones du masque (shader). La PALETTE (TOON_PALETTES) est distincte
 * de l'identite du camp : `teamPalette` ne fait que choisir une palette par
 * camp.
 */
const DIR = '/assets/units/toon';

/** Humains (Western Kingdoms) : un par kit du jeu. */
type HumanToonKind = 'fantassin' | 'archer' | 'mage' | 'sentinel' | 'oracle' | 'piquier' | 'vengeur' | 'hero' | 'cavalier' | 'villageois';
/** Barbares (pack Barbarians) : chacun habille une unite du jeu (ToonUnitDef.skins). */
type BarbarianToonKind = 'barbare_guerrier' | 'barbare_berserker' | 'barbare_chasseur' | 'barbare_chaman' | 'barbare_brute' | 'barbare_cavalier';
export type ToonUnitKind = HumanToonKind | BarbarianToonKind;

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
  /** Unite du jeu habillee par ce modele d'une autre faction (Barbares). */
  skins?: HumanToonKind;
  /** Parties a texture propre (maillages `part_<partie>` du GLB) : suffixe
   *  de leur texture, `<textures>_<suffixe>.png`, sans teinte d'equipe (le
   *  cheval de la cavalerie humaine, hors de l'atlas des unites). */
  parts?: Record<string, string>;
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

const HUMAN_TOON_UNITS: Record<HumanToonKind, ToonUnitDef> = {
  fantassin: {
    file: 'human_footman.glb',
    textures: 'wk',
    // Modele par defaut de l'Homme d'armes (2026-11-02, demande d'Antoine) ;
    // Footman V2 / V1 officiels : repli si ce GLB manque.
    defaultOn: true,
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
    // Modele par defaut de l'Archer (2026-11-02, demande d'Antoine : le Camp
    // d'archerie produisait encore l'ancien Archer Meshy, qui reste le repli
    // si ce GLB manque).
    defaultOn: true,
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
    // Modele par defaut (2026-11-02) ; ancien Mage Meshy : repli.
    defaultOn: true,
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
    // Modele par defaut (2026-11-02) ; ancienne Sentinelle Meshy : repli.
    defaultOn: true,
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
  // Villageois (2026-11-03, Atelier d'Antoine : tete WK A x0,8, corps
  // barbare D, bras et jambes WK A, ni epauliere ni arme) : peon economique,
  // clips Spearman ; son estoc sert de coup de hache / de pioche (outils
  // `tool_axe` / `tool_pick` du GLB, visibles seulement au travail,
  // setWorkerTool). Le set n'a aucun geste accroupi : ramassage et depot
  // restent sur le repos (pas de coup de lance a vide, KI-64). Aucune
  // attaque en jeu (data/units.ts).
  villageois: {
    file: 'human_villager.glb',
    textures: 'wk',
    defaultOn: true,
    roles: {
      ...COMMON_ROLES,
      walk: loop('run', 1.1),
      attack: once('attack'),
      chop: loop('attack', 1.1),
      mine: loop('attack', 1.1),
      gather: loop('idle'),
      deposit: loop('idle'),
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
  // Heros (2026-11-01, PROVISOIRE ; pieces du 2026-11-03, Atelier d'Antoine) :
  // chef barbu a capuche, corps lourd, grosses epaulieres, gros marteau (x1,4)
  // sans bouclier ; hache et pioche en outils commutables (maillages
  // `tool_*`, setToonTool). Plus grand que toute autre unite. Toujours ce
  // modele (aucun modele officiel).
  hero: {
    file: 'human_hero.glb',
    textures: 'wk',
    defaultOn: true,
    // Echelle visuelle 1,4 (2026-11-02, decision d'Antoine) ; rayon de jeu inchange.
    scale: 1.4,
    roles: {
      ...COMMON_ROLES,
      // ESSAI (2026-11-02, demande d'Antoine, « juste pour tester ») : clip
      // `charge` (0,83 s) au lieu de `run` (1 s) pour le deplacement.
      // Cadence estimee : `run` a 1,6 pour 4,16 cases/s, cycle plus court de
      // `charge` -> 1,3. Pour revenir : walk: loop('run', 1.6).
      walk: loop('charge', 1.3),
      // Coups de marteau en alternance (A par-dessus, B en revers), cadence 1,1 s.
      attack: once('attackA', 1.25),
      attackAlt: once('attackB', 1.25),
      // Gestes de travail du dossier Worker (UnitViews, travail du Heros) :
      // coup vertical debout (couper, hache), coup penche vers le sol
      // (miner, pioche), petits coups accroupi (construire, marteau).
      chop: loop('workingA'),
      mine: loop('workingB'),
      build: loop('workingC'),
      // Ramasser un petit tas : meme geste accroupi que construire.
      gather: loop('workingC', 1.3),
      // Deposer le sac a la Baliste (2026-11-02, 0,5 s par unite) : idem.
      deposit: loop('workingC', 1.3),
      // Soin (2026-11-02) : le GLB n'a pas de clip d'incantation ; garde de
      // combat parcourue une fois sur les 2 s du sort (UnitViews), plutot que
      // le repos.
      cast: once('combatIdle', 1),
    },
    castReleaseFraction: 1,
  },
  /** Cavalier leger (2026-11-01) : cheval, lance, petit bouclier (pack
   *  Western Kingdoms, `WK_SM_Cavalry_Light_B`, clips `Cavalry_Spear`).
   *  Course du cheval pour le deplacement (unite rapide), coup de lance
   *  accelere pour tenir dans la cadence de 1,3 s. PROVISOIRE. */
  cavalier: {
    file: 'human_light_cavalry.glb',
    textures: 'wk',
    defaultOn: true,
    parts: { horse: 'horse' },
    roles: {
      ...COMMON_ROLES,
      walk: loop('run', 1),
      attack: once('attack', 1.15),
    },
  },
};

/** Barbare qui habille l'unite humaine `skins` (laboratoire, jamais par
 *  defaut) : memes roles et memes vitesses que celle-ci (meme squelette,
 *  dossiers d'animations de memes noms et memes durees, voir
 *  tools/toon-units/README.md), textures de la source `brb`. */
function barbarian(file: string, skins: HumanToonKind, over: Partial<ToonUnitDef> = {}): ToonUnitDef {
  return { ...HUMAN_TOON_UNITS[skins], defaultOn: false, file, textures: 'brb', skins, ...over };
}

export const TOON_UNITS: Record<ToonUnitKind, ToonUnitDef> = {
  ...HUMAN_TOON_UNITS,
  barbare_guerrier: barbarian('barbarian_warrior.glb', 'fantassin'),
  barbare_berserker: barbarian('barbarian_berserker.glb', 'vengeur'),
  barbare_chasseur: barbarian('barbarian_hunter.glb', 'archer'),
  barbare_chaman: barbarian('barbarian_shaman.glb', 'mage'),
  barbare_brute: barbarian('barbarian_brute.glb', 'sentinel'),
  // Cavalerie legere barbare : unite propre (kit `cavalier_barbare`), pas
  // un habillage ; memes roles que le Cavalier humain (memes clips du pack).
  barbare_cavalier: { ...HUMAN_TOON_UNITS.cavalier, file: 'barbarian_light_cavalry.glb', textures: 'brb', parts: undefined },
};

/** Barbare qui habille chaque unite humaine (voir ToonUnitDef.skins). */
const BARBARIAN_SKIN = new Map<ToonUnitKind, ToonUnitKind>(
  (Object.keys(TOON_UNITS) as ToonUnitKind[]).flatMap((kind) => {
    const skins = TOON_UNITS[kind].skins;
    return skins ? [[skins, kind] as const] : [];
  }),
);

/** Groupes de `?toonUnits=` (et alias francais). */
const TOON_GROUPS: Record<string, readonly ToonUnitKind[]> = {
  human: ['piquier', 'fantassin', 'archer', 'mage', 'sentinel', 'oracle', 'vengeur', 'hero', 'cavalier', 'villageois'],
  sentinelle: ['sentinel'],
  barbarian: ['barbare_guerrier', 'barbare_berserker', 'barbare_chasseur', 'barbare_chaman', 'barbare_brute', 'barbare_cavalier'],
  barbare: ['barbare_guerrier', 'barbare_berserker', 'barbare_chasseur', 'barbare_chaman', 'barbare_brute', 'barbare_cavalier'],
};

/** Teinte des zones d'equipe (sRGB, multiplie l'atlas neutre), ajustee sur
 *  les atlas de couleur du pack (moindres carres blanc x teinte dans le
 *  masque), sauf `orange` et `neutral` (gris clair, unites neutres), absents
 *  du pack. */
export const TOON_PALETTES = {
  // Camps (config/factions.ts, source unique) : Rouge, Bleu, Vert, Jaune, Neutre.
  blue: FACTION_PALETTES.blue.toonTint,
  red: FACTION_PALETTES.red.toonTint,
  green: FACTION_PALETTES.green.toonTint,
  yellow: FACTION_PALETTES.yellow.toonTint,
  faction_neutral: FACTION_PALETTES.neutral.toonTint,
  // Teintes du laboratoire (`?toonColors=`).
  purple: [0.531, 0.449, 0.697],
  orange: [1, 0.46, 0.06],
  neutral: [0.8, 0.8, 0.8],
  brown: [0.67, 0.446, 0.286],
  tan: [1, 0.556, 0.08],
  black: [0.318, 0.262, 0.283],
} as const satisfies Record<string, readonly [number, number, number]>;
export type ToonPaletteId = keyof typeof TOON_PALETTES;

/** Teinte par cote : celle de son allegeance (joueur Bleu, cote adverse
 *  Neutre brun, config/factions.ts) ; `?toonColors=` la remplace. */
const teamPalette: Record<Team, ToonPaletteId> = { player: LOCAL_PLAYER_COLOR, enemy: 'faction_neutral' };
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
/** Textures de parties (`ToonUnitDef.parts`), par fichier. */
const partTextures = new Map<string, THREE.Texture>();

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

/** Atlas d'un materiau du GLB : suffixe `__<textures>` (piece d'une autre
 *  source, pipeline tools/toon-units), sinon celui de l'unite. */
function sourceTexturesOf(material: THREE.Material, fallback: string): string {
  const i = material.name.lastIndexOf('__');
  return i >= 0 ? material.name.slice(i + 2) : fallback;
}

async function loadPrototype(kind: ToonUnitKind): Promise<void> {
  const def = TOON_UNITS[kind];
  const [gltf] = await Promise.all([
    new GLTFLoader().loadAsync(`${DIR}/${def.file}`),
    texturesOf(def.textures),
    ...Object.values(def.parts ?? {}).map(async (suffix) => {
      const file = `${def.textures}_${suffix}.png`;
      if (!partTextures.has(file)) partTextures.set(file, await loadTexture(`${DIR}/${file}`, true));
    }),
  ]);
  // Unite mixte (pieces de plusieurs sources, Atelier) : atlas des autres
  // sources, d'apres le nom de leur materiau (`<unite>__<textures>`).
  const extraTextures = new Set<string>();
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) extraTextures.add(sourceTexturesOf(mesh.material as THREE.Material, def.textures));
  });
  extraTextures.delete(def.textures);
  await Promise.all([...extraTextures].map(texturesOf));
  const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
  const roleClips = new Map<string, THREE.AnimationClip>();
  for (const [name, role] of Object.entries(def.roles)) {
    const clip = clips.get(role.clip);
    if (!clip) throw new Error(`Clip ${role.clip} absent de ${def.file}`);
    const resolved = role.retime ? retimeClip(clip, role.retime) : clip;
    // Sort sur un clip deja pris par un autre role (garde du Heros) : clip
    // clone, pour une action propre (boucle et cadence independantes).
    roleClips.set(name, name === 'cast' && [...roleClips.values()].includes(resolved) ? resolved.clone() : resolved);
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

/** Modele Toon RTS du role `kit` dans la faction visuelle `faction`
 *  (config/factions.ts) : le barbare qui habille ce role, ou null. */
export function toonFactionKind(kit: string, faction: VisualFaction): ToonUnitKind | null {
  if (faction !== 'barbarian') return null;
  return BARBARIAN_SKIN.get(kit as ToonUnitKind) ?? BARBARIAN_OWN_KITS[kit] ?? null;
}

/** Kits propres a une unite barbare (pas un habillage d'un role humain). */
const BARBARIAN_OWN_KITS: Readonly<Record<string, ToonUnitKind>> = { cavalier_barbare: 'barbare_cavalier' };

/** Modele de faction pret (precharge) pour ce role, ou null : l'appelant
 *  garde alors le modele humain du role (GLB absent, assets hors Git). */
export function readyToonFactionKind(kit: string, faction: VisualFaction): ToonUnitKind | null {
  const kind = toonFactionKind(kit, faction);
  return kind && prototypes[kind] ? kind : null;
}

/** Precharge les modeles des unites d'une faction visuelle (unites neutres
 *  barbares, data/units.ts) : jamais actives pour les autres unites
 *  (toonUnitFor exige `?toonUnits=`). Ne rejette jamais. */
export async function preloadToonFaction(faction: VisualFaction): Promise<void> {
  const kinds = (Object.keys(TOON_UNITS) as ToonUnitKind[]).filter((k) => toonFactionKind(TOON_UNITS[k].skins ?? '', faction) === k);
  await Promise.all(kinds.map((k) => ensureToonUnitPrototype(k)));
}

const prototypeLoads = new Map<ToonUnitKind, Promise<boolean>>();

/** Charge le modele `kind` meme s'il n'est pas active (apercus du bestiaire
 *  de l'editeur) : il ne remplace pas pour autant une unite en jeu
 *  (toonUnitFor exige `?toonUnits=`). Faux si le chargement echoue (GLB
 *  absent : assets commerciaux hors Git). Ne rejette jamais. */
export function ensureToonUnitPrototype(kind: ToonUnitKind): Promise<boolean> {
  if (prototypes[kind]) return Promise.resolve(true);
  let pending = prototypeLoads.get(kind);
  if (!pending) {
    pending = loadPrototype(kind).then(
      () => true,
      (error: unknown) => {
        console.warn(`Unite Toon RTS ${kind} : apercu impossible.`, error);
        return false;
      },
    );
    prototypeLoads.set(kind, pending);
  }
  return pending;
}

/** Modele Toon RTS de la prochaine unite `kind` (kit du jeu) du camp `team`,
 *  ou null (modele officiel). Un barbare demande habille l'unite ; si son
 *  pendant humain l'est aussi (`?toonUnits=human,barbarian`), le joueur garde
 *  l'humain et l'ennemi prend le barbare. Un modele non charge est ignore. */
export function toonUnitFor(kind: ToonUnitKind, team: Team): ToonUnitKind | null {
  const ready = (k: ToonUnitKind | undefined): k is ToonUnitKind => k !== undefined && !!prototypes[k] && enabled.has(k);
  const skin = BARBARIAN_SKIN.get(kind);
  const human = ready(kind) ? kind : null;
  const pick = ready(skin) && (team === 'enemy' || !human) ? skin : human;
  if (!pick) return null;
  if (!mix || TOON_UNITS[pick].defaultOn) return pick;
  const n = decisions[pick] ?? 0;
  decisions[pick] = n + 1;
  return n % 2 === 0 ? pick : null;
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

/** Atelier de personnage (src/workshop) : textures d'une source chargees
 *  (`wk`, `brb`), partagees avec les unites du jeu. */
export async function loadToonTextures(prefix: string): Promise<void> {
  await texturesOf(prefix);
}

/** Atelier de personnage : materiau de la source `textures` dont la teinte se
 *  regle EN DIRECT (couleur sRGB et intensite du melange dans la zone du
 *  masque d'equipe, une seule zone). Meme rendu que createToonUnitMaterial a
 *  intensite 1 ; jamais utilise par le jeu. */
export function createToonTintMaterial(textures: string): { material: THREE.MeshStandardMaterial; setTint(color: THREE.Color, strength: number): void } {
  const set = loadedTextures.get(textures);
  if (!set) throw new Error(`Textures Toon RTS ${textures} non prechargees.`);
  const material = new THREE.MeshStandardMaterial({ map: set.albedo, metalness: 0, roughness: 1, emissiveIntensity: 0 });
  const tint = { value: new THREE.Color(1, 1, 1) };
  const strength = { value: 1 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms['toonTeamMask'] = { value: set.teamMask };
    shader.uniforms['toonTeamTint'] = tint;
    shader.uniforms['toonTintStrength'] = strength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D toonTeamMask;\nuniform vec3 toonTeamTint;\nuniform float toonTintStrength;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	sampledDiffuseColor.rgb *= mix( vec3( 1.0 ), toonTeamTint, texture2D( toonTeamMask, vMapUv ).r * toonTintStrength );
	diffuseColor *= sampledDiffuseColor;
#endif`,
      );
  };
  material.customProgramCacheKey = () => 'toon-unit-team-strength';
  return { material, setTint: (color, value) => { tint.value.copy(color); strength.value = value; } };
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
  // Un materiau par atlas : celui de l'unite, plus ceux des autres sources
  // d'une unite mixte (materiau `<unite>__<textures>` du GLB).
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const materialFor = (textures: string): THREE.MeshStandardMaterial => {
    let m = materials.get(textures);
    if (!m) {
      m = createToonUnitMaterial(textures, palette);
      materials.set(textures, m);
    }
    return m;
  };
  // Parties a texture propre : un materiau par partie, sans teinte d'equipe.
  const partMaterials = new Map<string, THREE.MeshStandardMaterial>();
  for (const [part, suffix] of Object.entries(def.parts ?? {})) {
    partMaterials.set(`part_${part}`, new THREE.MeshStandardMaterial({ map: partTextures.get(`${def.textures}_${suffix}.png`)!, metalness: 0, roughness: 1, emissiveIntensity: 0 }));
  }
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = partMaterials.get(mesh.name) ?? materialFor(sourceTexturesOf(mesh.material as THREE.Material, def.textures));
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
  const used = new Set<THREE.AnimationClip>();
  for (const [role, { timeScale, loop: looping }] of Object.entries(def.roles)) {
    // Un clip partage par plusieurs roles (Villageois : l'estoc sert d'attaque
    // et de coup de hache) recoit une action PAR role : UnitViews distingue
    // l'attaque du geste de travail a l'action qui tourne.
    let clip = prototype.roleClips.get(role)!;
    if (used.has(clip)) clip = clip.clone();
    used.add(clip);
    const action = mixer.clipAction(clip);
    action.timeScale = timeScale;
    if (!looping) {
      // Fin de clip figee jusqu'au fondu decide par UnitViews (attaque, sort, chute).
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions[role] = action;
  }
  // Outils commutables (maillages `tool_*` du GLB) : marteau par defaut.
  const tools = new Map<string, THREE.Object3D>();
  group.traverse((obj) => {
    if (obj.name.startsWith('tool_')) tools.set(obj.name.slice(5), obj);
  });
  if (tools.size > 0) {
    root.userData['toonTools'] = tools;
    // Marteau par defaut (Heros) ; aucun outil sans marteau (Villageois).
    setToonTool(root, tools.has('hammer') ? 'hammer' : '');
  }
  actions['idle']!.play();
  mixer.update(0);
  root.userData['riggedMixer'] = mixer;
  root.userData['riggedActions'] = actions;
  root.userData['riggedAttackFadeSeconds'] = ATTACK_FADE_SECONDS;
  if (def.castReleaseFraction !== undefined) root.userData['riggedCastReleaseFraction'] = def.castReleaseFraction;
  return root;
}

/** Outil visible d'un modele a outils commutables (Heros : `hammer`,
 *  `axe`, `pick`) ; sans effet sur un autre modele. */
export function setToonTool(root: THREE.Object3D, tool: string): void {
  const tools = root.userData['toonTools'] as Map<string, THREE.Object3D> | undefined;
  if (!tools || root.userData['toonTool'] === tool) return;
  for (const [name, mesh] of tools) mesh.visible = name === tool;
  root.userData['toonTool'] = tool;
}

/** Tous les clips d'une unite chargee (laboratoire, outils de test). */
export function toonUnitClips(kind: ToonUnitKind): ReadonlyMap<string, THREE.AnimationClip> {
  return prototypes[kind]?.clips ?? new Map();
}
