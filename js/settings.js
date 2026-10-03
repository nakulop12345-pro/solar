/**
 * settings.js — persistent user preferences.
 *
 * Settings are validated on load so a corrupted localStorage entry can never
 * put the application into an invalid state.
 */

const STORAGE_KEY = 'nakul-solar-system.settings.v1';

export const QUALITY_PRESETS = {
  low:    { label: 'Low',    textureSize: 256,  segments: 32,  starBase: 6000,  bloom: false, moons: true  },
  medium: { label: 'Medium', textureSize: 512,  segments: 48,  starBase: 12000, bloom: true,  moons: true  },
  high:   { label: 'High',   textureSize: 1024, segments: 64,  starBase: 24000, bloom: true,  moons: true  },
  ultra:  { label: 'Ultra',  textureSize: 2048, segments: 96,  starBase: 40000, bloom: true,  moons: true  },
};

export const DEFAULT_SETTINGS = Object.freeze({
  quality: 'high',
  starDensity: 1.0,
  atmospheres: true,
  orbits: true,
  moons: true,
  bloom: true,
  labels: true,
  cinematic: false,
  reducedMotion: false,
  sound: false,
});

const BOOLEAN_KEYS = ['atmospheres','orbits','moons','bloom','labels','cinematic','reducedMotion','sound'];

function sanitize(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;

  if (typeof raw.quality === 'string' && QUALITY_PRESETS[raw.quality]) out.quality = raw.quality;

  if (typeof raw.starDensity === 'number' && isFinite(raw.starDensity)) {
    out.starDensity = Math.min(2, Math.max(0.2, raw.starDensity));
  }
  for (const k of BOOLEAN_KEYS) if (typeof raw[k] === 'boolean') out[k] = raw[k];

  return out;
}

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[NAKUL SOLAR SYSTEM] Could not read saved settings:', err);
    return null;
  }
}

export const settings = sanitize(readStorage());

export function saveSettings() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[NAKUL SOLAR SYSTEM] Could not persist settings:', err);
  }
}

export function resetSettings() {
  Object.assign(settings, DEFAULT_SETTINGS);
  saveSettings();
}

/** Current quality preset object (never null). */
export function qualityPreset() {
  return QUALITY_PRESETS[settings.quality] || QUALITY_PRESETS.high;
}

/** Whether motion should be suppressed (user preference OR OS preference). */
export function prefersReducedMotion() {
  if (settings.reducedMotion) return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}
