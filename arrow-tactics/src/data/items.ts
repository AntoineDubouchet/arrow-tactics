/**
 * Donnees pures, comme units.ts : aucune logique ici, seulement ce qu'est un
 * objet et ce qu'il fait. Chantier inventaire (2026-08-09, demande d'Antoine) :
 * premier objet, le parchemin de soin MINEUR, utilisable en temps reel EN
 * BATAILLE ET PENDANT LE PLACEMENT (cible une unite au clic — voir
 * `usablePhases`). Remplace entierement l'ancien bouton "Soigner une unité"
 * de la boutique (soin instantane et complet entre deux vagues, sans
 * ciblage) — il n'existe plus, c'est desormais le seul moyen de soigner.
 *
 * D'autres objets viendront (parchemins de bataille, sorts, bombardement de
 * fleches, un futur parchemin de soin MAJEUR...) avec des conditions
 * d'utilisation DIFFERENTES (demande explicite d'Antoine, 2026-08-10 : "les
 * sorts n'auront pas les memes conditions d'utilisation") — d'ou
 * `usablePhases` par objet plutot qu'une regle globale, et `effect.type` deja
 * une union extensible plutot qu'un champ "heal" fige.
 *
 * Premier parchemin de bataille reel (2026-08-14) : Nova de glace — voir
 * IceNovaEffect ci-dessous.
 */
import { ICE_NOVA_RADIUS_MULTIPLIER, ICE_NOVA_ROOT_DURATION } from '../config/constants';
import { findAbility } from './abilities';
import { getUnit } from './units';

export type GamePhase = 'placement' | 'battle';

export interface HealEffect {
  type: 'heal';
  /** Echelle interne x10, comme UnitStats.maxHp/damage — voir CLAUDE.md,
   *  "Echelle des nombres". Un "point de vie" affiche a Antoine (pips, texte
   *  de soin flottant) vaut HP_PER_PIP = 10 ici, EXACTEMENT comme la fleche
   *  du joueur ("2 degats, 20 en interne") : ne jamais ecrire directement le
   *  nombre de PV affiches souhaite dans ce champ (bug corrige le 2026-08-09
   *  — `amount: 3` soignait en realite 0.3 pip, quasiment invisible, au lieu
   *  des 3 PV/3 pips reellement demandes par Antoine). */
  amount: number;
}

/** Premier VRAI parchemin de bataille (2026-08-14, demande d'Antoine) —
 *  impact INSTANTANE (aucun projectile, aucun temps de vol) : immobilise
 *  (Root, voir sim/entity.ts Entity.rootTimer) tous les ennemis presents
 *  dans `radiusTiles` de la zone ciblee AU MOMENT du clic. Le talent
 *  Blizzard (voir data/talents.ts) AJOUTE un second effet (zone persistante
 *  de degats, voir sim/systems/persistentAreaEffects.ts) au moment de
 *  l'utilisation — jamais encode ici, l'objet reste "juste" la Nova, voir
 *  main.ts castIceNova pour l'orchestration additive. */
export interface IceNovaEffect {
  type: 'ice-nova';
  /** Rayon de la zone d'effet (cases) — voir ICE_NOVA_RADIUS ci-dessous. */
  radiusTiles: number;
  /** Duree du Root applique aux ennemis presents a l'impact (secondes). */
  rootDuration: number;
}

export type ItemEffect = HealEffect | IceNovaEffect;

/** Categorie d'affichage a la boutique (2026-08-11, demande d'Antoine :
 *  "il faut désormais classer les objets de la boutique dans des fenêtres
 *  distinctes"). REFONTE 2026-08-17 (demande explicite d'Antoine, chantier
 *  "bâtiments achetables" : "je ne veux plus séparer artificiellement
 *  Parchemin de soins et sorts offensifs... tous les parchemins doivent
 *  désormais se trouver dans PARCHEMINS DE BATAILLE") — 'heal' retiree,
 *  TOUS les objets (soin compris) partagent desormais la MEME categorie.
 *  Reste un champ EXPLICITE (pas supprime) : la boutique reste data-driven
 *  ("chaque entree shop doit avoir une categorie", demande explicite), un
 *  futur objet utilitaire/defensif y apparait automatiquement sans code
 *  supplementaire — voir aussi data/buildings.ts (categorie 'building',
 *  systeme SEPARE) et data/units.ts (toujours l'onglet Unites, code en dur,
 *  jamais eu besoin de ce genre de champ). */
export type ItemCategory = 'battleScroll';

/** Ordre d'affichage des categories dans l'inventaire (2026-08-14, demande
 *  d'Antoine : "trier l'inventaire pour que les sorts similaires soient les
 *  uns à côté des autres, éviter que cela fasse brouillon") — source de
 *  verite unique reutilisee par ui/inventoryBar.ts, jamais une liste
 *  dupliquee ailleurs (meme principe que TALENT_BRANCH_ORDER). Une seule
 *  categorie desormais (voir ItemCategory ci-dessus) : le tri par id reste
 *  le SEUL discriminant reel (deja stable, deja suffisant pour regrouper les
 *  instances d'un meme objet — voir compareItemsForDisplay). */
