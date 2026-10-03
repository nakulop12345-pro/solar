/**
 * effects.js — post-processing chain, ambient audio synthesis, screen capture.
 *
 * The composer is created lazily and only when bloom is enabled, so low-end
 * devices can run the plain forward-rendered path with zero post cost.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.composer = null;
    this.bloomPass = null;
    this.renderPass = null;
    this.outputPass = null;
    this.enabled = false;
    this._size = new THREE.Vector2(1, 1);
    this._available = true;
  }

  /** Create the composer on first use. Returns false if post-processing is unavailable. */
  ensure() {
    if (this.composer) return true;
    if (!this._available) return false;

    try {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.composer = new EffectComposer(this.renderer);
      this.composer.setSize(size.x, size.y);

      this.renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(this.renderPass);

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(size.x, size.y),
        0.62,   // strength — restrained: stars and the Sun glow, nothing else blooms
        0.62,   // radius
        0.82    // threshold
      );
      this.composer.addPass(this.bloomPass);

      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);

      return true;
    } catch (err) {
      console.warn('[NAKUL SOLAR SYSTEM] Post-processing unavailable — running direct render.', err);
      this._available = false;
      this.composer = null;
      return false;
    }
  }

  setEnabled(on) {
    this.enabled = !!on && this.ensure();
    if (!this.enabled && this.composer) {
      // Keep the composer alive but stop paying for it.
      this.composer.reset?.();
    }
    return this.enabled;
  }

  setSize(width, height, pixelRatio) {
    this._size.set(width, height);
    if (!this.composer) return;
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.bloomPass?.setSize(w, h);
  }

  render(delta) {
    if (this.enabled && this.composer) this.composer.render(delta);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.composer?.dispose?.();
    this.bloomPass?.dispose?.();
    this.composer = null;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   AMBIENT AUDIO — fully synthesised, no external files, never autoplays.
   ══════════════════════════════════════════════════════════════════════ */
export class AmbientAudio {
  constructor() {
    this.ctx = null;
    this.nodes = [];
    this.gain = null;
    this.running = false;
  }

  /** Must be called from a user gesture. */
  async start() {
    if (this.running) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;

    try {
      this.ctx = this.ctx || new Ctx();
      if (this.ctx.state === 'suspended') await this.ctx.resume();

      const master = this.ctx.createGain();
      master.gain.value = 0;
      master.connect(this.ctx.destination);
      this.gain = master;

      // Slow-moving low drone built from detuned sine partials.
      const baseFreqs = [55, 82.5, 110, 164.81, 220];
      baseFreqs.forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.value = f;

        const g = this.ctx.createGain();
        g.gain.value = 0.06 / (i + 1);

        // Very slow LFO for gentle movement.
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.017 + i * 0.009;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.022 / (i + 1);
        lfo.connect(lfoGain).connect(g.gain);
        lfo.start();

        osc.connect(g).connect(master);
        osc.start();
        this.nodes.push(osc, g, lfo, lfoGain);
      });

      // Filtered noise for a faint "solar wind" texture.
      const bufferSize = this.ctx.sampleRate * 4;
      const noiseBuf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;      // audio dither only — never scientific
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.0;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      lp.Q.value = 0.7;

      const ng = this.ctx.createGain();
      ng.gain.value = 0.16;
      noise.connect(lp).connect(ng).connect(master);
      noise.start();
      this.nodes.push(noise, lp, ng);

      master.gain.linearRampToValueAtTime(0.34, this.ctx.currentTime + 2.4);
      this.running = true;
      return true;
    } catch (err) {
      console.warn('[NAKUL SOLAR SYSTEM] Ambient audio unavailable:', err);
      return false;
    }
  }

  stop() {
    if (!this.ctx || !this.gain) return;
    try {
      this.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6);
      const nodes = this.nodes.slice();
      setTimeout(() => {
        for (const n of nodes) { try { n.stop?.(); n.disconnect?.(); } catch (_) { /* noop */ } }
      }, 900);
    } catch (_) { /* noop */ }
    this.nodes = [];
    this.running = false;
  }

  setEnabled(on) {
    if (on) return this.start();
    this.stop();
    return Promise.resolve(false);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SCREENSHOT
   ══════════════════════════════════════════════════════════════════════ */
export function captureScreenshot(renderer, scene, camera) {
  try {
    renderer.render(scene, camera);                 // guarantee a fresh frame
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `nakul-solar-system-${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch (err) {
    console.warn('[NAKUL SOLAR SYSTEM] Screenshot failed:', err);
    return false;
  }
}
