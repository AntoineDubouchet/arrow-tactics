/**
 * Bonus de statistiques d'une unite JOUEUR (2026-11-05, Pass 2 : modele
 * d'ameliorations du Hero RTS). Forme commune a deux sources de progression
 * de run, toutes deux GLOBALES a la run et RETROACTIVES (unites presentes et
 * futures) :
 *  - le niveau du batiment producteur (BuildingDef.rosterBonusPerLevel :
 *    Camp d'archerie Niv. 2 -> Archers +2 PV, +1 degats) ;
 *  - les technologies (data/technologies.ts : Forge -> Armes / Armures
 *    forgees, +10 % ; Caserne -> entrainement des Hommes d'armes).
 * Valeurs AFFICHEES (points), jamais l'echelle interne x10 ; les pourcentages
 * en points de pourcentage (10 = +10 %). Le calcul des stats finales est
 * dans run/playerUnitStats.ts : base + bonus fixes, puis x (1 + % cumules).
 */
export interface UnitBonus {
  /** +N PV max (points). */
  hp?: number;
  /** +N degats (points) sur l'attaque principale (Boule de feu pour le Mage). */
  attack?: number;
  /** +N % de PV max. */
  hpPercent?: number;
  /** +N % de degats sur l'attaque principale. */
  attackPercent?: number;
  /** +N % de vitesse de deplacement (sur la vitesse de base, avant le
   *  multiplicateur global UNIT_MOVE_SPEED_MULTIPLIER). */
  moveSpeedPercent?: number;
}

export const NO_UNIT_BONUS: Readonly<Required<UnitBonus>> = { hp: 0, attack: 0, hpPercent: 0, attackPercent: 0, moveSpeedPercent: 0 };

/** Somme de bonus (champs absents = 0). Objet frais. */
export function sumUnitBonuses(bonuses: Iterable<Readonly<UnitBonus>>): Required<UnitBonus> {
  const total = { ...NO_UNIT_BONUS };
  for (const b of bonuses) {
    total.hp += b.hp ?? 0;
    total.attack += b.attack ?? 0;
    total.hpPercent += b.hpPercent ?? 0;
    total.attackPercent += b.attackPercent ?? 0;
    total.moveSpeedPercent += b.moveSpeedPercent ?? 0;
  }
  return total;
}

/** Bonus multiplie par `times` (niveau d'un producteur). Objet frais. */
export function scaleUnitBonus(bonus: Readonly<UnitBonus>, times: number): Required<UnitBonus> {
  const b = sumUnitBonuses([bonus]);
  return { hp: b.hp * times, attack: b.attack * times, hpPercent: b.hpPercent * times, attackPercent: b.attackPercent * times, moveSpeedPercent: b.moveSpeedPercent * times };
}

export function isEmptyUnitBonus(bonus: Readonly<UnitBonus>): boolean {
  const b = sumUnitBonuses([bonus]);
  return b.hp === 0 && b.attack === 0 && b.hpPercent === 0 && b.attackPercent === 0 && b.moveSpeedPercent === 0;
}

/** Texte court d'un bonus (« +2 PV, +1 dégâts », « +10 % PV », « +5 %
 *  vitesse »), vide s'il est nul. `attackLabel` : nom de l'attaque
 *  principale quand ce n'est pas « dégâts » (ex. « Boule de feu »). */
export function describeUnitBonus(bonus: Readonly<UnitBonus>, attackLabel = 'dégâts'): string {
  const b = sumUnitBonuses([bonus]);
  const parts: string[] = [];
  if (b.hp !== 0) parts.push(`${sign(b.hp)} PV`);
  if (b.attack !== 0) parts.push(`${sign(b.attack)} ${attackLabel}`);
  if (b.hpPercent !== 0) parts.push(`${sign(b.hpPercent)} % PV`);
  if (b.attackPercent !== 0) parts.push(`${sign(b.attackPercent)} % ${attackLabel}`);
  if (b.moveSpeedPercent !== 0) parts.push(`${sign(b.moveSpeedPercent)} % vitesse`);
  return parts.join(', ');
}

function sign(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const text = Number.isInteger(rounded) ? String(Math.abs(rounded)) : Math.abs(rounded).toFixed(1);
  return `${n < 0 ? '−' : '+'}${text}`;
}
