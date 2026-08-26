import type { AudioSettings } from '../run/userSettings';

/**
 * Moteur audio procedural (2026-08-12). UN SEUL AudioContext pour tout le
 * jeu (cree au premier `unlock()`, jamais recree ensuite — voir CLAUDE.md,
 * demande explicite d'Antoine). Architecture en bus :
 *
 *   Master
 *   ├── Music
 *   ├── SFX
 *   ├── UI
 *   └── Ambience
 *
 * chacun son propre GainNode, tous vers un DynamicsCompressorNode leger
 * avant `ctx.destination` (evite les pics lors des grosses batailles sans
 * ecraser toute la dynamique).
 *
 * Mapping des 3 sliders de l'ecran Parametres (decision d'Antoine) :
 *  - Volume general -> Master (affecte tout, y compris Music/SFX/UI/Ambience
 *    par construction du graphe : ils sont tous enfants de Master).
 *  - Musique -> Music uniquement.
 *  - Effets sonores -> SFX + UI + Ambiance (pas de sliders dedies pour ces
 *    deux derniers en V1 — decision explicite d'Antoine : "si nous avons
 *    deja une vraie separation interne propre, ne la detruis pas" ; ici les
 *    bus RESTENT separes cote graphe audio, seul le controle utilisateur
 *    est regroupe pour l'instant, un futur slider "Interface"/"Ambiance"
 *    pourra piloter UI/Ambience independamment sans rien changer au graphe).
 *
 * Mute : etat INDEPENDANT des volumes (`AudioSettings.muted`), applique
 * UNIQUEMENT sur Master — decoche restaure exactement les niveaux d'avant,
 * jamais de sliders remis a 0 (demande explicite d'Antoine).
 *
 * Toutes les transitions de gain passent par `setTargetAtTime` (~30ms) pour
 * eviter les clics numeriques (demande explicite) — jamais de saut brutal
 * de valeur sur un GainNode.
 */

export type SoundCategory = 'sfx' | 'ui' | 'ambience' | 'music';

export interface PlayOptions {
  /** -1 (gauche) a +1 (droite) — sans effet pour la categorie 'ui'. */
  pan?: number;
  /** Multiplicateur de volume APRES le bus (0..~1.5), pour les variations
   *  d'intensite (distance camera, agregation de plusieurs evenements...). */
  volumeScale?: number;
  /** Variation de hauteur en demi-tons, appliquee comme playbackRate pour
   *  les sons a base de buffer, ou comme decalage de frequence pour les
   *  oscillateurs — chaque son procedural interprete ceci a sa maniere. */
  pitchSemitones?: number;
}

export type SoundBuilder = (ctx: AudioContext, output: AudioNode, opts: PlayOptions) => void;

/** Nombre max de voix simultanees par categorie (2026-08-12, demande
 *  explicite d'Antoine — "sound budget", eviter la cacophonie sur une
 *  grosse bataille). Une estimation de duree par son sert a liberer le
 *  budget au bon moment (voir `play`, pas de suivi precis par voix pour
 *  rester simple en V1 — largement suffisant, un son procedural dure
 *  toujours moins d'une seconde ici). */
const CATEGORY_VOICE_BUDGET: Record<SoundCategory, number> = {
  sfx: 28,
  ui: 8,
  ambience: 4,
  music: 2,
};

class VoiceBudgetTracker {
  private active: Record<SoundCategory, number> = { sfx: 0, ui: 0, ambience: 0, music: 0 };

  /** Essaie de reserver une voix ; renvoie false si le budget de la
   *  categorie est deja atteint (l'appelant doit alors ne PAS jouer le son). */
  tryAcquire(category: SoundCategory): boolean {
    if (this.active[category] >= CATEGORY_VOICE_BUDGET[category]) return false;
    this.active[category]++;
    return true;
  }

  release(category: SoundCategory): void {
    this.active[category] = Math.max(0, this.active[category] - 1);
  }
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private settings: AudioSettings;
  private readonly voices = new VoiceBudgetTracker();
  private readonly catalog = new Map<string, { category: SoundCategory; build: SoundBuilder; estimatedDuration: number }>();

  constructor(initialSettings: AudioSettings) {
    this.settings = initialSettings;
  }

