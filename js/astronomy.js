/**
 * astronomy.js — Julian-date time engine and Keplerian orbit propagation.
 *
 * Method: first-order Keplerian elements (Standish, JPL SSD). Valid roughly
 * 1800–2050 AD; residuals against DE430 are on the order of arcminutes.
 * Newton–Raphson converges to 1e-10 rad in <6 iterations for e < 0.26.
 *
 * Times are handled as Julian Dates in UTC. The elements are referenced to TDB;
 * the UTC–TDB difference (< 2 min) is not modelled and is documented in the UI.
 */

import { J2000_JD } from './data.js';

export { J2000_JD };

const CENTURY = 36525;             // days per Julian century
export const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

/* ─────────────────────── time ─────────────────────── */

export function dateToJD(date) { return date.getTime() / 86400000 + 2440587.5; }
export function jdToDate(jd)   { return new Date((jd - 2440587.5) * 86400000); }

export function jdToISO(jd) {
  const d = jdToDate(jd);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-` +
         `${String(d.getUTCMonth() + 1).padStart(2, '0')}-` +
         `${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function jdToClock(jd) {
  const d = jdToDate(jd);
  return `${String(d.getUTCHours()).padStart(2, '0')}:` +
         `${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

export function jdToPretty(jd) {
  const d = jdToDate(jd);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const y = d.getUTCFullYear();
  return `${String(d.getUTCDate()).padStart(2,'0')} ${months[d.getUTCMonth()]} ${y < 0 ? 'BCE' : ''}${Math.abs(y)}`;
}

/* ─────────────────────── Kepler ─────────────────────── */

/** Solve M = E − e·sin E for the eccentric anomaly E (radians). */
export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i++) {
    const f  = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    if (Math.abs(fp) < 1e-12) break;
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-11) break;
  }
  return E;
}

function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

/**
 * Heliocentric ecliptic position of a planet.
 * @param {object} el  element set { a,e,I,L,peri,node, aDot,eDot,IDot,LDot,periDot,nodeDot }
 * @param {number} jd  Julian date
 * @returns {{x:number,y:number,z:number}} position in AU (ecliptic J2000 frame)
 */
export function planetHeliocentric(el, jd) {
  const T = (jd - J2000_JD) / CENTURY;

  const a    = el.a    + el.aDot    * T;
  const e    = el.e    + el.eDot    * T;
  const I    = (el.I    + el.IDot    * T) * DEG;
  const L    = (el.L    + el.LDot    * T) * DEG;
  const peri = (el.peri + el.periDot * T) * DEG;
  const node = (el.node + el.nodeDot * T) * DEG;

  const w = peri - node;                          // argument of perihelion
  const M = normalizeAngle(L - peri);             // mean anomaly
  const E = solveKepler(M, e);                    // eccentric anomaly

  // Position in the orbital plane.
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);

  // Rotate orbital plane → ecliptic (ω about z, I about x, Ω about z).
  const cw = Math.cos(w), sw = Math.sin(w);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(I), si = Math.sin(I);

  const x = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp;
  const y = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp;
  const z = (sw * si) * xp + (cw * si) * yp;

  return { x, y, z };
}

/**
 * Sample a full orbit ellipse for line rendering (uses current epoch's elements).
 * Returns an array of ecliptic-space points.
 */
export function orbitPath(el, jd, segments = 320) {
  const T = (jd - J2000_JD) / CENTURY;
  const a = el.a + el.aDot * T;
  const e = el.e + el.eDot * T;
  const I = (el.I + el.IDot * T) * DEG;
  const peri = (el.peri + el.periDot * T) * DEG;
  const node = (el.node + el.nodeDot * T) * DEG;
  const w = peri - node;

  const cw = Math.cos(w), sw = Math.sin(w);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(I), si = Math.sin(I);

  const pts = new Array(segments + 1);
  for (let i = 0; i <= segments; i++) {
    const E = (i / segments) * TWO_PI;
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
    pts[i] = {
      x: (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
      y: (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
      z: (sw * si) * xp + (cw * si) * yp,
    };
  }
  return pts;
}

/* ─────────────────────── satellites ─────────────────────── */

/**
 * Position of a satellite in its parent's equatorial plane.
 * Approximation: circular orbit, constant inclination, linear mean longitude.
 * @returns {{x:number,y:number,z:number}} parent-local units
 */
export function satelliteLocalPosition(moon, jd, orbitRadius) {
  const days = jd - J2000_JD;
  const dir  = moon.retrograde ? -1 : 1;
  const theta = (days / moon.periodDays) * TWO_PI * dir + (moon.phase || 0);
  const inc = (moon.inclination || 0) * DEG;

  const c = Math.cos(theta), s = Math.sin(theta);
  const ct = Math.cos(inc), st = Math.sin(inc);

  // Circle in the XZ plane, tilted about X.
  return {
    x:  c * orbitRadius,
    y: -s * orbitRadius * st,
    z:  s * orbitRadius * ct,
  };
}

/* ─────────────────────── epoch helpers ─────────────────────── */

export function epochJ2000() { return J2000_JD; }
export function epochNow()   { return dateToJD(new Date()); }

/** Human-readable rate label from a multiplier. */
export function describeSpeed(multiplier) {
  if (multiplier <= 1.0001) return 'Real time';
  const perSecond = multiplier;                        // simulated seconds / real second
  const units = [
    { s: 1,       n: 's' },
    { s: 60,      n: 'min' },
    { s: 3600,    n: 'hr' },
    { s: 86400,   n: 'day' },
    { s: 604800,  n: 'week' },
    { s: 2629800, n: 'month' },
    { s: 31557600,n: 'year' },
  ];
  let best = units[0];
  for (const u of units) if (perSecond >= u.s * 0.9) best = u;
  const v = perSecond / best.s;
  const shown = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${shown} ${best.n}/sec`;
}
