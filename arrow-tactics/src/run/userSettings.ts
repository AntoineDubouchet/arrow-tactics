/**
 * Preferences UTILISATEUR (2026-08-12) — volumes audio, etc. — distinctes de
 * `MetaProgress` (progression permanente : points de talent, unites
 * debloquees...) : le bouton "Effacer la sauvegarde" (voir metaProgress.ts,
 * resetMetaProgress) efface la PROGRESSION, jamais les preferences. Cle
 * localStorage separee, versionnee comme metaProgress.ts (meme pattern,
 * meme raison : pouvoir migrer sans casser une sauvegarde existante).
 */
const STORAGE_KEY = 'arrow-tactics.user-settings.v1';

export interface AudioSettings {
  /** 0..1, controle le bus MASTER (tout). */
  masterVolume: number;
  /** 0..1, bus MUSIC (pas encore de musique reelle, prepare pour plus tard). */
  musicVolume: number;
  /** 0..1, bus SFX (+ UI/ambiance, voir AudioManager). */
  sfxVolume: number;
  /** Etat INDEPENDANT des volumes (voir AudioManager.getEffectiveVolume) —
   *  ne remet jamais les sliders a 0, coupe juste la sortie. */
  muted: boolean;
}

export interface UserSettings {
  audio: AudioSettings;
}

function defaultUserSettings(): UserSettings {
  return {
    audio: {
      masterVolume: 0.8,
      musicVolume: 0.7,
      sfxVolume: 0.85,
      muted: false,
    },
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Retombe silencieusement sur les valeurs par defaut pour toute donnee
 *  absente, corrompue, ou de mauvais type — meme principe defensif que
 *  `loadMetaProgress` : jamais d'exception qui bloquerait le demarrage du
 *  jeu pour une histoire de preferences. */
export function loadUserSettings(): UserSettings {
  const fallback = defaultUserSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const obj: unknown = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return fallback;
    const audioRaw = (obj as Record<string, unknown>)['audio'];
    if (!audioRaw || typeof audioRaw !== 'object') return fallback;
    const a = audioRaw as Record<string, unknown>;
    return {
      audio: {
        masterVolume: typeof a['masterVolume'] === 'number' ? clamp01(a['masterVolume']) : fallback.audio.masterVolume,
        musicVolume: typeof a['musicVolume'] === 'number' ? clamp01(a['musicVolume']) : fallback.audio.musicVolume,
        sfxVolume: typeof a['sfxVolume'] === 'number' ? clamp01(a['sfxVolume']) : fallback.audio.sfxVolume,
        muted: typeof a['muted'] === 'boolean' ? a['muted'] : fallback.audio.muted,
      },
    };
  } catch {
    return fallback;
  }
}

export function saveUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Navigation privee, quota plein, etc. — jamais bloquant.
  }
}
