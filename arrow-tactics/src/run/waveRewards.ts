import { Rng } from '../core/rng';
import { EQUIPMENT, equipmentIds, ITEM_LEVEL_MIN, statsAtLevel, type EquipmentDef, type EquipmentStats } from '../data/equipment';

/**
 * Recompense de fin de vague (2026-11-05, decision d'Antoine, G46) : a
 * chaque vague repoussee, le joueur choisit UNE piece d'equipement parmi
 * deux, tirees dans la banque d'items (data/equipment.ts), au niveau de la
 * vague (itemLevel = numero de la vague) et aux stats deterministes
 * (statsAtLevel). Le tirage des deux definitions est pseudo-aleatoire mais
 * deterministe : meme graine de carte + meme vague = memes propositions.
 * Deux definitions distinctes, sans garantie d'un item par orientation.
 * Les recompenses non choisies s'empilent (RunState.pendingRewards, traitees
 * une par une) ; elles remplacent l'ancien +5 or de fin de vague.
 */
export interface WaveReward {
  wave: number;
  /** Deux ids distincts de la banque. */
  itemIds: [string, string];
}

/** Choix affiche / applique : exemplaire au niveau de la vague. */
export interface WaveRewardChoice {
  itemId: string;
  level: number;
  def: EquipmentDef;
  stats: EquipmentStats;
}

/** Tirage deterministe des deux propositions de la vague `wave` pour la
 *  graine `seed` (RNG du jeu, core/rng.ts). */
export function rollWaveReward(seed: number, wave: number): WaveReward {
  const ids = equipmentIds();
  if (ids.length < 2) throw new Error('Banque d’items trop petite pour une récompense');
  const rng = new Rng((Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(wave | 0, 0x85ebca6b) ^ 0x5bd1e995) >>> 0);
  const first = ids[Math.floor(rng.next() * ids.length)]!;
  const rest = ids.filter((id) => id !== first);
  const second = rest[Math.floor(rng.next() * rest.length)]!;
  return { wave, itemIds: [first, second] };
}

/** Les deux exemplaires proposes (niveau = vague, stats deterministes). */
export function waveRewardChoices(reward: WaveReward): [WaveRewardChoice, WaveRewardChoice] {
  const level = Math.max(ITEM_LEVEL_MIN, reward.wave);
  const choice = (itemId: string): WaveRewardChoice => {
    const def = EQUIPMENT[itemId];
    if (!def) throw new Error(`Item de récompense inconnu : ${itemId}`);
    return { itemId, level, def, stats: statsAtLevel(def, level) };
  };
  return [choice(reward.itemIds[0]), choice(reward.itemIds[1])];
}
