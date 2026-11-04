import { BALLISTA_UPGRADE } from '../data/ballistaUpgrade';
import { getTalent, listDependents, listFounderTalents, TALENTS } from '../data/talents';
import { computeTalentTreeLayout, type TalentNodeLayout, type TalentTreeLayoutNode } from './talentTreeLayout';
import { getUnit } from '../data/units';
import { getUnitUpgradeDef, listUpgradableUnitIds } from '../data/unitUpgrades';
import { canUnlockTalent, isTalentUnlocked, type MetaProgress } from '../run/metaProgress';
import { formatGold, type RunState } from '../run/runState';
import { currentProductionLevel, unitProductionSummary, type UnitProductionSummary } from '../run/unitUpgradeEffects';
import {
  ballistaAttackSpeedBonus,
  ballistaDamageBonusDisplay,
  ballistaHpBonusDisplay,
  ballistaNextPurchaseGrantsDamageBonus,
  ballistaRemainingUntilDamageBonus,
  ballistaUpgradeLevel,
} from '../run/ballistaUpgradeEffects';
import { canPurchaseRunUpgrade, displayedUpgradeLevel, runUpgradeGoldCost } from '../run/runUpgrades';
import type { AudioSettings } from '../run/userSettings';
import { createCoinIcon } from './pixelIcon';

export type ScreenName =
  | 'menu'
  | 'talents'
  | 'pause'
  | 'quitRunConfirm'
  | 'gameOver'
  | 'resetConfirm'
  | 'resetTalentsConfirm'
  | 'settings'
  | 'unitUpgradeShop';

/** Un curseur de volume construit par `Screens.sliderControl` — `row` est
 *  l'element a inserer dans le panneau, `input`/`valueLabel` sont retenus a
 *  part pour que `refreshSettings` puisse les remettre a jour sans tout
 *  reconstruire. */
interface SliderControl {
  row: HTMLElement;
  input: HTMLInputElement;
  valueLabel: HTMLElement;
}

/** Refs vers les elements dynamiques d'UNE carte de la boutique
 *  d'amelioration permanente (voir buildUnitUpgradeCard/refreshForge) —
 *  meme motif que talentNodes, cle par unitId. */
interface UnitUpgradeCardRefs {
  button: HTMLButtonElement;
  levelEl: HTMLElement;
  /** Stats de la PROCHAINE unite produite (niveau courant). */
  nextUnitEl: HTMLElement;
  /** Cout de production de la prochaine unite. */
  goldCostEl: HTMLElement;
  /** Ce qu'apporte le niveau suivant, cout de production compris. */
  nextUpgradeEl: HTMLElement;
  costEl: HTMLElement;
}

/** Refs de la carte "Baliste" (2026-08-13) — voir buildBallistaUpgradeCard/
 *  refreshForge. Forme dediee : cadence en %, pas de "PV". */
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
  costEl: HTMLElement;
}

