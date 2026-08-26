import type { RuneCostDef } from './unitUpgrades';

/**
 * Amelioration permanente du parchemin NOVA DE GLACE (2026-08-14, demande
 * d'Antoine) — meme famille de systeme que data/ballistaUpgrade.ts/
 * data/healScrollUpgrade.ts (RuneCostDef, premier achat -> prix double a
 * chaque achat suivant).
 */
export interface IceNovaUpgradeDef extends RuneCostDef {
  id: 'ice_nova';
  /** +N secondes par achat — demande explicite d'Antoine : LE MEME bonus
   *  est ajoute A LA FOIS a la duree du Root (immobilisation, voir
   *  config/constants.ts ICE_NOVA_ROOT_DURATION) ET a la duree de la zone
   *  Blizzard (degats, voir BLIZZARD_DURATION) — un seul champ pour les
   *  deux, jamais deux bonus distincts a synchroniser separement. */
  durationPerLevel: number;
  /** Tous les N achats, +damagePerMilestone degats de TICK affiches sur la
   *  zone Blizzard (config/constants.ts BLIZZARD_DAMAGE_PER_TICK) — n'a
   *  d'effet que si le talent Blizzard est debloque (le Root lui-meme
   *  n'inflige jamais de degats), meme principe que ballistaDamageBonus. */
  damageEveryLevels: number;
  damagePerMilestone: number;
  /** A chaque NIVEAU d'amelioration achete, +N au cout GOLD d'achat de la
   *  Nova de glace en boutique de RUN (2026-08-15, chantier polish/
   *  equilibrage — voir run/iceNovaUpgradeEffects.ts, effectiveIceNovaCost).
   *  Ne change JAMAIS le cout en RUNES de l'amelioration elle-meme. */
  goldCostPerLevel: number;
}

export const ICE_NOVA_UPGRADE: IceNovaUpgradeDef = {
  id: 'ice_nova',
  // Meme point de depart que les 4 autres ameliorations permanentes (10
  // runes, voir data/unitUpgrades.ts) — le NIVEAU reste independant.
  baseRuneCost: 10,
  costMultiplier: 2,
  durationPerLevel: 0.5,
  damageEveryLevels: 3,
  damagePerMilestone: 1,
  goldCostPerLevel: 0.5,
};
