// Footman V2 : compare les assets generes aux exports Meshy (os, sommets, skin, clips, equipements).
// Usage (depuis arrow-tactics/) : node tools/footman-v2/verify-models.mjs [--source <dir>] [--out <dir>]
// Code de sortie 1 si un ecart depasse les tolerances.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { CLIPS, EQUIPMENT, TEAMS, parseArgs } from './footman-config.mjs';
import { buildClip, loadFbx } from './meshy.mjs';

const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { source, out } = parseArgs();
console.log(`Sources : ${source}\nAssets  : ${out}`);

/** Tolerances (unites natives du modele : 170 de haut). */
const MAX_REST_GAP = 1e-3;
const MAX_CLIP_GAP = 5e-3;
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'ECART'} ${label}`);
};

async function loadGlb(file) {
  const buffer = fs.readFileSync(path.join(out, file));
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}
const findSkinned = (root) => { let mesh = null; root.traverse((o) => { if (o.isSkinnedMesh) mesh = o; }); return mesh; };
const boneNames = (root) => { const names = new Set(); root.traverse((o) => { if (o.isBone) names.add(o.name); }); return names; };
/** Ecart max entre sommets deformes par le squelette (un sommet sur trois). */
function skinnedGap(a, b, rootA, rootB) {
  rootA.updateMatrixWorld(true);
  rootB.updateMatrixWorld(true);
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  let max = 0;
  for (let i = 0; i < a.geometry.attributes.position.count; i += 3) {
    a.getVertexPosition(i, va).applyMatrix4(a.matrixWorld);
    b.getVertexPosition(i, vb).applyMatrix4(b.matrixWorld);
    max = Math.max(max, va.distanceTo(vb));
  }
  return max;
}

for (const [team, cfg] of Object.entries(TEAMS)) {
  const fbx = loadFbx(path.join(source, `${cfg.prefix}Character_output.fbx`));
  const glb = await loadGlb(`footman_${team}.glb`);
  const fbxMesh = findSkinned(fbx), glbMesh = findSkinned(glb);
  const fbxBones = boneNames(fbx), glbBones = boneNames(glb);
  let parentMismatch = 0;
  fbx.traverse((o) => { if (o.isBone && glb.getObjectByName(o.name)?.parent?.name !== o.parent?.name) parentMismatch++; });
  check(fbxBones.size === glbBones.size && [...fbxBones].every((n) => glbBones.has(n)) && parentMismatch === 0, `${team} : ${glbBones.size} os, memes noms et memes parents`);
  check(fbxMesh.geometry.attributes.position.count === glbMesh.geometry.attributes.position.count, `${team} : ${glbMesh.geometry.attributes.position.count} sommets`);
  check(!glbMesh.material.map, `${team} : aucune texture embarquee`);
  const boxF = new THREE.Box3().setFromObject(fbx, true), boxG = new THREE.Box3().setFromObject(glb, true);
  check(boxF.min.distanceTo(boxG.min) < MAX_REST_GAP && boxF.max.distanceTo(boxG.max) < MAX_REST_GAP, `${team} : meme emprise (pieds a y=${boxG.min.y.toFixed(2)}, hauteur ${(boxG.max.y - boxG.min.y).toFixed(1)})`);
  const restGap = skinnedGap(fbxMesh, glbMesh, fbx, glb);
  check(restGap < MAX_REST_GAP, `${team} : pose de repos, ecart sommets deformes ${restGap.toExponential(1)}`);
  for (const clipSpec of CLIPS) {
    const reference = buildClip(source, cfg.prefix, clipSpec, fbx);
    const generated = THREE.AnimationClip.parse(JSON.parse(fs.readFileSync(path.join(out, `footman_${team}_${clipSpec.key}.json`), 'utf8')));
    const mixerF = new THREE.AnimationMixer(fbx), mixerG = new THREE.AnimationMixer(glb);
    mixerF.clipAction(reference).play();
    mixerG.clipAction(generated).play();
    let worst = 0;
    for (let i = 0; i <= 10; i++) {
      const t = Math.min((reference.duration * i) / 10, reference.duration - 1e-4);
      mixerF.setTime(t);
      mixerG.setTime(t);
      worst = Math.max(worst, skinnedGap(fbxMesh, glbMesh, fbx, glb));
    }
    mixerF.stopAllAction();
    mixerG.stopAllAction();
    check(Math.abs(reference.duration - generated.duration) < 1e-3 && reference.tracks.length === generated.tracks.length && worst < MAX_CLIP_GAP,
      `${team} ${clipSpec.key} : ${generated.duration.toFixed(3)} s, ${generated.tracks.length} pistes, ecart max ${worst.toFixed(4)}`);
  }
}
for (const [name, cfg] of Object.entries(EQUIPMENT)) {
  const fbx = loadFbx(path.join(source, `${cfg.prefix}.fbx`));
  const sourceMesh = fbx.children.find((c) => c.isMesh);
  const reference = sourceMesh.geometry.clone();
  reference.applyMatrix4(sourceMesh.matrixWorld);
  const glb = await loadGlb(`${name}.glb`);
  let mesh = null;
  glb.traverse((o) => { if (o.isMesh) mesh = o; });
  const generated = mesh.geometry.clone();
  generated.applyMatrix4(mesh.matrixWorld);
  let maxPos = 0, maxUv = 0;
  const pa = reference.attributes.position.array, pb = generated.attributes.position.array;
  for (let i = 0; i < pa.length; i++) maxPos = Math.max(maxPos, Math.abs(pa[i] - pb[i]));
  const ua = reference.attributes.uv.array, ub = generated.attributes.uv.array;
  for (let i = 0; i < ua.length; i++) maxUv = Math.max(maxUv, Math.abs(ua[i] - ub[i]));
  check(pa.length === pb.length && maxPos < MAX_REST_GAP && maxUv < 1e-6 && !mesh.material.map, `${name} : ${generated.attributes.position.count} sommets, ecart positions ${maxPos.toExponential(1)}, ecart UV ${maxUv.toExponential(1)}`);
}
console.log(failures ? `\n${failures} ecart(s) detecte(s).` : '\nTous les assets correspondent aux sources.');
process.exit(failures ? 1 : 0);
