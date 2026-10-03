/**
 * scene.js — renderer, scene graph root, camera, controls, lights.
 *
 * Owns the render loop plumbing (resize, pixel ratio, near-plane adaptation)
 * and exposes a minimal surface to main.js.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  /**
   * @param {HTMLElement} container
   * @param {{pixelRatioCap?:number}} [opts]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.pixelRatioCap = opts.pixelRatioCap ?? 2;

    /* ── Renderer ───────────────────────────────────────────────── */
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      logarithmicDepthBuffer: true,   // essential: 1e-2 … 1e5 unit depth range
    });
    this.renderer.setClearColor(0x03050a, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = true;

    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D view of the Solar System');

    /* ── Scene ──────────────────────────────────────────────────── */
    this.scene = new THREE.Scene();
    this.scene.background = null;

    /* ── Camera ─────────────────────────────────────────────────── */
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 260000);
    this.camera.position.set(0, 420, 1080);
    this.camera.lookAt(0, 0, 0);

    /* ── Controls ───────────────────────────────────────────────── */
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.7;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 60000;
    this.controls.autoRotateSpeed = 0.16;
    this.controls.target.set(0, 0, 0);

    /* ── Lighting ───────────────────────────────────────────────────
       The Sun is a point light at the origin with decay 0 so that distant
       planets remain readable. A very dim ambient keeps night sides from
       becoming pure black. This is a visualization choice, documented in
       the About panel.
       ─────────────────────────────────────────────────────────────── */
    this.sunLight = new THREE.PointLight(0xfff2dd, 3.6, 0, 0);
    this.sunLight.position.set(0, 0, 0);
    this.scene.add(this.sunLight);

    this.ambient = new THREE.AmbientLight(0x14203a, 0.55);
    this.scene.add(this.ambient);

    /* ── Resize ─────────────────────────────────────────────────── */
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(container);
    }
    this._onResize();
  }

  _onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();

    if (this.onResize) this.onResize(w, h);
  }

  get size() {
    return {
      width: this.container.clientWidth || window.innerWidth,
      height: this.container.clientHeight || window.innerHeight,
    };
  }

  /**
   * Keep the near plane proportional to viewing distance. With a 1e-1 … 1e5
   * depth range and a 24-bit buffer this is what prevents z-fighting when the
   * user zooms from a Moon down to the whole Solar System.
   */
  adaptNearPlane() {
    const d = this.camera.position.distanceTo(this.controls.target);
    const want = Math.max(0.008, Math.min(40, d * 0.0016));
    if (Math.abs(want - this.camera.near) / this.camera.near > 0.25) {
      this.camera.near = want;
      this.camera.updateProjectionMatrix();
    }
  }

  render(delta) {
    this.controls.update(delta);
    this.adaptNearPlane();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this._ro?.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
