import type { UpgradeDefBase } from './unitUpgrades';

/**
 * Amelioration permanente de la SENTINELLE (2026-08-14, demande d'Antoine) —
 * meme famille de systeme que data/ballistaUpgrade.ts/data/iceNovaUpgrade.ts/
 * data/mineUpgrade.ts (UpgradeDefBase) plutot que data/unitUpgrades.ts (UnitUpgradeDef) : la
 * Sentinelle ne gagne JAMAIS d'attaque via cette amelioration (demande
 * explicite, point 35 — "ne lui applique pas automatiquement la regle +1
 * attack = +1 gold"), `UnitUpgradeDef` suppose au contraire qu'un palier
 * d'attaque existe toujours (`attackEveryLevels`),
 * forme inadaptee ici.
 *
 * REVIREMENT explicite le 2026-08-15 (chantier polish/equilibrage) : le cout
 * GOLD de RECRUTEMENT, jusque-la TOUJOURS fixe a 40 — Antoine demande
 * desormais explicitement l'inverse ("augmente FORTEMENT le prix de
 * recrutement Gold de la Sentinelle en fonction de son niveau d'amelioration
 * permanente... `40 + sentinelUpgradeLevel * 5`"), conscient de revenir sur
 * cette decision.
 *
 * Refonte economique (ameliorations achetees en Or pendant la run, a la
 * Forge) : ce surcout de recrutement est SUPPRIME — une amelioration ne
 * renchérit plus ce qu'elle ameliore, la Sentinelle revient a son cout de
 * base. Les bonus PV/Bouclier (hpPerLevel/shieldEveryLevels ci-dessous)
 * restent inchanges.
 */
export interface SentinelUpgradeDef extends UpgradeDefBase {
  id: 'sentinel';
  /** +N PV AFFICHES (pas l'echelle interne) par achat. */
  hpPerLevel: number;
  /** Tous les N achats, +1 point de BOUCLIER (affiche) par ennemi provoque. */
  shieldEveryLevels: number;
  shieldBonusPerMilestone: number;
}

export const SENTINEL_UPGRADE: SentinelUpgradeDef = {
  id: 'sentinel',
  hpPerLevel: 5,
  shieldEveryLevels: 3,
  shieldBonusPerMilestone: 1,
};
