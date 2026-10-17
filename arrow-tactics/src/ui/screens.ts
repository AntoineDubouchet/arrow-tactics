import { HP_PER_PIP, MINE_BASE_GOLD_PER_SECOND } from '../config/constants';
import { getHealEffectAmount, getItem } from '../data/items';
import { BALLISTA_UPGRADE } from '../data/ballistaUpgrade';
import { BARRACKS_UPGRADE } from '../data/barracksUpgrade';
import { getBuilding, listBuyableBuildingIds } from '../data/buildings';
import { HEAL_SCROLL_UPGRADE } from '../data/healScrollUpgrade';
import { ICE_NOVA_UPGRADE } from '../data/iceNovaUpgrade';
import { MINE_UPGRADE } from '../data/mineUpgrade';
import { SENTINEL_UPGRADE } from '../data/sentinelUpgrade';
import { SHADOW_UPGRADE } from '../data/shadowUpgrade';
import { getTalent, listDependents, listFounderTalents, TALENTS } from '../data/talents';
import { computeTalentTreeLayout, type TalentNodeLayout, type TalentTreeLayoutNode } from './talentTreeLayout';
import { getUnit } from '../data/units';
import { getUnitUpgradeDef, listUpgradableUnitIds } from '../data/unitUpgrades';
import {
  canPurchaseUnitUpgrade,
  canPurchaseUpgrade,
  canUnlockTalent,
  effectiveUpgradeCost,
  getUnitUpgradeLevel,
  isTalentUnlocked,
  canPlayerRecruitUnit,
  type MetaProgress,
} from '../run/metaProgress';
import { canAddItemsToInventory, canAddItemToInventory, formatGold, type RunState } from '../run/runState';
import {
  effectivePlayerUnitCost,
  upgradeAttackBonusDisplay,
  upgradeHpBonusDisplay,
  upgradeNextPurchaseGrantsAttackBonus,
  upgradeRemainingUntilAttackBonus,
} from '../run/unitUpgradeEffects';
import {
  ballistaAttackSpeedBonus,
  ballistaDamageBonusDisplay,
  ballistaHpBonusDisplay,
  ballistaNextPurchaseGrantsDamageBonus,
  ballistaRemainingUntilDamageBonus,
  ballistaUpgradeLevel,
} from '../run/ballistaUpgradeEffects';
import {
  effectiveHealScrollCost,
  healBonusDisplay,
  healNextPurchaseGrantsExtraTarget,
  healRemainingUntilNextTarget,
  healScrollUpgradeLevel,
  healSecondaryTargetCount,
} from '../run/healScrollUpgradeEffects';
import {
  computePlayerIceNovaUpgradeEffects,
  effectiveIceNovaCost,
  iceNovaNextPurchaseGrantsDamageBonus,
  iceNovaRemainingUntilDamageBonus,
} from '../run/iceNovaUpgradeEffects';
import {
  effectiveMineGoldPerSecond,
  mineGoldPerSecondBonus,
  mineUpgradeLevel,
} from '../run/mineUpgradeEffects';
import {
  barracksNextPurchaseGrantsIntervalMilestone,
  barracksRemainingUntilIntervalMilestone,
  barracksUpgradeLevel,
  effectiveBarracksSpawnCount,
  effectiveBarracksSpawnInterval,
} from '../run/barracksUpgradeEffects';
import {
  computePlayerSentinelUpgradeEffects,
  sentinelNextPurchaseGrantsShieldBonus,
  sentinelRemainingUntilShieldBonus,
} from '../run/sentinelUpgradeEffects';
import {
  shadowBonusProjectileCount,
  shadowDamagePerProjectileDisplay,
  shadowNextPurchaseGrantsBonusProjectile,
  shadowRemainingUntilBonusProjectile,
  shadowUpgradeLevel,
} from '../run/shadowUpgradeEffects';
import { getEffectiveBuildingCost } from '../run/buildingUpgradeEffects';
import { copyMetaUpgradeLevelsForRun, type RunUpgradeLevels } from '../run/runUpgrades';
import type { AudioSettings } from '../run/userSettings';
import { createCoinIcon, createRuneIcon } from './pixelIcon';
import { createItemIcon } from './itemIcons';

export type ScreenName =
  | 'menu'
  | 'talents'
  | 'waveComplete'
  | 'shop'
  | 'pause'
  | 'quitRunConfirm'
  | 'gameOver'
  | 'resetConfirm'
  | 'resetTalentsConfirm'
  | 'placementGoldWarning'
  | 'settings'
  | 'unitUpgradeShop';

export type WaveResult = 'victoire' | 'defaite';

/** Un curseur de volume construit par `Screens.sliderControl` — `row` est
 *  l'element a inserer dans le panneau, `input`/`valueLabel` sont retenus a
 *  part pour que `refreshSettings` puisse les remettre a jour sans tout
 *  reconstruire (meme motif que shopBuyFantassin etc.). */
interface SliderControl {
  row: HTMLElement;
  input: HTMLInputElement;
  valueLabel: HTMLElement;
}

/** Refs vers les elements dynamiques d'UNE carte de la boutique
 *  d'amelioration permanente (voir buildUnitUpgradeCard/refreshUnitUpgradeShop) —
 *  meme motif que talentNodes, cle par unitId. */
interface UnitUpgradeCardRefs {
  button: HTMLButtonElement;
  levelEl: HTMLElement;
  hpBonusEl: HTMLElement;
  attackBonusEl: HTMLElement;
  goldCostEl: HTMLElement;
  nextUpgradeEl: HTMLElement;
  remainingAttackEl: HTMLElement;
  runeCostEl: HTMLElement;
}

/** Refs de la carte "Baliste" (2026-08-13) — voir buildBallistaUpgradeCard/
 *  refreshUnitUpgradeShop. Forme dediee : cadence en %, pas de "PV". */
interface BallistaUpgradeCardRefs {
  button: HTMLButtonElement;
  levelEl: HTMLElement;
  attackSpeedEl: HTMLElement;
  damageEl: HTMLElement;
  /** PV bonus de la TOUR (2026-08-16, "+10 PV par niveau") — voir
   *  run/ballistaUpgradeEffects.ts, ballistaHpBonusDisplay. */
  hpBonusEl: HTMLElement;
  nextUpgradeEl: HTMLElement;
  remainingDamageEl: HTMLElement;
  runeCostEl: HTMLElement;
}

/** Refs de la carte "Parchemin de soin" (2026-08-13) — voir
 *  buildHealScrollUpgradeCard/refreshUnitUpgradeShop. */
interface HealScrollUpgradeCardRefs {
  button: HTMLButtonElement;
  levelEl: HTMLElement;
  healEl: HTMLElement;
  secondaryCountEl: HTMLElement;
  secondaryRatioEl: HTMLElement;
  nextUpgradeEl: HTMLElement;
  remainingTargetEl: HTMLElement;
  runeCostEl: HTMLElement;
}

/** Refs de la carte "Nova de glace" (2026-08-14) — voir
 *  buildIceNovaUpgradeCard/refreshUnitUpgradeShop. Duree affichee pour le
 *  Root (immobilisation, TOUJOURS actif) ET la zone Blizzard (degats,
 *  n'agit que si le talent Blizzard est debloque) separement, meme si les
 *  deux partagent le meme bonus. */
interface IceNovaUpgradeCardRefs {
  button: HTMLButtonElement;
  levelEl: HTMLElement;
  rootDurationEl: HTMLElement;
  blizzardDurationEl: HTMLElement;
  damageEl: HTMLElement;
  nextUpgradeEl: HTMLElement;
  remainingDamageEl: HTMLElement;
  runeCostEl: HTMLElement;
}

/** Refs de la carte "Mine" (2026-08-14) — voir buildMineUpgradeCard/
 *  refreshUnitUpgradeShop. TOUJOURS visible depuis le 2026-08-17 (la Mine
 *  est devenue un bâtiment achetable en boutique de RUN, plus liee a un
 *  talent — voir data/buildings.ts) : ameliorer une Mine que le joueur n'a
 *  pas encore achetee cette run reste valide (demande explicite d'Antoine,
 *  point 40 : "pas besoin d'avoir une Caserne posée au moment de l'achat de
 *  l'upgrade", meme principe applique a la Mine). */
interface MineUpgradeCardRefs {
  card: HTMLElement;
  button: HTMLButtonElement;
  levelEl: HTMLElement;
  goldPerSecondEl: HTMLElement;
  nextUpgradeEl: HTMLElement;
  runeCostEl: HTMLElement;
}

/** Refs de la carte "Caserne" (2026-08-17, REFONTE le meme jour — deux
 *  effets desormais combines, voir data/barracksUpgrade.ts) — voir
 *  buildBarracksUpgradeCard/refreshUnitUpgradeShop. TOUJOURS visible (meme
 *  principe que la Mine ci-dessus), plus de plafond/etat "MAX" (le bonus de
 *  nombre de Fantassins reste utile a tout niveau). */
interface BarracksUpgradeCardRefs {
  card: HTMLElement;
  button: HTMLButtonElement;
  levelEl: HTMLElement;
  countEl: HTMLElement;
  intervalEl: HTMLElement;
  nextUpgradeEl: HTMLElement;
  remainingIntervalEl: HTMLElement;
  runeCostEl: HTMLElement;
  runeCostGroup: HTMLElement;
}

/** Refs de la carte "Sentinelle" (2026-08-14) — voir buildSentinelUpgradeCard/
 *  refreshUnitUpgradeShop. Shape dediee (PV + Bouclier/ennemi, PAS
 *  d'Attaque) : ne rentre pas dans UnitUpgradeCardRefs (qui suppose
 *  toujours un palier d'attaque, voir data/unitUpgrades.ts) — meme
 *  raisonnement que Baliste/Nova de glace/Mine, toujours visible (pas de
 *  masquage comme la Mine). */
interface SentinelUpgradeCardRefs {
  button: HTMLButtonElement;
  levelEl: HTMLElement;
  hpBonusEl: HTMLElement;
  shieldPerEnemyEl: HTMLElement;
  nextUpgradeEl: HTMLElement;
  remainingShieldEl: HTMLElement;
  runeCostEl: HTMLElement;
}

/** Refs de la carte "Soins excédentaires" (2026-08-15) — meme convention de
 *  masquage que la Mine (voir MineUpgradeCardRefs) : tant que le talent
 *  "Soins excédentaires" n'est pas debloque, l'ameliorer n'aurait aucun sens
 *  (voir refreshUnitUpgradeShop). Le NIVEAU deja achete reste toutefois
 *  intact meme masque (voir run/shadowUpgradeEffects.ts) — seule la carte
 *  disparait, jamais la progression. */
interface ShadowUpgradeCardRefs {
  card: HTMLElement;
  button: HTMLButtonElement;
  levelEl: HTMLElement;
  damageEl: HTMLElement;
  bonusCountEl: HTMLElement;
  nextUpgradeEl: HTMLElement;
  remainingBonusEl: HTMLElement;
  runeCostEl: HTMLElement;
}