export const ITEM_CATEGORY_ORDER: ItemCategory[] = ['battleScroll'];

/**
 * Rayon de la Nova de glace, DERIVE du rayon REEL de la Boule de feu du Mage
 * (data/units.ts, mage.abilities) plutot que duplique — demande explicite
 * d'Antoine : "inspecte le rayon réel de la Fireball... ne duplique pas ses
 * statistiques". `findAbility` leve si jamais le Mage perdait sa capacite
 * area-blast (ne devrait jamais arriver, garde-fou volontaire plutot qu'un
 * repli silencieux sur une valeur arbitraire).
 */
const mageFireballAbility = findAbility(getUnit('mage').abilities, 'area-blast');
if (!mageFireballAbility) throw new Error('Le Mage doit avoir une capacite area-blast pour calibrer le rayon de la Nova de glace.');
export const ICE_NOVA_RADIUS = mageFireballAbility.radiusTiles * ICE_NOVA_RADIUS_MULTIPLIER;

export interface ItemDef {
  id: string;
  name: string;
  /** Cout en or a la boutique. */
  cost: number;
  description: string;
  effect: ItemEffect;
  /** Phases de jeu ou l'objet peut etre arme/utilise — voir main.ts,
   *  armInventorySlot. */
  usablePhases: GamePhase[];
  category: ItemCategory;
  /** Nombre maximal d'exemplaires regroupes dans UN SEUL emplacement visuel
   *  de la barre d'inventaire (2026-08-14, demande d'Antoine : "les objets
   *  peuvent desormais se stack" — parchemin de soin par 10, Nova de glace
   *  par 3). RunState.inventory reste un tableau PLAT d'instances (aucun
   *  changement de donnees) — seul l'AFFICHAGE (ui/inventoryBar.ts) regroupe
   *  les instances consecutives de meme id en piles d'au plus `maxStack`,
   *  meme principe deja etabli pour le tri par categorie (voir
   *  ITEM_CATEGORY_ORDER). Sert aussi a calculer le nombre d'emplacements
   *  REELLEMENT consommes (run/runState.ts, countInventoryStacks) pour la
   *  limite d'achat. */
  maxStack: number;
}

export const ITEMS: Record<string, ItemDef> = {
  heal_scroll_minor: {
    id: 'heal_scroll_minor',
    name: 'Parchemin de soin mineur',
    cost: 1,
    // Rend 5 PV (50 interne, echelle x10) — monte de 3 PV le 2026-08-11,
    // demande explicite d'Antoine ("le parchemin de soin mineur rend
    // desormais 5 points de vie... 50 de ton cote").
    description: 'Rend 5 PV à une unité ciblée, en bataille ou pendant la préparation.',
    effect: { type: 'heal', amount: 50 },
    usablePhases: ['placement', 'battle'],
    category: 'battleScroll',
    maxStack: 10,
  },
  ice_nova: {
    id: 'ice_nova',
    name: 'Nova de glace',
    // Prix source de verite (2026-08-14, demande explicite d'Antoine : "4
    // Gold... le prix doit avoir une source de verite, pas de texte '4 Gold'
    // independant de la vraie logique d'achat") — lu directement ici par la
    // boutique (ui/screens.ts) et les handlers d'achat (main.ts), jamais
    // recopie.
    cost: 4,
    // Description STATIQUE (le talent Blizzard, s'il est debloque, ajoute sa
    // propre phrase par-dessus dans la boutique — voir ui/screens.ts,
    // refreshShop — plutot que de dupliquer cette logique ici).
    description: 'Mode de ciblage au sol : immobilise pendant 4 secondes tous les ennemis présents dans la zone au moment de l’impact.',
    // Usable UNIQUEMENT en bataille (demande d'Antoine, section "Mode de
    // ciblage" — jamais mentionne pour la phase de placement, contrairement
    // au parchemin de soin).
    effect: { type: 'ice-nova', radiusTiles: ICE_NOVA_RADIUS, rootDuration: ICE_NOVA_ROOT_DURATION },
    usablePhases: ['battle'],
    category: 'battleScroll',
    maxStack: 3,
  },
};

export function getItem(id: string): ItemDef {
  const def = ITEMS[id];
  if (!def) throw new Error(`Objet inconnu : ${id}`);
  return def;
}

/** Accesseur TYPE pour un objet dont l'effet est CONNU pour etre un soin
 *  (2026-08-14, extraction necessaire depuis que ItemEffect est devenue une
 *  union a 2 membres avec l'ajout de la Nova de glace) — centralise le
 *  narrowing `effect.type === 'heal'` ici plutot qu'un `as HealEffect` a
 *  chaque site d'appel (run/healScrollUpgradeEffects.ts, ui/screens.ts). */
export function getHealEffectAmount(id: string): number {
  const effect = getItem(id).effect;
  if (effect.type !== 'heal') throw new Error(`Objet '${id}' sans effet de soin.`);
  return effect.amount;
}
