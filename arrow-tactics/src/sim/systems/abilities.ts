import { CHARGE_KNOCKBACK_TILES, TILE, type ObstacleDef } from '../../config/constants';
import { clamp, dist } from '../../core/math';
import { findAbility, type AreaBlastAbility, type ChargeAbility, type TauntAbility } from '../../data/abilities';
import { getUnit } from '../../data/units';
import { applyDamageToEntity } from '../damage';
import type { Entity, Team } from '../entity';
import { findBlockingObstacle, obstaclesCollidingTeam } from '../geometry';

/**
 * Systeme GENERIQUE de capacites d'unite (2026-08-10, demande explicite
 * d'Antoine : "la Charge doit etre la premiere vraie capacite d'unite
 * generique, pas un morceau de code special Cavalier"). Deux capacites
 * existent aujourd'hui (charge, area-blast — voir data/abilities.ts) ; une
 * future (soin, buff...) ajoutera un type a data/abilities.ts et une branche
 * `if (findAbility(def.abilities, 'sontype'))` ici, jamais un
 * `if (unit.id === '...')` disperse ailleurs dans le moteur.
 *
 * Responsabilites par tick, par entite vivante :
 *  1. Faire descendre les cooldowns de capacites (generique, toutes capacites
 *     confondues).
 *  2. Si une ruee (dash) est en cours, l'avancer et la resoudre a l'arrivee.
 *  3. Sinon, si une incantation (cast) est en cours, l'avancer et lancer le
 *     projectile a l'issue — voir Entity.cast, "la position est verrouillee
 *     au debut de l'incantation" (mecanique centrale du Mage, 2026-08-11).
 *  4. Sinon, tenter de declencher une capacite disponible.
 *  5. Faire voler et resoudre les projectiles de zone deja lances
 *     (`blasts`, voir advanceBlasts) — INDEPENDANT du cycle de vie de leur
 *     lanceur (doit survivre a sa mort, voir CLAUDE.md point 18/19).
 *
 * Le declenchement de la Charge REUTILISE le ciblage existant (`e.targetId`,
 * pose par targetingSystem) plutot que de scanner les ennemis une deuxieme
 * fois avec une regle differente — "regle deterministe coherente avec notre
 * systeme actuel de ciblage" (demande d'Antoine), obtenue gratuitement. Le
 * declenchement de la Boule de feu reutilise `e.targetId` comme simple PORTE
 * ("y a-t-il quelqu'un a portee d'aggro"), mais choisit ensuite sa PROPRE
 * position d'impact parmi TOUS les ennemis a portee valide (voir
 * findBestAreaImpact), pas seulement la cible verrouillee — l'attaque de
 * zone doit pouvoir viser un autre ennemi que `targetId` si ca regroupe plus
 * de monde.
 */

export type AbilityEvent =
  | { type: 'charge-start'; entityId: number; targetId: number }
  | { type: 'charge-impact'; entityId: number; targetId: number; x: number; z: number }
  | { type: 'blast-launch'; entityId: number; fromX: number; fromZ: number; targetX: number; targetZ: number }
  | { type: 'blast-impact'; x: number; z: number; radiusTiles: number; hitIds: number[] }
  | { type: 'taunt'; entityId: number; x: number; z: number; radiusTiles: number; targetIds: number[]; shieldAmount: number };

/**
 * Projectile de zone EN VOL, independant de son lanceur (voir Entity.cast
 * pour l'incantation qui le precede, elle-meme liee au lanceur et annulee
 * s'il meurt). Une fois ici, rien ne le relie plus a `entityId` — meme si le
 * Mage meurt juste apres avoir lance sa Boule de feu, elle continue son vol
 * et explose normalement (demande explicite d'Antoine, point 18/19).
 */
export interface BlastProjectile {
  /** Camp du LANCEUR au moment du tir — determine qui encaisse les degats a
   *  l'impact (pas de friendly fire pour cette V1), fige ici pour ne plus
   *  dependre d'une Entity qui pourrait ne plus exister. */
  team: Team;
  fromX: number;
  fromZ: number;
  targetX: number;
  targetZ: number;
  elapsed: number;
  duration: number;
  damage: number;
  radiusTiles: number;
  knockbackTiles?: number;
}

