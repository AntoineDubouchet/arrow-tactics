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

/** Disposition du HUD reglee a la main (2026-11-02, ui/hudLayout.ts) :
 *  position de chaque bloc, preference locale. */
const HUD_LAYOUT_STORAGE_KEY = 'arrow-tactics.hud-layout.v1';

type SavedHudBlock = { fx: number; fy: number; w: number; h: number; scale?: number; width?: number; height?: number; ax?: 'start' | 'center' | 'end'; ay?: 'start' | 'center' | 'end'; ox?: number; oy?: number };

export function loadHudLayout(): Record<string, SavedHudBlock> {
  try {
    const raw = localStorage.getItem(HUD_LAYOUT_STORAGE_KEY);
    const obj: unknown = raw ? JSON.parse(raw) : null;
    if (!obj || typeof obj !== 'object') return {};
    const out: Record<string, SavedHudBlock> = {};
    const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    for (const [id, v] of Object.entries(obj as Record<string, unknown>)) {
      const p = v as Record<string, unknown> | null;
      if (!p || ![p['fx'], p['fy'], p['w'], p['h']].every(num)) continue;
      const block: SavedHudBlock = { fx: p['fx'] as number, fy: p['fy'] as number, w: p['w'] as number, h: p['h'] as number };
      for (const k of ['scale', 'width', 'height'] as const) if (num(p[k])) block[k] = p[k] as number;
      for (const k of ['ox', 'oy'] as const) if (num(p[k])) block[k] = p[k] as number;
      for (const k of ['ax', 'ay'] as const) if (p[k] === 'start' || p[k] === 'center' || p[k] === 'end') block[k] = p[k];
      out[id] = block;
    }
    return out;
  } catch {
    return {};
  }
}

/** Grille de calibration du HUD (Parametres > Interface). */
const HUD_GRID_STORAGE_KEY = 'arrow-tactics.hud-grid.v1';
/** Position de la fenetre du personnage / inventaire, deplacee par le joueur
 *  (2026-11-02, ui/heroInventory.ts) : coin haut gauche en px. */
const INVENTORY_WINDOW_STORAGE_KEY = 'arrow-tactics.inventory-window.v1';

export function loadInventoryWindowPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(INVENTORY_WINDOW_STORAGE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return null;
    const { x, y } = v as Record<string, unknown>;
    return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch {
    return null;
  }
}

export function saveInventoryWindowPosition(position: { x: number; y: number }): void {
  try {
    localStorage.setItem(INVENTORY_WINDOW_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Navigation privee : jamais bloquant.
  }
}
/** Outil de calibration du HUD disponible (Parametres > HUD), verrouille par
 *  defaut (2026-11-02). */
const HUD_UNLOCK_STORAGE_KEY = 'arrow-tactics.hud-unlocked.v1';

export function loadHudUnlocked(): boolean {
  try {
    return localStorage.getItem(HUD_UNLOCK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveHudUnlocked(on: boolean): void {
  try {
    if (on) localStorage.setItem(HUD_UNLOCK_STORAGE_KEY, '1');
    else localStorage.removeItem(HUD_UNLOCK_STORAGE_KEY);
  } catch {
    // Navigation privee : jamais bloquant.
  }
}

export function loadHudGrid(): boolean {
  try {
    return localStorage.getItem(HUD_GRID_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveHudGrid(on: boolean): void {
  try {
    if (on) localStorage.setItem(HUD_GRID_STORAGE_KEY, '1');
    else localStorage.removeItem(HUD_GRID_STORAGE_KEY);
  } catch {
    // Navigation privee : jamais bloquant.
  }
}

export function saveHudLayout(layout: Record<string, SavedHudBlock>): void {
  try {
    if (Object.keys(layout).length === 0) localStorage.removeItem(HUD_LAYOUT_STORAGE_KEY);
    else localStorage.setItem(HUD_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Navigation privee, quota plein : jamais bloquant.
  }
}

/** Camera (2026-11-02) : vitesse du defilement par les bords (multiplicateur,
 *  0,25 a 2,5). Cle propre : independante des reglages audio. */
const CAMERA_STORAGE_KEY = 'arrow-tactics.camera-settings.v1';
export const CAMERA_SPEED_MIN = 0.25;
export const CAMERA_SPEED_MAX = 2.5;

export function loadCameraSpeed(): number {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    const speed = raw ? (JSON.parse(raw) as { speed?: unknown }).speed : undefined;
    return typeof speed === 'number' && Number.isFinite(speed) ? Math.min(CAMERA_SPEED_MAX, Math.max(CAMERA_SPEED_MIN, speed)) : 1;
  } catch {
    return 1;
  }
}

export function saveCameraSpeed(speed: number): void {
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify({ speed }));
  } catch {
    // Navigation privee, quota plein : jamais bloquant.
  }
}

export function saveUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Navigation privee, quota plein, etc. — jamais bloquant.
  }
}
