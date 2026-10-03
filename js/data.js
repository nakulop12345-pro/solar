/**
 * data.js — scientific data for NAKUL SOLAR SYSTEM.
 *
 * PRIMARY SOURCES (all public domain):
 *   • NASA/JPL Solar System Dynamics — E. M. Standish, "Keplerian Elements for
 *     Approximate Positions of the Major Planets" (a, e, I, L, ϖ, Ω + rates).
 *   • NASA NSSDCA Planetary Fact Sheets — radii, masses, rotation, tilt, temperature.
 *   • JPL Planetary Satellite Physical Parameters — moon radii, a, and periods.
 *   • JPL Horizons — Pluto elements.
 *
 * No value in this file is invented. Where a value is a deliberate visual
 * compromise it lives in SCALE, not in the physical data.
 */

export const AU_KM = 149597870.7;
export const EARTH_RADIUS_KM = 6371.0;
export const J2000_JD = 2451545.0;

/* ──────────────────────────────────────────────────────────────────────────
   VISUALIZATION SCALE
   The real Solar System cannot be shown with true distances *and* true radii
   *and* readable planets. This project keeps DISTANCES linear (1 AU = 120 u)
   and compresses RADII. Satellite orbits are additionally compressed by a
   monotonic power law so that tightly-packed moon systems remain legible.
   ────────────────────────────────────────────────────────────────────────── */
export const SCALE = {
  AU: 120,                 // world units per astronomical unit
  EARTH_RADIUS: 2.2,       // world units for one Earth radius
  SUN_RADIUS: 15,          // compressed (true value would be 240 units)
  MIN_MOON_RADIUS: 0.085,  // keeps Phobos/Deimos visible
  AU_PER_UNIT: 1 / 120,
};

export function bodyRadiusUnits(radiusKm) {
  return Math.max(SCALE.MIN_MOON_RADIUS, (radiusKm / EARTH_RADIUS_KM) * SCALE.EARTH_RADIUS);
}

/** Monotonic satellite-orbit compression (documented in README). */
export function moonOrbitUnits(distKm, planetRadiusKm, planetDisplayRadius) {
  const ratio = Math.max(1.05, distKm / planetRadiusKm);
  return planetDisplayRadius * (1.8 + 1.15 * Math.pow(ratio, 0.62));
}

export function auToUnits(au) { return au * SCALE.AU; }

/* ──────────────────────────────────────────────────────────────────────────
   PLANETS — heliocentric Keplerian elements at J2000 with per-century rates.
   Angles in degrees, semi-major axis in AU, rates per Julian century.
   ────────────────────────────────────────────────────────────────────────── */

