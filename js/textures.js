/**
 * textures.js — worker-pool front end for procedural texture generation.
 *
 * Guarantees:
 *  • never blocks the render loop for more than one frame at a time
 *  • degrades to synchronous main-thread generation if workers are unavailable
 *  • every request has a timeout so the loading screen can never hang forever
 */

import * as THREE from 'three';
import { generateSurface, heightsToNormal, generateRings, generateNebula } from './textureGen.js';

const REQUEST_TIMEOUT_MS = 25000;

export class TextureManager {
  constructor() {
    this.workers = [];
    this.pool = [];
    this.pending = new Map();
    this.nextId = 1;
    this.workerAvailable = false;
    this.failures = 0;
  }

  /** Spin up a small worker pool. Safe to call on any browser. */
  init() {
    if (typeof Worker === 'undefined' || typeof URL === 'undefined') return this;

    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
    const count = Math.max(1, Math.min(4, cores - 1));

    try {
      for (let i = 0; i < count; i++) {
        const worker = new Worker(new URL('./texture.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => this._onMessage(worker, e.data);
        worker.onerror = (e) => this._onWorkerError(worker, e);
        this.workers.push(worker);
        this.pool.push(worker);
      }
      this.workerAvailable = true;
      console.log(`[NAKUL SOLAR SYSTEM] Texture worker pool ready (${count} workers)`);
    } catch (err) {
      console.warn('[NAKUL SOLAR SYSTEM] Module workers unavailable — using main-thread generation.', err);
      this.workerAvailable = false;
      this.workers = [];
      this.pool = [];
    }
    return this;
  }

  _onWorkerError(worker, ev) {
    console.warn('[NAKUL SOLAR SYSTEM] Texture worker error — falling back to main thread.', ev.message || ev);
    this.workerAvailable = false;
    this.pool = this.pool.filter(w => w !== worker);
    this.workers = this.workers.filter(w => w !== worker);
    // Reject everything still queued on this worker so the caller can fall back.
    for (const [id, entry] of this.pending) {
      if (entry.worker === worker) {
        this.pending.delete(id);
        clearTimeout(entry.timer);
        entry.reject(new Error('worker-failure'));
      }
    }
  }

  _onMessage(worker, data) {
    const entry = this.pending.get(data.id);
    if (!entry) return;                       // already timed out / cancelled
    clearTimeout(entry.timer);
    this.pending.delete(data.id);

    // Return the worker to the pool.
    if (this.pool.indexOf(worker) === -1) this.pool.push(worker);
    this._drain();

    if (data.ok) entry.resolve(data);
    else entry.reject(new Error(data.error || 'generation-failed'));
  }

  _drain() {
    while (this.queue && this.queue.length && this.pool.length) {
      const job = this.queue.shift();
      const worker = this.pool.shift();
      this._dispatch(worker, job);
    }
  }

  /** Low-level: send a job to a worker, or run it inline if no workers exist. */
  _dispatch(worker, job) {
    const id = this.nextId++;
    const entry = {
      worker,
      resolve: job.resolve,
      reject: job.reject,
      timer: setTimeout(() => {
        this.pending.delete(id);
        job.reject(new Error('timeout'));
      }, REQUEST_TIMEOUT_MS),
    };
    this.pending.set(id, entry);
    worker.postMessage({ id, ...job.message });
  }

  _request(message, inlineFn) {
    if (!this.workerAvailable || this.workers.length === 0) {
      // Synchronous fallback — correct, just slower.
      try { return Promise.resolve(inlineFn()); }
      catch (err) { return Promise.reject(err); }
    }
    return new Promise((resolve, reject) => {
      const job = { message, resolve, reject };
      if (this.pool.length) this._dispatch(this.pool.shift(), job);
      else {
        if (!this.queue) this.queue = [];
        this.queue.push(job);
      }
    });
  }

  /* ─────────────────────── public API ─────────────────────── */

  /**
   * Generate a surface map (+ optional tangent-space normal map).
   * @returns {Promise<{map:THREE.DataTexture, normalMap:THREE.DataTexture|null}>}
   */
  async surface(kind, width, height, opts) {
    const safeW = Math.max(64, Math.round(width));
    const safeH = Math.max(32, Math.round(safeW / 2));

    let result;
    try {
      result = await this._request(
        { task: 'surface', kind, width: safeW, height: safeH, opts },
        () => {
          const { pixels, heights } = generateSurface(kind, safeW, safeH, opts);
          const normal = heights && opts.normal
            ? heightsToNormal(heights, safeW, safeH, opts.normalStrength ?? 2.2)
            : null;
          return { pixels, normal, width: safeW, height: safeH };
        }
      );
    } catch (err) {
      this.failures++;
      console.warn(`[NAKUL SOLAR SYSTEM] Surface "${kind}" fell back to flat colour:`, err.message);
      return { map: null, normalMap: null };
    }

    const map = dataTexture(result.pixels, result.width, result.height, THREE.SRGBColorSpace);
    const normalMap = result.normal
      ? dataTexture(result.normal, result.width, result.height, THREE.NoColorSpace)
      : null;

    return { map, normalMap };
  }

  async rings(width, height, opts) {
    let result;
    try {
      result = await this._request(
        { task: 'rings', width, height, opts },
        () => ({ pixels: generateRings(width, height, opts), width, height })
      );
    } catch (err) {
      console.warn('[NAKUL SOLAR SYSTEM] Ring texture failed:', err.message);
      return null;
    }
    return dataTexture(result.pixels, result.width, result.height, THREE.SRGBColorSpace);
  }

  async nebula(width, height, seed) {
    try {
      const result = await this._request(
        { task: 'nebula', width, height, seed },
        () => ({ pixels: generateNebula(width, height, seed), width, height })
      );
      return dataTexture(result.pixels, result.width, result.height, THREE.SRGBColorSpace);
    } catch (err) {
      console.warn('[NAKUL SOLAR SYSTEM] Nebula texture failed:', err.message);
      return null;
    }
  }

  dispose() {
    for (const w of this.workers) { try { w.terminate(); } catch (_) { /* noop */ } }
    this.workers = []; this.pool = []; this.pending.clear();
  }
}

/* ─────────────────────── helpers ─────────────────────── */

function dataTexture(bytes, width, height, colorSpace) {
  const texture = new THREE.DataTexture(
    new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    width, height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}
