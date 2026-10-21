// Footman V2 : GLB sans textures (personnages + equipements) et clips JSON prets pour le jeu.
// Usage (depuis arrow-tactics/) : node tools/footman-v2/build-models.mjs [--source <dir>] [--out <dir>]
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { CLIPS, EQUIPMENT, TEAMS, parseArgs } from './footman-config.mjs';
import { buildClip, loadFbx } from './meshy.mjs';

const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
const { source, out } = parseArgs();
fs.mkdirSync(out, { recursive: true });
console.log(`Sources : ${source}\nSortie  : ${out}`);

const exportGlb = async (object, file) => {
  const buffer = await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true });
  fs.writeFileSync(path.join(out, file), Buffer.from(buffer));
};
const plainMaterial = (name) => new THREE.MeshStandardMaterial({ name });

/** Arrondi a 1e-6 (ecart negligeable) ; une piste constante est reduite a une cle.
 *  `uuid` fixe (et non aleatoire) : deux generations donnent les memes fichiers.
 *  Il doit rester unique par clip, AnimationMixer range ses actions par uuid. */
function compactClipJson(clip, uuid) {
  const json = THREE.AnimationClip.toJSON(clip);
  json.uuid = uuid;
  for (const track of json.tracks) {
    track.times = track.times.map((v) => Math.round(v * 1e6) / 1e6);
    track.values = track.values.map((v) => Math.round(v * 1e6) / 1e6);
    const size = track.values.length / track.times.length;
    let constant = true;
    for (let i = size; i < track.values.length && constant; i++) if (Math.abs(track.values[i] - track.values[i % size]) > 1e-6) constant = false;
    if (constant) {
      track.times = [0];
      track.values = track.values.slice(0, size);
    }
  }
  return json;
}

const written = [];
for (const [team, cfg] of Object.entries(TEAMS)) {
  const character = loadFbx(path.join(source, `${cfg.prefix}Character_output.fbx`));
  for (const clipSpec of CLIPS) {
    const file = `footman_${team}_${clipSpec.key}.json`;
    const clip = buildClip(source, cfg.prefix, clipSpec, character);
    fs.writeFileSync(path.join(out, file), JSON.stringify(compactClipJson(clip, `footman-${team}-${clipSpec.key}`)));
    written.push(file);
  }
  character.traverse((o) => { if (o.isMesh) o.material = plainMaterial('FootmanBody'); });
  await exportGlb(character, `footman_${team}.glb`);
  written.push(`footman_${team}.glb`);
}
// Equipements : geometrie normalisee (echelle 100 et rotation -90° X du FBX appliquees), mesh a l'identite.
for (const [name, cfg] of Object.entries(EQUIPMENT)) {
  const fbx = loadFbx(path.join(source, `${cfg.prefix}.fbx`));
  const sourceMesh = fbx.children.find((c) => c.isMesh);
  const geometry = sourceMesh.geometry.clone();
  geometry.applyMatrix4(sourceMesh.matrixWorld);
  const mesh = new THREE.Mesh(geometry, plainMaterial('FootmanEquipment'));
  mesh.name = name;
  await exportGlb(mesh, `${name}.glb`);
  written.push(`${name}.glb`);
}
for (const file of written) console.log(`${file.padEnd(32)} ${(fs.statSync(path.join(out, file)).size / 1024).toFixed(0).padStart(6)} Ko`);