export function abilitySystem(
  entities: Entity[],
  dt: number,
  obstacles: ObstacleDef[],
  boardWidth: number,
  boardHeight: number,
  blasts: BlastProjectile[],
  // Temps de simulation ecoule depuis le debut de LA bataille en cours
  // (voir World.time — remis a 0 par World.clear(), jamais avance pendant
  // le placement ni la Pause) — lu UNIQUEMENT par tryTriggerTaunt pour le
  // verrou initial de Provocation (TauntAbility.initialLockoutSeconds),
  // 2026-08-14. Ne concerne aucune autre capacite.
  battleElapsedTime: number,
): AbilityEvent[] {
  const events: AbilityEvent[] = [];
  const byId = new Map(entities.map((e) => [e.id, e]));

  for (const e of entities) {
    if (!e.alive) {
      // Incantation interrompue SANS projectile (point 18 : "si le Mage
      // meurt pendant son incantation, l'incantation est annulee et aucun
      // projectile n'est cree") — distinct d'un projectile DEJA lance
      // (stocke dans `blasts`, jamais sur l'entite), qui lui continue.
      e.dash = null;
      e.cast = null;
      continue;
    }

    // Batiments gameplay (Mine, Baliste — 2026-08-16, voir Entity.isBuilding) :
    // n'ont jamais de capacite (pas d'entree dans data/units.ts, getUnit()
    // leverait "Unite inconnue"). Bug reel trouve en testant : sans ce
    // garde-fou, cette exception abortait TOUTE la fonction des qu'un
    // batiment etait atteint dans la boucle — advanceBlasts(...) plus bas
    // (qui fait avancer les Boules de feu du Mage DEJA en vol) n'etait alors
    // JAMAIS appelee, cassant le combat du Mage des qu'un batiment gameplay
    // existait dans la bataille.
    if (e.isBuilding) continue;

    for (const key of Object.keys(e.abilityCooldowns) as (keyof typeof e.abilityCooldowns)[]) {
      const remaining = e.abilityCooldowns[key];
      if (remaining !== undefined && remaining > 0) e.abilityCooldowns[key] = Math.max(0, remaining - dt);
    }

    // Expiration du Shield temporaire (Provocation, 2026-08-14 — voir
    // Entity.shieldTimer) : GENERIQUE, decompte pour TOUTE entite vivante
    // avec un shield actif, pas seulement les Sentinelles (systeme reutilisable
    // pour de futures sources). Retombe a 0 meme si tout n'a pas ete consomme
    // par des degats (voir sim/damage.ts).
    if (e.shieldTimer > 0) {
      e.shieldTimer = Math.max(0, e.shieldTimer - dt);
      if (e.shieldTimer <= 0) e.shield = 0;
    }

    if (e.dash) {
      advanceDash(e, dt, byId, boardWidth, boardHeight, events);
      continue;
    }

    if (e.cast) {
      advanceCast(e, dt, blasts, events);
      continue;
    }

    const charge = findAbility(getUnit(e.unitId).abilities, 'charge');
    if (charge && (e.abilityCooldowns.charge ?? 0) <= 0) {
      tryTriggerCharge(e, charge, byId, obstacles, boardWidth, boardHeight, events);
      continue;
    }

    const areaBlast = findAbility(getUnit(e.unitId).abilities, 'area-blast');
    if (areaBlast && (e.abilityCooldowns['area-blast'] ?? 0) <= 0) {
      tryTriggerAreaBlast(e, areaBlast, entities);
      continue;
    }

    const taunt = findAbility(getUnit(e.unitId).abilities, 'taunt');
    if (taunt && (e.abilityCooldowns.taunt ?? 0) <= 0) {
      tryTriggerTaunt(e, taunt, entities, events, battleElapsedTime);
    }
  }

  advanceBlasts(blasts, dt, entities, boardWidth, boardHeight, events);

  return events;
}

