/**
 * bodies.js — construction and per-frame update of every Solar System object.
 *
 * Scene graph layout
 *   scene
 *   ├── Sun                          (origin, shader material + corona shell)
 *   ├── <planet>                     (Group, world position from Kepler solve)
 *   │   ├── orbit line               (Line, ecliptic plane)
 *   │   └── tilt (Group, axial tilt)
 *   │       ├── surface mesh         (rotates on local Y)
 *   │       ├── atmosphere shell
 *   │       ├── ring system
 *   │       └── <moon> (Group)       (orbit in the equatorial plane)
 *   │           ├── surface mesh
 *   │           └── orbit line
 *   └── asteroid belt                (InstancedMesh, animated)
 */

import * as THREE from 'three';
import {
  PLANETS, MOONS, SCALE,
  bodyRadiusUnits, moonOrbitUnits,
} from './data.js';
import {
  planetHeliocentric, orbitPath, satelliteLocalPosition, J2000_JD,
} from './astronomy.js';
import {
  createAtmosphereMaterial, createSunMaterial, createCoronaMaterial,
  createEarthMaterial, createRingMaterial,
} from './materials.js';
import { mulberry32 } from './noise.js';

const TWO_PI = Math.PI * 2;

/* ───────────────────────── helpers ───────────────────────── */

function eclipticToScene(p) {
  // Ecliptic (x, y, z) → three.js Y-up right-handed: (x, z, −y)
  return new THREE.Vector3(p.x * SCALE.AU, p.z * SCALE.AU, -p.y * SCALE.AU);
}

function surfaceMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color || '#888888'),
    map: null,
    roughness: 0.88,
    metalness: 0.0,
  });
}

/* ───────────────────────── main class ───────────────────────── */

