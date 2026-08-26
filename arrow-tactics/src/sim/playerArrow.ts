import { PLAYER_ARROW_COOLDOWN, PLAYER_ARROW_HIT_RADIUS, PLAYER_ARROW_SPEED } from '../config/constants';
import { dist } from '../core/math';
import { applyDamageToEntity } from './damage';
import type { Entity } from './entity';

/**
 * La fleche du joueur, seul geste de combat qu'il controle directement.
 * Contrairement a la fleche d'archer (purement cosmetique dans le rendu, les
 * degats sont deja resolus par combatSystem avant meme que le visuel parte),
 * ce vol DOIT etre simule ici : la cible n'est pas verrouillee (vise libre au
 * sol, decision d'Antoine), donc ce qui se trouve au point vise ne peut etre
 * determine qu'au moment ou le vol simule se termine, pas au moment du tir.
 */

export interface ArrowFlight {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  /** elapsed au tick precedent : permet au rendu d'interpoler (alpha) comme
   *  pour la position des unites, plutot que de sauter par pas de 1/30s. */
  prevElapsed: number;
  elapsed: number;
  duration: number;
  /** Degats EFFECTIFS de CE tir (voir fireArrow, parametre `damage`) —
   *  copies au depart plutot que relus a l'impact (2026-08-13, talent "tir
   *  rapide" renforce) : un talent qui se debloquerait pendant le vol ne
   *  doit jamais modifier un tir deja parti, meme principe que
   *  CastState.damage (Boule de feu du Mage). */
  damage: number;
}

export interface PlayerArrowState {
  /** Secondes avant le prochain tir possible. */
  cooldown: number;
  /** Vols en cours (2026-08-14, generalise de "flight: ArrowFlight | null" a
   *  un tableau — voir fireArrowVolley : talent "Mitraillette" peut faire
   *  partir plusieurs carreaux sous UN SEUL cooldown partage). Vide = rien
   *  en vol. Un seul VOL a la fois etait deja garanti par cooldown/flight
   *  avant Mitraillette ; desormais c'est une seule VOLEE a la fois (tous
   *  ses carreaux partagent le meme cooldown, voir fireArrowVolley). */
  flights: ArrowFlight[];
}

export function createPlayerArrowState(): PlayerArrowState {
  return { cooldown: 0, flights: [] };
}

/** Un carreau a tirer dans une volee — origine ET cible INDIVIDUELLES (la
 *  cible pour la resolution de l'impact, l'origine pour un tout petit
 *  decalage visuel lateral sur les carreaux secondaires de Mitraillette,
 *  voir main.ts buildBallistaVolleyShots), mais degats/vitesse/cooldown
 *  restent communs a toute la volee (voir fireArrowVolley). */
export interface ArrowShotSpec {
  originX: number;
  originZ: number;
  targetX: number;
  targetZ: number;
  damage: number;
}

/**
 * Tente de tirer une VOLEE (1 a N carreaux, voir ArrowShotSpec) sous un
 * SEUL cooldown partage — renvoie false sans rien faire si le cooldown
 * n'est pas ecoule ou si des carreaux d'une volee precedente sont encore en
 * vol (meme garde-fou qu'avant Mitraillette, juste etendu a une VOLEE
 * entiere plutot qu'un carreau unique : "Une attaque = un declenchement",
 * jamais plusieurs cooldowns independants pour une meme attaque).
 *
 * `cooldown`/`speed` optionnels, par defaut les constantes de base : valeurs
 * EFFECTIVES apres d'eventuels talents permanents (voir data/talents.ts,
 * "tir_rapide"/"mitraillette") — ce module ne sait pas ce qu'est un talent,
 * il recoit juste les nombres finaux, calcules par l'appelant (main.ts). Le
 * cas normal (pas de Mitraillette) reste un tableau a 1 seul element —
 * comportement STRICTEMENT identique a l'ancien fireArrow().
 */
export function fireArrowVolley(
  state: PlayerArrowState,
  shots: ArrowShotSpec[],
  cooldown: number = PLAYER_ARROW_COOLDOWN,
  speed: number = PLAYER_ARROW_SPEED,
): boolean {
  if (state.cooldown > 0 || state.flights.length > 0) return false;

  for (const shot of shots) {
    const distance = dist(shot.originX, shot.originZ, shot.targetX, shot.targetZ);
    state.flights.push({
      fromX: shot.originX,
      fromZ: shot.originZ,
      toX: shot.targetX,
      toZ: shot.targetZ,
      prevElapsed: 0,
      elapsed: 0,
      duration: Math.max(0.05, distance / speed),
      damage: shot.damage,
    });
  }
  state.cooldown = cooldown;
  return true;
}

export type PlayerArrowEvent = { hit: true; targetId: number; x: number; z: number } | { hit: false; x: number; z: number };

/**
 * Avance le cooldown et TOUS les vols en cours d'un tick de simulation.
 * Chaque vol se resout INDEPENDAMMENT des que sa propre duree est atteinte
 * (des vols d'une meme volee peuvent avoir des durees differentes — l'origine
 * secondaire de Mitraillette est legerement decalee et sa cible n'est pas au
 * meme endroit que le curseur, donc pas la meme distance/duree) : la cible
 * touchee (s'il y en a une) est l'ennemie vivante la plus proche du POINT
 * VISE PAR CE VOL, a portee de PLAYER_ARROW_HIT_RADIUS — jamais un
 * verrouillage sur une entite choisie au moment du tir, puisque la cible
 * peut avoir bouge entre-temps (meme logique de resolution EXACTEMENT
 * reprise pour les carreaux secondaires de Mitraillette : "position
 * verrouillee, pas de tracking" en decoule naturellement, sans code
 * separe). Applique les degats directement (pas de jet de miss). Renvoie la
 * liste des evenements resolus ce tick (0 a N) pour que le rendu affiche un
 * retour par carreau.
 */
export function stepPlayerArrow(state: PlayerArrowState, dt: number, entities: Entity[]): PlayerArrowEvent[] {
  if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);

  if (state.flights.length === 0) return [];

  const events: PlayerArrowEvent[] = [];
  const remaining: ArrowFlight[] = [];
  for (const flight of state.flights) {
    flight.prevElapsed = flight.elapsed;
    flight.elapsed += dt;
    if (flight.elapsed < flight.duration) {
      remaining.push(flight);
      continue;
    }

    const { toX, toZ, damage } = flight;
    let closest: Entity | null = null;
    let closestDist = PLAYER_ARROW_HIT_RADIUS;
    for (const e of entities) {
      if (!e.alive || e.team !== 'enemy') continue;
      const d = dist(toX, toZ, e.x, e.z);
      if (d <= closestDist) {
        closest = e;
        closestDist = d;
      }
    }

    if (closest) {
      applyDamageToEntity(closest, damage);
      events.push({ hit: true, targetId: closest.id, x: toX, z: toZ });
    } else {
      events.push({ hit: false, x: toX, z: toZ });
    }
  }
  state.flights = remaining;
  return events;
}
