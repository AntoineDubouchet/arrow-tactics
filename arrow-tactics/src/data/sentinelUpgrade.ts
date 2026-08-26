import type { RuneCostDef } from './unitUpgrades';

/**
 * Amelioration permanente de la SENTINELLE (2026-08-14, demande d'Antoine) —
 * meme famille de systeme que data/ballistaUpgrade.ts/data/iceNovaUpgrade.ts/
 * data/mineUpgrade.ts (RuneCostDef, premier achat -> prix multiplie a chaque
 * achat suivant) plutot que data/unitUpgrades.ts (UnitUpgradeDef) : la
 * Sentinelle ne gagne JAMAIS d'attaque via cette amelioration (demande
 * explicite, point 35 — "ne lui applique pas automatiquement la regle +1
 * attack = +1 gold"), `UnitUpgradeDef` suppose au contraire qu'un palier
 * d'attaque existe toujours (`attackEveryLevels`/`goldCostPerAttackUpgrade`),
 * forme inadaptee ici.
 *
 * Point de depart CONFIRME a 10 runes par Antoine (2026-08-14) : "dans la
 * boutique d'amélioration, la sentinelle doit commencer à 10. De toute
 * manière quand tu ajoutes un truc dans la boutique d'amélioration, fais-le
 * commencer à 10" — tranche la divergence relevee lors de l'integration
 * initiale (la demande d'origine, section 30, donnait "premier achat : 1
 * Rune" puis `2**level`, litteralement different du point de depart des 5
 * autres ameliorations permanentes de ce jeu). Regle desormais explicite et
 * PERMANENTE pour toute future amelioration ajoutee a cette boutique :
 * `baseRuneCost: 10` par defaut, jamais 1.
 *
 * REVIREMENT explicite le 2026-08-15 (chantier polish/equilibrage) : le
 * paragraphe ci-dessus disait le cout GOLD de RECRUTEMENT (pas le cout en
 * runes de l'amelioration elle-meme) TOUJOURS fixe a 40 — Antoine demande
 * desormais explicitement l'inverse ("augmente FORTEMENT le prix de
 * recrutement Gold de la Sentinelle en fonction de son niveau d'amelioration
 * permanente... `40 + sentinelUpgradeLevel * 5`"), conscient de revenir sur
 * cette decision. `goldCostPerLevel` ci-dessous porte ce nouveau cout — voir
 * run/sentinelUpgradeEffects.ts (effectiveSentinelGoldCost) et
 * run/unitUpgradeEffects.ts (effectivePlayerUnitCost, cas special
 * 'sentinel'). Les bonus PV/Bouclier (hpPerLevel/shieldEveryLevels ci-dessous)
 * restent EUX inchanges — seul le cout Gold de recrutement evolue.
 */
export interface SentinelUpgradeDef extends RuneCostDef {
  id: 'sentinel';
  /** +N PV AFFICHES (pas l'echelle interne) par achat. */
  hpPerLevel: number;
  /** Tous les N achats, +1 point de BOUCLIER (affiche) par ennemi provoque. */
  shieldEveryLevels: number;
  shieldBonusPerMilestone: number;
  /** A chaque NIVEAU d'amelioration achete, +N au cout GOLD de RECRUTEMENT
   *  de la Sentinelle en boutique de RUN (2026-08-15) — ne change JAMAIS le
   *  cout en RUNES de cette amelioration elle-meme. */
  goldCostPerLevel: number;
}

export const SENTINEL_UPGRADE: SentinelUpgradeDef = {
  id: 'sentinel',
  baseRuneCost: 10,
  costMultiplier: 2,
  hpPerLevel: 5,
  shieldEveryLevels: 3,
  shieldBonusPerMilestone: 1,
  goldCostPerLevel: 5,
};