export interface ScreenHandlers {
  onPlay: () => void;
  onOpenTalents: () => void;
  onCloseTalents: () => void;
  onContinueAfterWave: () => void;
  onContinueAfterShop: () => void;
  /** Entree dans le mode editeur de maps (chantier en cours, voir CLAUDE.md).
   *  Le menu principal est le point d'entree naturel : Antoine a explicitement
   *  demande de pouvoir y revenir facilement pendant ses tests. */
  onOpenEditor: () => void;
  /** Reprend la bataille en cours (bouton "Continuer" du menu pause,
   *  Echap y menait). */
  onResume: () => void;
  /** Abandonne la bataille en cours et revient au menu principal, comme au
   *  lancement du jeu — pas de reprise possible (aucune sauvegarde de run
   *  pour l'instant, voir CLAUDE.md). Reste utilise TEL QUEL par l'ecran
   *  "Partie terminee" (la run est deja terminee a ce moment-la, rien a
   *  confirmer) — voir onRequestQuitRun ci-dessous pour le bouton "Quitter"
   *  du menu Pause, qui lui passe desormais par une confirmation. */
  onQuit: () => void;
  /** Bouton "Quitter" du menu Pause (2026-08-16, demande explicite
   *  d'Antoine : "une vraie confirmation avant de quitter une run en
   *  cours") — n'appelle PLUS onQuit directement, ouvre la confirmation
   *  dediee (voir showQuitRunConfirm). Le menu Pause n'etant accessible QUE
   *  depuis une bataille/un placement en cours (voir main.ts,
   *  openPauseMenu), ce bouton represente TOUJOURS "quitter une run en
   *  cours" — aucune verification de contexte supplementaire necessaire ici. */
  onRequestQuitRun: () => void;
  /** "Annuler" de la confirmation — retourne au menu Pause (PAS une reprise
   *  du jeu, voir point 7 de la demande : la partie reste en pause tant que
   *  "Continuer" n'a pas ete cliques explicitement). */
  onCancelQuitRun: () => void;
  /** "Quitter" (rouge) de la confirmation — appelle reellement onQuit.
   *  Idempotent (voir main.ts, quitRunConfirmationInFlight) : un double-clic
   *  ne declenche jamais deux fois la navigation/le nettoyage de run. */
  onConfirmQuitRun: () => void;
  /** Achats de la boutique (chantier economie, etape B — voir CLAUDE.md) :
   *  chaque handler verifie lui-meme l'or disponible et met a jour
   *  currentRun (voir main.ts) — Screens ne fait que relayer le clic et
   *  rafraichir l'affichage ensuite (voir refreshShop). */
  onBuyFantassin: () => void;
  onBuyArcher: () => void;
  onBuyMage: () => void;
  /** Sentinelle (2026-08-14, tank lourd) — meme motif que les 3 handlers
   *  ci-dessus, jamais reservee par vague (contrairement au Mage). */
  onBuySentinel: () => void;
  /** Achat d'un parchemin de soin (chantier inventaire, voir CLAUDE.md) —
   *  verifie lui-meme l'or ET la capacite de l'inventaire (voir
   *  INVENTORY_CAPACITY). Remplace l'ancien "Soigner une unité" (soin
   *  instantane et complet entre deux vagues) : le soin ne passe plus que
   *  par cet objet, utilisable en temps reel pendant la bataille. */
  onBuyHealScroll: () => void;
  /** Achat de Nova de glace (2026-08-14) — meme garde-fou que
   *  onBuyHealScroll (or ET capacite d'inventaire), voir main.ts. */
  onBuyIceNova: () => void;
  /** Bouton "×5" a cote de chaque unite (2026-08-13, demande d'Antoine :
   *  "plus confortable pour acheter plusieurs unités") — achete jusqu'a 5
   *  exemplaires de `unitId` d'un coup (le handler, main.ts, s'arrete tout
   *  seul des que l'or manque, meme garde-fou que l'achat simple, pas
   *  besoin que Screens verifie quoi que ce soit ici). */
  onBuyFive: (unitId: string) => void;
  /** Bouton "×5" pour les consommables (Parchemin de soin/Nova de glace...) —
   *  2026-08-15, chantier polish/equilibrage, demande explicite d'Antoine.
   *  Distinct de `onBuyFive` (unites, tolerant, s'arrete des qu'un achat
   *  echoue) : l'achat de 5 consommables d'un coup est ATOMIQUE (voir
   *  main.ts, buyConsumable — tout ou rien, jamais partiel). */
  onBuyItemFive: (itemId: string) => void;
  /** Bouton d'achat d'un bâtiment (Mine, Caserne — 2026-08-17, onglet
   *  Bâtiments) — N'ACHETE PAS immediatement (demande explicite d'Antoine,
   *  point 7 : "ne le pose pas immédiatement") : entre en mode placement
   *  (voir main.ts), l'or n'est retire qu'a la confirmation d'un
   *  emplacement valide. Le bouton est deja desactive si l'or est
   *  insuffisant (voir Screens.refreshShop) — n'appelle donc ce handler que
   *  lorsque l'achat est reellement possible. */
  onRequestPlaceBuilding: (buildingId: string) => void;
  /** Bouton "Annuler le dernier achat" de la boutique de run (2026-08-13,
   *  demande d'Antoine : "au cas où une unité ait été achetée par hasard") —
   *  le handler verifie lui-meme s'il y a quelque chose a annuler (voir
   *  main.ts, lastUnitPurchase) ; Screens se contente d'activer/desactiver
   *  le bouton via `refreshShop`/`showShop` (voir canUndoLastPurchase). */
  onUndoLastUnitPurchase: () => void;
  /** Achat d'un talent (universel ou fondateur — voir data/talents.ts) — le
   *  handler verifie lui-meme si l'achat est possible (canUnlockTalent) et
   *  sauvegarde ensuite ; Screens ne fait que relayer le clic et rafraichir
   *  l'affichage (voir refreshTalents), meme motif que les achats boutique.
   *  Les 3 fondateurs sont achetables librement et independamment, pas
   *  d'exclusivite entre eux (voir CLAUDE.md, refonte 2026-08-10). */
  onUnlockTalent: (id: string) => void;
  /** Boutique d'AMELIORATION PERMANENTE des unites (2026-08-13, demande
   *  d'Antoine) — accessible depuis le menu titre uniquement, DISTINCTE de
   *  la boutique de run (onBuyFantassin etc. ci-dessus) et de l'arbre de
   *  talents. `onPurchaseUnitUpgrade` verifie lui-meme les runes
   *  disponibles (voir canPurchaseUnitUpgrade) ; Screens ne fait que
   *  relayer le clic et rafraichir (meme motif que onUnlockTalent). */
  onOpenUnitUpgradeShop: () => void;
  onCloseUnitUpgradeShop: () => void;
  onPurchaseUnitUpgrade: (unitId: string) => void;
  /** Bouton "Effacer la sauvegarde" du menu principal (demande d'Antoine,
   *  2026-08-10) : ouvre l'ecran de confirmation, ne supprime rien lui-meme —
   *  voir onConfirmResetSave/onCancelResetSave pour l'action reelle. */
  onRequestResetSave: () => void;
  /** Confirmation explicite ("mets quand meme une securite") : efface pour
   *  de bon la progression permanente (points de talent, talents debloques)
   *  et revient au menu. */
  onConfirmResetSave: () => void;
  onCancelResetSave: () => void;
  /** Bouton "Réinitialiser les talents" de l'ecran talents (demande
   *  d'Antoine, 2026-08-11) : ouvre l'ecran de confirmation, ne rembourse
   *  rien lui-meme — voir onConfirmResetTalents. Distinct de
   *  onRequestResetSave : rembourse les points depenses (respec), n'efface
   *  RIEN d'autre (record de vague, unites debloquees...). */
  onRequestResetTalents: () => void;
  onConfirmResetTalents: () => void;
  onCancelResetTalents: () => void;
  /** Bouton de DEBUG "+1 point de talent" (2026-08-14, demande explicite
   *  d'Antoine : "rajoute moi un bouton pour m'auto attribuer un point de
   *  talent... ce bouton sera retiré, c'est juste pour tester les talents")
   *  — accorde immédiatement 1 point et sauvegarde, sans passer par une run
   *  ou un palier de vague. A RETIRER quand Antoine aura fini de tester. */
  onDebugGrantTalentPoint: () => void;
  /** Bouton de DEBUG (2026-08-17, demande explicite d'Antoine : "fais-moi
   *  un bouton debug pour m'ajouter 100 or... ce bouton sera retiré plus
   *  tard") — meme motif que onDebugGrantTalentPoint ci-dessus. A RETIRER
   *  (ce handler, le bouton dans ui/screens.ts, et le style
   *  .shop-debug-button) une fois les tests termines. */
  onDebugAddGold: () => void;
  /** Barriere de securite au clic sur "Pret pour la bataille" (2026-08-10,
   *  demande d'Antoine) : si l'or restant depasse 10% de l'or au debut de
   *  CETTE phase de placement, ce popup s'affiche avant de lancer la
   *  bataille pour de bon (voir main.ts, requestValidatePlacement). "Lancer
   *  quand meme" appelle onConfirmPlacementWithGold, "Annuler" revient au
   *  placement sans rien declencher. */
  onConfirmPlacementWithGold: () => void;
  onCancelPlacementGoldWarning: () => void;
  /** Ecran Parametres (2026-08-12, demande d'Antoine : "UN SEUL systeme de
   *  parametres reutilisable" depuis le menu principal ET le menu pause).
   *  DEUX points d'entree distincts plutot qu'un seul `onOpenSettings` :
   *  chacun fixe le contexte de retour cote main.ts (menu vs pause) AVANT
   *  d'afficher l'ecran — Screens elle-meme ne sait pas d'ou on vient,
   *  `onCloseSettings` se contente de relayer le clic "Retour", c'est
   *  main.ts qui decide vers quel ecran revenir. */
  onOpenSettingsFromMenu: () => void;
  onOpenSettingsFromPause: () => void;
  onCloseSettings: () => void;
  /** Valeurs 0..1 — l'ecran convertit lui-meme depuis/vers l'affichage 0-100%. */
  onSetMasterVolume: (value: number) => void;
  onSetMusicVolume: (value: number) => void;
  onSetSfxVolume: (value: number) => void;
  onSetMuted: (muted: boolean) => void;
}

/**
 * Constantes de mise en page de l'arbre de talents (2026-08-14, deuxieme
 * refonte) — voir buildTalentTree/ui/talentTreeLayout.ts. `cardWidth`/
 * `cardHeight` DOIVENT rester synchronises avec `.talent-node` en CSS
 * (`width`/`height` fixes, voir style.css) : ce projet n'a pas de systeme de
 * constantes partagees CSS<->JS, donc ce couplage reste manuel — documente
 * aux deux endroits. `cardHeight` fixe (pas juste min-height) resout
 * explicitement la demande d'Antoine ("cartes de hauteur uniforme... je ne
 * veux pas quelques pixels de différence dus à leur contenu").
 */
const TALENT_TREE_LAYOUT_OPTIONS = {
  cardWidth: 140,
  cardHeight: 72,
  siblingGap: 28,
  // 84px entre le bas d'une carte et le haut de la suivante — dans la
  // fourchette 70-100px demandee explicitement (section 15/18).
  tierGap: 84,
  rootGap: 64,
};

/**
 * Ecrans de meta-jeu : menu principal, arbre de talents, fin de vague,
 * boutique intermanche. Du HTML/CSS par-dessus le canvas, comme toute
 * l'interface. Contenu volontairement squelettique — ce sont des ecrans de
 * navigation, pas les systemes eux-memes (pas d'or, pas de talents reels) :
 * ca viendra apres la fleche du joueur et le test de plaisir, une fois qu'on
 * sait que la boucle de base est amusante.
 */
export class Screens {
  private readonly menu: HTMLElement;
  private readonly talents: HTMLElement;
  /** Section "Progression" (record de vague) — voir CLAUDE.md, refonte du
   *  2026-08-10 : le nouveau systeme de paliers n'a pas encore de contenu,
   *  ce texte reste volontairement statique tant qu'Antoine n'a pas concu
   *  de vrais paliers (voir data/talents.ts, TALENT_TIERS). */
  private readonly progressWaveText: HTMLElement;
  private readonly talentsPoints: HTMLElement;
  /** Un bouton par talent (voir data/talents.ts), cle par id — permet a
   *  refreshTalents de mettre a jour chacun individuellement sans reconstruire
   *  tout l'arbre (contrairement a playerPreview/combatOverlay.syncPlacement,
   *  le nombre de talents ne change JAMAIS en cours de partie). */
  private readonly talentNodes = new Map<string, HTMLButtonElement>();
  /**
   * DEUXIEME refonte visuelle 2026-08-14 (demande d'Antoine — le premier
   * essai en lignes flexbox `justify-content: center` traitait chaque
   * palier comme une simple liste centree, perdant la relation "cette
   * carte est centree sous SON parent") : positionnement ABSOLU calcule par
   * un vrai algorithme d'arbre (voir ui/talentTreeLayout.ts,
   * computeTalentTreeLayout — pur, teste en headless) plutot que du CSS
   * flexbox generique. Une seule strategie de layout (section 34 de la
   * demande : "ne pas accumuler flex + absolute + patchs margin-left") :
   * TOUT est positionne via `left`/`top` en pixels calcules en JS, aucune
   * regle CSS de centrage/alignement ne reste en jeu pour les cartes.
   */
  /** Tooltip UNIQUE et PARTAGE (2026-08-14, demande d'Antoine : "le tooltip
   *  recouvre une grande partie des talents... position:fixed... placement
   *  intelligent") — un seul element flottant reutilise/repositionne au
   *  survol de n'importe quelle carte, jamais un enfant de chaque carte
   *  (contrairement a l'ancien `.talent-node-desc`). Ajoute directement a
   *  `document.body` pour n'etre jamais clippe par un ancetre `overflow`.
   *  GENERALISE le 2026-08-17 (demande explicite d'Antoine : "fais le meme
   *  affichage que pour les points de talents" pour la boutique — Mine,
   *  Caserne, Nova de glace) : plus reserve aux talents, voir showTooltip/
   *  attachItemTooltip ci-dessous. Nom de champ conserve pour ne pas
   *  toucher a chaque site d'appel existant, mais desormais partage. */
  private readonly talentTooltip: HTMLElement;
  private readonly talentTooltipName: HTMLElement;
  private readonly talentTooltipDesc: HTMLElement;
  private readonly waveComplete: HTMLElement;
  private readonly waveCompleteTitle: HTMLElement;
  /** Petit feedback "+N runes d'amélioration" (2026-08-13, point 6 de la
   *  demande d'Antoine : "un petit feedback intégré à l'écran de victoire
   *  suffit... ne fais pas une énorme fenêtre") — texte vide (masqué en
   *  pratique par un contenu vide) sur une défaite, aucune rune n'est
   *  jamais gagnee dans ce cas (voir main.ts). */
  private readonly waveCompleteRunes: HTMLElement;
  private readonly shop: HTMLElement;
  private readonly shopGold: HTMLElement;
  /** Nombre d'or affiché dans shopGold — élément dédié pour ne pas écraser
   *  l'icône de pièce voisine en réécrivant tout le textContent parent. */
  private readonly shopGoldAmount: HTMLElement;
  private readonly shopBuyFantassin: HTMLButtonElement;
  private readonly shopBuyArcher: HTMLButtonElement;
  private readonly shopBuyMage: HTMLButtonElement;
  private readonly shopBuySentinel: HTMLButtonElement;
  private readonly shopBuyHealScroll: HTMLButtonElement;
  /** "Annuler le dernier achat" (2026-08-13) — active seulement s'il y a
   *  quelque chose a annuler, voir refreshShop/showShop. */
  private readonly shopUndoLastPurchase: HTMLButtonElement;
  /** Element de PRIX (pas le bouton entier) de chaque objet achetable
   *  ci-dessus (unites ET, depuis le 2026-08-15, les consommables Parchemin
   *  de soin/Nova de glace), cle par id — le cout EFFECTIF (voir
   *  run/unitUpgradeEffects.ts, effectivePlayerUnitCost ;
   *  run/healScrollUpgradeEffects.ts/run/iceNovaUpgradeEffects.ts) peut
   *  changer en cours de partie des qu'un niveau d'amelioration permanente
   *  est achete, contrairement a tout le reste de cette boutique ou le prix
   *  etait FIXE a la construction (voir shopItemButton). */
  private readonly shopUnitPriceEls = new Map<string, HTMLElement>();
  /** Boutons "×5" a cote de chaque objet achetable (2026-08-13, etendu aux
   *  consommables le 2026-08-15) — cle par id, active/desactive dans
   *  refreshShop selon `run.gold >= 5 * coutEffectif` ET (pour un
   *  consommable) la capacite d'inventoire pour 5 exemplaires de plus. */
  private readonly shopUnitBuyFiveEls = new Map<string, HTMLButtonElement>();
  /** Ligne complete (bouton simple + ×5) du Mage — c'est CETTE ligne qui est
   *  masquee tant que le Mage n'est pas debloque (voir refreshShop), pas
   *  seulement le bouton d'achat simple, sinon le ×5 resterait visible et
   *  cliquable pour une unite verrouillee. */
  private readonly shopMageRow: HTMLElement;
  /** Meme principe que shopMageRow, pour la Sentinelle (2026-08-15, systeme
   *  generique de deblocage par victoire — voir data/units.ts,
   *  playerUnlockMode). Avant cette refonte, la Sentinelle etait TOUJOURS
   *  visible (jamais reservee) — desormais gouvernee par la MEME regle
   *  generique que le Mage, voir refreshShop. */
  private readonly shopSentinelRow: HTMLElement;
  /** Boutique d'AMELIORATION PERMANENTE des unites (2026-08-13) — voir
   *  data/unitUpgrades.ts. */
  private readonly unitUpgradeShop: HTMLElement;
  private readonly unitUpgradeRunesAmount: HTMLElement;
  private readonly unitUpgradeCards = new Map<string, UnitUpgradeCardRefs>();
  /** Cartes "Baliste"/"Parchemin de soin"/"Nova de glace" (2026-08-13,
   *  2026-08-14) — shape different des unites (voir BallistaUpgradeCardRefs/
   *  HealScrollUpgradeCardRefs/IceNovaUpgradeCardRefs), donc pas dans
   *  `unitUpgradeCards`. Une seule carte chacune (pas une Map), toujours
   *  presentes. */
  private readonly ballistaUpgradeCard: BallistaUpgradeCardRefs;
  private readonly healScrollUpgradeCard: HealScrollUpgradeCardRefs;
  private readonly iceNovaUpgradeCard: IceNovaUpgradeCardRefs;
  /** Carte "Mine" (2026-08-14) — TOUJOURS visible depuis le 2026-08-17, voir
   *  MineUpgradeCardRefs. */
  private readonly mineUpgradeCard: MineUpgradeCardRefs;
  /** Carte "Caserne" (2026-08-17) — voir BarracksUpgradeCardRefs. */
  private readonly barracksUpgradeCard: BarracksUpgradeCardRefs;
  /** Carte "Sentinelle" (2026-08-14) — voir buildSentinelUpgradeCard. */
  private readonly sentinelUpgradeCard: SentinelUpgradeCardRefs;
  /** Carte "Soins excédentaires" (2026-08-15) — MASQUEE tant que le talent
   *  du meme nom n'est pas debloque, voir refreshUnitUpgradeShop. */
  private readonly shadowUpgradeCard: ShadowUpgradeCardRefs;
  /** Onglets de la boutique (2026-08-11, demande d'Antoine : "classer les
   *  objets de la boutique dans des fenêtres distinctes") — un onglet par
   *  categorie, une seule visible a la fois via setShopTab. REFONTE
   *  2026-08-17 (chantier "bâtiments achetables", demande explicite
   *  d'Antoine) : l'onglet "Soins" disparait — TOUS les parchemins
   *  (soin compris) vivent desormais dans "Parchemins de bataille" — et un
   *  nouvel onglet "Bâtiments" apparait (Mine, Caserne). */
  private readonly shopTabUnits: HTMLButtonElement;
  private readonly shopTabBuildings: HTMLButtonElement;
  private readonly shopTabBattleScrolls: HTMLButtonElement;
  private readonly shopPanelUnits: HTMLElement;
  private readonly shopPanelBuildings: HTMLElement;
  private readonly shopPanelBattleScrolls: HTMLElement;
  /** Boutons d'achat de bâtiment (2026-08-17), cle par buildingId — construits
   *  dynamiquement depuis `listBuyableBuildingIds()` (jamais deux boutons
   *  codes en dur, un futur bâtiment achetable apparait automatiquement).
   *  Le clic n'achete PAS immediatement (voir onRequestPlaceBuilding) :
   *  entre en mode placement, l'or n'est retire qu'a la confirmation. */
  private readonly shopBuildingButtons = new Map<string, HTMLButtonElement>();
  private readonly shopBuildingDescriptions = new Map<string, HTMLElement>();
  /** Nova de glace (2026-08-14) — bouton d'achat + description DYNAMIQUE
   *  (voir refreshShop) : le texte change quand le talent Blizzard est
   *  debloque, sans jamais changer le prix ni le comportement du bouton. */
  private readonly shopBuyIceNova: HTMLButtonElement;
  private readonly shopIceNovaDescription: HTMLElement;
  private readonly pause: HTMLElement;
  /** Confirmation "Quitter" pendant une run (2026-08-16, demande d'Antoine)
   *  — voir showQuitRunConfirm/isQuitRunConfirmOpen. `quitRunCancelButton`
   *  retenu a part pour recevoir le focus par defaut a l'ouverture (point 4
   *  de la demande : "je ne veux pas qu'appuyer accidentellement sur Entree
   *  valide automatiquement Quitter" — Annuler doit toujours etre l'action
   *  par defaut, jamais le bouton rouge). */
  private readonly quitRunConfirm: HTMLElement;
  private readonly quitRunCancelButton: HTMLButtonElement;
  private readonly gameOver: HTMLElement;
  private readonly gameOverProgress: HTMLElement;
  private readonly resetConfirm: HTMLElement;
  private readonly resetTalentsConfirm: HTMLElement;
  private readonly placementGoldWarning: HTMLElement;
  private readonly placementGoldWarningText: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly settingsMaster: SliderControl;
  private readonly settingsMusic: SliderControl;
  private readonly settingsSfx: SliderControl;
  private readonly settingsMuted: { row: HTMLElement; input: HTMLInputElement };

