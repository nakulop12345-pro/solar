/**
 * textureGen.js — procedural generation of all surface, ring and nebula maps.
 *
 * Every function here is pure: given the same arguments it returns byte-identical
 * output. That is what makes the visualization reproducible and cache-friendly,
 * and it is why the project needs zero external image assets.
 *
 * Output maps are equirectangular (2:1) RGBA buffers suitable for direct upload
 * as THREE.DataTexture / CanvasTexture.
 */

import { fbm3, ridged3, noise3, mulberry32 } from './noise.js';

const TWO_PI = Math.PI * 2;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/* ─────────────────────────── colour helpers ─────────────────────────── */

const hexCache = new Map();
function hexToRgb(hex) {
  let c = hexCache.get(hex);
  if (c) return c;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(s => s + s).join('') : h, 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  hexCache.set(hex, c);
  return c;
}

/** Build a sorted colour ramp from [{p, c}] stops. */
function makeRamp(stops) {
  const s = stops.map(o => ({ p: clamp01(o.p), c: hexToRgb(o.c) }))
                 .sort((a, b) => a.p - b.p);
  return function (t, out) {
    t = clamp01(t);
    if (t <= s[0].p) { out[0] = s[0].c[0]; out[1] = s[0].c[1]; out[2] = s[0].c[2]; return out; }
    const last = s[s.length - 1];
    if (t >= last.p) { out[0] = last.c[0]; out[1] = last.c[1]; out[2] = last.c[2]; return out; }
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i], b = s[i + 1];
      if (t >= a.p && t <= b.p) {
        const k = (t - a.p) / (b.p - a.p || 1);
        out[0] = lerp(a.c[0], b.c[0], k);
        out[1] = lerp(a.c[1], b.c[1], k);
        out[2] = lerp(a.c[2], b.c[2], k);
        return out;
      }
    }
    return out;
  };
}

/* ─────────────────────────── surface generators ─────────────────────────── */

/**
 * @param {string} kind  'rocky' | 'gas' | 'terrestrial' | 'clouds' | 'lights' | 'sun' | 'ice'
 * @param {number} w     texture width  (height is w/2)
 * @param {number} h
 * @param {object} o     body-specific options (palette, seed, bands, spot, …)
 * @returns {{pixels:Uint8ClampedArray, heights:Float32Array|null}}
 */
