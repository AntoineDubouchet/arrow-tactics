import { TALENT_BONUS_GOLD_PER_KILL, TALENT_STARTING_GOLD_BONUS } from '../config/constants';
import { isTalentUnlocked, type MetaProgress } from './metaProgress';
import type { TalentEconomyHooks } from './runState';

/**
 * REFONTE 2026-08-10 (voir CLAUDE.md, retour a une base simple) : ce module
 * ne calcule plus que les 2 effets ECONOMIQUES des talents CONSERVES (or_depart,
 * butin_de_guerre) — tout le reste (Pillage, Fonds de campagne, Prime de
 * victoire/risque, Profiteur de guerre, Intérêts, Spéculateur, Liquidation,
 * Recyclage, Assurance militaire, Chasseur de primes) a ete retire avec les
 * 20 talents mineurs qui le portaient. Le PRINCIPE reste : seul ce module
 * (avec main.ts, qui l'appelle) sait ce qu'est un talent — run/runState.ts
 * ne recoit que des nombres/fonctions deja calcules.
 */

/** or_depart : bonus applique a STARTING_GOLD. */
export function computeStartingGoldBonus(progress: MetaProgress): number {
  return isTalentUnlocked(progress, 'or_depart') ? TALENT_STARTING_GOLD_BONUS : 0;
}

/** butin_de_guerre : or supplementaire par ennemi tue. */
export function computeTalentEconomyHooks(progress: MetaProgress): TalentEconomyHooks {
  const butinActive = isTalentUnlocked(progress, 'butin_de_guerre');
  return {
    bonusGoldPerKill(): number {
      return butinActive ? TALENT_BONUS_GOLD_PER_KILL : 0;
    },
  };
}