  /** `uiSound` : callbacks audio (2026-08-12) — Screens ne connait pas
   *  l'AudioManager, juste deux fonctions a appeler ("joue un clic",
   *  "joue un survol"), branchees par main.ts. Point d'insertion unique
   *  (voir `button()`/`shopItemButton()`) plutot que d'ajouter le son a
   *  chaque site d'appel individuel dans main.ts. */
  constructor(
    handlers: ScreenHandlers,
    private readonly uiSound: { click: () => void; hover: () => void },
  ) {
    // Tooltip flottant de l'arbre de talents (2026-08-14) — construit ICI,
    // avant tout le reste : buildTalentTree()/buildTalentNode() (appeles
    // plus bas dans ce meme constructeur) en ont besoin des leur execution.
    // Ajoute directement a document.body (jamais a l'interieur d'un ecran)
    // pour ne jamais etre clippe par un ancetre `overflow` — voir
    // showTalentTooltip.
    this.talentTooltip = document.createElement('div');
    this.talentTooltip.className = 'talent-tooltip';
    this.talentTooltipName = document.createElement('div');
    this.talentTooltipName.className = 'talent-tooltip-name';
    this.talentTooltipDesc = document.createElement('div');
    this.talentTooltipDesc.className = 'talent-tooltip-desc';
    this.talentTooltip.append(this.talentTooltipName, this.talentTooltipDesc);
    document.body.appendChild(this.talentTooltip);

    this.menu = this.overlay('menu', [
      this.title('Arrow Tactics'),
      this.button('Jouer', handlers.onPlay),
      this.button('Arbre de talents', handlers.onOpenTalents),
      this.button('Boutique d’amélioration', handlers.onOpenUnitUpgradeShop),
      this.button('Éditeur de maps', handlers.onOpenEditor),
      this.button('Paramètres', handlers.onOpenSettingsFromMenu),
      this.button('Effacer la sauvegarde', handlers.onRequestResetSave),
    ]);

    this.resetConfirm = this.overlay('reset-confirm', [
      this.title('Effacer la sauvegarde ?'),
      this.paragraph(
        'Action irréversible : tous les points de talent et talents débloqués seront perdus. La run en cours (si il y en a une) n’est pas concernée.',
      ),
      this.button('Annuler', handlers.onCancelResetSave),
      this.button('Oui, tout effacer', handlers.onConfirmResetSave),
    ]);

    this.resetTalentsConfirm = this.overlay('reset-talents-confirm', [
      this.title('Réinitialiser les talents ?'),
      this.paragraph(
        'Tous les talents débloqués sont retirés et leur coût vous est intégralement remboursé en points de talent — rien d’autre n’est affecté (record de vague, unités débloquées...).',
      ),
      this.button('Annuler', handlers.onCancelResetTalents),
      this.button('Oui, réinitialiser', handlers.onConfirmResetTalents),
    ]);

    this.progressWaveText = this.paragraph('');
    this.talentsPoints = this.paragraph('');
    // Bouton de DEBUG (2026-08-14, voir ScreenHandlers.onDebugGrantTalentPoint)
    // — A RETIRER une fois les tests de talents terminés, demande explicite
    // d'Antoine ("ce bouton sera retiré").
    const debugGrantButton = this.button('+1 point de talent (debug)', handlers.onDebugGrantTalentPoint);
    debugGrantButton.classList.add('talent-debug-button');
    this.talents = this.overlay('talents', [
      this.title('Arbre de talents'),
      this.progressWaveText,
      this.paragraph('Nouveau système de talents en cours de conception.'),
      this.talentsPoints,
      this.buildTalentTree(handlers),
      debugGrantButton,
      this.button('Réinitialiser les talents', handlers.onRequestResetTalents),
      this.button('Retour', handlers.onCloseTalents),
    ]);

    this.waveCompleteTitle = this.title('');
    this.waveCompleteRunes = this.paragraph('');
    this.waveComplete = this.overlay('wave-complete', [
      this.waveCompleteTitle,
      this.waveCompleteRunes,
      this.button('Continuer', handlers.onContinueAfterWave),
    ]);

    // Boutique par onglets (2026-08-11, demande d'Antoine : "classer les
    // objets de la boutique dans des fenêtres distinctes") — voir
    // setShopTab. Unites/Soins/Parchemins de bataille, un seul onglet
    // visible a la fois.
    this.shopGold = document.createElement('p');
    this.shopGold.className = 'screen-text shop-gold';
    this.shopGoldAmount = document.createElement('span');
    this.shopGold.append('Or : ', this.shopGoldAmount, createCoinIcon(16));

    const fantassinDef = getUnit('fantassin');
    const archerDef = getUnit('archer');
    const fantassinRow = this.unitPurchaseRow(fantassinDef, handlers.onBuyFantassin, () => handlers.onBuyFive('fantassin'));
    const archerRow = this.unitPurchaseRow(archerDef, handlers.onBuyArcher, () => handlers.onBuyFive('archer'));
    this.shopBuyFantassin = fantassinRow.button;
    this.shopBuyArcher = archerRow.button;
    // Mage (2026-08-11) : achetable des le debut a l'epoque, DESORMAIS
    // reserve jusqu'a MAGE_UNLOCK_WAVE (2026-08-13, voir refreshShop) — la
    // ligne ENTIERE (bouton + ×5) est masquee tant qu'il n'est pas debloque,
    // pas juste le bouton d'achat simple.
    const mageDef = getUnit('mage');
    const mageRow = this.unitPurchaseRow(mageDef, handlers.onBuyMage, () => handlers.onBuyFive('mage'));
    this.shopBuyMage = mageRow.button;
    this.shopMageRow = mageRow.row;
    // Sentinelle (2026-08-14, tank lourd) — RESERVEE depuis le 2026-08-15
    // (systeme generique de deblocage par victoire, voir refreshShop) :
    // auparavant toujours visible, jamais reservee par vague.
    const sentinelDef = getUnit('sentinel');
    const sentinelRow = this.unitPurchaseRow(sentinelDef, handlers.onBuySentinel, () => handlers.onBuyFive('sentinel'));
    this.shopBuySentinel = sentinelRow.button;
    this.shopSentinelRow = sentinelRow.row;
    // Parchemin de soin — "ACHAT x5" (2026-08-15, chantier polish/
    // equilibrage, demande explicite d'Antoine) : meme unitPurchaseRow que
    // les unites (bouton simple + ×5), le prix affiche/desactive suit
    // desormais le cout EFFECTIF (base + niveau d'amelioration permanente x
    // 0.5, voir run/healScrollUpgradeEffects.ts) au lieu du cout FIXE de
    // data/items.ts — voir refreshShop pour le recalcul dynamique. REFONTE
    // 2026-08-17 (demande explicite d'Antoine : "je ne veux plus séparer
    // artificiellement Parchemin de soins et sorts offensifs... tous les
    // parchemins doivent désormais se trouver dans PARCHEMINS DE BATAILLE") :
    // rejoint desormais le MEME panneau que la Nova de glace ci-dessous,
    // l'onglet "Soins" separe disparait entierement.
    const scrollDef = getItem('heal_scroll_minor');
    const healRow = this.unitPurchaseRow(
      scrollDef,
      handlers.onBuyHealScroll,
      () => handlers.onBuyItemFive('heal_scroll_minor'),
      'heal_scroll_minor',
    );
    this.shopBuyHealScroll = healRow.button;
    // Description en TOOLTIP flottant (2026-08-17), pas un paragraphe
    // toujours visible — voir attachItemTooltip. Texte STATIQUE (l'objet n'a
    // pas de valeur effective a recalculer dans sa description, contrairement
    // a la Nova de glace/aux batiments ci-dessous).
    this.attachItemTooltip(healRow.button, scrollDef.name, () => scrollDef.description);

    // "Annuler le dernier achat" (2026-08-13, demande d'Antoine : "au cas où
    // une unité ait été achetée par hasard") — bouton generique (pas
    // shopItemButton, pas de prix a afficher dessus), style secondaire
    // discret via .shop-undo-button.
    this.shopUndoLastPurchase = this.button('Annuler le dernier achat', handlers.onUndoLastUnitPurchase) as HTMLButtonElement;
    this.shopUndoLastPurchase.classList.add('shop-undo-button');

    this.shopPanelUnits = this.shopTabPanel([
      fantassinRow.row,
      archerRow.row,
      this.shopMageRow,
      this.shopSentinelRow,
      this.shopUndoLastPurchase,
    ]);

    // Nova de glace (2026-08-14) : premier VRAI parchemin de bataille — le
    // prix vient de data/items.ts (ITEMS.ice_nova.cost), jamais recopie ici
    // (demande explicite d'Antoine : "pas de texte '4 Gold' independant de
    // la vraie logique d'achat"). Description sous le bouton, mise a jour
    // dynamiquement par refreshShop selon que Blizzard est debloque ou non.
    // "ACHAT x5" (2026-08-15) : meme motif que le Parchemin de soin
    // ci-dessus — unitPurchaseRow, prix EFFECTIF recalcule dans refreshShop.
    const iceNovaDef = getItem('ice_nova');
    const iceNovaRow = this.unitPurchaseRow(
      iceNovaDef,
      handlers.onBuyIceNova,
      () => handlers.onBuyItemFive('ice_nova'),
      'ice_nova',
    );
    this.shopBuyIceNova = iceNovaRow.button;
    // Description en TOOLTIP flottant (2026-08-17, plus un paragraphe
    // toujours visible sous le bouton — voir attachItemTooltip) : reste mise
    // a jour dynamiquement (texte Blizzard) via ce meme element, jamais
    // affiche dans la mise en page, seulement lu au survol.
    this.shopIceNovaDescription = this.paragraph(iceNovaDef.description);
    this.attachItemTooltip(iceNovaRow.button, iceNovaDef.name, () => this.shopIceNovaDescription.textContent ?? '');
    // TOUS les parchemins dans le MEME panneau (2026-08-17) — Soin d'abord
    // (ITEM_CATEGORY_ORDER n'a plus qu'une seule categorie, voir data/items.ts,
    // donc l'ordre d'affichage ici est simplement l'ordre d'ajout).
    this.shopPanelBattleScrolls = this.shopTabPanel([healRow.row, iceNovaRow.row]);

    // Onglet BÂTIMENTS (2026-08-17, demande explicite d'Antoine) — construit
    // dynamiquement depuis listBuyableBuildingIds() (data/buildings.ts),
    // jamais deux boutons codes en dur : un futur bâtiment achetable
    // (cost defini) y apparait automatiquement. Le clic n'achete PAS
    // immediatement — voir onRequestPlaceBuilding, entre en mode placement,
    // l'or n'est retire qu'a la confirmation d'un emplacement valide (voir
    // main.ts).
    const buildingRows: HTMLElement[] = [];
    for (const buildingId of listBuyableBuildingIds()) {
      const def = getBuilding(buildingId);
      const button = this.shopItemButton(def.displayName, def.cost ?? 0, () => handlers.onRequestPlaceBuilding(buildingId), buildingId);
      this.shopBuildingButtons.set(buildingId, button);
      // Description en TOOLTIP flottant (2026-08-17), pas un paragraphe
      // toujours visible sous le bouton (demande explicite d'Antoine : "cela
      // fait beaucoup de texte sous les boutons actuellement") — l'element
      // reste mis a jour dynamiquement par refreshShop (valeur effective),
      // seulement jamais ajoute a la mise en page, juste lu au survol.
      const description = this.paragraph('');
      this.shopBuildingDescriptions.set(buildingId, description);
      this.attachItemTooltip(button, def.displayName, () => description.textContent ?? '');
      buildingRows.push(button);
    }
    this.shopPanelBuildings = this.shopTabPanel(buildingRows);

    this.shopTabUnits = this.tabButton('Unités', () => this.setShopTab('units'));
    this.shopTabBuildings = this.tabButton('Bâtiments', () => this.setShopTab('buildings'));
    this.shopTabBattleScrolls = this.tabButton('Parchemins de bataille', () => this.setShopTab('battle-scrolls'));
    const shopTabs = document.createElement('div');
    shopTabs.className = 'shop-tabs';
    shopTabs.append(this.shopTabUnits, this.shopTabBuildings, this.shopTabBattleScrolls);

    // Bouton de DEBUG (2026-08-17, voir ScreenHandlers.onDebugAddGold) — A
    // RETIRER une fois les tests termines, demande explicite d'Antoine ("ce
    // bouton sera retiré plus tard").
    const debugAddGoldButton = this.button('+100 or (debug)', handlers.onDebugAddGold);
    debugAddGoldButton.classList.add('shop-debug-button');

    this.shop = this.overlay('shop', [
      this.title('Boutique'),
      this.shopGold,
      shopTabs,
      this.shopPanelUnits,
      this.shopPanelBuildings,
      this.shopPanelBattleScrolls,
      debugAddGoldButton,
      this.button('Continuer', handlers.onContinueAfterShop),
    ]);
    this.setShopTab('units');

    // Boutique d'AMELIORATION PERMANENTE des unites (2026-08-13, demande
    // d'Antoine) — accessible depuis le menu titre. Une carte GENERIQUE par
    // unite ameliorable (listUpgradableUnitIds, voir data/unitUpgrades.ts) :
    // ajouter une nouvelle unite ameliorable plus tard (Cavalier, Baliste...)
    // n'exige aucun changement ici, juste une nouvelle entree dans
    // UNIT_UPGRADES (point 7 de la demande : "ne hardcode pas toute l'UI
    // autour de seulement trois unites").
    const unitUpgradeRunes = document.createElement('p');
    unitUpgradeRunes.className = 'screen-text shop-gold';
    this.unitUpgradeRunesAmount = document.createElement('span');
    unitUpgradeRunes.append('Runes : ', this.unitUpgradeRunesAmount, createRuneIcon(16));

    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'upgrade-cards';
    for (const unitId of listUpgradableUnitIds()) {
      cardsContainer.append(this.buildUnitUpgradeCard(unitId, handlers));
    }
    // Baliste / Parchemin de soin / Nova de glace (2026-08-13, 2026-08-14) —
    // shape different des unites (voir buildBallistaUpgradeCard/
    // buildHealScrollUpgradeCard/buildIceNovaUpgradeCard), donc construites a
    // part plutot que par listUpgradableUnitIds ci-dessus.
    const ballistaCard = this.buildBallistaUpgradeCard(handlers);
    this.ballistaUpgradeCard = ballistaCard.refs;
    const healScrollCard = this.buildHealScrollUpgradeCard(handlers);
    this.healScrollUpgradeCard = healScrollCard.refs;
    const iceNovaCard = this.buildIceNovaUpgradeCard(handlers);
    this.iceNovaUpgradeCard = iceNovaCard.refs;
    this.mineUpgradeCard = this.buildMineUpgradeCard(handlers);
    this.barracksUpgradeCard = this.buildBarracksUpgradeCard(handlers);
    const sentinelCard = this.buildSentinelUpgradeCard(handlers);
    this.sentinelUpgradeCard = sentinelCard.refs;
    this.shadowUpgradeCard = this.buildShadowUpgradeCard(handlers);
    cardsContainer.append(
      ballistaCard.card,
      healScrollCard.card,
      iceNovaCard.card,
      this.mineUpgradeCard.card,
      this.barracksUpgradeCard.card,
      sentinelCard.card,
      this.shadowUpgradeCard.card,
    );

    this.unitUpgradeShop = this.overlay('unit-upgrade-shop', [
      this.title('Boutique d’amélioration'),
      unitUpgradeRunes,
      cardsContainer,
      this.button('Retour', handlers.onCloseUnitUpgradeShop),
    ]);

    this.pause = this.overlay('pause', [
      this.title('Pause'),
      this.button('Continuer', handlers.onResume),
      this.button('Paramètres', handlers.onOpenSettingsFromPause),
      // Ouvre desormais une confirmation dediee au lieu de quitter
      // directement (2026-08-16, demande explicite d'Antoine) — voir
      // onRequestQuitRun/showQuitRunConfirm.
      this.button('Quitter', handlers.onRequestQuitRun),
    ]);

    // Confirmation "Quitter une run en cours" (2026-08-16) — meme
    // architecture que resetConfirm juste au-dessus (screen-panel/overlay
    // existant, pas une deuxieme popup system) : titre/texte/2 boutons.
    // Texte HONNETE sur ce qui persiste reellement (voir CLAUDE.md, chantier
    // sauvegarde) : seule la progression PERMANENTE (talents, ameliorations,
    // records de vague) est deja sauvegardee au moment ou ce popup s'affiche
    // — l'or/l'armee/l'inventaire de LA RUN elle-meme ne sont jamais
    // persistes, quitter les perd reellement. Bouton "Quitter" marque
    // `.danger-button` (fond rouge sombre plein, pas juste une teinte
    // legere comme .shop-undo-button/.editor-button--danger — demande
    // explicite d'un traitement plus appuye pour cette action precise).
    const quitRunCancelBtn = this.button('Annuler', handlers.onCancelQuitRun) as HTMLButtonElement;
    const quitRunConfirmBtn = this.button('Quitter', handlers.onConfirmQuitRun) as HTMLButtonElement;
    quitRunConfirmBtn.classList.add('danger-button');
    this.quitRunCancelButton = quitRunCancelBtn;
    this.quitRunConfirm = this.overlay('quit-run-confirm', [
      this.title('Êtes-vous sûr de vouloir quitter ?'),
      this.paragraph(
        'L’or, l’armée et l’inventaire de cette run seront perdus. Votre progression permanente (talents, améliorations, records de vague) est déjà sauvegardée.',
      ),
      quitRunCancelBtn,
      quitRunConfirmBtn,
    ]);

    this.gameOverProgress = this.paragraph('');
    this.gameOver = this.overlay('game-over', [
      this.title('Partie terminée'),
      this.paragraph('Toute votre armée est tombée. La run se termine ici.'),
      this.gameOverProgress,
      this.button('Retour au menu principal', handlers.onQuit),
    ]);

    this.placementGoldWarningText = this.paragraph('');
    this.placementGoldWarning = this.overlay('placement-gold-warning', [
      this.title('Il vous reste de l’or'),
      this.placementGoldWarningText,
      this.button('Annuler', handlers.onCancelPlacementGoldWarning),
      this.button('Lancer quand même', handlers.onConfirmPlacementWithGold),
    ]);

    // Ecran Parametres (2026-08-12) — un seul onglet reellement fonctionnel
    // ("Son") pour cette V1, demande explicite d'Antoine : "ne remplis pas
    // artificiellement" Graphismes/Commandes/Jeu. La rangee d'onglets existe
    // deja (meme structure que shop-tabs) pour que les ajouter plus tard
    // n'exige pas de reconstruire l'ecran, mais un SEUL bouton y figure ici.
    this.settingsMaster = this.sliderControl('Volume général', handlers.onSetMasterVolume);
    this.settingsMusic = this.sliderControl('Musique', handlers.onSetMusicVolume);
    this.settingsSfx = this.sliderControl('Effets sonores', handlers.onSetSfxVolume);
    this.settingsMuted = this.checkboxControl('Muet', handlers.onSetMuted);

    const soundTabButton = this.tabButton('Son', () => {});
    soundTabButton.classList.add('shop-tab--active');
    const soundTabPanel = this.shopTabPanel([
      this.settingsMaster.row,
      this.settingsMusic.row,
      this.settingsSfx.row,
      this.settingsMuted.row,
    ]);
    soundTabPanel.classList.add('shop-tab-content--active');
    const settingsTabs = document.createElement('div');
    settingsTabs.className = 'shop-tabs';
    settingsTabs.append(soundTabButton);

    this.settings = this.overlay('settings', [
      this.title('Paramètres'),
      settingsTabs,
      soundTabPanel,
      this.button('Retour', handlers.onCloseSettings),
    ]);

    this.hideAll();
    this.show('menu');
  }

