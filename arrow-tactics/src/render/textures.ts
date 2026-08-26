import * as THREE from 'three';

/**
 * Textures du sol (herbe du dessus, terre des strates sous la surface) —
 * de vraies images PNG fournies par Antoine (2026-08-14 :
 * "C:\...\texturesol, deux textures à utiliser pour remplacer l'herbe et la
 * terre sous le plateau"), remplacent les anciennes textures generees par
 * canvas (bruit procedural : traits verts aleatoires, speckles bruns —
 * jugees stylisees plutot que photo, voir l'historique dans CLAUDE.md,
 * "Objectif de style pour ces textures"). Meme statut d'exception que les
 * rochers/arbres/props/baliste/fond de ciel/VFX deja documentes dans
 * CLAUDE.md (Stack) — la regle "aucun asset graphique" ne s'appliquait de
 * toute facon deja plus a ces elements-la.
 *
 * Chaque appel charge une instance FRAICHE (jamais un clone d'une texture
 * partagee) : cloner une THREE.Texture chargee par reseau AVANT la fin de
 * son chargement ne propage pas l'image une fois arrivee (piege connu de
 * Three.js — `clone()` copie la reference `.image` au moment de l'appel,
 * pas les mises a jour futures declenchees par le callback de chargement) —
 * plus simple et plus sur de relancer un chargement independant a chaque
 * fois. Le cache HTTP du navigateur rend les appels suivants quasi
 * gratuits ; ces fonctions ne sont de toute facon appelees qu'a la
 * construction d'un plateau (jeu ou editeur), jamais dans une boucle
 * chaude.
 */

const TEX_DIR = '/textures/ground';

function loadGroundTexture(name: string): THREE.Texture {
  const texture = new THREE.TextureLoader().load(`${TEX_DIR}/${name}`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGrassTexture(): THREE.Texture {
  return loadGroundTexture('ground_grass.png');
}

export function createDirtTexture(): THREE.Texture {
  return loadGroundTexture('ground_dirt.png');
}