/**
 * Avance l'incantation en cours d'un pas de temps ; a l'issue du castTime,
 * lance le projectile (ajoute a `blasts`, INDEPENDANT de l'entite des cet
 * instant) et libere l'entite (`e.cast = null`, redonne la main au ciblage/
 * mouvement/combat normaux des le tick suivant).
 */
function advanceCast(e: Entity, dt: number, blasts: BlastProjectile[], events: AbilityEvent[]): void {
  const cast = e.cast!;
  cast.elapsed += dt;
  if (cast.elapsed < cast.duration) return;

  const travelDist = dist(e.x, e.z, cast.targetX, cast.targetZ);
  blasts.push({
    team: e.team,
    fromX: e.x,
    fromZ: e.z,
    targetX: cast.targetX,
    targetZ: cast.targetZ,
    elapsed: 0,
    duration: Math.max(0.05, travelDist / cast.projectileSpeed),
    damage: cast.damage,
    radiusTiles: cast.radiusTiles,
    knockbackTiles: cast.knockbackTiles,
  });
  events.push({ type: 'blast-launch', entityId: e.id, fromX: e.x, fromZ: e.z, targetX: cast.targetX, targetZ: cast.targetZ });
  e.cast = null;
}

/**
 * Verifie qu'une position d'impact valide existe (voir findBestAreaImpact)
 * et declenche l'incantation si oui — sinon ne fait RIEN : le cooldown ne
 * doit demarrer que sur un declenchement REEL (meme principe que la Charge).
 * Le cooldown demarre ICI, au DEBUT de l'incantation (voir data/abilities.ts,
 * AreaBlastAbility.cooldown) — jamais a l'impact, pour qu'aucun enchainement
 * de projectiles plus rapide que prevu ne soit possible.
 */
function tryTriggerAreaBlast(e: Entity, ability: AreaBlastAbility, entities: Entity[]): void {
  if (e.targetId === null) return;

  const impact = findBestAreaImpact(e, ability, entities);
  if (!impact) return;

  e.cast = {
    targetX: impact.x,
    targetZ: impact.z,
    elapsed: 0,
    duration: ability.castTime,
    projectileSpeed: ability.projectileSpeed,
    // + e.abilityDamageBonus (2026-08-13, boutique d'amelioration permanente
    // du JOUEUR — voir run/unitUpgradeEffects.ts) : toujours 0 pour un
    // ennemi (voir World.spawn), donc sans effet sur son propre Mage.
    damage: ability.damage + e.abilityDamageBonus,
    radiusTiles: ability.radiusTiles,
    knockbackTiles: ability.knockbackTiles,
  };
  // Pas d'evenement "cast-start" dedie : le rendu (telegraphe au sol + orbe
  // lumineux, voir render/) lit Entity.cast directement chaque frame, pas
  // besoin d'un evenement ponctuel en plus de cet etat deja disponible.
  e.abilityCooldowns['area-blast'] = ability.cooldown;
}

/**
 * Choisit la MEILLEURE position d'impact parmi les ennemis a portee valide
 * (min <= distance <= max) du lanceur : pour chaque candidat, compte combien
 * d'ennemis (n'importe lesquels, pas seulement ceux a portee du lanceur)
 * tomberaient dans `radiusTiles` de sa position, et retient le score le plus
 * eleve. Egalite : le candidat le plus proche du lanceur, puis l'id le plus
 * bas (regle deterministe, jamais de choix aleatoire — demande explicite).
 * Renvoie null si aucun ennemi n'est a portee valide.
 */
function findBestAreaImpact(e: Entity, ability: AreaBlastAbility, entities: Entity[]): { x: number; z: number } | null {
  const candidates = entities.filter((o) => {
    if (o.team === e.team || !o.alive) return false;
    const d = dist(e.x, e.z, o.x, o.z);
    return d >= ability.minRangeTiles && d <= ability.maxRangeTiles;
  });
  if (candidates.length === 0) return null;

  let best: Entity | null = null;
  let bestScore = -1;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    let score = 0;
    for (const other of entities) {
      if (other.team === e.team || !other.alive) continue;
      if (dist(candidate.x, candidate.z, other.x, other.z) <= ability.radiusTiles) score++;
    }

    const d = dist(e.x, e.z, candidate.x, candidate.z);
    const better =
      score > bestScore ||
      (score === bestScore && d < bestDist) ||
      (score === bestScore && d === bestDist && (best === null || candidate.id < best.id));
    if (better) {
      best = candidate;
      bestScore = score;
      bestDist = d;
    }
  }

  return best ? { x: best.x, z: best.z } : null;
}