  show(name: ScreenName): void {
    this.hideAll();
    this.screenEl(name).classList.add('screen-overlay--visible');
  }

  hideAll(): void {
    this.menu.classList.remove('screen-overlay--visible');
    this.talents.classList.remove('screen-overlay--visible');
    this.waveComplete.classList.remove('screen-overlay--visible');
    this.shop.classList.remove('screen-overlay--visible');
    this.pause.classList.remove('screen-overlay--visible');
    this.quitRunConfirm.classList.remove('screen-overlay--visible');
    this.gameOver.classList.remove('screen-overlay--visible');
    this.resetConfirm.classList.remove('screen-overlay--visible');
    this.resetTalentsConfirm.classList.remove('screen-overlay--visible');
    this.placementGoldWarning.classList.remove('screen-overlay--visible');
    this.settings.classList.remove('screen-overlay--visible');
    this.unitUpgradeShop.classList.remove('screen-overlay--visible');
  }

  /** `waveNumber` : la vague qui vient d'etre JOUEE (pas la suivante) —
   *  voir main.ts, waveBeingFought (capture avant l'increment de
   *  applyBattleOutcome). `runesEarned` (2026-08-13, point 4/6 de la demande
   *  d'Antoine sur la boutique d'amelioration) : 0 sur une defaite (jamais
   *  gagne dans ce cas, voir main.ts) — le texte reste vide plutot que
   *  d'afficher "+0 runes". */
  showWaveComplete(waveNumber: number, result: WaveResult, runesEarned = 0): void {
    this.waveCompleteTitle.textContent =
      result === 'victoire' ? `Vague ${waveNumber} terminée — Victoire` : `Vague ${waveNumber} terminée — Défaite`;
    this.waveCompleteRunes.textContent = runesEarned > 0 ? `+${runesEarned} runes d’amélioration` : '';
    this.show('waveComplete');
  }

  /** Toute l'armée du joueur est tombée (demande d'Antoine, 2026-08-09) : la
   *  run s'arrête net, pas de boutique ni de vague suivante — juste un
   *  retour au menu principal (même handler que "Quitter" en pause).
   *  `highestWaveReached` (refonte 2026-08-10, voir CLAUDE.md) : la
   *  progression permanente n'est plus "+1 point de talent" a chaque run,
   *  mais un record de vague — cet écran confirme juste qu'il a bien été
   *  sauvegardé (voir main.ts, registerWaveReached). */
  showGameOver(highestWaveReached: number): void {
    this.gameOverProgress.textContent = `Meilleure vague atteinte : ${highestWaveReached}.`;
    this.show('gameOver');
  }

  /** Affiche l'arbre de talents a jour — toujours appeler ceci plutôt que
   *  show('talents') directement, sinon le compteur/les nœuds resteraient
   *  périmés depuis la dernière ouverture. */
  showTalents(progress: MetaProgress): void {
    this.refreshTalents(progress);
    this.show('talents');
  }

  /** Remet a jour le record de vague, le compteur de points et l'etat visuel
   *  de chaque nœud — appelee a l'ouverture ET apres chaque achat (voir
   *  main.ts, onUnlockTalent), meme motif que refreshShop. */
  refreshTalents(progress: MetaProgress): void {
    this.progressWaveText.textContent = `Meilleure vague atteinte : ${progress.highestWaveReached}`;
    this.talentsPoints.textContent = `Points de talent : ${progress.talentPoints}`;
    for (const [id, node] of this.talentNodes) {
      const def = getTalent(id);
      const unlocked = isTalentUnlocked(progress, id);
      const unlockable = !unlocked && canUnlockTalent(progress, id);
      node.classList.toggle('talent-node--unlocked', unlocked);
      node.classList.toggle('talent-node--unlockable', unlockable);
      node.classList.toggle('talent-node--locked', !unlocked && !unlockable);
      node.disabled = !unlockable;

      const costEl = node.querySelector('.talent-node-cost');
      if (costEl) costEl.textContent = unlocked ? 'Débloqué' : `${def.cost} point${def.cost > 1 ? 's' : ''}`;
    }
    // Pas de recalcul de layout ici (2026-08-14, deuxieme refonte) : les
    // positions/connecteurs sont desormais calcules UNE SEULE FOIS a la
    // construction depuis des constantes de taille FIXES (voir
    // buildTalentTree/ui/talentTreeLayout.ts), jamais depuis des bounding
    // boxes DOM mesurees apres coup — rien ici ne peut plus les perimer.
  }

  /** Vrai si la boutique est actuellement affichee — permet au bouton
   *  "Boutique" pendant le placement de basculer entre ouvrir/fermer (voir
   *  main.ts, openShopFromPlacement) plutot que de toujours rouvrir. */
  isShopOpen(): boolean {
    return this.shop.classList.contains('screen-overlay--visible');
  }

  /** Vrai si l'ecran Parametres est actuellement affiche — utilise par
   *  main.ts pour router Echap correctement (fermer Parametres en premier,
   *  jamais basculer Pause par-dessus). */
  isSettingsOpen(): boolean {
    return this.settings.classList.contains('screen-overlay--visible');
  }

  /** Affiche la confirmation "Quitter" — toujours appeler ceci plutot que
   *  show('quitRunConfirm') directement : deplace le focus clavier sur
   *  "Annuler" (point 4 de la demande d'Antoine, 2026-08-16 — Entree ne doit
   *  jamais valider "Quitter" par defaut). */
  showQuitRunConfirm(): void {
    this.show('quitRunConfirm');
    this.quitRunCancelButton.focus();
  }

  /** Vrai si la confirmation "Quitter" est actuellement affichee — utilise
   *  par main.ts pour router Echap vers "Annuler" (retour Pause) plutot que
   *  vers la logique normale de reprise/pause (voir openPauseMenu, qui reste
   *  actif en arriere-plan pendant que cette confirmation est ouverte). */
  isQuitRunConfirmOpen(): boolean {
    return this.quitRunConfirm.classList.contains('screen-overlay--visible');
  }

  /** Ancre pour l'animation de gain/perte d'or pres de l'affichage de la
   *  boutique (voir main.ts, spawnCoinPopup apres un achat). */
  get shopGoldElement(): HTMLElement {
    return this.shopGold;
  }

  /** Affiche la boutique a jour pour la run en cours — toujours appeler ceci
   *  plutot que show('shop') directement, sinon l'or/les boutons resteraient
   *  perimes depuis le dernier passage. `progress` (2026-08-13) : le cout
   *  EFFECTIF des unites depend du niveau d'amelioration permanente, voir
   *  run/unitUpgradeEffects.ts. `canUndoLastPurchase` (2026-08-13) : active
   *  ou non le bouton "Annuler le dernier achat" (voir main.ts,
   *  lastUnitPurchase — Screens ne connait pas cet etat, main.ts le fournit
   *  a chaque appel). */
  showShop(run: RunState, progress: MetaProgress, canUndoLastPurchase: boolean): void {
    this.refreshShop(run, progress, canUndoLastPurchase);
    this.show('shop');
  }