export const PLANETS = [
  {
    id: 'mercury', name: 'Mercury', type: 'Terrestrial planet',
    radiusKm: 2439.7, massKg: 3.3011e23, gravity: 3.7,
    rotationPeriodDays: 58.646, axialTilt: 0.034,
    moons: 0, tempC: '−173 °C to +427 °C',
    atmosphere: 'Virtually none — a trace exosphere of oxygen, sodium, hydrogen, helium and potassium.',
    elements: {
      a: 0.38709927, e: 0.20563593, I: 7.00497902, L: 252.25032350,
      peri: 77.45779628, node: 48.33076593,
      aDot: 0.00000037, eDot: 0.00001906, IDot: -0.00594749,
      LDot: 149472.67411175, periDot: 0.16047689, nodeDot: -0.12534081,
    },
    color: '#9c9088',
    texture: {
      kind: 'rocky', seed: 1101, normal: true, normalStrength: 2.6, craters: 0.55, frequency: 3.0,
      palette: [
        { p: 0.00, c: '#2c2926' }, { p: 0.35, c: '#5d564e' },
        { p: 0.65, c: '#8d857a' }, { p: 1.00, c: '#c3b9a9' },
      ],
    },
    facts: [
      'A single Mercurian day (sunrise to sunrise) lasts 176 Earth days — two Mercurian years.',
      'Its iron core occupies roughly 85 % of the planet’s radius.',
      'Despite the scorching days, radar shows water ice in permanently shadowed polar craters.',
    ],
  },
  {
    id: 'venus', name: 'Venus', type: 'Terrestrial planet',
    radiusKm: 6051.8, massKg: 4.8675e24, gravity: 8.87,
    rotationPeriodDays: -243.025, axialTilt: 177.36,
    moons: 0, tempC: '+464 °C (mean surface)',
    atmosphere: '96.5 % carbon dioxide, 3.5 % nitrogen; sulphuric-acid cloud decks. Surface pressure 92 bar.',
    elements: {
      a: 0.72333566, e: 0.00677672, I: 3.39467605, L: 181.97909950,
      peri: 131.60246718, node: 76.67984255,
      aDot: 0.00000390, eDot: -0.00004107, IDot: -0.00078890,
      LDot: 58517.81538729, periDot: 0.00268329, nodeDot: -0.27769418,
    },
    color: '#e6c88a',
    texture: {
      kind: 'gas', seed: 1202, bandCount: 7, turbulence: 0.11,
      bands: [
        { p: 0.00, c: '#c9a860' }, { p: 0.24, c: '#e5cf9a' },
        { p: 0.50, c: '#f3e3bb' }, { p: 0.76, c: '#e8d3a2' },
        { p: 1.00, c: '#cbb072' },
      ],
    },
    atmosphere: { color: '#ffe9b8', intensity: 0.85, power: 2.2, scale: 1.035 },
    facts: [
      'Venus rotates backwards: the Sun rises in the west and sets in the east.',
      'Its atmosphere super-rotates, circling the planet every ~4 days while the surface takes 243.',
      'It is the hottest planet — hotter than Mercury, which is closer to the Sun.',
    ],
  },
  {
    id: 'earth', name: 'Earth', type: 'Terrestrial planet',
    radiusKm: 6371.0, massKg: 5.97237e24, gravity: 9.807,
    rotationPeriodDays: 0.99726968, axialTilt: 23.4393,
    moons: 1, tempC: '+15 °C (mean surface)',
    atmosphere: '78.08 % nitrogen, 20.95 % oxygen, 0.93 % argon, variable water vapour.',
    elements: {
      a: 1.00000261, e: 0.01671123, I: -0.00001531, L: 100.46457166,
      peri: 102.93768193, node: 0.0,
      aDot: 0.00000562, eDot: -0.00004392, IDot: -0.01294668,
      LDot: 35999.37244981, periDot: 0.32327364, nodeDot: 0.0,
    },
    color: '#3d7bd6',
    texture: { kind: 'terrestrial', seed: 1303, normal: true, normalStrength: 1.7, seaLevel: 0.505, iceEdge: 0.80 },
    atmosphere: { color: '#6aa8ff', intensity: 1.15, power: 2.6, scale: 1.026 },
    facts: [
      'The only planetary body known to support life.',
      'Its magnetic field, generated by a liquid iron dynamo, deflects the solar wind.',
      'About 71 % of the surface is covered by liquid water.',
    ],
  },
  {
    id: 'mars', name: 'Mars', type: 'Terrestrial planet',
    radiusKm: 3389.5, massKg: 6.4171e23, gravity: 3.721,
    rotationPeriodDays: 1.02595676, axialTilt: 25.19,
    moons: 2, tempC: '−140 °C to +20 °C (mean −63 °C)',
    atmosphere: '95.3 % carbon dioxide, 2.7 % nitrogen, 1.6 % argon. Surface pressure ~0.006 bar.',
    elements: {
      a: 1.52371034, e: 0.09339410, I: 1.84969142, L: -4.55343205,
      peri: -23.94362959, node: 49.55953891,
      aDot: 0.00001847, eDot: 0.00007882, IDot: -0.00813131,
      LDot: 19140.30268499, periDot: 0.44441088, nodeDot: -0.29257343,
    },
    color: '#c1552b',
    texture: {
      kind: 'rocky', seed: 1404, normal: true, normalStrength: 2.2, craters: 0.38, frequency: 2.8,
      palette: [
        { p: 0.00, c: '#4a1f12' }, { p: 0.30, c: '#8c3a1f' },
        { p: 0.62, c: '#c06a38' }, { p: 0.86, c: '#dd9459' }, { p: 1.00, c: '#f0d9c0' },
      ],
    },
    atmosphere: { color: '#ff9d6b', intensity: 0.42, power: 2.8, scale: 1.022 },
    facts: [
      'Olympus Mons is the tallest volcano in the Solar System, rising ~22 km.',
      'Valles Marineris is a canyon system over 4,000 km long.',
      'Mars has the largest dust storms in the Solar System — they can envelop the entire planet.',
    ],
  },
  {
    id: 'jupiter', name: 'Jupiter', type: 'Gas giant',
    radiusKm: 69911, massKg: 1.8982e27, gravity: 24.79,
    rotationPeriodDays: 0.41354, axialTilt: 3.13,
    moons: 95, tempC: '−108 °C (cloud tops)',
    atmosphere: '~90 % hydrogen, ~10 % helium with traces of methane, ammonia and water vapour.',
    elements: {
      a: 5.20288700, e: 0.04838624, I: 1.30439695, L: 34.39644051,
      peri: 14.72847983, node: 100.47390909,
      aDot: -0.00011607, eDot: -0.00013253, IDot: -0.00183714,
      LDot: 3034.74612775, periDot: 0.21252668, nodeDot: 0.20469106,
    },
    color: '#d8b48a',
    texture: {
      kind: 'gas', seed: 1505, bandCount: 15, turbulence: 0.062,
      spot: { lon: 1.35, lat: -0.37, rx: 0.30, ry: 0.105, color: '#b8502c' },
      bands: [
        { p: 0.00, c: '#6b5a4c' }, { p: 0.10, c: '#9c7a58' }, { p: 0.22, c: '#d5bf9c' },
        { p: 0.34, c: '#a86a48' }, { p: 0.46, c: '#e8d5b8' }, { p: 0.56, c: '#b07a52' },
        { p: 0.68, c: '#dcc7a4' }, { p: 0.82, c: '#a8845f' }, { p: 1.00, c: '#6f5d4d' },
      ],
    },
    atmosphere: { color: '#ffd9a8', intensity: 0.75, power: 2.4, scale: 1.018 },
    facts: [
      'Jupiter is more massive than every other planet in the Solar System combined, by 2.5×.',
      'The Great Red Spot is an anticyclone wider than Earth that has raged for centuries.',
      'Its magnetosphere is the largest structure in the Solar System after the heliosphere.',
    ],
  },
  {
    id: 'saturn', name: 'Saturn', type: 'Gas giant',
    radiusKm: 58232, massKg: 5.6834e26, gravity: 10.44,
    rotationPeriodDays: 0.44401, axialTilt: 26.73,
    moons: 146, tempC: '−139 °C (cloud tops)',
    atmosphere: '~96 % hydrogen, ~3 % helium, traces of methane and ammonia.',
    elements: {
      a: 9.53667594, e: 0.05386179, I: 2.48599187, L: 49.95424423,
      peri: 92.59887831, node: 113.66242448,
      aDot: -0.00125060, eDot: -0.00050991, IDot: 0.00193609,
      LDot: 1222.49362201, periDot: -0.41897216, nodeDot: -0.28867794,
    },
    color: '#e0cf9a',
    texture: {
      kind: 'gas', seed: 1606, bandCount: 11, turbulence: 0.038,
      bands: [
        { p: 0.00, c: '#a89770' }, { p: 0.18, c: '#d9c99a' }, { p: 0.38, c: '#efe3bc' },
        { p: 0.50, c: '#f6ecc9' }, { p: 0.64, c: '#eddfb4' }, { p: 0.84, c: '#cfbd8c' },
        { p: 1.00, c: '#9d8f6c' },
      ],
    },
    ring: {
      innerRatio: 1.24, outerRatio: 2.34, color: '#ded2b6', baseDensity: 0.74,
      gaps: [
        { center: 0.055, width: 0.030, strength: 0.42 },   // C ring inner
        { center: 0.375, width: 0.022, strength: 0.34 },   // Maxwell / Huygens region
        { center: 0.615, width: 0.030, strength: 0.94 },   // Cassini Division
        { center: 0.760, width: 0.012, strength: 0.44 },   // Encke Gap
        { center: 0.905, width: 0.016, strength: 0.32 },   // Roche Division
        { center: 0.975, width: 0.012, strength: 0.55 },   // F ring lane
      ],
    },
    atmosphere: { color: '#ffeec2', intensity: 0.68, power: 2.4, scale: 1.020 },
    facts: [
      'Saturn’s mean density is 0.687 g/cm³ — less than water. It would float.',
      'The rings span ~280,000 km but are on average only ~10 m thick.',
      'A hexagonal jet stream circles its north pole, stable for decades.',
    ],
  },
  {
    id: 'uranus', name: 'Uranus', type: 'Ice giant',
    radiusKm: 25362, massKg: 8.6810e25, gravity: 8.87,
    rotationPeriodDays: -0.71833, axialTilt: 97.77,
    moons: 28, tempC: '−197 °C (cloud tops)',
    atmosphere: '~83 % hydrogen, ~15 % helium, ~2 % methane — the methane gives it its cyan hue.',
    elements: {
      a: 19.18916464, e: 0.04725744, I: 0.77263783, L: 313.23810451,
      peri: 170.95427630, node: 74.01692503,
      aDot: -0.00196176, eDot: -0.00004397, IDot: -0.00242939,
      LDot: 428.48202785, periDot: 0.40805281, nodeDot: 0.04240589,
    },
    color: '#9fe3e8',
    texture: {
      kind: 'gas', seed: 1707, bandCount: 6, turbulence: 0.020,
      bands: [
        { p: 0.00, c: '#8fd2da' }, { p: 0.32, c: '#a9e2e8' },
        { p: 0.62, c: '#bcedf1' }, { p: 1.00, c: '#94d6de' },
      ],
    },
    atmosphere: { color: '#9fe8ff', intensity: 0.80, power: 2.6, scale: 1.028 },
    facts: [
      'Uranus is tipped 98° — it rolls around the Sun on its side.',
      'Each pole endures 42 years of continuous sunlight followed by 42 years of darkness.',
      'It was the first planet discovered with a telescope, by William Herschel in 1781.',
    ],
  },
  {
    id: 'neptune', name: 'Neptune', type: 'Ice giant',
    radiusKm: 24622, massKg: 1.02413e26, gravity: 11.15,
    rotationPeriodDays: 0.67125, axialTilt: 28.32,
    moons: 16, tempC: '−201 °C (cloud tops)',
    atmosphere: '~80 % hydrogen, ~19 % helium, ~1.5 % methane. Supersonic winds up to 2,100 km/h.',
    elements: {
      a: 30.06992276, e: 0.00859048, I: 1.77004347, L: -55.12002969,
      peri: 44.96476227, node: 131.78422574,
      aDot: 0.00026291, eDot: 0.00005105, IDot: 0.00035372,
      LDot: 218.45945325, periDot: -0.32241464, nodeDot: -0.00508664,
    },
    color: '#4a6fd8',
    texture: {
      kind: 'gas', seed: 1808, bandCount: 8, turbulence: 0.034,
      spot: { lon: 2.4, lat: -0.30, rx: 0.26, ry: 0.10, color: '#18214f' },
      bands: [
        { p: 0.00, c: '#28409c' }, { p: 0.28, c: '#3655bd' },
        { p: 0.52, c: '#4a6fd8' }, { p: 0.74, c: '#5b83e0' }, { p: 1.00, c: '#2d47a8' },
      ],
    },
    atmosphere: { color: '#6f9dff', intensity: 0.92, power: 2.6, scale: 1.026 },
    facts: [
      'Neptune was found by mathematics before it was seen — predicted from Uranus’s orbital perturbations.',
      'Its winds are the fastest measured anywhere in the Solar System.',
      'It has completed only one orbit of the Sun since its discovery in 1846.',
    ],
  },
  {
    id: 'pluto', name: 'Pluto', type: 'Dwarf planet',
    radiusKm: 1188.3, massKg: 1.303e22, gravity: 0.62,
    rotationPeriodDays: 6.3872, axialTilt: 122.53,
    moons: 5, tempC: '−229 °C (mean)',
    atmosphere: 'Thin, transient nitrogen–methane atmosphere that freezes out near aphelion.',
    dwarf: true,
    elements: {
      a: 39.48211675, e: 0.24882730, I: 17.14001206, L: 238.92903833,
      peri: 224.06891629, node: 110.30393684,
      aDot: -0.00031596, eDot: 0.00005170, IDot: 0.00004818,
      LDot: 145.20780515, periDot: -0.04062942, nodeDot: -0.01183482,
    },
    color: '#c8b09a',
    texture: {
      kind: 'rocky', seed: 1909, normal: true, normalStrength: 2.0, craters: 0.30, frequency: 3.4,
      palette: [
        { p: 0.00, c: '#5a4636' }, { p: 0.35, c: '#9b8270' },
        { p: 0.70, c: '#cdbba7' }, { p: 1.00, c: '#f2e6d6' },
      ],
    },
    facts: [
      'Pluto and Charon are tidally locked — they always show each other the same face.',
      'Sputnik Planitia, its vast nitrogen-ice plain, is a convecting glacier.',
      'Pluto’s orbit is so eccentric it sometimes comes closer to the Sun than Neptune.',
    ],
  },
];

