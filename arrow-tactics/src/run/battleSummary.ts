import { getUnit, UNITS } from '../data/units';
import { roundGold } from './runState';

/**
 * Bilan d'UNE manche (ecran de fin de vague) : ennemis vaincus par type et
 * or gagne pendant la manche. Alimente par main.ts au fil des evenements de
 * jeu (morts ennemies detectees dans la simulation, productions des Mines,
 * bonus de victoire), jamais recompte depuis le rendu. Remis a zero au
 * lancement de chaque vraie bataille.
 *
 * `goldEarned` ne compte QUE des gains : jamais l'or possede au depart, ni
 * les achats ou depenses de la preparation.
 */
export interface BattleSummary {
  defeatedByUnitId: Map<string, number>;
  goldEarned: number;
}

export function createBattleSummary(): BattleSummary {
  return { defeatedByUnitId: new Map(), goldEarned: 0 };
}

export function recordEnemyDefeated(summary: BattleSummary, unitId: string): void {
  summary.defeatedByUnitId.set(unitId, (summary.defeatedByUnitId.get(unitId) ?? 0) + 1);
}

export function recordGoldEarned(summary: BattleSummary, amount: number): void {
  if (Number.isFinite(amount) && amount > 0) summary.goldEarned = roundGold(summary.goldEarned + amount);
}

export interface BattleSummaryLine {
  label: string;
  value: number;
}

/** Une ligne par type d'ennemi REELLEMENT vaincu (aucune ligne a 0), dans
 *  l'ordre des definitions d'unites (jamais l'ordre des morts). */
export function defeatedLines(summary: BattleSummary): BattleSummaryLine[] {
  const order = Object.keys(UNITS);
  return [...summary.defeatedByUnitId.entries()]
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([unitId, count]) => ({ label: `${pluralName(getUnit(unitId).name)} ${FEMININE_UNIT_IDS.has(unitId) ? 'vaincues' : 'vaincus'}`, value: count }));
}

/** Noms d'unite feminins, pour l'accord de « vaincu(e)s ». */
const FEMININE_UNIT_IDS: ReadonlySet<string> = new Set(['sentinel']);

function pluralName(name: string): string {
  return /[sx]$/.test(name) ? name : `${name}s`;
}