/**
 * Avance tous les projectiles de zone deja lances et resout leur impact des
 * que la duree de vol est ecoulee — INDEPENDANT de l'entite lanceuse (voir
 * BlastProjectile). Degats appliques a CHAQUE unite ennemie (jamais le camp
 * du lanceur, pas de friendly fire pour cette V1) dans `radiusTiles` du
 * point d'impact VERROUILLE — pas la cible d'origine, qui a pu bouger ou
 * mourir entre-temps (points 18-19).
 *
 * Recul radial optionnel (`b.knockbackTiles`, 2026-08-11 — demande d'Antoine
 * apres avoir vu l'explosion en jeu, "un bump depuis la zone d'impact") :
 * repousse CHAQUE cible touchee depuis le POINT D'IMPACT (pas depuis le
 * lanceur, contrairement a la Charge qui repousse dans l'axe cavalier->cible)
 * — coherent avec une explosion radiale plutot qu'une direction unique.
 * Meme tolerance deja acceptee pour la Charge : pas de verification
 * d'obstacle sur la destination (resolveObstacleCollisions la ressort au
 * tick suivant si besoin), seules les limites du plateau sont respectees.
 */
function advanceBlasts(
  blasts: BlastProjectile[],
  dt: number,
  entities: Entity[],
  boardWidth: number,
  boardHeight: number,
  events: AbilityEvent[],
): void {
  const halfW = (boardWidth * TILE) / 2;
  const halfH = (boardHeight * TILE) / 2;

  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i]!;
    b.elapsed += dt;
    if (b.elapsed < b.duration) continue;

    const hitIds: number[] = [];
    for (const target of entities) {
      if (!target.alive || target.team === b.team) continue;
      const d = dist(target.x, target.z, b.targetX, b.targetZ);
      if (d > b.radiusTiles) continue;

      applyDamageToEntity(target, b.damage);
      hitIds.push(target.id);

      // Batiments (Mine, Baliste) : degats, mais jamais de recul — exclus de
      // movementSystem, rien ne les ramenerait ensuite sur leur case.
      if (b.knockbackTiles && !target.isBuilding) {
        let dirX: number;
        let dirZ: number;
        if (d > 1e-4) {
          dirX = (target.x - b.targetX) / d;
          dirZ = (target.z - b.targetZ) / d;
        } else {
          // Cible pile sur le point d'impact (d ~ 0) : direction radiale
          // indefinie. Cas FREQUENT — l'impact est verrouille sur la position
          // d'un ennemi (findBestAreaImpact), donc toute cible restee
          // immobile pendant l'incantation et le vol est exactement au
          // centre. On continue la direction de vol du projectile (lanceur ->
          // impact, figee dans le projectile, valable meme si le lanceur est
          // mort) : la cible est repoussee LOIN du lanceur, comme la Charge.
          // L'ancien +Z fixe la tirait vers un Mage du joueur. +Z ne reste
          // qu'en dernier recours, si le vol lui-meme est degenere.
          const flight = dist(b.fromX, b.fromZ, b.targetX, b.targetZ);
          dirX = flight > 1e-4 ? (b.targetX - b.fromX) / flight : 0;
          dirZ = flight > 1e-4 ? (b.targetZ - b.fromZ) / flight : 1;
        }
        const pushX = dirX * b.knockbackTiles * TILE;
        const pushZ = dirZ * b.knockbackTiles * TILE;
        target.x = clamp(target.x + pushX, -halfW + target.stats.radius, halfW - target.stats.radius);
        target.z = clamp(target.z + pushZ, -halfH + target.stats.radius, halfH - target.stats.radius);
      }
    }
    events.push({ type: 'blast-impact', x: b.targetX, z: b.targetZ, radiusTiles: b.radiusTiles, hitIds });
    blasts.splice(i, 1);
  }
}

