/**
 * starfield.js — GPU-instanced star catalogue + faint Milky Way backdrop.
 *
 * Stars are placed on a spherical shell using a deterministic PRNG so the sky
 * is identical on every load. Spectral class is modelled with a temperature →
 * colour lookup so blue giants and red dwarfs appear alongside white stars.
 */

import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { createStarMaterial } from './materials.js';

const SHELL_RADIUS = 90000;

/* Approximate black-body colours for the main spectral classes. */
const SPECTRAL = [
  { w: 0.030, size: 2.6, colors: [0.62, 0.72, 1.00] }, // O / B — blue giants
  { w: 0.070, size: 2.0, colors: [0.76, 0.84, 1.00] }, // A — white
  { w: 0.130, size: 1.6, colors: [0.96, 0.96, 1.00] }, // F — yellow-white
  { w: 0.220, size: 1.3, colors: [1.00, 0.95, 0.82] }, // G — yellow (Sun-like)
  { w: 0.230, size: 1.1, colors: [1.00, 0.84, 0.66] }, // K — orange
  { w: 0.320, size: 0.9, colors: [1.00, 0.72, 0.58] }, // M — red dwarfs
];

function pickSpectral(r) {
  let acc = 0;
  for (const s of SPECTRAL) { acc += s.w; if (r <= acc) return s; }
  return SPECTRAL[SPECTRAL.length - 1];
}

export class StarField {
  /**
   * @param {THREE.Scene} scene
   * @param {{count:number, seed?:number}} opts
   */
  constructor(scene, { count = 24000, seed = 20240101 } = {}) {
    this.scene = scene;
    this.baseCount = count;
    this.seed = seed;
    this.group = new THREE.Group();
    this.group.name = 'StarField';
    this.points = null;
    this.nebula = null;
    this.material = createStarMaterial();
    scene.add(this.group);
  }

  /** Build (or rebuild) the point cloud at the requested density multiplier. */
  build(density = 1) {
    this.disposePoints();

    const n = Math.max(800, Math.round(this.baseCount * density));
    const rand = mulberry32(this.seed);

    const positions = new Float32Array(n * 3);
    const colors    = new Float32Array(n * 3);
    const sizes     = new Float32Array(n);
    const phases    = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      // Uniform distribution over the sphere (avoids polar clustering).
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const r = SHELL_RADIUS * (0.92 + rand() * 0.16);

      positions[i * 3]     = Math.cos(phi) * s * r;
      positions[i * 3 + 1] = u * r;
      positions[i * 3 + 2] = Math.sin(phi) * s * r;

      const sp = pickSpectral(rand());
      const mag = 0.35 + Math.pow(rand(), 2.4) * 1.35;      // few bright stars
      colors[i * 3]     = sp.colors[0] * mag;
      colors[i * 3 + 1] = sp.colors[1] * mag;
      colors[i * 3 + 2] = sp.colors[2] * mag;

      sizes[i]  = sp.size * (0.65 + rand() * 0.85);
      phases[i] = rand();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SHELL_RADIUS * 1.2);

    this.points = new THREE.Points(geo, this.material);
    this.points.name = 'Stars';
    this.points.frustumCulled = false;
    this.points.renderOrder = -100;
    this.group.add(this.points);
  }

  /** Attach the procedurally generated Milky Way backdrop. */
  setNebula(texture) {
    if (this.nebula) {
      this.group.remove(this.nebula);
      this.nebula.geometry.dispose();
      this.nebula.material.dispose();
      this.nebula = null;
    }
    if (!texture) return;

    const geo = new THREE.SphereGeometry(SHELL_RADIUS * 1.35, 48, 32);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.nebula = new THREE.Mesh(geo, mat);
    this.nebula.name = 'Nebula';
    this.nebula.frustumCulled = false;
    this.nebula.renderOrder = -200;
    this.group.add(this.nebula);
  }

  setPixelRatio(r) { this.material.uniforms.uPixelRatio.value = r; }

  update(elapsed) { this.material.uniforms.uTime.value = elapsed; }

  disposePoints() {
    if (!this.points) return;
    this.group.remove(this.points);
    this.points.geometry.dispose();
    this.points = null;
  }

  dispose() {
    this.disposePoints();
    this.material.dispose();
    if (this.nebula) {
      this.nebula.geometry.dispose();
      this.nebula.material.map?.dispose();
      this.nebula.material.dispose();
    }
  }
}
