/**
 * main.js — application bootstrap and the single animation loop.
 *
 * Order of operations:
 *   1. Verify WebGL availability and report a readable failure.
 *   2. Create renderer / scene / camera / controls (synchronous, ~50 ms).
 *   3. Build the star field and the Solar System with flat-colour fallbacks.
 *   4. Stream procedural textures in the background.
 *   5. Clear the loading screen as soon as the essential bodies are textured.
 *
 * The render loop is deliberately the only place that touches time; every
 * module exposes pure state that this file advances.
 */

import * as THREE from 'three';

import { SceneManager } from './scene.js';
import { SolarSystem } from './bodies.js';
import { StarField } from './starfield.js';
import { PostFX, AmbientAudio, captureScreenshot } from './effects.js';
import { CameraDirector } from './camera.js';
import { TextureManager } from './textures.js';
import { UI, SPEEDS } from './ui.js';
import { settings, qualityPreset, saveSettings, prefersReducedMotion } from './settings.js';
import { dateToJD, describeSpeed, jdToDate } from './astronomy.js';
import { ESSENTIAL_IDS } from './data.js';

/* ══════════════════════════════════════════════════════════════════════
   Bootstrapping
   ══════════════════════════════════════════════════════════════════════ */

const LOG_TAG = '[NAKUL SOLAR SYSTEM]';
console.log(`${LOG_TAG} booting`);

const container = document.getElementById('viewport');

if (!container) {
  console.error(`${LOG_TAG} fatal: #viewport is missing from the document.`);
} else if (!hasWebGL()) {
  failHard('WebGL is not available in this browser. The visualization cannot start.');
} else {
  start().catch(err => {
    console.error(`${LOG_TAG} fatal error during start-up`, err);
    failHard(err && err.message ? err.message : 'Unknown start-up error');
  });
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2')) ||
           !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (_) {
    return false;
  }
}

function failHard(message) {
  const status = document.getElementById('loading-status');
  const bar = document.getElementById('loading-bar');
  if (status) status.textContent = message;
  if (bar) bar.style.background = '#ff7676';
  const err = document.getElementById('loading-error');
  const msg = document.getElementById('loading-error-msg');
  if (err) err.hidden = false;
  if (msg) msg.textContent = message;
}

/* ══════════════════════════════════════════════════════════════════════
   Application
   ══════════════════════════════════════════════════════════════════════ */

