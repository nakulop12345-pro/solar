/**
 * noise.js — deterministic, seeded value-noise primitives.
 * Used both by the main thread and by the texture worker.
 * No external dependencies. No Math.random() anywhere.
 */

/** 3-D integer hash → [0,1). Deterministic for identical inputs. */
export function hash3(x, y, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^
          Math.imul(y | 0, 668265263) ^
          Math.imul(z | 0, 1440662683) ^
          Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Quintic smoothstep — C2 continuous, avoids visible grid artefacts. */
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

/** Trilinear value noise in [0,1]. */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);

  const c000 = hash3(xi,     yi,     zi,     seed);
  const c100 = hash3(xi + 1, yi,     zi,     seed);
  const c010 = hash3(xi,     yi + 1, zi,     seed);
  const c110 = hash3(xi + 1, yi + 1, zi,     seed);
  const c001 = hash3(xi,     yi,     zi + 1, seed);
  const c101 = hash3(xi + 1, yi,     zi + 1, seed);
  const c011 = hash3(xi,     yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);

  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;

  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;

  return y0 + (y1 - y0) * w;
}

/** Fractal Brownian motion, normalised to [0,1]. */
export function fbm3(x, y, z, octaves = 5, lacunarity = 2.0, gain = 0.5, seed = 0) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum  += amp * noise3(x * freq, y * freq, z * freq, seed + i * 131);
    norm += amp;
    amp  *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Ridged multifractal — produces sharp crests, ideal for cratered terrain. */
export function ridged3(x, y, z, octaves = 5, lacunarity = 2.0, gain = 0.5, seed = 0) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise3(x * freq, y * freq, z * freq, seed + i * 197) * 2 - 1);
    sum  += amp * n * n;
    norm += amp;
    amp  *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Deterministic PRNG (mulberry32) for scatter placement. */
export function mulberry32(a) {
  let s = a >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
