import * as THREE from 'three';
import { getUnit } from '../data/units';
import { buildArcherModel } from './archerRig';
import { buildFantassinModel } from './fantassinRig';
import { buildMageModel } from './mageRig';
import { buildSentinelModel } from './sentinelRig';
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
  return buildFantassinModel(team);
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
  return buildMageModel(team);
}

/**
 * Sentinelle : premiere unite TANK du jeu (2026-08-14, demande complete
 * d'Antoine — voir render/sentinelRig.ts), modele riggé Meshy AI deja teint
 * par camp, comme l'Archer/le Fantassin V3. Marche/attaque/Provocation
 * TOUTES procedurales (aucune animation embarquee dans le modele source).
 */
export function buildSentinel(team: Team): THREE.Group {
  return buildSentinelModel(team);
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
  }
}