  /** Remet a jour l'or affiche et l'activation des boutons — appele a
   *  l'ouverture de la boutique et apres chaque achat (voir main.ts), pour
   *  qu'un achat qui vide l'or desactive immediatement les autres sans
   *  attendre une reouverture de l'ecran. Le PRIX affiche de chaque objet
   *  achetable (pas seulement son activation) est aussi reecrit ici
   *  (2026-08-13, voir shopUnitPriceEls ; etendu aux consommables le
   *  2026-08-15) — contrairement au reste de cette boutique, ce prix n'est
   *  plus fige pour toujours a la construction. */
  refreshShop(run: RunState, progress: MetaProgress, canUndoLastPurchase: boolean): void {
    // formatGold (2026-08-15) : meme fonction que les prix ci-dessous, pour
    // qu'un residu de virgule flottante ne puisse jamais s'afficher ici non
    // plus — distinct de GoldHud (toFixed(1) systematique, voir
    // ui/goldHud.ts), qui reste inchange pour sa propre raison documentee.
    this.shopGoldAmount.textContent = formatGold(run.gold);

    const costFantassin = effectivePlayerUnitCost('fantassin', run.upgrades);
    const costArcher = effectivePlayerUnitCost('archer', run.upgrades);
    const costMage = effectivePlayerUnitCost('mage', run.upgrades);
    // Sentinelle (2026-08-15, chantier polish/equilibrage — REVIREMENT
    // explicite sur la decision "toujours 40" documentee auparavant, voir
    // data/sentinelUpgrade.ts) : cout desormais CROISSANT avec le niveau
    // d'amelioration permanente (effectivePlayerUnitCost route en interne
    // vers effectiveSentinelGoldCost pour cette unite precise).
    const costSentinel = effectivePlayerUnitCost('sentinel', run.upgrades);
    this.shopBuyFantassin.disabled = run.gold < costFantassin;
    this.shopBuyArcher.disabled = run.gold < costArcher;
    this.shopBuyMage.disabled = run.gold < costMage;
    this.shopBuySentinel.disabled = run.gold < costSentinel;
    const fantassinPriceEl = this.shopUnitPriceEls.get('fantassin');
    if (fantassinPriceEl) fantassinPriceEl.textContent = formatGold(costFantassin);
    const archerPriceEl = this.shopUnitPriceEls.get('archer');
    if (archerPriceEl) archerPriceEl.textContent = formatGold(costArcher);
    const magePriceEl = this.shopUnitPriceEls.get('mage');
    if (magePriceEl) magePriceEl.textContent = formatGold(costMage);
    const sentinelPriceEl = this.shopUnitPriceEls.get('sentinel');
    if (sentinelPriceEl) sentinelPriceEl.textContent = formatGold(costSentinel);

    // Boutons "×5" (2026-08-13) — desactives des que l'or ne couvre pas 5
    // achats d'affilee (le cout par unite reste CONSTANT sur ces 5 achats :
    // seule la boutique d'amelioration permanente, menu titre uniquement,
    // peut le faire varier — jamais en cours de run).
    const fantassinFiveEl = this.shopUnitBuyFiveEls.get('fantassin');
    if (fantassinFiveEl) fantassinFiveEl.disabled = run.gold < costFantassin * 5;
    const archerFiveEl = this.shopUnitBuyFiveEls.get('archer');
    if (archerFiveEl) archerFiveEl.disabled = run.gold < costArcher * 5;
    const mageFiveEl = this.shopUnitBuyFiveEls.get('mage');
    if (mageFiveEl) mageFiveEl.disabled = run.gold < costMage * 5;
    const sentinelFiveEl = this.shopUnitBuyFiveEls.get('sentinel');
    if (sentinelFiveEl) sentinelFiveEl.disabled = run.gold < costSentinel * 5;

    // Mage/Sentinelle reserves tant qu'ils n'ont pas ete vaincus au moins une
    // fois comme ennemis (2026-08-15, systeme GENERIQUE — voir data/units.ts,
    // playerUnlockMode/run/metaProgress.ts, canPlayerRecruitUnit) — la ligne
    // ENTIERE (bouton simple + ×5) est MASQUEE tant que l'unite n'est pas
    // debloquee ("elle ne doit afficher que les unités qui sont achetables").
    this.shopMageRow.style.display = canPlayerRecruitUnit(progress, 'mage') ? '' : 'none';
    this.shopSentinelRow.style.display = canPlayerRecruitUnit(progress, 'sentinel') ? '' : 'none';

    // Parchemin de soin — cout EFFECTIF (2026-08-15, chantier polish/
    // equilibrage) : base + niveau d'amelioration permanente x 0.5 (voir
    // run/healScrollUpgradeEffects.ts, effectiveHealScrollCost), jamais
    // `getItem(...).cost` seul desormais — SOURCE UNIQUE partagee avec le
    // calcul de la transaction reelle (main.ts, buyConsumable). Capacite
    // d'inventaire verifiee SEPAREMENT pour x1 (canAddItemToInventory, une
    // place suffit deja si une pile existante n'est pas pleine) et x5
    // (canAddItemsToInventory, verifie les 5 EN MEME TEMPS — jamais un achat
    // partiel silencieux).
    const costHeal = effectiveHealScrollCost(run.upgrades);
    this.shopBuyHealScroll.disabled = run.gold < costHeal || !canAddItemToInventory(run.inventory, 'heal_scroll_minor');
    const healPriceEl = this.shopUnitPriceEls.get('heal_scroll_minor');
    if (healPriceEl) healPriceEl.textContent = formatGold(costHeal);
    const healFiveEl = this.shopUnitBuyFiveEls.get('heal_scroll_minor');
    if (healFiveEl) {
      healFiveEl.disabled = run.gold < costHeal * 5 || !canAddItemsToInventory(run.inventory, 'heal_scroll_minor', 5);
    }

    // Nova de glace (2026-08-14) : Blizzard ne change JAMAIS le prix ni le
    // comportement du bouton (demande explicite) — seule la description
    // affichee en dessous s'enrichit une fois le talent debloque, jamais
    // "à la place de" (voir data/talents.ts, blizzard.description). Duree/
    // degats de tick LUS depuis l'amelioration permanente effective (voir
    // run/iceNovaUpgradeEffects.ts) plutot que le texte statique de
    // data/items.ts — sinon la description resterait perimee ("4 secondes")
    // des le premier niveau achete a la boutique d'amelioration. Cout
    // EFFECTIF (2026-08-15) — meme motif que le Parchemin de soin ci-dessus.
    const costIceNova = effectiveIceNovaCost(run.upgrades);
    this.shopBuyIceNova.disabled = run.gold < costIceNova || !canAddItemToInventory(run.inventory, 'ice_nova');
    const iceNovaPriceEl = this.shopUnitPriceEls.get('ice_nova');
    if (iceNovaPriceEl) iceNovaPriceEl.textContent = formatGold(costIceNova);
    const iceNovaFiveEl = this.shopUnitBuyFiveEls.get('ice_nova');
    if (iceNovaFiveEl) {
      iceNovaFiveEl.disabled = run.gold < costIceNova * 5 || !canAddItemsToInventory(run.inventory, 'ice_nova', 5);
    }
    const iceNovaEffects = computePlayerIceNovaUpgradeEffects(run.upgrades);
    this.shopIceNovaDescription.textContent = isTalentUnlocked(progress, 'blizzard')
      ? `Mode de ciblage au sol : immobilise pendant ${iceNovaEffects.rootDuration.toFixed(1)} secondes tous les ennemis présents dans la zone au moment de l’impact. Crée en plus un Blizzard infligeant ${iceNovaEffects.damagePerTickInternal / HP_PER_PIP} dégâts chaque seconde pendant ${iceNovaEffects.blizzardDuration.toFixed(1)} secondes.`
      : `Mode de ciblage au sol : immobilise pendant ${iceNovaEffects.rootDuration.toFixed(1)} secondes tous les ennemis présents dans la zone au moment de l’impact.`;

    // Bâtiments (2026-08-17, demande explicite d'Antoine) — desactive si
    // l'or est insuffisant : "n'entre même pas en placement mode" (point 9),
    // donc rien de plus a faire cote main.ts pour empecher ce cas — un clic
    // sur un bouton deja desactive n'appelle jamais son handler. Prix ET
    // description DYNAMIQUES (2026-08-18, correctif : le prix affiche sur le
    // bouton restait fige a la valeur de BASE depuis sa construction, jamais
    // reecrit malgre le mecanisme shopUnitPriceEls deja generique — voir
    // getEffectiveBuildingCost, SOURCE UNIQUE partagee avec la transaction
    // reelle dans main.ts).
    for (const buildingId of listBuyableBuildingIds()) {
      const cost = getEffectiveBuildingCost(buildingId, run.upgrades);
      const button = this.shopBuildingButtons.get(buildingId);
      if (button) button.disabled = run.gold < cost;
      const priceEl = this.shopUnitPriceEls.get(buildingId);
      if (priceEl) priceEl.textContent = formatGold(cost);
      const description = this.shopBuildingDescriptions.get(buildingId);
      if (description) description.textContent = this.describeBuildingShopItem(buildingId, run.upgrades, cost);
    }

    this.shopUndoLastPurchase.disabled = !canUndoLastPurchase;
  }

  /** Texte descriptif DYNAMIQUE d'un bâtiment achetable (2026-08-17) — la
   *  Mine/la Caserne affichent leur valeur EFFECTIVE (base + amelioration
   *  permanente), jamais un texte statique qui deviendrait perime des le
   *  premier niveau achete (meme motif que la description de la Nova de
   *  glace, voir refreshShop). Prefixe desormais par le cout EN PARTIE
   *  (2026-08-18, demande explicite d'Antoine, point 14 : "CASERNE / Coût :
   *  65 Gold / Produit automatiquement...") — `cost` deja calcule par
   *  l'appelant (refreshShop, getEffectiveBuildingCost), jamais recalcule
   *  ici. Generique par id pour le reste (pas un if/else code en dur a
   *  etendre a la main pour un futur bâtiment sans production/revenu —
   *  retombe sur juste la ligne de cout dans ce cas). */
  private describeBuildingShopItem(buildingId: string, levels: RunUpgradeLevels, cost: number): string {
    const costLine = `Coût : ${formatGold(cost)} Gold.`;
    if (buildingId === 'mine') {
      return `${costLine} Génère ${effectiveMineGoldPerSecond(levels).toFixed(1)} Gold par seconde tant que la bataille est en cours.`;
    }
    if (buildingId === 'barracks') {
      const count = effectiveBarracksSpawnCount(levels);
      const noun = count > 1 ? 'Fantassins' : 'Fantassin';
      return `${costLine} Produit automatiquement ${count} ${noun} toutes les ${effectiveBarracksSpawnInterval(levels).toFixed(0)} secondes pendant la bataille.`;
    }
    if (buildingId === 'forge') {
      return `${costLine} Permettra d’améliorer l’armée.`;
    }
    return costLine;
  }

  /** Affiche la boutique d'amelioration a jour — toujours appeler ceci
   *  plutot que show('unitUpgradeShop') directement (meme motif que
   *  showShop/showTalents). */
  showUnitUpgradeShop(progress: MetaProgress): void {
    this.refreshUnitUpgradeShop(progress);
    this.show('unitUpgradeShop');
  }

  /** Remet a jour le compteur de runes et chaque carte d'unite — appelee a
   *  l'ouverture ET apres chaque achat (voir main.ts, onPurchaseUnitUpgrade),
   *  meme motif que refreshShop/refreshTalents. */
  refreshUnitUpgradeShop(progress: MetaProgress): void {
    // Boutique du MENU : aucune run n'existe, elle affiche et achete les
    // niveaux PERMANENTS (MetaProgress.unitUpgrades), lus ici sous la forme
    // attendue par les formules d'effet. Transition jusqu'aux achats en run.
    const levels = copyMetaUpgradeLevelsForRun(progress);
    this.unitUpgradeRunesAmount.textContent = String(progress.upgradeRunes);
    for (const [unitId, refs] of this.unitUpgradeCards) {
      const def = getUnitUpgradeDef(unitId);
      if (!def) continue;
      const level = getUnitUpgradeLevel(progress, unitId);
      const hpBonus = upgradeHpBonusDisplay(def, level);
      const attackBonus = upgradeAttackBonusDisplay(def, level);
      const nextCost = effectiveUpgradeCost(progress, def, level);
      const remaining = upgradeRemainingUntilAttackBonus(def, level);
      const grantsAttack = upgradeNextPurchaseGrantsAttackBonus(def, level);

      refs.levelEl.textContent = `Niveau d’amélioration : ${level}`;
      refs.hpBonusEl.textContent = `PV : +${hpBonus}`;
      refs.attackBonusEl.textContent = `Attaque : +${attackBonus}`;
      refs.goldCostEl.textContent = `Coût en partie : ${effectivePlayerUnitCost(unitId, levels)}`;
      // Palier d'attaque mis en avant si le PROCHAIN achat le declenche
      // (point 27 de la demande : "rends-le tres clair").
      refs.nextUpgradeEl.textContent = grantsAttack
        ? `Prochaine amélioration : +1 PV, +1 ATTAQUE, +1 coût Gold`
        : `Prochaine amélioration : +1 PV`;
      refs.remainingAttackEl.textContent =
        remaining === 1 ? 'Prochain bonus ATK : dans 1 amélioration' : `Prochain bonus ATK : dans ${remaining} améliorations`;
      refs.runeCostEl.textContent = String(nextCost);
      refs.button.disabled = !canPurchaseUnitUpgrade(progress, unitId);
    }

    // Baliste (2026-08-13, etendue le 2026-08-16 avec le bonus de PV de la
    // tour) — voir run/ballistaUpgradeEffects.ts.
    {
      const level = ballistaUpgradeLevel(levels);
      const attackSpeedPct = Math.round(ballistaAttackSpeedBonus(level) * 100);
      const damageBonus = ballistaDamageBonusDisplay(level);
      const hpBonus = ballistaHpBonusDisplay(level);
      const nextCost = effectiveUpgradeCost(progress, BALLISTA_UPGRADE, level);
      const remaining = ballistaRemainingUntilDamageBonus(level);
      const grantsDamage = ballistaNextPurchaseGrantsDamageBonus(level);
      const refs = this.ballistaUpgradeCard;

      refs.levelEl.textContent = `Niveau : ${level}`;
      refs.hpBonusEl.textContent = `PV bonus : +${hpBonus}`;
      refs.attackSpeedEl.textContent = `Vitesse d’attaque : +${attackSpeedPct} %`;
      refs.damageEl.textContent = `Dégâts bonus : +${damageBonus}`;
      // +10 PV et +20% de cadence a CHAQUE achat (jamais un palier) ; +1
      // degat UNIQUEMENT si le PROCHAIN achat tombe sur un multiple de 3
      // (meme convention que les cartes d'unite, point 16 de la demande —
      // "je veux que le joueur voie clairement le palier important").
      refs.nextUpgradeEl.textContent = grantsDamage
        ? 'Prochaine amélioration : +10 PV, +20 % vitesse d’attaque, +1 DÉGÂT'
        : 'Prochaine amélioration : +10 PV, +20 % vitesse d’attaque';
      refs.remainingDamageEl.textContent =
        remaining === 1
          ? 'Prochain bonus de dégâts : dans 1 amélioration'
          : `Prochain bonus de dégâts : dans ${remaining} améliorations`;
      refs.runeCostEl.textContent = String(nextCost);
      refs.button.disabled = !canPurchaseUpgrade(progress, BALLISTA_UPGRADE.id, BALLISTA_UPGRADE);
    }

    // Parchemin de soin (2026-08-13) — voir run/healScrollUpgradeEffects.ts.
    {
      const level = healScrollUpgradeLevel(levels);
      const healBonus = healBonusDisplay(level);
      const secondaryCount = healSecondaryTargetCount(level);
      const nextCost = effectiveUpgradeCost(progress, HEAL_SCROLL_UPGRADE, level);
      const remaining = healRemainingUntilNextTarget(level);
      const grantsTarget = healNextPurchaseGrantsExtraTarget(level);
      const refs = this.healScrollUpgradeCard;
      const baseHealDisplay = getHealEffectAmount('heal_scroll_minor') / HP_PER_PIP;

      refs.levelEl.textContent = `Niveau : ${level}`;
      refs.healEl.textContent = `Soin : +${healBonus} HP (total ${baseHealDisplay + healBonus} HP)`;
      refs.secondaryCountEl.textContent = `Alliés secondaires : ${secondaryCount}`;
      refs.secondaryRatioEl.textContent = `Soin secondaire : ${Math.round(HEAL_SCROLL_UPGRADE.secondaryHealRatio * 100)} %`;
      // Palier de cible supplementaire mis en avant si le PROCHAIN achat le
      // declenche (point 32 de la demande).
      refs.nextUpgradeEl.textContent = grantsTarget
        ? 'Prochaine amélioration : +1 soin, +1 allié secondaire à 50 %'
        : 'Prochaine amélioration : +1 soin';
      refs.remainingTargetEl.textContent =
        remaining === 1
          ? 'Prochain allié supplémentaire : dans 1 amélioration'
          : `Prochain allié supplémentaire : dans ${remaining} améliorations`;
      refs.runeCostEl.textContent = String(nextCost);
      refs.button.disabled = !canPurchaseUpgrade(progress, HEAL_SCROLL_UPGRADE.id, HEAL_SCROLL_UPGRADE);
    }

    // Nova de glace (2026-08-14) — voir run/iceNovaUpgradeEffects.ts. Duree
    // du Root (immobilisation, TOUJOURS active) et duree de la zone Blizzard
    // (degats, agit seulement si le talent Blizzard est debloque) affichees
    // separement — meme bonus partage, mais deux effets gameplay distincts.
    {
      const effects = computePlayerIceNovaUpgradeEffects(levels);
      const nextCost = effectiveUpgradeCost(progress, ICE_NOVA_UPGRADE, effects.level);
      const remaining = iceNovaRemainingUntilDamageBonus(effects.level);
      const grantsDamage = iceNovaNextPurchaseGrantsDamageBonus(effects.level);
      const refs = this.iceNovaUpgradeCard;

      refs.levelEl.textContent = `Niveau : ${effects.level}`;
      refs.rootDurationEl.textContent = `Immobilisation : ${effects.rootDuration.toFixed(1)} s`;
      refs.blizzardDurationEl.textContent = `Durée des dégâts (zone) : ${effects.blizzardDuration.toFixed(1)} s`;
      refs.damageEl.textContent = `Dégâts de tick : +${effects.damageBonusDisplay}`;
      // Palier de degats mis en avant si le PROCHAIN achat le declenche
      // (meme convention que les autres cartes a palier).
      refs.nextUpgradeEl.textContent = grantsDamage
        ? 'Prochaine amélioration : +0,5 s de durée, +1 DÉGÂT de tick'
        : 'Prochaine amélioration : +0,5 s de durée';
      refs.remainingDamageEl.textContent =
        remaining === 1
          ? 'Prochain bonus de dégâts : dans 1 amélioration'
          : `Prochain bonus de dégâts : dans ${remaining} améliorations`;
      refs.runeCostEl.textContent = String(nextCost);
      refs.button.disabled = !canPurchaseUpgrade(progress, ICE_NOVA_UPGRADE.id, ICE_NOVA_UPGRADE);
    }

    // Mine (2026-08-14) — voir run/mineUpgradeEffects.ts. TOUJOURS visible
    // depuis le 2026-08-17 (la Mine est devenue un bâtiment achetable en
    // boutique de RUN, plus liee a un talent — voir data/buildings.ts) :
    // ameliorer une Mine pas encore achetee cette run reste valide (point 40
    // de la demande, "pas besoin d'avoir une Caserne posée").
    {
      const refs = this.mineUpgradeCard;
      const level = mineUpgradeLevel(levels);
      const goldPerSecond = MINE_BASE_GOLD_PER_SECOND + mineGoldPerSecondBonus(level);
      const nextCost = effectiveUpgradeCost(progress, MINE_UPGRADE, level);

      refs.levelEl.textContent = `Niveau : ${level}`;
      refs.goldPerSecondEl.textContent = `Or/seconde : ${goldPerSecond.toFixed(1)}`;
      refs.nextUpgradeEl.textContent = 'Prochaine amélioration : +0,2 or/seconde';
      refs.runeCostEl.textContent = String(nextCost);
      refs.button.disabled = !canPurchaseUpgrade(progress, MINE_UPGRADE.id, MINE_UPGRADE);
    }

    // Caserne (2026-08-17, REFONTE le meme jour — voir
    // run/barracksUpgradeEffects.ts) : deux effets par niveau, TOUJOURS
    // visible (meme principe que la Mine ci-dessus), plus de plafond/etat
    // "MAX" (le bonus de nombre de Fantassins reste utile a tout niveau).
    {
      const refs = this.barracksUpgradeCard;
      const level = barracksUpgradeLevel(levels);
      const count = effectiveBarracksSpawnCount(levels);
      const interval = effectiveBarracksSpawnInterval(levels);
      const minInterval = getBuilding('barracks').spawner?.minIntervalSeconds ?? interval;
      const remaining = barracksRemainingUntilIntervalMilestone(level);
      const grantsInterval = barracksNextPurchaseGrantsIntervalMilestone(level);

      refs.levelEl.textContent = `Niveau : ${level}`;
      refs.countEl.textContent = `Fantassins par production : ${count}`;
      refs.intervalEl.textContent = `Intervalle actuel : ${interval.toFixed(0)} s`;
      // +1 Fantassin a CHAQUE achat ; -1s d'intervalle SEULEMENT si le
      // PROCHAIN achat tombe sur un palier de 3 (meme convention que les
      // autres cartes a palier — Baliste/Nova de glace/Sentinelle).
      refs.nextUpgradeEl.textContent = grantsInterval
        ? 'Prochaine amélioration : +1 Fantassin, -1 s d’intervalle'
        : 'Prochaine amélioration : +1 Fantassin';
      // Une fois le plancher d'intervalle atteint, un palier de reduction ne
      // change plus rien (Math.max deja applique) — le dire honnetement
      // plutot que de continuer a promettre une reduction qui n'aura plus
      // d'effet (le bonus de NOMBRE, lui, reste toujours utile).
      refs.remainingIntervalEl.textContent =
        interval <= minInterval
          ? `Intervalle déjà au minimum (${minInterval.toFixed(0)} s)`
          : remaining === 1
            ? 'Prochaine réduction d’intervalle : dans 1 amélioration'
            : `Prochaine réduction d’intervalle : dans ${remaining} améliorations`;
      refs.runeCostEl.textContent = String(effectiveUpgradeCost(progress, BARRACKS_UPGRADE, level));
      refs.button.disabled = !canPurchaseUpgrade(progress, BARRACKS_UPGRADE.id, BARRACKS_UPGRADE);
    }

    // Sentinelle (2026-08-14) — voir run/sentinelUpgradeEffects.ts. PAS de
    // ligne "Attaque" (contrairement aux cartes d'unite generiques) : cette
    // amelioration ne donne jamais d'attaque, seulement PV + Bouclier par
    // ennemi provoque.
    {
      const effects = computePlayerSentinelUpgradeEffects(levels);
      const nextCost = effectiveUpgradeCost(progress, SENTINEL_UPGRADE, effects.level);
      const remaining = sentinelRemainingUntilShieldBonus(effects.level);
      const grantsShield = sentinelNextPurchaseGrantsShieldBonus(effects.level);
      const refs = this.sentinelUpgradeCard;

      refs.levelEl.textContent = `Niveau : ${effects.level}`;
      refs.hpBonusEl.textContent = `PV : +${effects.hpBonusDisplay}`;
      refs.shieldPerEnemyEl.textContent = `Bouclier / ennemi provoqué : ${effects.effectiveShieldPerEnemyDisplay}`;
      // Palier de bouclier mis en avant si le PROCHAIN achat le declenche
      // (meme convention que les autres cartes a palier).
      refs.nextUpgradeEl.textContent = grantsShield
        ? 'Prochaine amélioration : +5 PV, +1 Bouclier / ennemi provoqué'
        : 'Prochaine amélioration : +5 PV';
      refs.remainingShieldEl.textContent =
        remaining === 1
          ? 'Prochain bonus de bouclier : dans 1 amélioration'
          : `Prochain bonus de bouclier : dans ${remaining} améliorations`;
      refs.runeCostEl.textContent = String(nextCost);
      refs.button.disabled = !canPurchaseUpgrade(progress, SENTINEL_UPGRADE.id, SENTINEL_UPGRADE);
    }

    // Soins excédentaires (2026-08-15) — voir run/shadowUpgradeEffects.ts.
    // Carte MASQUEE tant que le talent du meme nom n'est pas debloque (le
    // niveau deja achete, lui, N'EST JAMAIS PERDU — voir data/shadowUpgrade.ts) :
    // meme convention que la Mine.
    {
      const refs = this.shadowUpgradeCard;
      const unlocked = isTalentUnlocked(progress, 'soins_excedentaires');
      refs.card.style.display = unlocked ? '' : 'none';
      if (unlocked) {
        const level = shadowUpgradeLevel(levels);
        const damage = shadowDamagePerProjectileDisplay(level);
        const bonusCount = shadowBonusProjectileCount(level);
        const nextCost = effectiveUpgradeCost(progress, SHADOW_UPGRADE, level);
        const remaining = shadowRemainingUntilBonusProjectile(level);
        const grantsBonus = shadowNextPurchaseGrantsBonusProjectile(level);

        refs.levelEl.textContent = `Niveau : ${level}`;
        refs.damageEl.textContent = `Dégâts par projectile : ${damage}`;
        refs.bonusCountEl.textContent = `Projectiles bonus par soin excédentaire : +${bonusCount}`;
        refs.nextUpgradeEl.textContent = grantsBonus
          ? 'Prochaine amélioration : +0,5 dégât, +1 projectile bonus'
          : 'Prochaine amélioration : +0,5 dégât';
        refs.remainingBonusEl.textContent =
          remaining === 1
            ? 'Prochain projectile bonus : dans 1 amélioration'
            : `Prochain projectile bonus : dans ${remaining} améliorations`;
        refs.runeCostEl.textContent = String(nextCost);
        refs.button.disabled = !canPurchaseUpgrade(progress, SHADOW_UPGRADE.id, SHADOW_UPGRADE);
      }
    }
  }

