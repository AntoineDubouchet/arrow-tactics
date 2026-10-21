// Configuration commune des outils Footman V2 : chemins, arguments, fichiers Meshy attendus.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Racine du projet npm (`arrow-tactics/`). */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Arguments : `--source <dossier>` (exports Meshy, defaut `.source-assets/footman_v2`),
 * `--out <dossier>` (assets de production, defaut `public/assets/units/footman_v2`),
 * `--channel <canal Playwright>` (navigateur des textures, defaut `msedge`).
 * Les chemins relatifs partent du dossier courant.
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    source: path.join(PROJECT_ROOT, '.source-assets', 'footman_v2'),
    out: path.join(PROJECT_ROOT, 'public', 'assets', 'units', 'footman_v2'),
    channel: 'msedge',
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in options) || argv[i + 1] === undefined) throw new Error(`Argument inconnu ou sans valeur : ${argv[i]}`);
    options[key] = key === 'channel' ? argv[++i] : path.resolve(argv[++i]);
  }
  return options;
}

/** Exports Meshy par camp, relatifs au dossier source. Le corps rouge n'a pas de normal map. */
export const TEAMS = {
  blue: { prefix: 'Meshy_AI_footman_blue/Meshy_AI_footman_blue_3d_biped_', hasNormal: true },
  red: { prefix: 'Meshy_AI_footman_red/Meshy_AI_footman_red_remesh_3k_biped_', hasNormal: false },
};

/** Clips generes, avec la meme plage que le jeu (Left Slash : 0,45 -> 1,65 s). */
export const CLIPS = [
  { key: 'walking', file: 'Animation_Walking_withSkin.fbx', name: 'Walking', start: 0, end: Infinity },
  { key: 'left_slash', file: 'Animation_Left_Slash_withSkin.fbx', name: 'Attack', start: 0.45, end: 1.65 },
  { key: 'spartan_kick', file: 'Animation_Spartan_Kick_withSkin.fbx', name: 'Attack', start: 0, end: Infinity },
];

/** Equipements rigides : FBX et prefixe des textures, relatifs au dossier source. */
export const EQUIPMENT = {
  sword: { prefix: 'Meshy_AI_footman_sword_cartoon_fbx/Meshy_AI_footman_sword_cartoon_1021011448_image-to-3d-texture', hasNormal: true },
  shield_blue: { prefix: 'Meshy_AI_footman_shield_blue_fbx/Meshy_AI_footman_shield_blue_c_1021011623_image-to-3d-texture', hasNormal: true },
  shield_red: { prefix: 'Meshy_AI_footman_shield_red_fbx/Meshy_AI_footman_shield_red_ca_1021011346_image-to-3d-texture', hasNormal: true },
};

/** Textures a produire : source Meshy (4K) -> `<nom>_<carte>.png` (2K). */
export function textureJobs() {
  const jobs = [];
  const add = (sourcePrefix, name, hasNormal) => {
    for (const map of ['base', ...(hasNormal ? ['normal'] : []), 'metallic', 'roughness']) {
      jobs.push({ src: `${sourcePrefix}${map === 'base' ? '' : `_${map}`}.png`, out: `${name}_${map}.png` });
    }
  };
  for (const [team, cfg] of Object.entries(TEAMS)) add(`${cfg.prefix}texture_0`, `footman_${team}`, cfg.hasNormal);
  for (const [name, cfg] of Object.entries(EQUIPMENT)) add(cfg.prefix, name, cfg.hasNormal);
  return jobs;
}