export interface ScreenHandlers {
  onPlay: () => void;
  onOpenTalents: () => void;
  onCloseTalents: () => void;
  /** Entree dans le mode editeur de maps (chantier en cours, voir CLAUDE.md).
   *  Le menu principal est le point d'entree naturel : Antoine a explicitement
   *  demande de pouvoir y revenir facilement pendant ses tests. */
  onOpenEditor: () => void;
  /** Atelier de personnage (outil interne de conception, src/workshop). */
  onOpenWorkshop: () => void;
  /** Editeur d'items (outil interne, src/itemEditor). */
  onOpenItemEditor: () => void;
  /** Reprend la bataille en cours (bouton "Continuer" du menu pause,
   *  Echap y menait). */
  onResume: () => void;
  /** Abandonne la run en cours et revient au menu principal, comme au
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
   *  depuis une run en cours (voir main.ts, openPauseMenu), ce bouton
   *  represente TOUJOURS "quitter une run en cours" — aucune verification de
   *  contexte supplementaire necessaire ici. */
  onRequestQuitRun: () => void;
  /** "Annuler" de la confirmation — retourne au menu Pause (PAS une reprise
   *  du jeu, voir point 7 de la demande : la partie reste en pause tant que
   *  "Continuer" n'a pas ete cliques explicitement). */
  onCancelQuitRun: () => void;
  /** "Quitter" (rouge) de la confirmation — appelle reellement onQuit.
   *  Idempotent (voir main.ts, quitRunConfirmationInFlight) : un double-clic
   *  ne declenche jamais deux fois la navigation/le nettoyage de run. */
  onConfirmQuitRun: () => void;
  /** Achat d'un talent (universel ou fondateur — voir data/talents.ts) — le
   *  handler verifie lui-meme si l'achat est possible (canUnlockTalent) et
   *  sauvegarde ensuite ; Screens ne fait que relayer le clic et rafraichir
   *  l'affichage (voir refreshTalents). Les 3 fondateurs sont achetables
   *  librement et independamment, pas d'exclusivite entre eux (voir
   *  CLAUDE.md, refonte 2026-08-10). */
  onUnlockTalent: (id: string) => void;
  /** Ecran de la FORGE : ameliorations de la run, payees en Or, ouvert
   *  depuis la fiche d'une Forge en jeu (voir main.ts, le temps est fige).
   *  `onPurchaseRunUpgrade` verifie et realise l'achat (run/runUpgrades.ts,
   *  purchaseRunUpgrade) ; Screens ne fait que relayer le clic et
   *  rafraichir. */
  onCloseForge: () => void;
  onPurchaseRunUpgrade: (upgradeId: string) => void;
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
  /** Vitesse de la camera (multiplicateur, 0,25 a 2,5). */
  onSetCameraSpeed: (value: number) => void;
  /** Disposition du HUD (ui/hudLayout.ts) : layout officiel, export (texte
   *  copie), import (message de resultat), grille de calibration, outil de
   *  calibration deverrouille. */
  onResetHudLayout: () => void;
  onCopyHudLayout: () => string;
  onLoadHudLayout: (text: string) => string;
  onSetHudGrid: (on: boolean) => void;
  onSetHudUnlocked: (on: boolean) => void;
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
 * Ecrans de meta-jeu : menu principal, arbre de talents, Forge, pause,
 * confirmations, Partie terminee, Parametres. Du HTML/CSS par-dessus le
 * canvas, comme toute l'interface. La Boutique de run, l'ecran de fin de
 * manche et l'avertissement d'or restant du jeu en manches ont ete retires
 * (passe de modernisation 1, 2026-11-04).
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
   *  tout l'arbre (le nombre de talents ne change JAMAIS en cours de partie). */
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
   *  Partage avec les cartes de la Forge (showTooltip). Nom de champ
   *  conserve pour ne pas toucher a chaque site d'appel existant. */
  private readonly talentTooltip: HTMLElement;
  private readonly talentTooltipName: HTMLElement;
  private readonly talentTooltipDesc: HTMLElement;
  /** Ecran de la FORGE (ameliorations de la run, en Or ; id interne
   *  historique `unitUpgradeShop`) — voir data/unitUpgrades.ts. */
  private readonly unitUpgradeShop: HTMLElement;
  private readonly forgeGoldAmount: HTMLElement;
  private readonly unitUpgradeCards = new Map<string, UnitUpgradeCardRefs>();
  /** Carte "Baliste" (2026-08-13) — shape different des unites (voir
   *  BallistaUpgradeCardRefs), donc pas dans `unitUpgradeCards`. */
  private readonly ballistaUpgradeCard: BallistaUpgradeCardRefs;
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
  private readonly gameOverReason: HTMLElement;
  private readonly resetConfirm: HTMLElement;
  private readonly resetTalentsConfirm: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly settingsMaster: SliderControl;
  private readonly settingsCameraSpeed: SliderControl;
  private readonly settingsHudGrid: { row: HTMLElement; input: HTMLInputElement };
  private readonly settingsHudUnlocked: { row: HTMLElement; input: HTMLInputElement };
  private readonly settingsMusic: SliderControl;
  private readonly settingsSfx: SliderControl;
  private readonly settingsMuted: { row: HTMLElement; input: HTMLInputElement };