/** Avance une ruee en cours d'un pas de temps ; resout l'impact (degats +
 *  evenement) des que la distance prevue est parcourue. Deplacement direct
 *  (pas de contournement, pas de separation) : le chemin a deja ete verifie
 *  degage au declenchement, et une ruee est trop breve pour justifier de
 *  reagir a un changement de situation en cours de route. */
function advanceDash(
  e: Entity,
  dt: number,
  byId: Map<number, Entity>,
  boardWidth: number,
  boardHeight: number,
  events: AbilityEvent[],
): void {
  const dash = e.dash!;
  dash.elapsed += dt;
  const t = dash.duration > 0 ? Math.min(1, dash.elapsed / dash.duration) : 1;

  e.x = dash.fromX + (dash.toX - dash.fromX) * t;
  e.z = dash.fromZ + (dash.toZ - dash.fromZ) * t;

  if (t < 1) return;

  const target = byId.get(dash.targetId);
  if (target && target.alive) {
    // Le point d'arret a ete fige AU DECLENCHEMENT (voir tryTriggerCharge) ;
    // si la cible a continue de se rapprocher pendant le court vol de la ruee
    // (elle n'est pas figee, elle), un leger chevauchement residuel est
    // possible a l'arrivee. Correction finale, meme principe que
    // resolveObstacleCollisions (movement.ts) : on ressort le cavalier a
    // l'exacte distance de contact minimale si besoin, jamais en dessous —
    // garantit l'absence de superposition quoi qu'il arrive. Marge (STOP_MARGIN)
    // volontairement retranchee : atterrir PILE sur le seuil d'attackRange est
    // fragile au bruit flottant (movementSystem peut alors se voir "hors de
    // portee" par une poussiere de valeur et faire un micro-pas de poursuite
    // le tick suivant, observe en test headless) — sans consequence sur le
    // "jamais superpose" demande, la marge est trois ordres de grandeur sous
    // le rayon des corps.
    const STOP_MARGIN = 1e-3;
    const stopDistance = e.stats.attackRange + target.stats.radius - STOP_MARGIN;
    const dx = e.x - target.x;
    const dz = e.z - target.z;
    const d = Math.hypot(dx, dz);
    if (d < stopDistance) {
      const scale = d > 1e-4 ? stopDistance / d : 1;
      e.x = target.x + (d > 1e-4 ? dx * scale : stopDistance);
      e.z = target.z + (d > 1e-4 ? dz * scale : 0);
    }

    applyDamageToEntity(target, dash.damage);

    // "Bump d'impact" (demande d'Antoine, 2026-08-10) : repousse la cible
    // d'une case en CONTINUANT l'axe de la charge, donc dans la direction
    // cavalier -> cible (l'oppose de dx/dz, qui pointent cible -> cavalier)
    // — jamais vers le cavalier lui-meme. Pas de verification d'obstacle
    // sur la destination : resolveObstacleCollisions (movementSystem) la
    // ressort au tick suivant si besoin, meme tolerance deja acceptee pour
    // la separation entre corps — seules les limites du plateau sont
    // respectees ici, pour ne jamais ejecter une unite hors de la carte.
    const pushLen = d > 1e-4 ? d : 1;
    const pushX = (-dx / pushLen) * CHARGE_KNOCKBACK_TILES * TILE;
    const pushZ = (-dz / pushLen) * CHARGE_KNOCKBACK_TILES * TILE;
    const halfW = (boardWidth * TILE) / 2;
    const halfH = (boardHeight * TILE) / 2;
    target.x = clamp(target.x + pushX, -halfW + target.stats.radius, halfW - target.stats.radius);
    target.z = clamp(target.z + pushZ, -halfH + target.stats.radius, halfH - target.stats.radius);

    events.push({ type: 'charge-impact', entityId: e.id, targetId: target.id, x: e.x, z: e.z });
  }
  e.dash = null;
}

