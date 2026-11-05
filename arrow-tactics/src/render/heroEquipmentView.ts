import * as THREE from 'three';
import type { EquipmentVisual } from '../data/equipment';
import { cataloguePieceMesh, createHeldPiece, loadToonCatalogue, skeletonRestOf, type ToonHand } from './toonCatalogue';
import { createToonUnitMaterial, setToonTool, type ToonPaletteId } from './toonUnitRig';

/**
 * Equipement visible du Heros (2026-11-02) : objets tenus des items equipes
 * (data/equipment.ts, `visual`), poses dans les mains de sa vue avec le
 * placement de l'Atelier (render/toonCatalogue.ts, createHeldPiece), toute
 * source de pieces confondue. Rendu seulement.
 *
 * Equipement permanent vs outil temporaire : au travail, l'outil (hache pour
 * couper, pioche pour miner, marteau pour construire) remplace l'arme
 * principale ; a la fin du travail, l'arme revient. Sans arme principale, le
 * marteau du Heros reste son arme. Les pieces de corps (casque, epaulieres)
 * ne sont pas encore affichees en jeu : le modele du Heros est un GLB fusionne.
 */
export interface HeroHeldVisuals {
  right: EquipmentVisual | null;
  left: EquipmentVisual | null;
}

const KEY = 'heroEquipmentKey';
const MESHES = 'heroEquipmentMeshes';
const HAS_WEAPON = 'heroEquipmentWeapon';

function paletteOf(view: THREE.Object3D): ToonPaletteId {
  let palette: ToonPaletteId = 'blue';
  view.traverse((obj) => {
    const material = (obj as THREE.Mesh).material as THREE.Material | undefined;
    const p = material?.userData?.['toonPalette'] as ToonPaletteId | undefined;
    if (p) palette = p;
  });
  return palette;
}

/** Objets tenus de la vue du Heros (sans effet si rien n'a change). */
export function applyHeroEquipmentVisual(view: THREE.Object3D, visuals: HeroHeldVisuals): void {
  const key = JSON.stringify(visuals);
  if (view.userData[KEY] === key) return;
  view.userData[KEY] = key;
  for (const mesh of (view.userData[MESHES] as THREE.Mesh[] | undefined) ?? []) mesh.removeFromParent();
  const meshes: THREE.Mesh[] = [];
  view.userData[MESHES] = meshes;
  view.userData[HAS_WEAPON] = visuals.right !== null;
  // L'outil affiche au repos depend de la presence d'une arme : recalcul.
  delete view.userData['toonTool'];
  const rest = skeletonRestOf(view);
  const palette = paletteOf(view);
  for (const hand of ['right', 'left'] as const satisfies readonly ToonHand[]) {
    const visual = visuals[hand];
    if (!visual) continue;
    void loadToonCatalogue(visual.source)
      .then(({ catalogue, gltf }) => {
        if (view.userData[KEY] !== key) return;
        const info = catalogue.pieces.find((p) => p.name === visual.piece);
        const source = cataloguePieceMesh(gltf, visual.piece);
        if (!info || !source) throw new Error(`Piece ${visual.piece} absente du catalogue ${visual.source}`);
        const mesh = createHeldPiece(rest, hand, info, source, createToonUnitMaterial(catalogue.textures, palette), visual);
        if (!mesh) return;
        mesh.name = `equipment_${hand}`;
        mesh.userData['equipmentHand'] = hand;
        meshes.push(mesh);
        mesh.visible = hand === 'left' || view.userData['toonTool'] === '';
      })
      .catch((error: unknown) => console.warn('Equipement du Heros : visuel indisponible.', error));
  }
}

/** Outil en main du Villageois selon son travail (chaque image) : hache
 *  (couper), pioche (miner), hache aussi pour construire (2026-11-05 : le
 *  GLB du Villageois n'a pas de marteau, KI-64) ; mains vides sinon (ni
 *  ramassage ni depot). */
export function setWorkerTool(view: THREE.Object3D, working: string | null | undefined): void {
  setToonTool(view, working === 'chop' || working === 'build' ? 'axe' : working === 'mine' ? 'pick' : '');
}

/** Outil ou arme en main selon le travail du Heros (chaque image). */
export function setHeroWorkTool(view: THREE.Object3D, working: string | null | undefined): void {
  const tool = working === 'chop' ? 'axe' : working === 'mine' ? 'pick' : working === 'build' ? 'hammer' : null;
  const weapon = view.userData[HAS_WEAPON] === true;
  setToonTool(view, tool ?? (weapon ? '' : 'hammer'));
  for (const mesh of (view.userData[MESHES] as THREE.Mesh[] | undefined) ?? []) {
    if (mesh.userData['equipmentHand'] === 'right') mesh.visible = tool === null;
  }
}