  /** A appeler sur la PREMIERE interaction utilisateur valide (voir main.ts) —
   *  cree le AudioContext une seule fois. Ne leve jamais d'exception : un
   *  navigateur sans Web Audio, ou un `resume()` refuse, laisse simplement
   *  le jeu silencieux plutot que de planter. */
  unlock(): void {
    if (this.ctx) return;
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.buildGraph();
      this.applySettings();
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, ctx.currentTime);
    compressor.knee.setValueAtTime(12, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.15, ctx.currentTime);
    compressor.connect(ctx.destination);

    this.masterGain = ctx.createGain();
    this.masterGain.connect(compressor);

    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.uiGain = ctx.createGain();
    this.ambienceGain = ctx.createGain();
    for (const g of [this.musicGain, this.sfxGain, this.uiGain, this.ambienceGain]) g.connect(this.masterGain);
  }

  private rampGain(node: GainNode | null, value: number): void {
    if (!node || !this.ctx) return;
    node.gain.setTargetAtTime(value, this.ctx.currentTime, 0.03);
  }

  private applySettings(): void {
    const effectiveMaster = this.settings.muted ? 0 : this.settings.masterVolume;
    this.rampGain(this.masterGain, effectiveMaster);
    this.rampGain(this.musicGain, this.settings.musicVolume);
    this.rampGain(this.sfxGain, this.settings.sfxVolume);
    // UI/Ambiance suivent le slider "Effets sonores" pour l'instant (voir
    // commentaire de classe) — l'ambiance reste un peu plus discrete par
    // construction du graphe (multiplicateur fixe, pas expose au joueur).
    this.rampGain(this.uiGain, this.settings.sfxVolume);
    this.rampGain(this.ambienceGain, this.settings.sfxVolume * 0.6);
  }

  setMasterVolume(v: number): void {
    this.settings.masterVolume = Math.min(1, Math.max(0, v));
    this.applySettings();
  }

  setMusicVolume(v: number): void {
    this.settings.musicVolume = Math.min(1, Math.max(0, v));
    this.applySettings();
  }

  setSfxVolume(v: number): void {
    this.settings.sfxVolume = Math.min(1, Math.max(0, v));
    this.applySettings();
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.applySettings();
  }

  getSettings(): AudioSettings {
    return this.settings;
  }

  /** Enregistre un son procedural jouable par nom (voir audio/sounds/*.ts) —
   *  `estimatedDuration` sert uniquement a liberer le budget de voix au bon
   *  moment (voir VoiceBudgetTracker), pas besoin d'etre exact a la
   *  milliseconde. */
  register(name: string, category: SoundCategory, build: SoundBuilder, estimatedDuration: number): void {
    this.catalog.set(name, { category, build, estimatedDuration });
  }

  /** Joue un son enregistre. Sans effet si le contexte n'est pas encore
   *  debloque (voir `unlock`), si le son est inconnu, ou si le budget de
   *  voix de sa categorie est deja atteint (les evenements les moins
   *  prioritaires sont simplement ignores plutot que d'empiler indefiniment
   *  des voix — demande explicite d'Antoine, "sound budget"). */
  play(name: string, opts: PlayOptions = {}): void {
    if (!this.ctx) return;
    const entry = this.catalog.get(name);
    if (!entry) return;
    if (!this.voices.tryAcquire(entry.category)) return;

    const bus =
      entry.category === 'sfx'
        ? this.sfxGain
        : entry.category === 'ui'
          ? this.uiGain
          : entry.category === 'ambience'
            ? this.ambienceGain
            : this.musicGain;
    if (!bus) {
      this.voices.release(entry.category);
      return;
    }

    try {
      entry.build(this.ctx, bus, opts);
    } finally {
      // Liberation apres la duree estimee — largement suffisant pour des
      // sons procedureaux courts (<1s), pas besoin d'un suivi par voix plus
      // precis pour cette V1.
      setTimeout(() => this.voices.release(entry.category), Math.ceil(entry.estimatedDuration * 1000) + 50);
    }
  }
}

let instance: AudioManager | null = null;

/** Instance UNIQUE du moteur audio (voir main.ts) — cree paresseusement
 *  avec les preferences chargees, jamais reconstruite. */
export function getAudioManager(initialSettings: AudioSettings): AudioManager {
  if (!instance) instance = new AudioManager(initialSettings);
  return instance;
}