export function generateSurface(kind, w, h, o) {
  const px = new Uint8ClampedArray(w * h * 4);
  const wantH = !!o.normal;
  const hbuf = wantH ? new Float32Array(w * h) : null;

  const seed = o.seed | 0;
  const rgb = [0, 0, 0];

  // Pre-compile ramps once (never inside the pixel loop).
  const rampMain = o.palette ? makeRamp(o.palette) : null;
  const rampBand = o.bands   ? makeRamp(o.bands)   : null;

  const spot = o.spot || null;

  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const lat = (0.5 - v) * Math.PI;       // +π/2 (north) → −π/2 (south)
    const clat = Math.cos(lat), slat = Math.sin(lat);
    const rowBase = y * w;

    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const lon = u * TWO_PI;

      // Point on the unit sphere — this is what makes the map seamless in u.
      const px3 = clat * Math.cos(lon);
      const py3 = slat;
      const pz3 = clat * Math.sin(lon);

      let hgt = 0.5;

      switch (kind) {

        /* ── cratered / rocky bodies ─────────────────────────────── */
        case 'rocky':
        case 'ice': {
          const f = o.frequency || 2.4;
          const base  = fbm3(px3 * f, py3 * f, pz3 * f, 5, 2.0, 0.5, seed);
          const ridge = ridged3(px3 * f * 2.7, py3 * f * 2.7, pz3 * f * 2.7, 5, 2.1, 0.5, seed + 31);
          const fine  = fbm3(px3 * 22, py3 * 22, pz3 * 22, 3, 2.0, 0.5, seed + 97);

          const craterMix = o.craters ?? 0.42;
          let e = base * (1 - craterMix) + ridge * craterMix;
          e = e * 0.86 + fine * 0.14;

          if (kind === 'ice' && o.cracks) {
            // Long linear fractures: ridged noise thresholded to thin lines.
            const cr = ridged3(px3 * 3.4, py3 * 3.4, pz3 * 3.4, 4, 2.2, 0.55, seed + 411);
            e -= Math.pow(clamp01(1 - Math.abs(cr - 0.62) * 12), 2) * 0.22;
          }

          hgt = clamp01(e);
          rampMain(hgt, rgb);
          // Subtle large-scale albedo variation (mare / highland contrast)
          const alb = fbm3(px3 * 0.9, py3 * 0.9, pz3 * 0.9, 3, 2.0, 0.5, seed + 7);
          const k = 0.82 + alb * 0.36;
          rgb[0] *= k; rgb[1] *= k; rgb[2] *= k;
          break;
        }

        /* ── Earth-like: oceans, continents, polar ice ───────────── */
        case 'terrestrial': {
          const warp = (fbm3(px3 * 3.1 + 11, py3 * 3.1, pz3 * 3.1, 4, 2.0, 0.5, seed + 5) - 0.5) * 0.16;
          const cont = fbm3(px3 * 1.55, py3 * 1.55, pz3 * 1.55, 6, 2.05, 0.5, seed) + warp;
          const detail = fbm3(px3 * 9, py3 * 9, pz3 * 9, 4, 2.0, 0.5, seed + 61);
          const e = cont * 0.78 + detail * 0.22;

          hgt = clamp01(e);
          const seaLevel = o.seaLevel ?? 0.505;
          const absLat = Math.abs(slat);
          const iceEdge = o.iceEdge ?? 0.80;

          if (e < seaLevel) {
            // Ocean: depth-modulated blue, slight turquoise on shelves.
            const d = clamp01((seaLevel - e) / 0.16);
            rgb[0] = lerp(38, 8, d);
            rgb[1] = lerp(112, 30, d);
            rgb[2] = lerp(160, 74, d);
            // Coastal scattering
            const shelf = smoothstep(seaLevel - 0.035, seaLevel, e);
            rgb[0] += shelf * 26; rgb[1] += shelf * 30; rgb[2] += shelf * 20;
            // Alpha channel stores an ocean mask (used by the specular term).
            px[(rowBase + x) * 4 + 3] = 255;
          } else {
            const land = clamp01((e - seaLevel) / (1 - seaLevel));
            // Latitude climate: tropics → temperate → tundra → snow
            const arid  = smoothstep(0.36, 0.06, Math.abs(absLat - 0.42));
            const cold  = smoothstep(0.55, 0.92, absLat);
            const mount = smoothstep(0.55, 0.95, land);

            let r = lerp(60, 118, land), g = lerp(112, 96, land), b = lerp(56, 70, land);
            // Desert belts near ±25–35°
            r = lerp(r, 196, arid * 0.85); g = lerp(g, 168, arid * 0.85); b = lerp(b, 112, arid * 0.85);
            // Boreal / tundra
            r = lerp(r, 122, cold * 0.7); g = lerp(g, 128, cold * 0.7); b = lerp(b, 118, cold * 0.7);
            // Rock / snow at altitude
            r = lerp(r, 138, mount); g = lerp(g, 130, mount); b = lerp(b, 120, mount);
            const snow = smoothstep(0.80, 1.0, land) * smoothstep(0.30, 0.75, absLat);
            r = lerp(r, 246, snow); g = lerp(g, 248, snow); b = lerp(b, 255, snow);

            const grain = 0.94 + detail * 0.12;
            rgb[0] = r * grain; rgb[1] = g * grain; rgb[2] = b * grain;
            px[(rowBase + x) * 4 + 3] = 0;   // land → no specular
          }

          // Polar ice caps — applied over both land and ocean.
          const ice = smoothstep(iceEdge, iceEdge + 0.14, absLat + (fbm3(px3 * 6, py3 * 6, pz3 * 6, 3, 2, .5, seed + 3) - .5) * 0.10);
          if (ice > 0.001) {
            rgb[0] = lerp(rgb[0], 244, ice);
            rgb[1] = lerp(rgb[1], 248, ice);
            rgb[2] = lerp(rgb[2], 255, ice);
            px[(rowBase + x) * 4 + 3] = Math.round(px[(rowBase + x) * 4 + 3] * (1 - ice));
          }
          break;
        }

        /* ── cloud decks (alpha stored in R) ─────────────────────── */
        case 'clouds': {
          const warpX = fbm3(px3 * 2.2 + 40, py3 * 2.2, pz3 * 2.2, 3, 2, .5, seed + 13) * 0.35;
          const c = fbm3(px3 * 2.9 + warpX, py3 * 4.6, pz3 * 2.9 + warpX, 6, 2.1, 0.55, seed);
          // ITCZ + mid-latitude storm belts
          const belt = 0.55
            + 0.20 * Math.exp(-Math.pow((slat - 0.10) / 0.16, 2))
            + 0.16 * Math.exp(-Math.pow((slat + 0.10) / 0.16, 2))
            + 0.14 * Math.exp(-Math.pow((Math.abs(slat) - 0.68) / 0.20, 2));
          const a = clamp01((c * belt - 0.34) * 2.6);
          const b = Math.round(150 + c * 105);
          px[(rowBase + x) * 4]     = b;
          px[(rowBase + x) * 4 + 1] = b;
          px[(rowBase + x) * 4 + 2] = Math.min(255, b + 8);
          px[(rowBase + x) * 4 + 3] = Math.round(a * 255);
          hgt = a;
          break;
        }

        /* ── night-side city lights (R channel) ──────────────────── */
        case 'lights': {
          const cont = fbm3(px3 * 1.55, py3 * 1.55, pz3 * 1.55, 6, 2.05, 0.5, seed - 3);
          const land = smoothstep(0.50, 0.56, cont);              // crude coastline mask
          const pop  = fbm3(px3 * 4.5, py3 * 4.5, pz3 * 4.5, 4, 2, .5, seed + 77);
          const sparkle = Math.pow(clamp01(noise3(px3 * 260, py3 * 260, pz3 * 260, seed + 9) * 1.4 - 0.35), 2.2);
          let a = land * smoothstep(0.42, 0.85, pop) * (0.55 + sparkle * 2.4);
          // Temperate latitudes glow more than poles / deep tropics.
          a *= 0.35 + 0.65 * Math.exp(-Math.pow(slat / 0.62, 2));
          a = clamp01(a);
          px[(rowBase + x) * 4]     = Math.round(a * 255);
          px[(rowBase + x) * 4 + 1] = Math.round(a * 216);
          px[(rowBase + x) * 4 + 2] = Math.round(a * 140);
          px[(rowBase + x) * 4 + 3] = 255;
          hgt = a;
          break;
        }

        /* ── gas giants: latitude bands + turbulent shear ─────────── */
        case 'gas': {
          const turb = o.turbulence ?? 0.05;
          const warpx = (fbm3(px3 * 2.4, py3 * 7.5, pz3 * 2.4, 5, 2, .5, seed + 19) - 0.5) * turb;
          const warpy = (fbm3(px3 * 3.6, py3 * 9.0, pz3 * 3.6, 4, 2, .5, seed + 23) - 0.5) * turb * 0.55;

          // Normalised latitude (0 = south pole, 1 = north pole) with warping.
          let t = clamp01((slat / Math.PI) + 0.5 + warpy);

          // Fine zonal streaks, stretched along longitude.
          const streak = fbm3(px3 * 1.6, py3 * 34, pz3 * 1.6, 4, 2.05, .52, seed + 41);
          t = clamp01(t + (streak - 0.5) * 0.028 + warpx);

          rampBand(t, rgb);

          // Zonal contrast boost — belts read darker than zones.
          const zonal = Math.sin((t * (o.bandCount || 12)) * Math.PI);
          const k = 0.90 + zonal * 0.11 + (streak - 0.5) * 0.14;
          rgb[0] *= k; rgb[1] *= k; rgb[2] *= k;
          hgt = t;

          // Great Red Spot (or any analogous anticyclone).
          if (spot) {
            const dLon = Math.atan2(Math.sin(lon - spot.lon), Math.cos(lon - spot.lon));
            const dLat = lat - spot.lat;
            const d = Math.sqrt((dLon / spot.rx) ** 2 + (dLat / spot.ry) ** 2);
            if (d < 1.25) {
              const swirl = fbm3(px3 * 9, py3 * 9, pz3 * 9, 4, 2, .5, seed + 313);
              const a = (1 - smoothstep(0.72, 1.18, d)) * (0.72 + swirl * 0.45);
              const sc = hexToRgb(spot.color);
              rgb[0] = lerp(rgb[0], sc[0], a);
              rgb[1] = lerp(rgb[1], sc[1], a);
              rgb[2] = lerp(rgb[2], sc[2], a);
              hgt = clamp01(hgt + a * 0.08);
            }
          }
          break;
        }

        /* ── photosphere granulation ─────────────────────────────── */
        case 'sun': {
          const gran = ridged3(px3 * 42, py3 * 42, pz3 * 42, 4, 2.1, .5, seed);
          const superg = fbm3(px3 * 7.5, py3 * 7.5, pz3 * 7.5, 5, 2.0, .5, seed + 5);
          const hh = clamp01(gran * 0.62 + superg * 0.38);
          hgt = hh;
          rgb[0] = lerp(196, 255, hh);
          rgb[1] = lerp(96, 244, Math.pow(hh, 1.25));
          rgb[2] = lerp(18, 190, Math.pow(hh, 2.6));
          break;
        }

        default: {
          rgb[0] = rgb[1] = rgb[2] = 128;
          hgt = 0.5;
        }
      }

      const i = (rowBase + x) * 4;
      px[i]     = rgb[0];
      px[i + 1] = rgb[1];
      px[i + 2] = rgb[2];
      if (px[i + 3] === 0 && kind !== 'terrestrial' && kind !== 'clouds' && kind !== 'lights') px[i + 3] = 255;

      if (hbuf) hbuf[rowBase + x] = hgt;
    }
  }

  return { pixels: px, heights: hbuf };
}