  /** `uiSound` : callbacks audio (2026-08-12) — Screens ne connait pas
   *  l'AudioManager, juste deux fonctions a appeler ("joue un clic",
   *  "joue un survol"), branchees par main.ts. Point d'insertion unique
   *  (voir `button()`) plutot que d'ajouter le son a chaque site d'appel
   *  individuel dans main.ts. */
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
      this.button('Mode survie', handlers.onPlay),
      this.button('Arbre de talents', handlers.onOpenTalents),
      this.button('Éditeur de maps', handlers.onOpenEditor),
      this.button('Atelier de personnage', handlers.onOpenWorkshop),
      this.button("Éditeur d'items", handlers.onOpenItemEditor),
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

    // Ecran de la Forge (ameliorations de la run, 2026-08-13) — ouvert
    // depuis la fiche d'une Forge en jeu. Une carte GENERIQUE par unite
    // ameliorable (listUpgradableUnitIds, voir data/unitUpgrades.ts) :
    // ajouter une nouvelle unite ameliorable plus tard n'exige aucun
    // changement ici, juste une nouvelle entree dans UNIT_UPGRADES (point 7
    // de la demande : "ne hardcode pas toute l'UI autour de seulement trois
    // unites").
    const forgeGold = document.createElement('p');
    forgeGold.className = 'screen-text shop-gold';
    this.forgeGoldAmount = document.createElement('span');
    forgeGold.append('Or : ', this.forgeGoldAmount, createCoinIcon(16));

    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'upgrade-cards';
    for (const unitId of listUpgradableUnitIds()) cardsContainer.append(this.buildUnitUpgradeCard(unitId, handlers));
    // Baliste (2026-08-13) — shape different des unites (voir
    // buildBallistaUpgradeCard), donc construite a part.
    const ballistaCard = this.buildBallistaUpgradeCard(handlers);
    this.ballistaUpgradeCard = ballistaCard.refs;
    cardsContainer.append(ballistaCard.card);

