import { dist } from '../../core/math';
import { applyDamageToEntity } from '../damage';
import type { Entity, Team } from '../entity';

/**
 * Zone d'effet persistante GENERIQUE (2026-08-14, premier consommateur :
 * Blizzard, voir data/talents.ts + main.ts castIceNova) — pas specifique a
 * la glace : reutilisable telle quelle pour un futur poison/feu/aura/
 * meteore/sanctuaire (demande explicite d'Antoine, point 34). Reste
 * volontairement PRAGMATIQUE (un seul champ d'effet, degats plats par tick)
 * plutot qu'une abstraction a callback — c'est la forme la plus commune
 * pour ce genre de zone, et rien ne justifie plus pour un seul consommateur
 * aujourd'hui.
 *
 * Cible a CHAQUE tick les unites REELLEMENT presentes dans le rayon a CET
 * INSTANT (jamais une liste figee au moment de la creation de la zone) —
 * voir tickPersistentAreaEffects. `casterTeam` determine qui encaisse : les
 * unites de l'AUTRE camp (pas de friendly fire, meme convention que
 * BlastProjectile.team).
 */
/** Un tick de degats resolu (2026-08-14, demande d'Antoine : "flash blanc de
 *  degats sur chaque tick du Blizzard") — meme forme que AbilityEvent
 *  'blast-impact' (sim/systems/abilities.ts), reutilisee ici pour rester
 *  coherent : `hitIds` liste les entites REELLEMENT touchees par CE tick
 *  precis (peut etre vide si personne n'est dans le rayon a cet instant),
 *  jamais les cibles au moment de la creation de la zone. */
export interface AreaEffectTickEvent {
  x: number;
  z: number;
  radius: number;
  hitIds: number[];
}

export interface PersistentAreaEffect {
  casterTeam: Team;
  x: number;
  z: number;
  radius: number;
  /** Secondes ecoulees depuis la creation de la zone. */
  elapsed: number;
  duration: number;
  tickInterval: number;
  damagePerTick: number;
  /** Nombre de ticks DEJA resolus — evite de retraiter deux fois le meme
   *  palier de temps et plafonne au nombre de ticks THEORIQUEMENT possible
   *  sur `duration` (duration=4, tickInterval=1 -> exactement 4 ticks,
   *  jamais 5). */
  ticksFired: number;
}

/**
 * Fait avancer chaque zone d'un pas de temps et resout les ticks dus —
 * `elapsed` croise un multiple de `tickInterval` (t=1, 2, 3, 4...), jamais
 * t=0 (voir data/... commentaire d'Antoine : "le premier dégât arrive après
 * une seconde"). Une `while` (pas juste un `if`) resout plusieurs ticks dus
 * d'un coup si jamais un `dt` inhabituellement long les avait fait
 * s'accumuler — n'arrive jamais en pratique a 30 Hz, mais reste correct par
 * construction. La zone est retiree du tableau des que sa duree totale est
 * ecoulee.
 *
 * Renvoie un `AreaEffectTickEvent` par tick REELLEMENT resolu (0 a N —
 * generalement 1 par appel a 30 Hz, mais la `while` ci-dessus peut en
 * produire plusieurs d'un coup) — vide si aucun tick n'etait du ce pas de
 * temps. Consomme par main.ts pour declencher le flash blanc de degats
 * (`unitViews.playHit`) sur chaque cible reellement touchee, meme motif deja
 * en place pour l'impact de la Boule de feu du Mage (voir AbilityEvent
 * 'blast-impact').
 */
export function tickPersistentAreaEffects(zones: PersistentAreaEffect[], dt: number, entities: Entity[]): AreaEffectTickEvent[] {
  const events: AreaEffectTickEvent[] = [];

  for (let i = zones.length - 1; i >= 0; i--) {
    const zone = zones[i]!;
    zone.elapsed += dt;

    const maxTicks = Math.floor(zone.duration / zone.tickInterval);
    const dueTicks = Math.min(maxTicks, Math.floor(zone.elapsed / zone.tickInterval));
    while (zone.ticksFired < dueTicks) {
      zone.ticksFired++;
      const hitIds: number[] = [];
      for (const target of entities) {
        if (!target.alive || target.team === zone.casterTeam) continue;
        if (dist(target.x, target.z, zone.x, zone.z) > zone.radius) continue;
        applyDamageToEntity(target, zone.damagePerTick);
        hitIds.push(target.id);
      }
      events.push({ x: zone.x, z: zone.z, radius: zone.radius, hitIds });
    }

    if (zone.elapsed >= zone.duration) zones.splice(i, 1);
  }

  return events;
}