/* ─────────────────────────── normal map ─────────────────────────── */

/**
 * Convert a height field into a tangent-space normal map.
 * Wraps in U (longitude) and clamps in V (latitude).
 */
export function heightsToNormal(hbuf, w, h, strength = 2.2) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const yUp = y > 0 ? y - 1 : 0;
    const yDn = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const xL = x > 0 ? x - 1 : w - 1;
      const xR = x < w - 1 ? x + 1 : 0;

      const l = hbuf[y * w + xL];
      const r = hbuf[y * w + xR];
      const u = hbuf[yUp * w + x];
      const d = hbuf[yDn * w + x];

      // Tangent-space normal; green = +V in UV space.
      let nx = -(r - l) * strength;
      let ny =  (d - u) * strength;
      let nz = 1.0;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv; ny *= inv; nz *= inv;

      const i = (y * w + x) * 4;
      out[i]     = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

/* ─────────────────────────── ring texture ─────────────────────────── */

/**
 * 1-D radial ring profile stored as a 2-D strip (height = 4 px).
 * u = 0 → inner edge, u = 1 → outer edge, in units of the inner radius.
 */
export function generateRings(w, h, o) {
  const px = new Uint8ClampedArray(w * h * 4);
  const seed = (o.seed | 0) || 991;
  const rnd = mulberry32(seed);

  // Pre-generate a fine structure noise track so it stays coherent across rows.
  const fine = new Float32Array(w);
  for (let i = 0; i < w; i++) {
    const t = i / w;
    fine[i] = fbm3(t * 240, 0.5, 0.5, 4, 2.0, 0.5, seed) * 0.6 +
              fbm3(t * 900, 3.5, 1.5, 3, 2.0, 0.5, seed + 5) * 0.4;
  }

  const base = hexToRgb(o.color || '#d8cdb6');

  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);            // 0 → inner edge, 1 → outer edge

    // Macro density profile (C / B / Cassini / A / F structure by default).
    let a = 0;
    for (const g of (o.gaps || [])) {
      a += g.strength * Math.exp(-Math.pow((t - g.center) / g.width, 2));
    }
    let density = clamp01((o.baseDensity ?? 0.72) - a);

    // Ringlet structure.
    density *= 0.62 + fine[i] * 0.72;

    // Soft edges.
    density *= smoothstep(0, 0.035, t) * (1 - smoothstep(0.955, 1, t));

    const shade = 0.72 + fine[i] * 0.5;
    for (let y = 0; y < h; y++) {
      const idx = (y * w + i) * 4;
      px[idx]     = clamp01(base[0] / 255 * shade) * 255;
      px[idx + 1] = clamp01(base[1] / 255 * shade) * 255;
      px[idx + 2] = clamp01(base[2] / 255 * shade) * 255;
      px[idx + 3] = clamp01(density) * 255;
    }
  }
  return px;
}