    this.unitUpgradeShop = this.overlay('unit-upgrade-shop', [
      this.title('Forge'),
      forgeGold,
      cardsContainer,
      this.button('Retour', handlers.onCloseForge),
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
    this.gameOverReason = this.paragraph('');
    this.gameOver = this.overlay('game-over', [
      this.title('Partie terminée'),
      this.gameOverReason,
      this.gameOverProgress,
      this.button('Retour au menu principal', handlers.onQuit),
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

    // Camera (2026-11-02) : vitesse du defilement par les bords, 25 a 250 %.
    this.settingsCameraSpeed = this.sliderControl('Vitesse de déplacement de la caméra', handlers.onSetCameraSpeed);
    this.settingsCameraSpeed.input.min = '25';
    this.settingsCameraSpeed.input.max = '250';
    this.settingsCameraSpeed.input.step = '5';
    this.settingsCameraSpeed.input.dataset['name'] = 'camera-speed';

    const soundTabPanel = this.shopTabPanel([
      this.settingsMaster.row,
      this.settingsMusic.row,
      this.settingsSfx.row,
      this.settingsMuted.row,
    ]);
    const cameraTabPanel = this.shopTabPanel([this.settingsCameraSpeed.row]);
    // HUD (2026-11-02) : disposition du HUD ; outil de calibration (MAJ)
    // verrouille par defaut.
    const hudTitle = document.createElement('div');
    hudTitle.className = 'settings-section-title';
    hudTitle.textContent = 'Disposition du HUD';
    this.settingsHudUnlocked = this.checkboxControl('Déverrouiller la disposition du HUD', handlers.onSetHudUnlocked);
    const hudHint = document.createElement('p');
    hudHint.className = 'settings-hint';
    hudHint.textContent = 'Déverrouillée : en jeu, maintenir MAJ, glisser le fond d\'un bloc pour le déplacer, sa poignée (coin) pour sa taille. ALT pendant le glisser : sans aimantation.';
    this.settingsHudGrid = this.checkboxControl('Afficher la grille de calibration', handlers.onSetHudGrid);
    const hudText = document.createElement('textarea');
    hudText.className = 'settings-hud-text';
    hudText.dataset['name'] = 'hud-layout';
    hudText.placeholder = 'Disposition (JSON) : copiée ici, ou à coller puis « Charger une disposition »';
    const hudStatus = document.createElement('div');
    hudStatus.className = 'settings-hint';
    const interfaceTabPanel = this.shopTabPanel([
      hudTitle,
      this.settingsHudUnlocked.row,
      hudHint,
      this.settingsHudGrid.row,
      this.button('Réinitialiser la disposition du HUD', () => {
        handlers.onResetHudLayout();
        hudStatus.textContent = 'HUD réinitialisé';
      }),
      this.button('Copier la disposition du HUD', () => {
        hudText.value = handlers.onCopyHudLayout();
        hudStatus.textContent = 'Disposition copiée';
      }),
      hudText,
      this.button('Charger une disposition', () => {
        hudStatus.textContent = handlers.onLoadHudLayout(hudText.value);
      }),
      hudStatus,
    ]);
    const settingsTabPanels = [soundTabPanel, cameraTabPanel, interfaceTabPanel];
    const soundTabButton = this.tabButton('Son', () => selectSettingsTab(0));
    const cameraTabButton = this.tabButton('Caméra', () => selectSettingsTab(1));
    const interfaceTabButton = this.tabButton('HUD', () => selectSettingsTab(2));
    const settingsTabButtons = [soundTabButton, cameraTabButton, interfaceTabButton];
    const selectSettingsTab = (index: number): void => {
      settingsTabButtons.forEach((b, i) => b.classList.toggle('shop-tab--active', i === index));
      settingsTabPanels.forEach((p, i) => p.classList.toggle('shop-tab-content--active', i === index));
    };
    selectSettingsTab(0);
    const settingsTabs = document.createElement('div');
    settingsTabs.className = 'shop-tabs';
    settingsTabs.append(soundTabButton, cameraTabButton, interfaceTabButton);

    this.settings = this.overlay('settings', [
      this.title('Paramètres'),
      settingsTabs,
      soundTabPanel,
      cameraTabPanel,
      interfaceTabPanel,
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
    this.pause.classList.remove('screen-overlay--visible');
    this.quitRunConfirm.classList.remove('screen-overlay--visible');
    this.gameOver.classList.remove('screen-overlay--visible');
    this.resetConfirm.classList.remove('screen-overlay--visible');
    this.resetTalentsConfirm.classList.remove('screen-overlay--visible');
    this.settings.classList.remove('screen-overlay--visible');
    this.unitUpgradeShop.classList.remove('screen-overlay--visible');
  }

  /** Baliste detruite (2026-11-02, coeur de la base) : la run s'arrete net —
   *  retour au menu principal (meme handler que "Quitter" en pause).
   *  `highestWaveReached` (refonte 2026-08-10) : la progression permanente
   *  est un record de vague — cet ecran confirme juste qu'il a bien ete
   *  sauvegarde (voir main.ts, registerWaveReached). */
  showGameOver(highestWaveReached: number): void {
    this.gameOverReason.textContent = 'La Baliste est tombée. La run se termine ici.';
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

  /** Vrai si un ecran (Forge, pause, Game Over...) recouvre le jeu. */
  hasVisibleOverlay(): boolean {
    return document.querySelector('.screen-overlay.screen-overlay--visible') !== null;
  }

  /** Vrai si l'ecran de la Forge est affiche (voir main.ts : Echap le ferme
   *  en priorite, la fiche d'entite est masquee dessous). */
  isForgeOpen(): boolean {
    return this.unitUpgradeShop.classList.contains('screen-overlay--visible');
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

  /** Affiche l'ecran de la Forge a jour — toujours appeler ceci plutot que
   *  show('unitUpgradeShop') directement (meme motif que showTalents). */
  showForge(run: RunState): void {
    this.refreshForge(run);
    this.show('unitUpgradeShop');
  }

  /** Remet a jour l'Or et chaque carte — appelee a l'ouverture ET apres
   *  chaque achat (voir main.ts, onPurchaseRunUpgrade). Niveaux : ceux de la
   *  RUN (run.upgrades) ; prix : bareme en Or (runUpgradeGoldCost) ; achat
   *  possible : canPurchaseRunUpgrade. */
  refreshForge(run: RunState): void {
    const levels = run.upgrades;
    this.forgeGoldAmount.textContent = formatGold(run.gold);
    // Niveau de production : stats de la PROCHAINE unite produite et gain du
    // niveau suivant (voir data/unitUpgrades.ts) ; les unites deja
    // recrutees gardent le leur (rappel sur la carte).
    for (const [unitId, refs] of this.unitUpgradeCards) {
      if (!getUnitUpgradeDef(unitId)) continue;
      const level = currentProductionLevel(levels, unitId);
      const current = unitProductionSummary(unitId, level);
      const next = unitProductionSummary(unitId, level + 1);

      refs.levelEl.textContent = `Niveau de production : ${displayedUpgradeLevel(level)}`;
      refs.nextUnitEl.textContent = `Prochaine unité : ${formatUnitStats(current)}`;
      refs.goldCostEl.textContent = `Coût de production : ${formatGold(current.cost)}`;
      refs.nextUpgradeEl.textContent = `Niv. ${displayedUpgradeLevel(level + 1)} : ${formatUnitGains(current, next)}`;
      refs.costEl.textContent = formatGold(runUpgradeGoldCost(unitId, level));
      refs.button.disabled = !canPurchaseRunUpgrade(run, unitId);
    }

    // Baliste (2026-08-13, etendue le 2026-08-16 avec le bonus de PV de la
    // tour) — voir run/ballistaUpgradeEffects.ts.
    {
      const level = ballistaUpgradeLevel(levels);
      const attackSpeedPct = Math.round(ballistaAttackSpeedBonus(level) * 100);
      const damageBonus = ballistaDamageBonusDisplay(level);
      const hpBonus = ballistaHpBonusDisplay(level);
      const nextCost = runUpgradeGoldCost(BALLISTA_UPGRADE.id, level);
      const remaining = ballistaRemainingUntilDamageBonus(level);
      const grantsDamage = ballistaNextPurchaseGrantsDamageBonus(level);
      const refs = this.ballistaUpgradeCard;

      refs.levelEl.textContent = `Niveau : ${displayedUpgradeLevel(level)}`;
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
      refs.costEl.textContent = formatGold(nextCost);
      refs.button.disabled = !canPurchaseRunUpgrade(run, BALLISTA_UPGRADE.id);
    }
  }

  /** Construit une carte GENERIQUE de la boutique d'amelioration pour UNE
   *  unite (voir refreshForge pour le remplissage des valeurs) —
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
    const nextUnitEl = document.createElement('p');
    nextUnitEl.className = 'upgrade-card-line';
    const goldCostGroup = document.createElement('p');
    goldCostGroup.className = 'upgrade-card-line';
    const goldCostEl = document.createElement('span');
    goldCostGroup.append(goldCostEl, ' ', createCoinIcon(12));
    const nextUpgradeEl = document.createElement('p');
    nextUpgradeEl.className = 'upgrade-card-line upgrade-card-next';
    const noteEl = document.createElement('p');
    noteEl.className = 'upgrade-card-line upgrade-card-dim';
    noteEl.textContent = 'Les unités déjà recrutées gardent leur niveau.';

    const buyRow = document.createElement('div');
    buyRow.className = 'upgrade-card-buy-row';
    const costEl = document.createElement('span');
    const costGroup = document.createElement('span');
    costGroup.className = 'shop-item-price-group';
    costGroup.append(costEl, createCoinIcon(14));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-button upgrade-card-button';
    button.textContent = 'Améliorer';
    button.addEventListener('mouseenter', () => this.uiSound.hover());
    button.addEventListener('click', () => {
      this.uiSound.click();
      handlers.onPurchaseRunUpgrade(unitId);
    });
    buyRow.append(costGroup, button);

    card.append(nameEl, levelEl, nextUnitEl, goldCostGroup, nextUpgradeEl, noteEl, buyRow);

    this.unitUpgradeCards.set(unitId, {
      button,
      levelEl,
      nextUnitEl,
      goldCostEl,
      nextUpgradeEl,
      costEl,
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
    const costEl = document.createElement('span');
    const costGroup = document.createElement('span');
    costGroup.className = 'shop-item-price-group';
    costGroup.append(costEl, createCoinIcon(14));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-button upgrade-card-button';
    button.textContent = 'Améliorer';
    button.addEventListener('mouseenter', () => this.uiSound.hover());
    button.addEventListener('click', () => {
      this.uiSound.click();
      handlers.onPurchaseRunUpgrade(BALLISTA_UPGRADE.id);
    });
    buyRow.append(costGroup, button);

    card.append(nameEl, levelEl, hpBonusEl, attackSpeedEl, damageEl, nextUpgradeEl, remainingDamageEl, buyRow);

    return {
      card,
      refs: { button, levelEl, attackSpeedEl, damageEl, hpBonusEl, nextUpgradeEl, remainingDamageEl, costEl },
    };
  }

  /** Onglet (Parametres) — classes historiques `.shop-tab*`, partagees par
   *  l'ancienne Boutique de run (retiree). */
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
      case 'settings':
        return this.settings;
      case 'unitUpgradeShop':
        return this.unitUpgradeShop;
    }
  }

  /** Affiche l'ecran Parametres a jour — toujours appeler ceci plutot que
   *  show('settings') directement (meme motif que showTalents). */
  showSettings(audio: AudioSettings, cameraSpeed = 1, hudGrid = false, hudUnlocked = false): void {
    this.refreshSettings(audio);
    this.setSliderValue(this.settingsCameraSpeed, cameraSpeed);
    this.settingsHudGrid.input.checked = hudGrid;
    this.settingsHudUnlocked.input.checked = hudUnlocked;
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

  /** Positionne et affiche le tooltip PARTAGE pres de `anchor` — prefere la
   *  droite (assez de place), sinon la gauche, sinon au-dessus/en dessous ;
   *  toujours entierement clampe dans la fenetre (section 24 : "reste
   *  entièrement dans la fenêtre"). `position: fixed` (voir CSS) : ne
   *  participe jamais au flux normal, ne peut donc jamais pousser une carte
   *  voisine ni changer la taille de l'arbre. */
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

}

/** Stats d'une unite produite, sur une ligne (« 8 PV · Attaque 2 · Pop. 1 »). */
function formatUnitStats(summary: UnitProductionSummary): string {
  const parts = [`${formatGold(summary.hp)} PV`];
  if (summary.attack > 0) parts.push(`${summary.attackLabel} ${formatGold(summary.attack)}`);
  if (summary.tauntShield !== null) parts.push(`Bouclier ${formatGold(summary.tauntShield)} / ennemi`);
  parts.push(`Pop. ${summary.population}`);
  return parts.join(' · ');
}

/** Gain d'un niveau de production au suivant (« +3 PV, +1 Attaque, coût +1 »). */
function formatUnitGains(from: UnitProductionSummary, to: UnitProductionSummary): string {
  const gains: string[] = [];
  if (to.hp > from.hp) gains.push(`+${formatGold(to.hp - from.hp)} PV`);
  if (to.attack > from.attack) gains.push(`+${formatGold(to.attack - from.attack)} ${from.attackLabel}`);
  if (to.tauntShield !== null && from.tauntShield !== null && to.tauntShield > from.tauntShield) {
    gains.push(`+${formatGold(to.tauntShield - from.tauntShield)} Bouclier / ennemi`);
  }
  gains.push(`coût +${formatGold(to.cost - from.cost)}`);
  return gains.join(', ');
}