  /** Construit une carte GENERIQUE de la boutique d'amelioration pour UNE
   *  unite (voir refreshUnitUpgradeShop pour le remplissage des valeurs) —
   *  aucun id d'unite code en dur au-dela du nom/de l'icone du bouton
   *  d'achat, point 7 de la demande. */
  private buildUnitUpgradeCard(unitId: string, handlers: ScreenHandlers): HTMLElement {
    const def = getUnit(unitId);
    const card = document.createElement('div');
    card.className = 'upgrade-card';

    const nameEl = document.createElement('h3');
    nameEl.className = 'upgrade-card-name';
    nameEl.textContent = def.name;

    const levelEl = document.createElement('p');
    levelEl.className = 'upgrade-card-line';
    const hpBonusEl = document.createElement('p');
    hpBonusEl.className = 'upgrade-card-line';
    const attackBonusEl = document.createElement('p');
    attackBonusEl.className = 'upgrade-card-line';
    const goldCostGroup = document.createElement('p');
    goldCostGroup.className = 'upgrade-card-line';
    const goldCostEl = document.createElement('span');
    goldCostGroup.append(goldCostEl, ' ', createCoinIcon(12));
    const nextUpgradeEl = document.createElement('p');
    nextUpgradeEl.className = 'upgrade-card-line upgrade-card-next';
    const remainingAttackEl = document.createElement('p');
    remainingAttackEl.className = 'upgrade-card-line upgrade-card-dim';

    const buyRow = document.createElement('div');
    buyRow.className = 'upgrade-card-buy-row';
    const runeCostEl = document.createElement('span');
    const runeCostGroup = document.createElement('span');
    runeCostGroup.className = 'shop-item-price-group';
    runeCostGroup.append(runeCostEl, createRuneIcon(14));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-button upgrade-card-button';
    button.textContent = 'Améliorer';
    button.addEventListener('mouseenter', () => this.uiSound.hover());
    button.addEventListener('click', () => {
      this.uiSound.click();
      handlers.onPurchaseUnitUpgrade(unitId);
    });
    buyRow.append(runeCostGroup, button);

    card.append(nameEl, levelEl, hpBonusEl, attackBonusEl, goldCostGroup, nextUpgradeEl, remainingAttackEl, buyRow);

    this.unitUpgradeCards.set(unitId, {
      button,
      levelEl,
      hpBonusEl,
      attackBonusEl,
      goldCostEl,
      nextUpgradeEl,
      remainingAttackEl,
      runeCostEl,
    });

    return card;
  }

  /** Carte "Baliste" (2026-08-13, boutique d'amelioration) — cadence de tir
   *  en %, pas de PV : shape different de buildUnitUpgradeCard, construite
   *  a part. */
  private buildBallistaUpgradeCard(handlers: ScreenHandlers): { card: HTMLElement; refs: BallistaUpgradeCardRefs } {
    const card = document.createElement('div');
    card.className = 'upgrade-card';

    const nameEl = document.createElement('h3');
    nameEl.className = 'upgrade-card-name';
    nameEl.textContent = 'Baliste';

    const levelEl = document.createElement('p');
    levelEl.className = 'upgrade-card-line';
    const attackSpeedEl = document.createElement('p');
    attackSpeedEl.className = 'upgrade-card-line';
    const damageEl = document.createElement('p');
    damageEl.className = 'upgrade-card-line';
    // PV bonus de la tour (2026-08-16, demande explicite d'Antoine) — meme
    // ligne "upgrade-card-line" que les 3 autres, juste au-dessus (ordre
    // "PV bonus / Vitesse d'attaque / Dégâts bonus" demande point 15).
    const hpBonusEl = document.createElement('p');
    hpBonusEl.className = 'upgrade-card-line';
    const nextUpgradeEl = document.createElement('p');
    nextUpgradeEl.className = 'upgrade-card-line upgrade-card-next';
    const remainingDamageEl = document.createElement('p');
    remainingDamageEl.className = 'upgrade-card-line upgrade-card-dim';

    const buyRow = document.createElement('div');
    buyRow.className = 'upgrade-card-buy-row';
    const runeCostEl = document.createElement('span');
    const runeCostGroup = document.createElement('span');
    runeCostGroup.className = 'shop-item-price-group';
    runeCostGroup.append(runeCostEl, createRuneIcon(14));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-button upgrade-card-button';
    button.textContent = 'Améliorer';
    button.addEventListener('mouseenter', () => this.uiSound.hover());
    button.addEventListener('click', () => {
      this.uiSound.click();
      handlers.onPurchaseUnitUpgrade(BALLISTA_UPGRADE.id);
    });
    buyRow.append(runeCostGroup, button);

    card.append(nameEl, levelEl, hpBonusEl, attackSpeedEl, damageEl, nextUpgradeEl, remainingDamageEl, buyRow);

    return {
      card,
      refs: { button, levelEl, attackSpeedEl, damageEl, hpBonusEl, nextUpgradeEl, remainingDamageEl, runeCostEl },
    };
  }

  /** Carte "Parchemin de soin" (2026-08-13, boutique d'amelioration) — soin +
   *  cibles secondaires, shape different de buildUnitUpgradeCard. */
  private buildHealScrollUpgradeCard(handlers: ScreenHandlers): { card: HTMLElement; refs: HealScrollUpgradeCardRefs } {
    const card = document.createElement('div');
    card.className = 'upgrade-card';

    const nameEl = document.createElement('h3');
    nameEl.className = 'upgrade-card-name';
    nameEl.textContent = 'Parchemin de soin';

    const levelEl = document.createElement('p');
    levelEl.className = 'upgrade-card-line';
    const healEl = document.createElement('p');
    healEl.className = 'upgrade-card-line';
    const secondaryCountEl = document.createElement('p');
    secondaryCountEl.className = 'upgrade-card-line';
    const secondaryRatioEl = document.createElement('p');
    secondaryRatioEl.className = 'upgrade-card-line';
    const nextUpgradeEl = document.createElement('p');
    nextUpgradeEl.className = 'upgrade-card-line upgrade-card-next';
    const remainingTargetEl = document.createElement('p');
    remainingTargetEl.className = 'upgrade-card-line upgrade-card-dim';

    const buyRow = document.createElement('div');
    buyRow.className = 'upgrade-card-buy-row';
    const runeCostEl = document.createElement('span');
    const runeCostGroup = document.createElement('span');
    runeCostGroup.className = 'shop-item-price-group';
    runeCostGroup.append(runeCostEl, createRuneIcon(14));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-button upgrade-card-button';
    button.textContent = 'Améliorer';
    button.addEventListener('mouseenter', () => this.uiSound.hover());
    button.addEventListener('click', () => {
      this.uiSound.click();
      handlers.onPurchaseUnitUpgrade(HEAL_SCROLL_UPGRADE.id);
    });
    buyRow.append(runeCostGroup, button);

    card.append(nameEl, levelEl, healEl, secondaryCountEl, secondaryRatioEl, nextUpgradeEl, remainingTargetEl, buyRow);

    return { card, refs: { button, levelEl, healEl, secondaryCountEl, secondaryRatioEl, nextUpgradeEl, remainingTargetEl, runeCostEl } };
  }

  /** Carte "Nova de glace" (2026-08-14, boutique d'amelioration) — duree
   *  (Root + zone Blizzard) + degats de tick, shape different de
   *  buildUnitUpgradeCard. */
  private buildIceNovaUpgradeCard(handlers: ScreenHandlers): { card: HTMLElement; refs: IceNovaUpgradeCardRefs } {
    const card = document.createElement('div');
    card.className = 'upgrade-card';

    const nameEl = document.createElement('h3');
    nameEl.className = 'upgrade-card-name';
    nameEl.textContent = 'Nova de glace';

    const levelEl = document.createElement('p');
    levelEl.className = 'upgrade-card-line';
    const rootDurationEl = document.createElement('p');
    rootDurationEl.className = 'upgrade-card-line';
    const blizzardDurationEl = document.createElement('p');
    blizzardDurationEl.className = 'upgrade-card-line';
    const damageEl = document.createElement('p');
    damageEl.className = 'upgrade-card-line';
    const nextUpgradeEl = document.createElement('p');
    nextUpgradeEl.className = 'upgrade-card-line upgrade-card-next';
    const remainingDamageEl = document.createElement('p');
    remainingDamageEl.className = 'upgrade-card-line upgrade-card-dim';

    const buyRow = document.createElement('div');
    buyRow.className = 'upgrade-card-buy-row';
    const runeCostEl = document.createElement('span');
    const runeCostGroup = document.createElement('span');
    runeCostGroup.className = 'shop-item-price-group';
    runeCostGroup.append(runeCostEl, createRuneIcon(14));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-button upgrade-card-button';
    button.textContent = 'Améliorer';
    button.addEventListener('mouseenter', () => this.uiSound.hover());
    button.addEventListener('click', () => {
      this.uiSound.click();
      handlers.onPurchaseUnitUpgrade(ICE_NOVA_UPGRADE.id);
    });
    buyRow.append(runeCostGroup, button);

    card.append(nameEl, levelEl, rootDurationEl, blizzardDurationEl, damageEl, nextUpgradeEl, remainingDamageEl, buyRow);

    return { card, refs: { button, levelEl, rootDurationEl, blizzardDurationEl, damageEl, nextUpgradeEl, remainingDamageEl, runeCostEl } };
  }