/* ──────────────────────────────────────────────────────────────────────────
   MOONS
   Orbits are treated as circles in the parent's equatorial plane.
   phase is a deterministic offset (radians) so systems do not line up.
   ────────────────────────────────────────────────────────────────────────── */

export const MOONS = [
  /* Earth */
  { id: 'moon', name: 'Moon', parent: 'earth', radiusKm: 1737.4, massKg: 7.342e22,
    distKm: 384400, periodDays: 27.321661, inclination: 5.145, phase: 0.0, color: '#b9b6b0',
    type: 'Natural satellite', gravity: 1.62, tempC: '−173 °C to +127 °C',
    atmosphere: 'Essentially none — a trace exosphere.',
    texture: { kind: 'rocky', seed: 2101, normal: true, normalStrength: 2.6, craters: 0.62, frequency: 3.2,
      palette: [ { p: 0.00, c: '#2a2824' }, { p: 0.40, c: '#5f5b52' },
                 { p: 0.72, c: '#918b7e' }, { p: 1.00, c: '#c4bcae' } ] },
    facts: ['Always shows Earth the same face — tidal locking.', 'Formed ~4.5 Gyr ago, probably from a giant impact.'] },

  /* Mars */
  { id: 'phobos', name: 'Phobos', parent: 'mars', radiusKm: 11.267, distKm: 9376,
    periodDays: 0.318910, inclination: 1.08, phase: 0.9, color: '#8a7d70', type: 'Natural satellite',
    texture: { kind: 'rocky', seed: 2201, normal: true, normalStrength: 3.0, craters: 0.75, frequency: 5.0,
      palette: [ { p: 0, c: '#3a332c' }, { p: 0.5, c: '#6d6154' }, { p: 1, c: '#9c8d7c' } ] },
    facts: ['Orbits faster than Mars rotates — it rises in the west twice a Martian day.'] },
  { id: 'deimos', name: 'Deimos', parent: 'mars', radiusKm: 6.2, distKm: 23463,
    periodDays: 1.262440, inclination: 1.79, phase: 2.4, color: '#8f8377', type: 'Natural satellite',
    texture: { kind: 'rocky', seed: 2202, normal: true, normalStrength: 3.0, craters: 0.72, frequency: 5.5,
      palette: [ { p: 0, c: '#3d362e' }, { p: 0.5, c: '#726558' }, { p: 1, c: '#a39383' } ] },
    facts: ['One of the smoothest small bodies known — regolith fills its craters.'] },

  /* Jupiter — Galilean satellites */
  { id: 'io', name: 'Io', parent: 'jupiter', radiusKm: 1821.6, distKm: 421700,
    periodDays: 1.769138, inclination: 0.05, phase: 0.4, color: '#e8d26a', type: 'Galilean moon',
    atmosphere: 'Extremely thin sulphur-dioxide atmosphere, constantly replenished by volcanism.',
    texture: { kind: 'rocky', seed: 2301, normal: true, normalStrength: 1.8, craters: 0.18, frequency: 3.4,
      palette: [ { p: 0, c: '#8a6a1e' }, { p: 0.34, c: '#d9b642' },
                 { p: 0.62, c: '#f0dd8a' }, { p: 1, c: '#fdf3c8' } ] },
    facts: ['The most volcanically active body in the Solar System — over 400 active volcanoes.'] },
  { id: 'europa', name: 'Europa', parent: 'jupiter', radiusKm: 1560.8, distKm: 671034,
    periodDays: 3.551181, inclination: 0.47, phase: 1.7, color: '#dfd5c0', type: 'Galilean moon',
    atmosphere: 'Very tenuous oxygen exosphere.',
    texture: { kind: 'ice', seed: 2302, normal: true, normalStrength: 1.6, cracks: true, craters: 0.10, frequency: 2.6,
      palette: [ { p: 0, c: '#9c8f78' }, { p: 0.45, c: '#ded4c1' },
                 { p: 0.78, c: '#f0e9dc' }, { p: 1, c: '#ffffff' } ] },
    facts: ['Beneath its ice shell lies a global salt-water ocean holding twice Earth’s water.'] },
  { id: 'ganymede', name: 'Ganymede', parent: 'jupiter', radiusKm: 2634.1, distKm: 1070412,
    periodDays: 7.154553, inclination: 0.20, phase: 3.1, color: '#a89e90', type: 'Galilean moon',
    atmosphere: 'Thin oxygen exosphere.',
    texture: { kind: 'rocky', seed: 2303, normal: true, normalStrength: 2.0, craters: 0.45, frequency: 3.0,
      palette: [ { p: 0, c: '#4c4740' }, { p: 0.42, c: '#8b8377' },
                 { p: 0.74, c: '#b8b0a2' }, { p: 1, c: '#dcd5c8' } ] },
    facts: ['The largest moon in the Solar System — bigger than Mercury.'] },
  { id: 'callisto', name: 'Callisto', parent: 'jupiter', radiusKm: 2410.3, distKm: 1882709,
    periodDays: 16.689018, inclination: 0.19, phase: 5.0, color: '#7f766c', type: 'Galilean moon',
    texture: { kind: 'rocky', seed: 2304, normal: true, normalStrength: 2.4, craters: 0.85, frequency: 4.0,
      palette: [ { p: 0, c: '#2e2a26' }, { p: 0.45, c: '#655c52' },
                 { p: 0.78, c: '#958b7d' }, { p: 1, c: '#c0b6a6' } ] },
    facts: ['The most heavily cratered object known — its surface is ~4 Gyr old.'] },

  /* Saturn */
  { id: 'mimas', name: 'Mimas', parent: 'saturn', radiusKm: 198.2, distKm: 185539,
    periodDays: 0.942422, inclination: 1.57, phase: 0.2, color: '#c9c6bd', type: 'Natural satellite',
    texture: { kind: 'ice', seed: 2401, normal: true, normalStrength: 2.6, craters: 0.80, frequency: 5.5,
      palette: [ { p: 0, c: '#585650' }, { p: 0.5, c: '#a5a29a' }, { p: 1, c: '#e6e3db' } ] },
    facts: ['Its 130 km Herschel crater gives it an uncanny resemblance to the Death Star.'] },
  { id: 'enceladus', name: 'Enceladus', parent: 'saturn', radiusKm: 252.1, distKm: 237948,
    periodDays: 1.370218, inclination: 0.009, phase: 1.4, color: '#f2f6f8', type: 'Natural satellite',
    atmosphere: 'Localised water-vapour plume originating from the south polar terrain.',
    texture: { kind: 'ice', seed: 2402, normal: true, normalStrength: 1.6, cracks: true, craters: 0.22, frequency: 3.4,
      palette: [ { p: 0, c: '#a8b2ba' }, { p: 0.5, c: '#e2eaee' }, { p: 1, c: '#ffffff' } ] },
    facts: ['Its south pole vents plumes of water ice — evidence of a subsurface ocean.'] },
  { id: 'tethys', name: 'Tethys', parent: 'saturn', radiusKm: 531.1, distKm: 294619,
    periodDays: 1.887802, inclination: 1.09, phase: 2.6, color: '#dcdad2', type: 'Natural satellite',
    texture: { kind: 'ice', seed: 2403, normal: true, normalStrength: 2.0, craters: 0.55, frequency: 4.0,
      palette: [ { p: 0, c: '#6a6862' }, { p: 0.5, c: '#bcb9b1' }, { p: 1, c: '#f0eee7' } ] },
    facts: ['Ithaca Chasma is a 2,000 km canyon system, three-quarters of its circumference.'] },
  { id: 'dione', name: 'Dione', parent: 'saturn', radiusKm: 561.4, distKm: 377396,
    periodDays: 2.736915, inclination: 0.02, phase: 4.0, color: '#c9c6be', type: 'Natural satellite',
    texture: { kind: 'ice', seed: 2404, normal: true, normalStrength: 2.2, craters: 0.60, frequency: 4.0,
      palette: [ { p: 0, c: '#5f5d57' }, { p: 0.5, c: '#b0ada5' }, { p: 1, c: '#e8e5dd' } ] },
    facts: ['Features bright ice cliffs formed by tectonic fracturing.'] },
  { id: 'rhea', name: 'Rhea', parent: 'saturn', radiusKm: 763.8, distKm: 527108,
    periodDays: 4.518212, inclination: 0.345, phase: 5.4, color: '#cbc8c0', type: 'Natural satellite',
    texture: { kind: 'ice', seed: 2405, normal: true, normalStrength: 2.2, craters: 0.68, frequency: 4.2,
      palette: [ { p: 0, c: '#5b5954' }, { p: 0.5, c: '#adаaa2'.replace('а','a') }, { p: 1, c: '#e6e3db' } ] },
    facts: ['Saturn’s second-largest moon, and a possible faint ring system of its own.'] },
  { id: 'titan', name: 'Titan', parent: 'saturn', radiusKm: 2574.7, distKm: 1221870,
    periodDays: 15.945421, inclination: 0.348, phase: 0.8, color: '#e0a44a', type: 'Natural satellite',
    atmosphere: 'Dense nitrogen atmosphere (~1.45 bar) with methane; opaque orange photochemical haze.',
    texture: { kind: 'gas', seed: 2406, bandCount: 5, turbulence: 0.055,
      bands: [ { p: 0, c: '#8a5a18' }, { p: 0.35, c: '#c8892c' },
               { p: 0.65, c: '#e8ac52' }, { p: 1, c: '#9a6520' } ] },
    facts: ['The only moon with a substantial atmosphere.', 'Has stable lakes and rivers of liquid methane and ethane.'] },
  { id: 'iapetus', name: 'Iapetus', parent: 'saturn', radiusKm: 734.5, distKm: 3560820,
    periodDays: 79.3215, inclination: 15.47, phase: 3.6, color: '#9a8f80', type: 'Natural satellite',
    texture: { kind: 'rocky', seed: 2407, normal: true, normalStrength: 2.4, craters: 0.70, frequency: 4.6,
      palette: [ { p: 0, c: '#1e1a16' }, { p: 0.44, c: '#5c5348' },
                 { p: 0.62, c: '#a99c8a' }, { p: 1, c: '#ded4c2' } ] },
    facts: ['Two-toned: one hemisphere is as dark as coal, the other as bright as snow.'] },

  /* Uranus */
  { id: 'miranda', name: 'Miranda', parent: 'uranus', radiusKm: 235.8, distKm: 129390,
    periodDays: 1.413479, inclination: 4.34, phase: 0.5, color: '#c6c8c9', type: 'Natural satellite',
    texture: { kind: 'ice', seed: 2501, normal: true, normalStrength: 2.6, cracks: true, craters: 0.45, frequency: 4.4,
      palette: [ { p: 0, c: '#5e6062' }, { p: 0.5, c: '#adb0b2' }, { p: 1, c: '#e8ebed' } ] },
    facts: ['Verona Rupes is a cliff up to 20 km high — the tallest known.'] },
  { id: 'ariel', name: 'Ariel', parent: 'uranus', radiusKm: 578.9, distKm: 190900,
    periodDays: 2.520379, inclination: 0.26, phase: 1.9, color: '#d2d6d8', type: 'Natural satellite',
    texture: { kind: 'ice', seed: 2502, normal: true, normalStrength: 2.0, cracks: true, craters: 0.38, frequency: 4.0,
      palette: [ { p: 0, c: '#666a6c' }, { p: 0.5, c: '#b8bcbe' }, { p: 1, c: '#f2f5f7' } ] },
    facts: ['The brightest and most geologically active Uranian moon.'] },
  { id: 'umbriel', name: 'Umbriel', parent: 'uranus', radiusKm: 584.7, distKm: 266000,
    periodDays: 4.144177, inclination: 0.13, phase: 3.3, color: '#8a8c8c', type: 'Natural satellite',
    texture: { kind: 'ice', seed: 2503, normal: true, normalStrength: 2.2, craters: 0.72, frequency: 4.4,
      palette: [ { p: 0, c: '#3a3c3d' }, { p: 0.5, c: '#82858६'.replace('६','6') }, { p: 1, c: '#c0c3c4' } ] },
    facts: ['The darkest of the five major Uranian moons.'] },
  { id: 'titania', name: 'Titania', parent: 'uranus', radiusKm: 788.4, distKm: 436300,
    periodDays: 8.705872, inclination: 0.34, phase: 4.7, color: '#c0bcb4', type: 'Natural satellite',
    texture: { kind: 'ice', seed: 2504, normal: true, normalStrength: 2.0, craters: 0.58, frequency: 4.2,
      palette: [ { p: 0, c: '#5a574f' }, { p: 0.5, c: '#aeaaa0' }, { p: 1, c: '#e6e2d8' } ] },
    facts: ['The largest Uranian moon, scarred by enormous canyon systems.'] },
  { id: 'oberon', name: 'Oberon', parent: 'uranus', radiusKm: 761.4, distKm: 583500,
    periodDays: 13.463239, inclination: 0.058, phase: 1.1, color: '#a8a29a', type: 'Natural satellite',
    texture: { kind: 'ice', seed: 2505, normal: true, normalStrength: 2.2, craters: 0.74, frequency: 4.6,
      palette: [ { p: 0, c: '#4a4640' }, { p: 0.5, c: '#9c968c' }, { p: 1, c: '#d4cec4' } ] },
    facts: ['Its surface shows dark material of unknown composition in crater floors.'] },

  /* Neptune */
  { id: 'triton', name: 'Triton', parent: 'neptune', radiusKm: 1353.4, distKm: 354759,
    periodDays: 5.876854, inclination: 20.0, retrograde: true, phase: 2.2, color: '#dfe2e0',
    type: 'Natural satellite', atmosphere: 'Thin nitrogen atmosphere with a tenuous haze.',
    texture: { kind: 'ice', seed: 2601, normal: true, normalStrength: 2.0, cracks: true, craters: 0.30, frequency: 3.6,
      palette: [ { p: 0, c: '#8f8a80' }, { p: 0.5, c: '#d8d3c8' }, { p: 1, c: '#ffffff' } ] },
    facts: ['The only large moon with a retrograde orbit — it was captured, not formed in place.',
            'Its surface has nitrogen geysers erupting several kilometres high.'] },

  /* Pluto */
  { id: 'charon', name: 'Charon', parent: 'pluto', radiusKm: 606, distKm: 19591,
    periodDays: 6.3872, inclination: 0.0, phase: 0.0, color: '#a9a5a0', type: 'Natural satellite',
    texture: { kind: 'ice', seed: 2701, normal: true, normalStrength: 2.2, cracks: true, craters: 0.55, frequency: 4.2,
      palette: [ { p: 0, c: '#55524e' }, { p: 0.5, c: '#a5a19c' }, { p: 1, c: '#dedad4' } ] },
    facts: ['Half the diameter of Pluto — the pair is effectively a binary system.'] },
];

/** Objects whose textures are required before the loading screen may clear. */
export const ESSENTIAL_IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
