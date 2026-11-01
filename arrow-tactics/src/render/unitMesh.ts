import * as THREE from 'three';
import { getUnit } from '../data/units';
import { buildArcherModel } from './archerRig';
import { buildFantassinModel } from './fantassinRig';
import { buildFantassinV2Model, isFantassinV2Ready } from './fantassinV2Rig';
import { buildMageModel } from './mageRig';
import { buildSentinelModel } from './sentinelRig';
import { buildToonUnitModel, useToonUnit } from './toonUnitRig';
import type { Team } from '../sim/entity';

/**
 * Point d'entree pour construire la silhouette d'une unite (voir buildUnit).
 *
 * Ce fichier a longtemps contenu des silhouettes "boites" construites par le
 * code, sans aucun asset — direction artistique d'origine du projet (voir
 * CLAUDE.md, "Silhouettes"). Ce n'est PLUS le cas pour aucune unite depuis le
 * 2026-08-11 : Mage, Fantassin puis Archer sont passes a des modeles `.glb`
 * riggés (voir mageRig.ts/fantassinRig.ts/archerRig.ts), et le Cavalier
 * léger — dernier a rester en boites, jamais remplace par un modele riggé —
 * a ete retire du jeu le meme jour (trop complexe a modeliser/riggé, demande
 * explicite d'Antoine). Le systeme de boites procedurales (cache de
 * materiaux local, helpers `box()`/`mat()`) n'a donc plus aucun consommateur
 * et a ete retire — trivial a reintroduire si une future unite en a besoin
 * (voir historique CLAUDE.md pour le detail des regles de silhouette
 * d'origine : boites plutot que pantins bas-poly, lisibilite vue de haut,
 * accessoire toujours enfant du bras qui le porte, metal neutre + couleur
 * d'equipe sur le tissu).
 */

/**
 * Fantassin : modele riggé fourni par Antoine (2026-08-11, Meshy AI "Azure
 * Sentinel" — voir render/fantassinRig.ts), remplace la silhouette en
 * boites d'origine. Deuxieme unite du jeu construite hors du systeme de
 * boites procedurales (apres le Mage) — squelette anime (marche, attaque,
 * chute) precharge au demarrage du jeu (voir main.ts, `preloadFantassinModel`).
 * Consequence assumee : perte de l'instanciation GPU (voir
 * render/fantassinRig.ts pour le detail, decision explicite d'Antoine).
 */
export function buildFantassin(team: Team): THREE.Group {
  // Laboratoire Toon RTS (`?toonUnits=`, voir toonUnitRig.ts) : jamais
  // sans le parametre.
  if (useToonUnit('fantassin')) return buildToonUnitModel('fantassin', team);
  // Prototype Footman V2 (`?footman=v2`, voir fantassinV2Rig.ts) : jamais
  // pret sans le parametre ou si son chargement a echoue -> V1.
  return officialFantassin(team);
}

/**
 * Archer : modele riggé fourni par Antoine (2026-08-11, Meshy AI "Azure
 * Sentinel Archer" — voir render/archerRig.ts), remplace la silhouette en
 * boites d'origine (arc en tore, carquois en diagonale). Troisieme unite du
 * jeu construite hors du systeme de boites procedurales (apres le Mage et
 * le Fantassin) — deux exports DEJA teints fournis par Antoine (un par
 * camp), voir archerRig.ts pour le detail.
 */
export function buildArcher(team: Team): THREE.Group {
  if (useToonUnit('archer')) return buildToonUnitModel('archer', team);
  return buildArcherModel(team);
}

/**
 * Mage : modele riggé fourni par Antoine (2026-08-11, Meshy AI "Emberhood
 * Mage" — voir render/mageRig.ts), remplace la silhouette en boites
 * d'origine. Premiere unite du jeu construite hors du systeme de boites
 * procedurales : `buildMageModel` clone un squelette anime (marche, attaque,
 * incantation de la Boule de feu) precharge au demarrage du jeu (voir
 * main.ts, `preloadMageModel`). Le pilotage des clips depuis l'etat de
 * simulation vit dans `UnitViews.tickRiggedAnimation`, pas ici.
 */
export function buildMage(team: Team): THREE.Group {
  if (useToonUnit('mage')) return buildToonUnitModel('mage', team);
  return buildMageModel(team);
}

/**
 * Sentinelle : premiere unite TANK du jeu (2026-08-14, demande complete
 * d'Antoine — voir render/sentinelRig.ts), modele riggé Meshy AI deja teint
 * par camp, comme l'Archer/le Fantassin V3. Marche/attaque/Provocation
 * TOUTES procedurales (aucune animation embarquee dans le modele source).
 */
export function buildSentinel(team: Team): THREE.Group {
  if (useToonUnit('sentinel')) return buildToonUnitModel('sentinel', team);
  return buildSentinelModel(team);
}

/**
 * Oracle (2026-11-01) : soutien de l'Eglise, modele Toon RTS uniquement
 * (`human_oracle.glb`, voir toonUnitRig.ts). Sans cet asset local, il
 * reprend le Mage officiel (repli PROVISOIRE : meme baton, meme gestuelle).
 */
export function buildOracle(team: Team): THREE.Group {
  if (useToonUnit('oracle')) return buildToonUnitModel('oracle', team);
  return buildMageModel(team);
}

/** Fantassin officiel (Footman V2, sinon V1), sans passer par le laboratoire
 *  Toon : repli des unites Toon sans modele officiel. */
function officialFantassin(team: Team): THREE.Group {
  return isFantassinV2Ready() ? buildFantassinV2Model(team) : buildFantassinModel(team);
}

/** Piquier et Vengeur (2026-11-01) : modeles Toon RTS uniquement
 *  (`human_pikeman.glb`, `human_avenger.glb`). Sans ces assets locaux, ils
 *  reprennent le Fantassin officiel (repli PROVISOIRE). */
export function buildPiquier(team: Team): THREE.Group {
  if (useToonUnit('piquier')) return buildToonUnitModel('piquier', team);
  return officialFantassin(team);
}

export function buildVengeur(team: Team): THREE.Group {
  if (useToonUnit('vengeur')) return buildToonUnitModel('vengeur', team);
  return officialFantassin(team);
}

/** Construit la silhouette adaptee au kit d'une unite. Point d'entree unique
 *  utilise par le rendu de combat (UnitViews) et par les previsualisations
 *  de la phase de placement, pour ne jamais dupliquer ce switch. */
export function buildUnit(unitId: string, team: Team): THREE.Group {
  const kit = getUnit(unitId).visual.kit;
  switch (kit) {
    case 'fantassin':
      return buildFantassin(team);
    case 'archer':
      return buildArcher(team);
    case 'mage':
      return buildMage(team);
    case 'sentinel':
      return buildSentinel(team);
    case 'oracle':
      return buildOracle(team);
    case 'piquier':
      return buildPiquier(team);
    case 'vengeur':
      return buildVengeur(team);
  }
}