  /** Carte "Mine" (2026-08-14, boutique d'amelioration) — or/seconde, shape
   *  different de buildUnitUpgradeCard. MASQUEE (voir refreshUnitUpgradeShop)
   *  tant que le talent "Le temps, c'est de l'argent" n'est pas debloque —
   *  meme convention que l'ancien deblocage du Cavalier ("elle ne doit
   *  afficher que ce qui est réellement achetable"). */
  private buildMineUpgradeCard(handlers: ScreenHandlers): MineUpgradeCardRefs {
    const card = document.createElement('div');
    card.className = 'upgrade-card';

    const nameEl = document.createElement('h3');
    nameEl.className = 'upgrade-card-name';
    nameEl.textContent = 'Mine';

    const levelEl = document.createElement('p');
    levelEl.className = 'upgrade-card-line';
    const goldPerSecondEl = document.createElement('p');
    goldPerSecondEl.className = 'upgrade-card-line';
    const nextUpgradeEl = document.createElement('p');
    nextUpgradeEl.className = 'upgrade-card-line upgrade-card-next';

    const buyRow = document.createElement('div');
    buyRow.className = 'upgrade-card-buy-row';
    const runeCostEl = document.createElement('span');
    const runeCostGroup = document.createElement('span');
    runeCostGroup.className = 'shop-item-price-group';
    runeCostGroup.append(runeCostEl, createRuneIcon(14));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-button upgrade-card-button';
    button.textContent = 'Améliorer';
    button.addEventListener('mouseenter', () => this.uiSound.hover());
    button.addEventListener('click', () => {
      this.uiSound.click();
      handlers.onPurchaseUnitUpgrade(MINE_UPGRADE.id);
    });
    buyRow.append(runeCostGroup, button);

    card.append(nameEl, levelEl, goldPerSecondEl, nextUpgradeEl, buyRow);

    return { card, button, levelEl, goldPerSecondEl, nextUpgradeEl, runeCostEl };
  }

  /** Carte "Caserne" (2026-08-17, boutique d'amelioration — REFONTE le meme
   *  jour, demande explicite d'Antoine : "l'amélioration augmente le nombre
   *  de fantassin invoqué de 1... toutes les 3 amélioration réduit le délai
   *  d'invocation de 1sec"). Deux effets par CHAQUE achat (nombre de
   *  Fantassins, toujours) + un palier tous les 3 achats (intervalle) — plus
   *  de plafond/etat "MAX" (voir CLAUDE.md, le bonus de nombre reste utile a
   *  tout niveau). */
  private buildBarracksUpgradeCard(handlers: ScreenHandlers): BarracksUpgradeCardRefs {
    const card = document.createElement('div');
    card.className = 'upgrade-card';

    const nameEl = document.createElement('h3');
    nameEl.className = 'upgrade-card-name';
    nameEl.textContent = 'Caserne';

    const levelEl = document.createElement('p');
    levelEl.className = 'upgrade-card-line';
    const countEl = document.createElement('p');
    countEl.className = 'upgrade-card-line';
    const intervalEl = document.createElement('p');
    intervalEl.className = 'upgrade-card-line';
    const nextUpgradeEl = document.createElement('p');
    nextUpgradeEl.className = 'upgrade-card-line upgrade-card-next';
    const remainingIntervalEl = document.createElement('p');
    remainingIntervalEl.className = 'upgrade-card-line upgrade-card-dim';

    const buyRow = document.createElement('div');
    buyRow.className = 'upgrade-card-buy-row';
    const runeCostEl = document.createElement('span');
    const runeCostGroup = document.createElement('span');
    runeCostGroup.className = 'shop-item-price-group';
    runeCostGroup.append(runeCostEl, createRuneIcon(14));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-button upgrade-card-button';
    button.textContent = 'Améliorer';
    button.addEventListener('mouseenter', () => this.uiSound.hover());
    button.addEventListener('click', () => {
      this.uiSound.click();
      handlers.onPurchaseUnitUpgrade(BARRACKS_UPGRADE.id);
    });
    buyRow.append(runeCostGroup, button);

    card.append(nameEl, levelEl, countEl, intervalEl, nextUpgradeEl, remainingIntervalEl, buyRow);

    return { card, button, levelEl, countEl, intervalEl, nextUpgradeEl, remainingIntervalEl, runeCostEl, runeCostGroup };
  }

  /** Carte "Sentinelle" (2026-08-14, boutique d'amelioration) — PV + Bouclier
   *  par ennemi provoque, JAMAIS d'Attaque (voir data/sentinelUpgrade.ts) :
   *  shape different de buildUnitUpgradeCard, toujours visible (contrairement
   *  a la Mine, jamais masquee). */
  private buildSentinelUpgradeCard(handlers: ScreenHandlers): { card: HTMLElement; refs: SentinelUpgradeCardRefs } {
    const card = document.createElement('div');
    card.className = 'upgrade-card';

    const nameEl = document.createElement('h3');
    nameEl.className = 'upgrade-card-name';
    nameEl.textContent = 'Sentinelle';

    const levelEl = document.createElement('p');
    levelEl.className = 'upgrade-card-line';
    const hpBonusEl = document.createElement('p');
    hpBonusEl.className = 'upgrade-card-line';
    const shieldPerEnemyEl = document.createElement('p');
    shieldPerEnemyEl.className = 'upgrade-card-line';
    const nextUpgradeEl = document.createElement('p');
    nextUpgradeEl.className = 'upgrade-card-line upgrade-card-next';
    const remainingShieldEl = document.createElement('p');
    remainingShieldEl.className = 'upgrade-card-line upgrade-card-dim';

    const buyRow = document.createElement('div');
    buyRow.className = 'upgrade-card-buy-row';
    const runeCostEl = document.createElement('span');
    const runeCostGroup = document.createElement('span');
    runeCostGroup.className = 'shop-item-price-group';
    runeCostGroup.append(runeCostEl, createRuneIcon(14));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-button upgrade-card-button';
    button.textContent = 'Améliorer';
    button.addEventListener('mouseenter', () => this.uiSound.hover());
    button.addEventListener('click', () => {
      this.uiSound.click();
      handlers.onPurchaseUnitUpgrade(SENTINEL_UPGRADE.id);
    });
    buyRow.append(runeCostGroup, button);

    card.append(nameEl, levelEl, hpBonusEl, shieldPerEnemyEl, nextUpgradeEl, remainingShieldEl, buyRow);

    return { card, refs: { button, levelEl, hpBonusEl, shieldPerEnemyEl, nextUpgradeEl, remainingShieldEl, runeCostEl } };
  }

  /** Carte "Soins excédentaires" (2026-08-15, boutique d'amelioration) —
   *  Degats par projectile + Bonus de nombre de projectiles (palier tous les
   *  3 achats), MASQUEE (voir refreshUnitUpgradeShop) tant que le talent du
   *  meme nom n'est pas debloque — meme convention que la Mine. */
  private buildShadowUpgradeCard(handlers: ScreenHandlers): ShadowUpgradeCardRefs {
    const card = document.createElement('div');
    card.className = 'upgrade-card';

    const nameEl = document.createElement('h3');
    nameEl.className = 'upgrade-card-name';
    nameEl.textContent = 'Soins excédentaires';

    const levelEl = document.createElement('p');
    levelEl.className = 'upgrade-card-line';
    const damageEl = document.createElement('p');
    damageEl.className = 'upgrade-card-line';
    const bonusCountEl = document.createElement('p');
    bonusCountEl.className = 'upgrade-card-line';
    const nextUpgradeEl = document.createElement('p');
    nextUpgradeEl.className = 'upgrade-card-line upgrade-card-next';
    const remainingBonusEl = document.createElement('p');
    remainingBonusEl.className = 'upgrade-card-line upgrade-card-dim';

    const buyRow = document.createElement('div');
    buyRow.className = 'upgrade-card-buy-row';
    const runeCostEl = document.createElement('span');
    const runeCostGroup = document.createElement('span');
    runeCostGroup.className = 'shop-item-price-group';
    runeCostGroup.append(runeCostEl, createRuneIcon(14));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-button upgrade-card-button';
    button.textContent = 'Améliorer';
    button.addEventListener('mouseenter', () => this.uiSound.hover());
    button.addEventListener('click', () => {
      this.uiSound.click();
      handlers.onPurchaseUnitUpgrade(SHADOW_UPGRADE.id);
    });
    buyRow.append(runeCostGroup, button);

    card.append(nameEl, levelEl, damageEl, bonusCountEl, nextUpgradeEl, remainingBonusEl, buyRow);

    return { card, button, levelEl, damageEl, bonusCountEl, nextUpgradeEl, remainingBonusEl, runeCostEl };
  }

  /** Bascule quel onglet de la boutique est visible (2026-08-11) — voir le
   *  constructeur pour la construction des onglets/panneaux. */
  private setShopTab(tab: 'units' | 'buildings' | 'battle-scrolls'): void {
    this.shopTabUnits.classList.toggle('shop-tab--active', tab === 'units');
    this.shopTabBuildings.classList.toggle('shop-tab--active', tab === 'buildings');
    this.shopTabBattleScrolls.classList.toggle('shop-tab--active', tab === 'battle-scrolls');
    this.shopPanelUnits.classList.toggle('shop-tab-content--active', tab === 'units');
    this.shopPanelBuildings.classList.toggle('shop-tab-content--active', tab === 'buildings');
    this.shopPanelBattleScrolls.classList.toggle('shop-tab-content--active', tab === 'battle-scrolls');
  }

  private tabButton(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shop-tab';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  private shopTabPanel(children: HTMLElement[]): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'shop-tab-content';
    panel.append(...children);
    return panel;
  }

  private screenEl(name: ScreenName): HTMLElement {
    switch (name) {
      case 'menu':
        return this.menu;
      case 'talents':
        return this.talents;
      case 'waveComplete':
        return this.waveComplete;
      case 'shop':
        return this.shop;
      case 'pause':
        return this.pause;
      case 'quitRunConfirm':
        return this.quitRunConfirm;
      case 'gameOver':
        return this.gameOver;
      case 'resetConfirm':
        return this.resetConfirm;
      case 'resetTalentsConfirm':
        return this.resetTalentsConfirm;
      case 'placementGoldWarning':
        return this.placementGoldWarning;
      case 'settings':
        return this.settings;
      case 'unitUpgradeShop':
        return this.unitUpgradeShop;
    }
  }

  /** Affiche l'ecran Parametres a jour — toujours appeler ceci plutot que
   *  show('settings') directement (meme motif que showShop/showTalents). */
  showSettings(audio: AudioSettings): void {
    this.refreshSettings(audio);
    this.show('settings');
  }

  /** Remet les 3 curseurs + la case Muet en phase avec l'etat REEL du moteur
   *  audio — appelee a l'ouverture (les valeurs ont pu changer ailleurs,
   *  meme si rien d'autre ne les modifie pour l'instant) et jamais pendant
   *  le glisser d'un curseur (l'input lui-meme fait deja son propre
   *  affichage en temps reel, voir sliderControl). */
  refreshSettings(audio: AudioSettings): void {
    this.setSliderValue(this.settingsMaster, audio.masterVolume);
    this.setSliderValue(this.settingsMusic, audio.musicVolume);
    this.setSliderValue(this.settingsSfx, audio.sfxVolume);
    this.settingsMuted.input.checked = audio.muted;
  }

  private setSliderValue(slider: SliderControl, value0to1: number): void {
    const pct = Math.round(value0to1 * 100);
    slider.input.value = String(pct);
    slider.valueLabel.textContent = `${pct} %`;
  }

  /** Curseur de volume stylise (2026-08-12) — `<input type=range>` natif
   *  (compatible souris/tactile "gratuitement") mais entierement redessine
   *  en CSS (voir style.css, .settings-slider) pour ne pas ressembler a un
   *  controle de navigateur brut, demande explicite d'Antoine. Affichage
   *  0-100% cote UI, `onChange` reçoit 0..1 — l'evenement 'input' (pas
   *  'change') declenche l'application en temps reel a chaque deplacement,
   *  sans bouton Appliquer. */
  private sliderControl(label: string, onChange: (value0to1: number) => void): SliderControl {
    const row = document.createElement('div');
    row.className = 'settings-slider-row';

    const labelRow = document.createElement('div');
    labelRow.className = 'settings-slider-label-row';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueLabel = document.createElement('span');
    valueLabel.className = 'settings-slider-value';
    labelRow.append(labelEl, valueLabel);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = '0';
    input.className = 'settings-slider';
    input.addEventListener('input', () => {
      const pct = Number(input.value);
      valueLabel.textContent = `${pct} %`;
      onChange(pct / 100);
    });

    row.append(labelRow, input);
    return { row, input, valueLabel };
  }

  /** Case a cocher stylisee (meme raison que sliderControl : pas l'apparence
   *  brute du navigateur). Structure label > input + 2 span, pour que le
   *  CSS puisse cibler `input:checked ~ .settings-checkbox-box` (voir
   *  style.css). */
  private checkboxControl(label: string, onChange: (checked: boolean) => void): { row: HTMLElement; input: HTMLInputElement } {
    const row = document.createElement('label');
    row.className = 'settings-checkbox-row';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'settings-checkbox-input';
    input.addEventListener('change', () => onChange(input.checked));

    const box = document.createElement('span');
    box.className = 'settings-checkbox-box';
    const labelEl = document.createElement('span');
    labelEl.className = 'settings-checkbox-label';
    labelEl.textContent = label;

    row.append(input, box, labelEl);
    return { row, input };
  }

  /** Affiche la barriere de securite "il vous reste de l'or" — voir
   *  ScreenHandlers.onConfirmPlacementWithGold. */
  showPlacementGoldWarning(goldRemaining: number): void {
    this.placementGoldWarningText.textContent =
      `Il vous reste ${goldRemaining} or non dépensé. Lancer la bataille quand même ?`;
    this.show('placementGoldWarning');
  }