/**
 * Verifie les 3 conditions de la Charge (distance, trajectoire degagee,
 * arrivee dans les limites du plateau) et la declenche si toutes passent —
 * sinon ne fait RIEN : le cooldown ne doit demarrer que sur un declenchement
 * REEL (demande explicite d'Antoine), jamais sur une tentative invalide.
 *
 * Point d'arret calcule EXACTEMENT comme le reste du jeu s'arrete pour
 * attaquer (voir movementSystem : `d <= attackRange + target.radius`) — pour
 * ne jamais superposer le Cavalier et sa cible, et pour qu'il puisse enchainer
 * sur une attaque automatique normale des l'impact.
 */
function tryTriggerCharge(
  e: Entity,
  ability: ChargeAbility,
  byId: Map<number, Entity>,
  obstacles: ObstacleDef[],
  boardWidth: number,
  boardHeight: number,
  events: AbilityEvent[],
): void {
  // Rootee (Nova de glace, 2026-08-14 — voir Entity.rootTimer) : aucun
  // nouveau deplacement volontaire, la Charge en fait partie. Une Charge
  // DEJA en cours au moment ou le Root frappe est coupee ailleurs
  // (World.applyIceNovaRoot met e.dash a null directement), donc ce garde-fou
  // ne couvre que le DECLENCHEMENT d'une nouvelle Charge.
  if (e.rootTimer > 0) return;

  if (e.targetId === null) return;
  const target = byId.get(e.targetId);
  if (!target || !target.alive) return;

  const d = dist(e.x, e.z, target.x, target.z);
  if (d > ability.maxRangeTiles) return;

  // Trajectoire libre : reutilise le meme test de ligne degagee que la ligne
  // de tir en combat et le contournement en mouvement (voir geometry.ts) —
  // AUCUNE liste d'obstacles speciale pour la Charge. Teste jusqu'a la cible
  // elle-meme (pas jusqu'au point d'arret), coherent avec les diagrammes de
  // la demande (C -> case -> case -> T).
  // target.footprintObstacle (2026-08-16) : meme correctif que combatSystem —
  // un batiment cible (Mine/Baliste) ne doit jamais se declarer bloquant
  // envers lui-meme.
  if (findBlockingObstacle(e.x, e.z, target.x, target.z, obstaclesCollidingTeam(obstacles, e.team), target.footprintObstacle)) return;

  const dirX = d > 1e-4 ? (target.x - e.x) / d : 0;
  const dirZ = d > 1e-4 ? (target.z - e.z) / d : 1;
  const stopDistance = e.stats.attackRange + target.stats.radius;
  // max(0, ...) : si la cible est deja a portee de melee (ex. charge a 1
  // case avec une portee d'attaque proche de 1), la ruee ne doit jamais
  // reculer pour "reculer jusqu'a la bonne distance" — elle reste sur place
  // et l'impact se resout au prochain tick.
  const travelDistance = Math.max(0, d - stopDistance);
  const toX = e.x + dirX * travelDistance;
  const toZ = e.z + dirZ * travelDistance;

  // Bord de plateau : verification explicite en plus de la trajectoire
  // degagee — un segment entre deux points deja sur le plateau reste
  // toujours a l'interieur d'un plateau rectangulaire (convexite), donc ce
  // cas ne devrait normalement jamais se produire, mais un garde-fou direct
  // reste plus sur qu'un raisonnement geometrique implicite.
  const halfW = (boardWidth * TILE) / 2;
  const halfH = (boardHeight * TILE) / 2;
  if (toX < -halfW || toX > halfW || toZ < -halfH || toZ > halfH) return;

  e.dash = {
    targetId: target.id,
    fromX: e.x,
    fromZ: e.z,
    toX,
    toZ,
    elapsed: 0,
    duration: travelDistance / ability.dashSpeed,
    // + e.abilityDamageBonus, meme principe que la Boule de feu ci-dessus —
    // aucune unite actuelle n'a a la fois Charge et une amelioration
    // permanente definie (voir data/unitUpgrades.ts), mais generique par
    // construction pour un futur Chevalier lourd.
    damage: ability.damage + e.abilityDamageBonus,
  };
  e.abilityCooldowns.charge = ability.cooldown;
  events.push({ type: 'charge-start', entityId: e.id, targetId: target.id });
}