/* ─────────────────────────── deep-space background ─────────────────────────── */

/**
 * Very low-contrast Milky Way band + faint interstellar dust.
 * Deliberately dark so it reads as deep space, not as a fantasy wallpaper.
 */
export function generateNebula(w, h, seed = 4242) {
  const px = new Uint8ClampedArray(w * h * 4);

  // Galactic plane normal expressed in the texture's frame.
  const gx = 0.42, gy = 0.80, gz = -0.43;
  const gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
  const nx0 = gx / gl, ny0 = gy / gl, nz0 = gz / gl;

  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const lat = (0.5 - v) * Math.PI;
    const clat = Math.cos(lat), slat = Math.sin(lat);

    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * TWO_PI;
      const dx = clat * Math.cos(lon), dy = slat, dz = clat * Math.sin(lon);

      // Distance from the galactic plane.
      const gd = dx * nx0 + dy * ny0 + dz * nz0;
      let band = Math.exp(-(gd * gd) / (2 * 0.075 * 0.075));

      // Central bulge toward the galactic centre.
      const gc = Math.exp(-(Math.pow(gd / 0.19, 2) + Math.pow(
        (dx * 0.90 + dy * 0.10 + dz * -0.42) / 0.30, 2)) * 2.1) * 0.55;

      // Structure: bright and dark clouds.
      const bright = fbm3(dx * 4.5, dy * 4.5, dz * 4.5, 5, 2.05, 0.55, seed);
      const dust   = fbm3(dx * 9.0 + 30, dy * 9.0, dz * 9.0, 5, 2.1, 0.5, seed + 17);
      const lane   = Math.pow(clamp01(1 - Math.abs(dust - 0.5) * 5.4), 1.6);

      let i = (band * (0.30 + bright * 0.85) + gc * (0.4 + bright * 0.7)) * (1 - lane * 0.72);
      i = clamp01(i * 0.30);

      // Slight warm core / cool halo tint.
      const warm = clamp01(gc * 1.6);
      const r = i * (168 + warm * 74);
      const g = i * (176 + warm * 34);
      const b = i * (214 + warm * -22);

      const idx = (y * w + x) * 4;
      px[idx]     = r;
      px[idx + 1] = g;
      px[idx + 2] = b;
      px[idx + 3] = 255;
    }
  }
  return px;
}
