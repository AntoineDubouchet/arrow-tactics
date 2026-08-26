import { getAudioManager, type AudioManager } from './AudioManager';
import { loadUserSettings, saveUserSettings } from '../run/userSettings';
import { registerUiSounds } from './sounds/uiSounds';
import { registerPlacementSounds } from './sounds/placementSounds';
import { registerCombatSounds } from './sounds/combatSounds';

/**
 * Point d'entree unique du systeme audio (2026-08-12) — voir main.ts pour
 * le cablage aux evenements de jeu. `initAudio()` construit l'AudioManager
 * (sans encore creer d'AudioContext, voir AudioManager.unlock) et enregistre
 * tout le catalogue de sons connu ; a appeler UNE FOIS au demarrage.
 */
export function initAudio(): AudioManager {
  const settings = loadUserSettings();
  const audio = getAudioManager(settings.audio);
  registerUiSounds(audio);
  registerPlacementSounds(audio);
  registerCombatSounds(audio);
  return audio;
}

/** Persiste les preferences audio courantes — a appeler apres tout
 *  changement depuis l'ecran Parametres (voir ui/screens.ts). */
export function persistAudioSettings(audio: AudioManager): void {
  saveUserSettings({ audio: audio.getSettings() });
}

export type { AudioManager, PlayOptions, SoundCategory } from './AudioManager';
