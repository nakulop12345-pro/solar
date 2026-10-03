/**
 * camera.js — cinematic camera director.
 *
 * Owns every camera movement that is not a direct user drag. Transitions use a
 * critically-damped exponential ease so the motion settles without overshoot,
 * and every transition can be cancelled by user input at any moment.
 */

import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class CameraDirector {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls
   */
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;

    this.active = false;
    this.elapsed = 0;
    this.duration = 1.5;

    this.fromPos = new THREE.Vector3();
    this.toPos = new THREE.Vector3();
    this.fromTarget = new THREE.Vector3();
    this.toTarget = new THREE.Vector3();

    /** Body currently being followed; its world position is chased every frame. */
    this.followTarget = null;
    this.followOffset = new THREE.Vector3();
    this.followDistance = 1;

    this._homePos = new THREE.Vector3(0, 420, 1080);
    this._homeTarget = new THREE.Vector3(0, 0, 0);
    this.reducedMotion = false;
  }

  /** Store the default full-system viewpoint. */
  setHome(position, target) {
    this._homePos.copy(position);
    this._homeTarget.copy(target);
  }

  /**
   * Smoothly fly to a body.
   * @param {object} body      body record with a world `position` Vector3 and `displayRadius`
   * @param {object} [opts]    { distanceFactor, duration, offsetDir }
   */
  focus(body, opts = {}) {
    if (!body) return;
    this.followTarget = body;

    const radius = Math.max(0.05, body.displayRadius || 1);
    const factor = opts.distanceFactor ?? 4.2;
    const distance = Math.max(radius * factor, radius + 0.6);

    // Approach from a stable, slightly elevated direction.
    const dir = opts.offsetDir || _v1.set(0.62, 0.34, 0.70).normalize();
    this.followOffset.copy(dir).multiplyScalar(distance);
    this.followDistance = distance;

    this._begin(
      body.position.clone().add(this.followOffset),
      body.position.clone(),
      opts.duration
    );
  }

  /** Return to the full Solar System view. */
  goHome(opts = {}) {
    this.followTarget = null;
    this._begin(this._homePos.clone(), this._homeTarget.clone(), opts.duration ?? 1.9);
  }

  _begin(toPos, toTarget, duration) {
    this.fromPos.copy(this.camera.position);
    this.fromTarget.copy(this.controls.target);

    this.toPos.copy(toPos);
    this.toTarget.copy(toTarget);

    this.duration = this.reducedMotion ? 0.001 : (duration ?? 1.5);
    this.elapsed = 0;
    this.active = true;
  }

  /** Abort any in-flight transition (called when the user grabs the mouse). */
  cancel() {
    this.active = false;
  }

  /** Detach following without moving the camera. */
  release() { this.followTarget = null; }

  /**
   * Advance the transition. Must be called every frame before controls.update().
   * @param {number} dt seconds
   */
  update(dt) {
    if (this.active) {
      this.elapsed += dt;
      const t = Math.min(1, this.elapsed / Math.max(0.0001, this.duration));

      // Ease-out-quint: fast start, long gentle settle.
      const e = 1 - Math.pow(1 - t, 5);

      this.camera.position.lerpVectors(this.fromPos, this.toPos, e);
      this.controls.target.lerpVectors(this.fromTarget, this.toTarget, e);

      if (t >= 1) this.active = false;
      return;
    }

    // Keep chasing a followed body as it moves along its orbit.
    if (this.followTarget && this.followTarget.position) {
      const target = this.followTarget.position;
      _v2.copy(target).add(this.followOffset);

      // Direct assignment when the body is stationary relative to the camera
      // would produce jitter; a light lerp keeps the frame stable.
      const k = this.reducedMotion ? 1 : 1 - Math.pow(0.0015, dt);
      this.camera.position.lerp(_v2, k);
      this.controls.target.lerp(target, k);
    }
  }

  get isTransitioning() { return this.active; }
}
