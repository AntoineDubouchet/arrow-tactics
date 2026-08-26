/**
 * Primitives de synthese reutilisables (2026-08-12) — voir audio/sounds/*.ts
 * pour les recettes concretes construites a partir de ces briques. Aucune
 * de ces fonctions ne JOUE de son : elles construisent/connectent des
 * noeuds Web Audio, l'appelant est responsable de `start()`/du nettoyage.
 */

const noiseBufferCache = new Map<string, AudioBuffer>();

/** Bruit blanc, mis en cache par (cle, duree) — genere UNE SEULE FOIS
 *  (demande explicite d'Antoine : "ne reconstruis pas inutilement des
 *  centaines de buffers par seconde"). La variation d'un son a l'autre
 *  passe par playbackRate/filtre/gain au moment de la lecture, jamais par
 *  une regeneration du buffer. */
export function getNoiseBuffer(ctx: AudioContext, key: string, durationSeconds: number): AudioBuffer {
  const cacheKey = `${key}:${durationSeconds.toFixed(3)}`;
  const cached = noiseBufferCache.get(cacheKey);
  if (cached) return cached;

  const length = Math.max(1, Math.ceil(ctx.sampleRate * durationSeconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBufferCache.set(cacheKey, buffer);
  return buffer;
}

/** Cree une source de bruit blanc PRETE A DEMARRER (non connectee), a
 *  partir du buffer partage — `playbackRate` permet une variation de
 *  timbre bon marche sans regenerer le buffer. */
export function createNoiseSource(ctx: AudioContext, key: string, durationSeconds: number, playbackRate = 1): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx, key, durationSeconds);
  src.playbackRate.value = playbackRate;
  return src;
}

/** Enveloppe de gain lineaire par points `{t (secondes depuis maintenant), value}` —
 *  point 0 obligatoire pour fixer la valeur de depart. */
export function applyGainEnvelope(gain: GainNode, ctx: AudioContext, points: { t: number; value: number }[]): void {
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(Math.max(0.0001, points[0]!.value), now);
  for (let i = 1; i < points.length; i++) {
    gain.gain.linearRampToValueAtTime(Math.max(0, points[i]!.value), now + points[i]!.t);
  }
}

/** Glissando de frequence (pitch envelope) exponentiel — plus naturel a
 *  l'oreille qu'un glissando lineaire pour un "whoosh"/"twang". */
export function applyFrequencySweep(param: AudioParam, ctx: AudioContext, from: number, to: number, duration: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(1, from), now);
  param.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
}

/** +/- `percent` de variation aleatoire autour de `base` (ex. pitch ±5%). */
export function jitter(base: number, percent: number): number {
  return base * (1 + (Math.random() * 2 - 1) * percent);
}

/** Petit oscillateur pret a demarrer, non connecte. */
export function createOscillator(ctx: AudioContext, type: OscillatorType, frequency: number): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  return osc;
}

export function createBandpass(ctx: AudioContext, frequency: number, q: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

export function createLowpass(ctx: AudioContext, frequency: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

export function createHighpass(ctx: AudioContext, frequency: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

/** Applique un pan stereo simple (voir PlayOptions.pan) — no-op si `pan`
 *  est absent (evite d'allouer un StereoPannerNode pour les sons UI, jamais
 *  spatialises). Renvoie le dernier noeud de la chaine (a connecter a la
 *  suite). */
export function withPan(ctx: AudioContext, input: AudioNode, pan: number | undefined): AudioNode {
  if (pan === undefined) return input;
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.min(1, Math.max(-1, pan));
  input.connect(panner);
  return panner;
}

const SEMITONE_RATIO = Math.pow(2, 1 / 12);

/** Convertit un decalage en demi-tons en multiplicateur de frequence/
 *  playbackRate. */
export function semitonesToRatio(semitones: number): number {
  return Math.pow(SEMITONE_RATIO, semitones);
}