  /**
   * DEUXIEME refonte visuelle 2026-08-14 (demande complete d'Antoine, ~37
   * sections) : le premier essai (une ligne flexbox par palier,
   * `justify-content: center`) affichait bien "un palier = une ligne", mais
   * traitait chaque ligne comme une simple LISTE centree — perdant la
   * relation "cette carte est centree sous SON parent" (Recyclage/Le temps
   * semblaient juste alignes cote a cote sans lien visible avec Butin de
   * guerre, Mitraillette atterrissait apres eux comme un 3e element de
   * liste plutot que sous Tir rapide). Remplace par un positionnement
   * ABSOLU calcule par un vrai algorithme d'arbre — voir
   * ui/talentTreeLayout.ts, computeTalentTreeLayout (pur, teste en
   * headless) : Y = palier (strict, section 30), X = centre du sous-arbre
   * de chaque talent, ce qui centre AUTOMATIQUEMENT un groupe d'enfants sous
   * leur parent (section 31) sans jamais traiter le palier comme une liste
   * plate indexee (section 32).
   *
   * Une seule strategie de layout (section 34) : toutes les cartes sont
   * positionnees via `left`/`top` en pixels, calcules UNE FOIS ici depuis
   * des constantes de taille FIXES (TALENT_TREE_LAYOUT_OPTIONS) — plus
   * aucune regle CSS de centrage/alignement pour les cartes elles-memes, et
   * plus besoin de remesurer/recalculer au resize (le layout ne depend pas
   * de la largeur du conteneur, seulement des donnees de l'arbre) : un
   * changement reel par rapport au premier essai, qui recalculait tout a
   * chaque refreshTalents()/resize depuis des bounding boxes DOM.
   */
  private buildTalentTree(handlers: ScreenHandlers): HTMLElement {
    const root = Object.values(TALENTS).find((t) => t.branch === null);
    if (!root) throw new Error('Aucun talent racine (branch: null) trouve dans data/talents.ts');

    // Arbre pour le LAYOUT uniquement (jamais pour le gameplay) : chaque
    // talent non-racine a pour parent son `requires` — ou la racine si
    // absent (les fondateurs n'ont pas de `requires` cote gameplay, leur
    // seul prerequis reel, verifie par canUnlockTalent, est le talent
    // universel ; ici on les rattache visuellement a la racine, qui les
    // affiche tous en eventail comme avant). Ne modifie AUCUNE donnee de
    // data/talents.ts.
    const descendants: TalentTreeLayoutNode[] = Object.values(TALENTS)
      .filter((t) => t.id !== root.id)
      .map((t) => ({ id: t.id, parentId: t.requires ?? root.id }));
    const layout = computeTalentTreeLayout(root.id, descendants, TALENT_TREE_LAYOUT_OPTIONS);
    const { cardWidth, cardHeight } = TALENT_TREE_LAYOUT_OPTIONS;

    const canvas = document.createElement('div');
    canvas.className = 'talent-tree-canvas';
    canvas.style.width = `${layout.totalWidth}px`;
    canvas.style.height = `${layout.totalHeight}px`;

    const svgNs = 'http://www.w3.org/2000/svg';
    const connectors = document.createElementNS(svgNs, 'svg') as SVGSVGElement;
    connectors.setAttribute('class', 'talent-tree-connectors');
    connectors.setAttribute('width', String(layout.totalWidth));
    connectors.setAttribute('height', String(layout.totalHeight));
    canvas.appendChild(connectors);

    // Un edge PAR PARENT (jamais une seule grande ligne horizontale partagee
    // par tout un palier, section 9-13 de la demande) : un parent a 1 seul
    // enfant -> trait direct (centre-bas -> centre-haut) ; plusieurs
    // enfants -> tronc court puis eventail dont la barre horizontale NE
    // COUVRE QUE la largeur entre SES propres enfants (jamais jusqu'au
    // voisin d'a cote). La racine est un parent comme un autre (5 enfants,
    // le meme code produit deja l'eventail attendu) — aucun cas special.
    const drawEdges = (parentId: string, childIds: string[]): void => {
      const parent = layout.nodes.get(parentId);
      if (!parent || childIds.length === 0) return;
      const children = childIds.map((id) => layout.nodes.get(id)).filter((n): n is TalentNodeLayout => !!n);
      if (children.length === 0) return;

      const parentBottom = { x: parent.centerX, y: parent.centerY + cardHeight / 2 };
      const childTops = children.map((c) => ({ x: c.centerX, y: c.centerY - cardHeight / 2 }));

      let d: string;
      if (childTops.length === 1) {
        const t = childTops[0]!;
        d = `M${parentBottom.x},${parentBottom.y} L${t.x},${t.y}`;
      } else {
        const branchY = (parentBottom.y + childTops[0]!.y) / 2;
        d = `M${parentBottom.x},${parentBottom.y} L${parentBottom.x},${branchY}`;
        for (const t of childTops) d += ` M${parentBottom.x},${branchY} L${t.x},${branchY} L${t.x},${t.y}`;
      }
      const path = document.createElementNS(svgNs, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', 'var(--edge)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      connectors.appendChild(path);
    };

    drawEdges(
      root.id,
      listFounderTalents().map((t) => t.id),
    );
    for (const talent of Object.values(TALENTS)) {
      if (talent.id === root.id) continue;
      drawEdges(
        talent.id,
        listDependents(talent.id).map((t) => t.id),
      );
    }

    // Cartes : positionnees en absolu depuis le layout calcule plus haut.
    for (const [id, pos] of layout.nodes) {
      const node = this.buildTalentNode(id, id === root.id ? 'talent-node--root' : '', handlers);
      node.style.left = `${pos.centerX - cardWidth / 2}px`;
      node.style.top = `${pos.centerY - cardHeight / 2}px`;
      canvas.appendChild(node);
    }

    const scroll = document.createElement('div');
    scroll.className = 'talent-tree-scroll';
    scroll.appendChild(canvas);

    // Libelles "Palier N" — une entree par Y de palier REELLEMENT present
    // dans layout.nodes (jamais un nombre fige en dur), positionnes en
    // absolu au meme Y que leur ligne, dans une colonne HORS de la zone de
    // scroll horizontal (section 24 : "libellés visibles à droite" meme si
    // l'utilisateur fait defiler une ligne large).
    const tierCenterY = new Map<number, number>();
    for (const n of layout.nodes.values()) {
      if (n.tier === 0 || tierCenterY.has(n.tier)) continue;
      tierCenterY.set(n.tier, n.centerY);
    }
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    const labelsColumn = document.createElement('div');
    labelsColumn.className = 'talent-tree-tier-labels';
    labelsColumn.style.height = `${layout.totalHeight}px`;
    for (const [tier, y] of [...tierCenterY.entries()].sort((a, b) => a[0] - b[0])) {
      const label = document.createElement('div');
      label.className = 'talent-tier-row-label';
      label.textContent = `Palier ${romanNumerals[tier - 1] ?? tier}`;
      label.style.top = `${y}px`;
      labelsColumn.appendChild(label);
    }

    const outer = document.createElement('div');
    outer.className = 'talent-tree-outer';
    outer.append(scroll, labelsColumn);

    return outer;
  }

  /** Un seul nœud, dans un etat NEUTRE (verrouille/deverrouillable/deja
   *  possede est applique ensuite par refreshTalents — construire l'etat des
   *  la creation demanderait de connaitre le MetaProgress ici, alors que la
   *  construction n'a lieu qu'une fois au demarrage). Position absolue
   *  (`left`/`top`) fixee par l'appelant (buildTalentTree) juste apres —
   *  ce constructeur ne pose que la largeur/hauteur (voir CSS,
   *  `.talent-node`) et le contenu. */
  private buildTalentNode(id: string, extraClass: string, handlers: ScreenHandlers): HTMLButtonElement {
    const def = getTalent(id);
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `talent-node ${extraClass}`.trim();

    const name = document.createElement('span');
    name.className = 'talent-node-name';
    name.textContent = def.name;

    const cost = document.createElement('span');
    cost.className = 'talent-node-cost';

    node.append(name, cost);
    node.addEventListener('click', () => handlers.onUnlockTalent(id));
    // Tooltip flottant PARTAGE (2026-08-14, section 24/25 de la demande :
    // "le tooltip ne doit pas pousser les cartes... il doit flotter") —
    // remplace l'ancien enfant .talent-node-desc (position absolue relative
    // a la carte, qui pouvait recouvrir les voisins) par un seul element
    // position:fixed reutilise pour toute carte survolee, voir
    // showTalentTooltip.
    node.addEventListener('mouseenter', () => this.showTooltip(node, def.name, def.description));
    node.addEventListener('mouseleave', () => this.hideTalentTooltip());

    this.talentNodes.set(id, node);
    return node;
  }

  /** Attache le tooltip flottant PARTAGE (voir showTooltip) au survol d'un
   *  bouton de boutique — 2026-08-17, demande explicite d'Antoine ("fais le
   *  meme affichage que pour les points de talents... cela fait beaucoup de
   *  texte sous les boutons actuellement") : remplace les paragraphes de
   *  description toujours visibles (Mine, Caserne, Nova de glace) par un
   *  survol, exactement comme l'arbre de talents. `descriptionOf` est un
   *  PROVIDER (pas une chaine figee) : lu a CHAQUE survol, donc reflete
   *  toujours la derniere description recalculee par refreshShop (valeurs
   *  effectives — revenu de Mine, texte Blizzard de la Nova...), jamais un
   *  texte perime capture une seule fois a la construction. */
  private attachItemTooltip(anchor: HTMLElement, name: string, descriptionOf: () => string): void {
    anchor.addEventListener('mouseenter', () => this.showTooltip(anchor, name, descriptionOf()));
    anchor.addEventListener('mouseleave', () => this.hideTalentTooltip());
  }

  /** Positionne et affiche le tooltip PARTAGE pres de `anchor` — prefere la
   *  droite (assez de place), sinon la gauche, sinon au-dessus/en dessous ;
   *  toujours entierement clampe dans la fenetre (section 24 : "reste
   *  entièrement dans la fenêtre"). `position: fixed` (voir CSS) : ne
   *  participe jamais au flux normal, ne peut donc jamais pousser une carte
   *  voisine ni changer la taille de l'arbre. GENERALISE (2026-08-17) : plus
   *  seulement pour un TalentDef, prend directement nom/description — voir
   *  attachItemTooltip pour la boutique. */
  private showTooltip(anchor: HTMLElement, name: string, description: string): void {
    this.talentTooltipName.textContent = name;
    this.talentTooltipDesc.textContent = description;
    this.talentTooltip.classList.add('talent-tooltip--visible');

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = this.talentTooltip.getBoundingClientRect();
    const margin = 10;
    const spaceRight = window.innerWidth - anchorRect.right;
    const spaceLeft = anchorRect.left;
    const fitsRight = spaceRight >= tooltipRect.width + margin;
    const fitsLeft = spaceLeft >= tooltipRect.width + margin;

    let left: number;
    if (fitsRight) {
      left = anchorRect.right + margin;
    } else if (fitsLeft) {
      left = anchorRect.left - tooltipRect.width - margin;
    } else {
      left = Math.max(margin, Math.min(anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2, window.innerWidth - tooltipRect.width - margin));
    }

    let top: number;
    if (fitsRight || fitsLeft) {
      top = Math.max(margin, Math.min(anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2, window.innerHeight - tooltipRect.height - margin));
    } else if (anchorRect.top >= tooltipRect.height + margin) {
      top = anchorRect.top - tooltipRect.height - margin;
    } else {
      top = Math.min(anchorRect.bottom + margin, window.innerHeight - tooltipRect.height - margin);
    }

    this.talentTooltip.style.left = `${left}px`;
    this.talentTooltip.style.top = `${top}px`;
  }

  private hideTalentTooltip(): void {
    this.talentTooltip.classList.remove('talent-tooltip--visible');
  }

  private overlay(className: string, children: HTMLElement[]): HTMLElement {
    const el = document.createElement('div');
    el.className = `screen-overlay screen-${className}`;

    const panel = document.createElement('div');
    panel.className = 'screen-panel';
    for (const child of children) panel.appendChild(child);

    el.appendChild(panel);
    document.body.appendChild(el);
    return el;
  }

  private title(text: string): HTMLElement {
    const h = document.createElement('h1');
    h.className = 'screen-title';
    h.textContent = text;
    return h;
  }

  private paragraph(text: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'screen-text';
    p.textContent = text;
    return p;
  }

  private button(label: string, onClick: () => void): HTMLElement {
    const b = document.createElement('button');
    b.className = 'screen-button';
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('mouseenter', () => this.uiSound.hover());
    b.addEventListener('click', () => {
      this.uiSound.click();
      onClick();
    });
    return b;
  }

  /** Bouton d'achat de la boutique : nom + coût + icône de pièce (2026-08-11,
   *  demande d'Antoine : "il faut que l'icône de gold apparaisse à côté de
   *  chaque prix dans le jeu"). Typé HTMLButtonElement (besoin de
   *  .disabled) et retourné directement — refreshShop doit pouvoir le
   *  retrouver ensuite pour l'activer/désactiver. Le coût est FIXE pour
   *  chaque objet SAUF si `unitId` est fourni (2026-08-13, boutique
   *  d'amélioration permanente) : dans ce cas le prix AFFICHÉ peut varier en
   *  cours de partie (voir run/unitUpgradeEffects.ts,
   *  effectivePlayerUnitCost), donc l'élément de prix est enregistré dans
   *  `shopUnitPriceEls` pour que refreshShop puisse le réécrire. */
  private shopItemButton(name: string, cost: number, onClick: () => void, unitId?: string, iconItemId?: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'screen-button shop-item-button';
    b.type = 'button';

    // Nom + icone de l'OBJET groupes ensemble (2026-08-14, demande
    // d'Antoine : "utilise les nouvelles images... en boutique") — meme
    // logique de groupement que priceGroup ci-dessous, pour que
    // justify-content:space-between ne separe que ces deux groupes, jamais
    // l'icone du nom. `iconItemId` optionnel : les lignes d'unite
    // (unitPurchaseRow) n'en fournissent pas, aucune icone d'objet a montrer.
    const nameGroup = document.createElement('span');
    nameGroup.className = 'shop-item-name-group';
    if (iconItemId) {
      const icon = createItemIcon(iconItemId, 22);
      icon.classList.add('shop-item-icon');
      nameGroup.appendChild(icon);
    }
    const nameEl = document.createElement('span');
    nameEl.textContent = name;
    nameGroup.appendChild(nameEl);

    // Prix + icone groupes dans leur PROPRE conteneur (2026-08-11, bug
    // remonte par Antoine : "trop d'espacement entre la pièce et le
    // montant") — avec 3 enfants directs et justify-content:space-between
    // sur le bouton, l'espace restant se repartissait entre CHAQUE paire
    // (nom<->prix ET prix<->icone), ecartant la piece du nombre au lieu de
    // les coller. En les regroupant, seul le nom et ce groupe sont
    // espaces par le bouton ; a l'interieur du groupe, un petit gap fixe
    // (meme valeur que .shop-gold, "Or : 8🪙" juste au-dessus) les garde
    // colles l'un a l'autre.
    const priceGroup = document.createElement('span');
    priceGroup.className = 'shop-item-price-group';
    const priceEl = document.createElement('span');
    priceEl.className = 'shop-item-price';
    // formatGold (2026-08-15, chantier polish/equilibrage) : les prix de
    // consommables sont desormais FRACTIONNAIRES (base + niveau x 0.5) —
    // jamais un `String(cost)` brut qui pourrait un jour afficher un residu
    // de virgule flottante, jamais de ".0" superflu sur un prix entier.
    priceEl.textContent = formatGold(cost);
    priceGroup.append(priceEl, createCoinIcon(14));
    if (unitId) this.shopUnitPriceEls.set(unitId, priceEl);

    b.append(nameGroup, priceGroup);
    b.addEventListener('mouseenter', () => this.uiSound.hover());
    b.addEventListener('click', () => {
      this.uiSound.click();
      onClick();
    });
    return b;
  }

  /** Ligne d'achat d'UN objet achetable (unite OU consommable, voir
   *  2026-08-15 ci-dessous) : bouton d'achat simple (shopItemButton) + petit
   *  bouton "×5" a droite (2026-08-13, demande d'Antoine : "plus confortable
   *  pour acheter plusieurs unités") — deux <button> FRERES dans un
   *  conteneur <div> (jamais un bouton imbrique dans un autre, invalide en
   *  HTML). Enregistre le bouton ×5 dans `shopUnitBuyFiveEls` pour que
   *  refreshShop puisse l'activer/desactiver separement du bouton simple (le
   *  ×5 a besoin de 5x l'or, pas juste 1x).
   *
   *  Etendue le 2026-08-15 (chantier polish/equilibrage, "ACHAT x5" pour les
   *  consommables) : `def` n'est plus specifique aux unites (`{id, name,
   *  cost}` suffit deja pour un ItemDef) — REUTILISE telle quelle pour le
   *  Parchemin de soin/la Nova de glace, aucune deuxieme implementation de
   *  ligne d'achat. `iconItemId` optionnel (nouveau) : les unites n'en ont
   *  toujours pas, les consommables passent leur propre id pour afficher
   *  leur icone (voir createItemIcon). */
  private unitPurchaseRow(
    def: { id: string; name: string; cost: number },
    onBuyOne: () => void,
    onBuyFive: () => void,
    iconItemId?: string,
  ): { row: HTMLElement; button: HTMLButtonElement } {
    const button = this.shopItemButton(def.name, def.cost, onBuyOne, def.id, iconItemId);

    const five = document.createElement('button');
    five.type = 'button';
    five.className = 'shop-x5-button';
    five.textContent = '×5';
    five.addEventListener('mouseenter', () => this.uiSound.hover());
    five.addEventListener('click', () => {
      this.uiSound.click();
      onBuyFive();
    });
    this.shopUnitBuyFiveEls.set(def.id, five);

    const row = document.createElement('div');
    row.className = 'shop-unit-row';
    row.append(button, five);
    return { row, button };
  }
}
