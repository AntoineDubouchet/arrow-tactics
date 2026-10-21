// Lecture des FBX Meshy dans Node et preparation des clips (renommage, filtrage, decoupe).
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

// FBXLoader et GLTFExporter attendent quelques API de navigateur. Les textures
// embarquees ne sont jamais decodees : les materiaux sont reconstruits en jeu.
globalThis.window ??= { URL: { createObjectURL: () => 'blob:ignore' } };
globalThis.self ??= globalThis;
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.({ target: this }); this.onload?.({ target: this }); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString('base64')}`; this.onloadend?.({ target: this }); this.onload?.({ target: this }); }); }
};
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

const originalWarn = console.warn;
/** Charge un FBX Meshy (avertissements du loader masques : poids > 4, cartes non gerees). */
export function loadFbx(file) {
  if (!fs.existsSync(file)) throw new Error(`Fichier source introuvable : ${file}`);
  const buffer = fs.readFileSync(file);
  console.warn = (...args) => { if (!String(args[0]).startsWith('THREE.FBXLoader')) originalWarn(...args); };
  try {
    const object = new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), path.dirname(file) + '/');
    object.updateMatrixWorld(true);
    return object;
  } finally {
    console.warn = originalWarn;
  }
}

/** Pistes `mixamorig*` renommees en `smartrig*`, gardees seulement si leur cible
 *  existe dans le Character (ecarte la racine d'armature, l'Icosphere et les os `_end`). */
export function remapMeshyClip(source, character, name) {
  const names = new Set();
  character.traverse((o) => names.add(o.name));
  const tracks = [];
  for (const track of source.tracks) {
    const dot = track.name.indexOf('.');
    const target = track.name.slice(0, dot).replace(/^mixamorig/, 'smartrig');
    if (!names.has(target)) continue;
    const remapped = track.clone();
    remapped.name = target + track.name.slice(dot);
    tracks.push(remapped);
  }
  return new THREE.AnimationClip(name, source.duration, tracks);
}

/** Garde la plage [start, end], ramenee a 0, avec une valeur interpolee aux deux bornes. */
export function trimClip(clip, start, end) {
  const to = Math.min(end, clip.duration);
  if (start <= 0 && to >= clip.duration) return clip;
  const tracks = clip.tracks.map((track) => {
    const size = track.getValueSize();
    const Interpolant = track instanceof THREE.QuaternionKeyframeTrack ? THREE.QuaternionLinearInterpolant : THREE.LinearInterpolant;
    const interpolant = new Interpolant(track.times, track.values, size, new Float32Array(size));
    const times = [start, ...Array.from(track.times).filter((t) => t > start && t < to), to];
    const values = [];
    for (const t of times) values.push(...Array.from(interpolant.evaluate(t)));
    return new track.constructor(track.name, times.map((t) => t - start), values);
  });
  return new THREE.AnimationClip(clip.name, to - start, tracks);
}

/** Clip pret pour le jeu depuis un FBX `_withSkin`. */
export function buildClip(sourceDir, teamPrefix, clipSpec, character) {
  const fbx = loadFbx(path.join(sourceDir, teamPrefix + clipSpec.file));
  const source = fbx.animations[0];
  if (!source) throw new Error(`Aucun clip dans ${teamPrefix + clipSpec.file}`);
  return trimClip(remapMeshyClip(source, character, clipSpec.name), clipSpec.start, clipSpec.end);
}