async function start() {
  const preset = qualityPreset();

  /* ── 1. Renderer / scene / camera / controls ─────────────────── */
  const sm = new SceneManager(container, { pixelRatioCap: preset.segments >= 96 ? 1.75 : 2 });
  console.log(`${LOG_TAG} Three.js initialized (r${THREE.REVISION}) · quality=${settings.quality}`);

  /* ── 2. Post-processing & audio ──────────────────────────────── */
  const postFX = new PostFX(sm.renderer, sm.scene, sm.camera);
  postFX.setSize(sm.size.width, sm.size.height, sm.renderer.getPixelRatio());

  const audio = new AmbientAudio();

  /* ── 3. Camera director ──────────────────────────────────────── */
  const director = new CameraDirector(sm.camera, sm.controls);
  director.reducedMotion = prefersReducedMotion();
  director.setHome(new THREE.Vector3(0, 420, 1080), new THREE.Vector3(0, 0, 0));

  /* ── 4. Star field ───────────────────────────────────────────── */
  const starfield = new StarField(sm.scene, {
    count: preset.starBase,
    seed: 20240101,
  });
  starfield.setPixelRatio(sm.renderer.getPixelRatio());
  starfield.build(settings.starDensity);
  console.log(`${LOG_TAG} star field generated (${Math.round(preset.starBase * settings.starDensity)} stars)`);

  /* ── 5. Solar System (flat fallbacks first) ──────────────────── */
  const textures = new TextureManager().init();
  const solar = new SolarSystem(sm.scene, textures, preset);

  /* ── 6. UI ───────────────────────────────────────────────────── */
  const ui = new UI(makeHandlers());

  ui.setLoading(0.02, 'Loading astronomical data');

  await solar.build((p) => {
    ui.setLoading(0.10 + p * 0.72, p < 0.6 ? 'Generating planetary surfaces' : 'Generating satellite surfaces');
  });

  ui.setLoading(0.84, 'Initializing star field');
  const nebula = await textures.nebula(1024, 512, 4242);
  starfield.setNebula(nebula);
  ui.setLoading(0.92, 'Initializing orbital systems');

  /* ── 7. Populate the catalogue & apply visibility ────────────── */
  const objects = solar.list().map(b => ({
    id: b.id, name: b.name, type: b.type, color: b.color,
    parent: b.parent || null, isMoon: !!b.isMoon, isPlanet: !!b.isPlanet,
    isSun: !!b.isSun, moonCount: b.isPlanet ? (b.data?.moons || 0) : 0,
  }));
  ui.buildTree(objects);
  ui.showInfo(null);

  applyAllSettings();
  ui.setLoading(0.97, 'Preparing observatory');

  // Prime the simulation one frame before revealing the scene.
  updateSimulation(dateToJD(new Date()), 0, true);

  await nextFrame();
  await nextFrame();

  ui.setLoading(1, 'Ready');
  setTimeout(() => ui.dismissLoading(), 260);

  console.log(`${LOG_TAG} textures loaded`);
  console.log(`${LOG_TAG} planet system initialized`);
  console.log(`${LOG_TAG} simulation ready`);

  /* ── 8. Render loop ──────────────────────────────────────────── */
  const clock = new THREE.Clock();
  let fpsAccum = 0, fpsFrames = 0, fpsTimer = 0;
  let labelTimer = 0;
  let elapsed = 0;

  const HOME_POS = new THREE.Vector3(0, 420, 1080);
  const HOME_TARGET = new THREE.Vector3(0, 0, 0);

  // Cancel camera transitions the moment the user grabs the view.
  sm.renderer.domElement.addEventListener('pointerdown', () => director.cancel(), { passive: true });
  sm.renderer.domElement.addEventListener('wheel', () => director.cancel(), { passive: true });
  sm.controls.addEventListener('start', () => director.cancel());

  sm.onResize = (w, h) => {
    postFX.setSize(w, h, sm.renderer.getPixelRatio());
    starfield.setPixelRatio(sm.renderer.getPixelRatio());
  };

  sm.renderer.domElement.addEventListener('click', onCanvasClick);
  sm.renderer.domElement.addEventListener('pointermove', onCanvasMove);

  requestAnimationFrame(loop);

  /* ═════════════════ loop ═════════════════ */

  function loop() {
    requestAnimationFrame(loop);

    const dtRaw = clock.getDelta();
    const dt = Math.min(dtRaw, 0.1);            // clamp after tab switches
    elapsed += dt;

    // ── simulate ──────────────────────────────────────────────
    updateSimulation(simJD, dt, playing);

    // ── star field ────────────────────────────────────────────
    starfield.update(elapsed);

    // ── sun shader ────────────────────────────────────────────
    solar.updateSunShader(elapsed);

    // ── camera ────────────────────────────────────────────────
    director.update(dt);

    // ── labels (throttled — DOM writes are the expensive part) ─
    labelTimer += dt;
    if (labelTimer > 0.05) {
      labelTimer = 0;
      updateLabels();
    }

    // ── render ────────────────────────────────────────────────
    sm.controls.update(dt);
    sm.adaptNearPlane();
    postFX.render(dt);

    // ── HUD (throttled to ~4 Hz) ──────────────────────────────
    fpsAccum += 1 / Math.max(dtRaw, 0.0001);
    fpsFrames++;
    fpsTimer += dtRaw;
    if (fpsTimer >= 0.25) {
      const fps = fpsAccum / fpsFrames;
      ui.setFPS(fps);
      ui.setClock(simJD, speedMultiplier, playing);
      fpsAccum = 0; fpsFrames = 0; fpsTimer = 0;
    }
  }

  /* ═════════════════ simulation state ═════════════════ */

  let simJD = dateToJD(new Date());
  let speedMultiplier = 1;
  let playing = true;
  let lastSelectedId = null;

  function updateSimulation(jd, dt, advance) {
    if (advance && dt > 0) {
      simJD += (dt * speedMultiplier) / 86400;   // seconds → days
    }
    solar.update(simJD);
  }

  /* ═════════════════ labels ═════════════════ */

  const labelState = new Map();
  const _proj = new THREE.Vector3();

  function updateLabels() {
    if (!settings.labels) return;
    const camPos = sm.camera.position;
    const w = sm.size.width, h = sm.size.height;

    for (const body of solar.list()) {
      const el = ui.ensureLabel(body.id, body.name);
      if (!el) continue;

      // Distance-based culling keeps the sky from becoming a wall of text.
      const dist = camPos.distanceTo(body.position);
      const radius = body.displayRadius;
      const apparent = radius / Math.max(0.001, dist);

      let visible = true;
      if (body.isMoon) {
        visible = settings.moons && apparent > 0.0016 && dist < 6000;
        if (body.object3D && !body.object3D.visible) visible = false;
      } else if (body.isSun) {
        visible = true;
      } else {
        visible = apparent > 0.00035;
      }

      if (!visible) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }

      _proj.copy(body.position).project(sm.camera);
      if (_proj.z < -1 || _proj.z > 1) {
        el.style.display = 'none';
        continue;
      }

      const x = (_proj.x * 0.5 + 0.5) * w;
      const y = (-_proj.y * 0.5 + 0.5) * h;

      if (x < -60 || x > w + 60 || y < -30 || y > h + 30) {
        el.style.display = 'none';
        continue;
      }

      el.style.display = '';
      el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;

      // Fade out when a body is very close to the camera.
      const fade = Math.min(1, Math.max(0, (dist / (radius * 6)) - 0.15));
      el.style.opacity = String(Math.min(1, fade) * (0.55 + Math.min(0.45, apparent * 240)));

      const wantSelected = body.id === lastSelectedId;
      if (labelState.get(body.id) !== wantSelected) {
        labelState.set(body.id, wantSelected);
        el.classList.toggle('selected', wantSelected);
      }
    }
  }

  /* ═════════════════ picking ═════════════════ */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDownAt = null;

  sm.renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownAt = { x: e.clientX, y: e.clientY };
  }, { passive: true });

  function onCanvasMove(e) {
    const rect = sm.renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, sm.camera);

    // Hover highlight — cheap: only test planet meshes.
    const meshes = solar.list().filter(b => !b.isMoon || settings.moons).map(b => b.mesh).filter(Boolean);
    const hits = raycaster.intersectObjects(meshes, false);
    sm.renderer.domElement.style.cursor = hits.length ? 'pointer' : 'default';
  }

  function onCanvasClick(e) {
    // Ignore the click that ends a drag.
    if (pointerDownAt) {
      const dx = e.clientX - pointerDownAt.x;
      const dy = e.clientY - pointerDownAt.y;
      if (dx * dx + dy * dy > 36) return;
    }

    const rect = sm.renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, sm.camera);

    const candidates = solar.list()
      .filter(b => (!b.isMoon || settings.moons) && b.mesh && b.mesh.visible)
      .map(b => b.mesh);

    const hits = raycaster.intersectObjects(candidates, false);
    if (!hits.length) return;

    const hit = hits[0].object;
    const body = solar.list().find(b => b.mesh === hit);
    if (!body) return;

    select(body.id);
    focus(body.id, false);
  }

  /* ═════════════════ handlers ═════════════════ */

  function makeHandlers() {
    return {
      /* ── queries ─────────────────────────────────────────── */
      listObjects: () => objects,
      getObject: (id) => solar.bodies.get(id),
      isCinematic: () => document.body.classList.contains('observatory'),

      /* ── selection & camera ──────────────────────────────── */
      focus(id, track) {
        const body = solar.bodies.get(id);
        if (!body) return;
        const factor = body.isSun ? 5.0 : body.isMoon ? 9.0 : body.isPlanet ? 4.2 : 4.5;
        director.focus(body, { distanceFactor: factor, duration: 1.6 });
        ui.setReticle(true);
        setTimeout(() => ui.setReticle(false), 2200);

        if (track) ui.toast(`Tracking ${body.name}`);
      },

      goHome() {
        director.goHome();
        ui.setReticle(false);
      },

      /* ── time ────────────────────────────────────────────── */
      togglePlay() {
        playing = !playing;
        ui.setPlayState(playing);
        ui.setClock(simJD, speedMultiplier, playing);
      },

      setPlaying(v) {
        playing = !!v;
        ui.setPlayState(playing);
        ui.setClock(simJD, speedMultiplier, playing);
      },

      setSpeed(mult) {
        speedMultiplier = mult;
        ui.setSpeedUI(mult);
        ui.setClock(simJD, speedMultiplier, playing);
        ui.toast(`${mult.toLocaleString('en-US')}× · ${describeSpeed(mult)}`);
      },

      setDate(jd) {
        simJD = jd;
        solar.update(simJD);
        ui.setClock(simJD, speedMultiplier, playing);
        updateLabels();
      },

      stepDays(days) {
        simJD += days;
        solar.update(simJD);
        ui.setClock(simJD, speedMultiplier, playing);
        updateLabels();
      },

      /* ── settings ────────────────────────────────────────── */
      onStarDensity(density) {
        starfield.build(density);
        starfield.setPixelRatio(sm.renderer.getPixelRatio());
      },

      onAtmospheres(on) {
        solar.setAtmospheresVisible(on);
      },

      onOrbits(on) {
        solar.orbitVisibility = on;
        solar.setOrbitsVisible(on);
      },

      onMoons(on) {
        solar.setMoonsVisible(on);
        ui.clearLabels();
      },

      onBloom(on) {
        const ok = postFX.setEnabled(on && preset.bloom);
        if (on && !ok) ui.toast('Bloom unavailable on this device');
        postFX.setSize(sm.size.width, sm.size.height, sm.renderer.getPixelRatio());
      },

      onLabels(on) {
        ui.setLabelsVisible(on);
        if (!on) ui.clearLabels();
      },

      onReducedMotion(on) {
        document.body.classList.toggle('reduce-motion', on);
        director.reducedMotion = on || prefersReducedMotion();
      },

      onSound(on) {
        audio.setEnabled(on).then(ok => {
          if (on && !ok) ui.toast('Audio is unavailable in this browser');
        });
      },

      setCinematic(on) {
        document.body.classList.toggle('observatory', on);
        sm.controls.autoRotate = on && !prefersReducedMotion();
        ui.setObservatory(on, lastSelectedId ? (solar.bodies.get(lastSelectedId)?.name) : null);
        if (on) {
          ui.toast('Observatory mode · press O or Esc to exit');
        } else {
          sm.controls.autoRotate = false;
        }
      },

      toggleLabels() {
        settings.labels = !settings.labels;
        saveSettings();
        ui._applySettingsToControls();
        ui.setLabelsVisible(settings.labels);
        if (!settings.labels) ui.clearLabels();
        ui.toast(`Labels ${settings.labels ? 'on' : 'off'}`);
      },

      applyAllSettings,

      /* ── loading ─────────────────────────────────────────── */
      dismissLoading() { ui.dismissLoading(); },
    };
  }

  function applyAllSettings() {
    solar.orbitVisibility = settings.orbits;
    solar.moonVisibility = settings.moons;

    solar.setOrbitsVisible(settings.orbits);
    solar.setMoonsVisible(settings.moons);
    solar.setAtmospheresVisible(settings.atmospheres);
    ui.setLabelsVisible(settings.labels);

    const bloomOn = settings.bloom && preset.bloom;
    postFX.setEnabled(bloomOn);
    postFX.setSize(sm.size.width, sm.size.height, sm.renderer.getPixelRatio());

    sm.controls.autoRotate = settings.cinematic && !prefersReducedMotion();
    director.reducedMotion = prefersReducedMotion();
    document.body.classList.toggle('reduce-motion', settings.reducedMotion);

    ui.setSpeedUI(speedMultiplier);
    ui.setPlayState(playing);
    ui.setClock(simJD, speedMultiplier, playing);
    ui.setScaleReadout('1 AU = 120 units · radii compressed');
  }

  /* ── selection convenience used by both tree and picking ──── */
  function select(id) {
    const body = solar.bodies.get(id);
    if (!body) return;
    lastSelectedId = id;
    ui.showInfo(body);
  }

  /* exposed for the UI keyboard shortcut / search */
  handlersSelect = select;
}

/* ══════════════════════════════════════════════════════════════════════
   Utilities
   ══════════════════════════════════════════════════════════════════════ */

let handlersSelect = () => {};

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