export class SolarSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./textures.js').TextureManager} textures
   * @param {object} preset  quality preset from settings.js
   */
  constructor(scene, textures, preset) {
    this.scene = scene;
    this.textures = textures;
    this.preset = preset;

    /** @type {Map<string, object>} */
    this.bodies = new Map();
    this.planets = [];
    this.moons = [];
    this.asteroidBelt = null;

    this.orbitVisibility = true;
    this.moonVisibility = true;

    this.root = new THREE.Group();
    this.root.name = 'SolarSystem';
    scene.add(this.root);

    this._lastJD = null;
  }

  /* ═══════════════════ CONSTRUCTION ═══════════════════ */

  /**
   * Build the whole system immediately with flat-colour fallbacks, then stream
   * real textures in. This keeps the first frame nearly instant.
   */
  async build(onProgress = () => {}) {
    const seg = this.preset.segments;

    /* ── SUN ─────────────────────────────────────────────────── */
    const sunRadius = SCALE.SUN_RADIUS;
    const sunGroup = new THREE.Group();
    sunGroup.name = 'Sun';
    this.root.add(sunGroup);

    const sunMat = createSunMaterial(null);
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(sunRadius, seg, seg / 2), sunMat);
    sunMesh.name = 'SunSurface';
    sunGroup.add(sunMesh);

    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(sunRadius * 2.9, 40, 24),
      createCoronaMaterial({ color: '#ffae52', intensity: 0.55, power: 3.2 })
    );
    corona.name = 'SunCorona';
    sunGroup.add(corona);

    this.sunGroup = sunGroup;
    this.sunMesh = sunMesh;
    this.sunMaterial = sunMat;

    const sunBody = {
      id: 'sun', name: 'Sun', type: 'G2V main-sequence star',
      object3D: sunGroup, mesh: sunMesh, position: new THREE.Vector3(0, 0, 0),
      displayRadius: sunRadius, data: {
        id: 'sun', name: 'Sun', type: 'Star (G2V)',
        radiusKm: 695700, massKg: 1.9885e30, gravity: 274, rotationPeriodDays: 25.38,
        axialTilt: 7.25, moons: 8, tempC: '+5,505 °C surface · +15,000,000 °C core',
        atmosphere: 'Photosphere, chromosphere and corona. Composition ~73 % hydrogen, ~25 % helium.',
        facts: [
          'Contains 99.86 % of all the mass in the Solar System.',
          'Light from its core takes ~100,000 years to reach the surface, then 8 min 20 s to reach Earth.',
          'Its magnetic field reverses polarity roughly every 11 years.',
        ],
        color: '#ffb45a',
      },
      color: '#ffb45a',
      isSun: true,
    };
    this.bodies.set('sun', sunBody);

    /* ── PLANETS ─────────────────────────────────────────────── */
    for (const p of PLANETS) {
      const body = this._buildPlanet(p, seg);
      this.bodies.set(p.id, body);
      this.planets.push(body);
    }

    /* ── MOONS ───────────────────────────────────────────────── */
    for (const m of MOONS) {
      const parent = this.bodies.get(m.parent);
      if (!parent || !parent.tiltGroup) continue;
      const body = this._buildMoon(m, parent, seg);
      this.bodies.set(m.id, body);
      this.moons.push(body);
      parent.children.push(body);
    }

    /* ── ASTEROID BELT ───────────────────────────────────────── */
    this._buildAsteroidBelt();

    onProgress(1);

    /* ── TEXTURES (streamed) ─────────────────────────────────── */
    await this._loadTextures(onProgress);
  }

  /* ── planet ─────────────────────────────────────────────────── */
  _buildPlanet(p, seg) {
    const radius = bodyRadiusUnits(p.radiusKm);

    const group = new THREE.Group();
    group.name = p.name;
    this.root.add(group);

    /* Orbit path (world/ecliptic space) */
    const path = orbitPath(p.elements, J2000_JD, 384);
    const orbitPts = path.map(pt => eclipticToScene(pt));
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
    const orbitMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(p.color || '#5b7ba8'),
      transparent: true,
      opacity: p.dwarf ? 0.14 : 0.22,
      depthWrite: false,
    });
    const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
    orbitLine.name = `${p.name}Orbit`;
    orbitLine.frustumCulled = false;
    this.root.add(orbitLine);

    /* Axial tilt frame */
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = (p.axialTilt || 0) * Math.PI / 180;
    group.add(tiltGroup);

    /* Surface */
    const mat = surfaceMaterial(p.color);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, Math.max(12, Math.floor(seg / 2))), mat);
    mesh.name = `${p.name}Surface`;
    tiltGroup.add(mesh);

    /* Atmosphere shell */
    let atmosphere = null;
    if (p.atmosphere && typeof p.atmosphere === 'object') {
      atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(
          radius * (p.atmosphere.scale ?? 1.025),
          Math.max(24, Math.floor(seg * 0.7)),
          Math.max(16, Math.floor(seg * 0.4))
        ),
        createAtmosphereMaterial(p.atmosphere)
      );
      atmosphere.name = `${p.name}Atmosphere`;
      atmosphere.renderOrder = 5;
      tiltGroup.add(atmosphere);
    }

    /* Ring system */
    let rings = null;
    let ringMaterial = null;
    if (p.ring) {
      const inner = radius * p.ring.innerRatio;
      const outer = radius * p.ring.outerRatio;
      const geo = new THREE.RingGeometry(inner, outer, 220, 3);
      ringMaterial = createRingMaterial(null, inner, outer, radius);
      rings = new THREE.Mesh(geo, ringMaterial);
      rings.rotation.x = -Math.PI / 2;
      rings.name = `${p.name}Rings`;
      rings.renderOrder = 2;
      tiltGroup.add(rings);
    }

    const body = {
      id: p.id, name: p.name, type: p.type,
      data: { ...p, radiusKm: p.radiusKm, massKg: p.massKg },
      object3D: group,
      tiltGroup,
      mesh,
      material: mat,
      atmosphere,
      rings,
      ringMaterial,
      orbitLine,
      position: new THREE.Vector3(),
      displayRadius: radius,
      spinPeriod: p.rotationPeriodDays,
      elements: p.elements,
      children: [],
      color: p.color,
      isPlanet: true,
      isDwarf: !!p.dwarf,
      _pendingTexture: p.texture,
    };

    mat.color = new THREE.Color(p.color || '#999999');
    mat.emissive = new THREE.Color(p.color || '#000000').multiplyScalar(0.035);

    return body;
  }

  /* ── moon ───────────────────────────────────────────────────── */
  _buildMoon(m, parent, seg) {
    const radius = bodyRadiusUnits(m.radiusKm);
    const orbitR = moonOrbitUnits(m.distKm, parent.data.radiusKm, parent.displayRadius);

    const group = new THREE.Group();
    group.name = m.name;
    parent.tiltGroup.add(group);

    const mat = surfaceMaterial(m.color);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(
        radius,
        Math.max(16, Math.floor(seg / 2)),
        Math.max(10, Math.floor(seg / 4))
      ),
      mat
    );
    mesh.name = `${m.name}Surface`;
    group.add(mesh);

    /* Circular orbit path in the equatorial plane. */
    const pts = [];
    const inc = (m.inclination || 0) * Math.PI / 180;
    const ct = Math.cos(inc), st = Math.sin(inc);
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * TWO_PI;
      const c = Math.cos(a), s = Math.sin(a);
      pts.push(new THREE.Vector3(c * orbitR, -s * orbitR * st, s * orbitR * ct));
    }
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const orbitMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(m.color || '#8899aa'),
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
    orbitLine.name = `${m.name}Orbit`;
    orbitLine.frustumCulled = false;
    parent.tiltGroup.add(orbitLine);

    mat.color = new THREE.Color(m.color || '#999999');
    mat.emissive = new THREE.Color(m.color || '#000000').multiplyScalar(0.03);

    return {
      id: m.id, name: m.name, type: m.type || 'Natural satellite',
      data: { ...m, radiusKm: m.radiusKm, massKg: m.massKg },
      object3D: group,
      mesh, material: mat,
      orbitLine,
      parent: parent.id,
      position: new THREE.Vector3(),
      displayRadius: radius,
      orbitRadius: orbitR,
      moonData: m,
      spinPeriod: m.periodDays,
      color: m.color,
      isMoon: true,
      _pendingTexture: m.texture,
    };
  }

  /* ── asteroid belt ──────────────────────────────────────────── */
  _buildAsteroidBelt() {
    const count = this.preset.segments >= 96 ? 2400 : this.preset.segments >= 64 ? 1600 : 900;
    const rand = mulberry32(778899);

    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9c8f80, roughness: 1.0, metalness: 0.0, flatShading: true,
    });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.name = 'AsteroidBelt';
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.frustumCulled = false;

    const data = new Float32Array(count * 4);   // a, phase, inclination, size
    for (let i = 0; i < count; i++) {
      const a = 2.06 + Math.pow(rand(), 0.85) * 1.22;
      data[i * 4]     = a;
      data[i * 4 + 1] = rand() * TWO_PI;
      data[i * 4 + 2] = (rand() - 0.5) * 0.30;
      data[i * 4 + 3] = 0.045 + Math.pow(rand(), 3) * 0.34;
    }

    this.asteroidBelt = { mesh: inst, data, count };
    this.root.add(inst);

    this._beltDummy = new THREE.Object3D();
  }

  /* ═══════════════════ TEXTURES ═══════════════════ */

  async _loadTextures(onProgress) {
    const size = this.preset.textureSize;
    const jobs = [];

    // Planets get the full resolution; Earth is handled separately, satellites
    // get a quarter of the resolution.
    for (const body of this.planets) {
      if (!body._pendingTexture) continue;
      if (body.id === 'earth') continue;    // handled by _loadEarth
      jobs.push({ body, spec: body._pendingTexture, size });
    }
    const moonSize = Math.max(128, Math.round(size / 4));
    for (const body of this.moons) {
      if (!body._pendingTexture) continue;
      jobs.push({ body, spec: body._pendingTexture, size: moonSize });
    }

    const sunJob = this.textures
      .surface('sun', Math.min(size, 1024), Math.min(size, 1024) / 2, { seed: 777 })
      .then(({ map }) => {
        if (map) {
          this.sunMaterial.uniforms.uMap.value = map;
          this.sunMaterial.needsUpdate = true;
        }
      })
      .catch(err => console.warn('[NAKUL SOLAR SYSTEM] Sun texture failed:', err));

    const ringJob = (async () => {
      const saturn = this.bodies.get('saturn');
      if (!saturn || !saturn.ringMaterial) return;
      const saturnSpec = PLANETS.find(p => p.id === 'saturn');
      if (!saturnSpec || !saturnSpec.ring) return;
      const tex = await this.textures.rings(1024, 4, {
        color: saturnSpec.ring.color,
        baseDensity: saturnSpec.ring.baseDensity,
        gaps: saturnSpec.ring.gaps,
        seed: 4711,
      });
      if (tex) {
        saturn.ringMaterial.uniforms.uMap.value = tex;
        saturn.ringMaterial.needsUpdate = true;
      }
    })();

    const earth = this.bodies.get('earth');
    const earthJob = earth ? this._loadEarth(earth, size) : Promise.resolve();

    const total = jobs.length;
    let done = 0;

    const generic = jobs.map(job => this._loadOne(job.body, job.spec, job.size)
      .catch(err => {
        console.warn(`[NAKUL SOLAR SYSTEM] Texture failed for "${job.body.name}":`, err.message);
      })
      .then(() => {
        done++;
        onProgress(total ? done / total : 1);
      }));

    await Promise.all([...generic, sunJob, ringJob, earthJob]);
  }

  async _loadOne(body, spec, size) {
    const opts = {
      seed: spec.seed,
      palette: spec.palette,
      bands: spec.bands,
      bandCount: spec.bandCount,
      turbulence: spec.turbulence,
      spot: spec.spot,
      craters: spec.craters,
      frequency: spec.frequency,
      cracks: spec.cracks,
      seaLevel: spec.seaLevel,
      iceEdge: spec.iceEdge,
      normal: !!spec.normal,
      normalStrength: spec.normalStrength,
    };

    const { map, normalMap } = await this.textures.surface(spec.kind, size, size / 2, opts);
    if (!map) return;

    const m = body.material;
    if (!m) return;

    // Standard materials get the full treatment.
    if (m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial) {
      m.map = map;
      if (normalMap && m.normalScale) {
        m.normalMap = normalMap;
        m.normalScale.set(0.7, 0.7);
      }
      if (m.color) m.color.setRGB(1, 1, 1);
      if (m.emissive) m.emissive.setRGB(0, 0, 0);
      m.needsUpdate = true;
      return;
    }

    // Custom shader materials: only patch the map if the uniform exists.
    if (m.uniforms && m.uniforms.uMap) {
      m.uniforms.uMap.value = map;
      m.needsUpdate = true;
    }
  }

  async _loadEarth(earth, size) {
    try {
      const [day, clouds, lights] = await Promise.all([
        this.textures.surface('terrestrial', size, size / 2, {
          seed: 1303, normal: true, normalStrength: 1.7, seaLevel: 0.505, iceEdge: 0.80,
        }),
        this.textures.surface('clouds', Math.max(256, size / 2), Math.max(128, size / 4), { seed: 1304 }),
        this.textures.surface('lights', Math.max(256, size / 2), Math.max(128, size / 4), { seed: 1305 }),
      ]);

      if (!day.map) return;

      const earthMat = createEarthMaterial({
        dayMap: day.map,
        nightMap: lights.map,
        cloudMap: clouds.map,
        normalMap: day.normalMap,
      });

      const old = earth.mesh.material;
      earth.mesh.material = earthMat;
      earth.material = earthMat;
      if (old && old.dispose) old.dispose();
    } catch (err) {
      console.warn('[NAKUL SOLAR SYSTEM] Earth shader fell back to standard material:', err);
    }
  }

  /* ═══════════════════ UPDATE ═══════════════════ */

  update(jd) {
    this._lastJD = jd;

    /* ── planets ─────────────────────────────────────────────── */
    for (const body of this.planets) {
      const helio = planetHeliocentric(body.elements, jd);
      body.position.set(helio.x * SCALE.AU, helio.z * SCALE.AU, -helio.y * SCALE.AU);
      body.object3D.position.copy(body.position);

      if (body.spinPeriod) {
        const angle = ((jd - J2000_JD) / body.spinPeriod) * TWO_PI;
        body.mesh.rotation.y = angle % TWO_PI;
      }
    }

    /* ── moons ───────────────────────────────────────────────── */
    for (const moon of this.moons) {
      const parent = this.bodies.get(moon.parent);
      if (!parent) continue;

      const local = satelliteLocalPosition(moon.moonData, jd, moon.orbitRadius);
      moon.object3D.position.set(local.x, local.y, local.z);

      const days = jd - J2000_JD;
      const dir = moon.moonData.retrograde ? -1 : 1;
      moon.mesh.rotation.y = (days / moon.moonData.periodDays) * TWO_PI * dir;

      moon.object3D.getWorldPosition(moon.position);
    }

    /* ── asteroid belt ───────────────────────────────────────── */
    this._updateBelt(jd);
  }

  _updateBelt(jd) {
    const belt = this.asteroidBelt;
    if (!belt || !belt.mesh.visible) return;

    const dummy = this._beltDummy;
    const days = jd - J2000_JD;
    const d = belt.data;

    for (let i = 0; i < belt.count; i++) {
      const a = d[i * 4];
      const phase = d[i * 4 + 1];
      const inc = d[i * 4 + 2];
      const size = d[i * 4 + 3];

      const periodDays = Math.pow(a, 1.5) * 365.25;
      const angle = phase + (days / periodDays) * TWO_PI;

      const r = a * SCALE.AU;
      const y = Math.sin(angle) * r * Math.sin(inc);

      dummy.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r * Math.cos(inc));
      dummy.rotation.set(angle * 2.3, angle * 1.7, angle * 0.9);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();

      belt.mesh.setMatrixAt(i, dummy.matrix);
    }
    belt.mesh.instanceMatrix.needsUpdate = true;
  }

  /* ═══════════════════ VISIBILITY / SETTINGS ═══════════════════ */

  setOrbitsVisible(on) {
    this.orbitVisibility = on;
    for (const p of this.planets) if (p.orbitLine) p.orbitLine.visible = on;
    for (const m of this.moons)  if (m.orbitLine) m.orbitLine.visible = on && this.moonVisibility;
  }

  setMoonsVisible(on) {
    this.moonVisibility = on;
    for (const m of this.moons) {
      if (m.object3D) m.object3D.visible = on;
      if (m.orbitLine) m.orbitLine.visible = on && this.orbitVisibility;
    }
  }

  setAtmospheresVisible(on) {
    for (const p of this.planets) if (p.atmosphere) p.atmosphere.visible = on;
    if (this.sunGroup) {
      this.sunGroup.children.forEach(c => {
        if (c.name === 'SunCorona') c.visible = on;
      });
    }
  }

  setBeltVisible(on) {
    if (this.asteroidBelt) this.asteroidBelt.mesh.visible = on;
  }

  list() {
    return [
      this.bodies.get('sun'),
      ...this.planets,
      ...this.moons,
    ].filter(Boolean);
  }

  updateSunShader(elapsed) {
    if (this.sunMaterial) this.sunMaterial.uniforms.uTime.value = elapsed;
  }
}