/**
 * Provocation (Sentinelle, 2026-08-14) : declenchement INSTANTANE, pas de
 * dash/cast comme la Charge/la Boule de feu — au moment ou elle se
 * declenche, l'effet (forcer la cible + gagner du Shield) est deja resolu.
 *
 * Gate bon marche AVANT le scan complet (`e.targetId === null` -> return),
 * meme optimisation que tryTriggerAreaBlast : `targetId` n'est non-null que
 * si un ennemi est deja dans l'AGGRO (voir targetingSystem), et
 * `radiusTiles` (Provocation) est TOUJOURS strictement inferieur a
 * `aggroRange` dans les donnees actuelles — si aucun ennemi n'est dans
 * l'aggro, aucun ne peut etre dans le rayon (plus petit) de Provocation non
 * plus, le gate ne peut donc jamais faire manquer un declenchement
 * legitime. Evite de scanner `entities` a CHAQUE tick pour chaque
 * Sentinelle prete tant qu'aucun ennemi n'est meme a proximite generale
 * (demande explicite d'Antoine, point 74 : "ne scanne pas inutilement
 * toute la World a chaque frame").
 *
 * Seules les cibles REELLEMENT valides comptent (point 22 de la demande) :
 * vivantes, du camp oppose, non immunisees (`tauntImmune`, reserve pour un
 * futur boss — aucune unite actuelle ne l'a) — jamais le nombre brut
 * d'entites dans le rayon. Aucun declenchement (cooldown NON consomme) si
 * personne n'est valide, meme regle que Charge/Boule de feu.
 */
function tryTriggerTaunt(e: Entity, ability: TauntAbility, entities: Entity[], events: AbilityEvent[], battleElapsedTime: number): void {
  // Verrou initial (2026-08-14) — AVANT toute autre condition, y compris le
  // gate bon marche ci-dessous : tant que la bataille n'a pas atteint
  // `initialLockoutSeconds` de temps de SIMULATION ecoule, Provocation est
  // interdite meme si le cooldown est pret et des ennemis sont dans le
  // rayon. Ne touche JAMAIS `e.abilityCooldowns.taunt` — le cooldown normal
  // (ability.cooldown) reste totalement independant, pret a demarrer sa
  // propre duree des la PREMIERE utilisation reelle, jamais artificiellement
  // consomme pendant l'attente.
  if (battleElapsedTime < (ability.initialLockoutSeconds ?? 0)) return;

  if (e.targetId === null) return;

  const targets = entities.filter(
    (o) => o.alive && o.team !== e.team && !o.stats.tauntImmune && dist(e.x, e.z, o.x, o.z) <= ability.radiusTiles,
  );
  if (targets.length === 0) return;

  for (const target of targets) {
    // Dernier Taunt valide = priorite actuelle (point 15 de la demande,
    // pas de systeme de menace) : REMPLACE simplement l'ancien, y compris
    // si c'est la MEME Sentinelle qui reprovoque une cible deja provoquee
    // (rafraichit juste la duree).
    target.tauntSourceId = e.id;
    target.tauntTimer = ability.tauntDuration;
  }

  // Shield : SEULES les cibles reellement provoquees comptent (targets.length,
  // deja filtre ci-dessus) — jamais le nombre brut d'entites dans le rayon.
  // Un nouveau Taunt REMPLACE le shield existant (voir Entity.shieldTimer),
  // ne l'additionne jamais a un reste eventuel.
  const effectiveShieldPerTarget = ability.baseShieldPerTarget + e.tauntShieldBonus;
  e.shield = targets.length * effectiveShieldPerTarget;
  e.shieldTimer = ability.shieldDuration;

  e.abilityCooldowns.taunt = ability.cooldown;
  events.push({
    type: 'taunt',
    entityId: e.id,
    x: e.x,
    z: e.z,
    radiusTiles: ability.radiusTiles,
    targetIds: targets.map((t) => t.id),
    shieldAmount: e.shield,
  });
}
