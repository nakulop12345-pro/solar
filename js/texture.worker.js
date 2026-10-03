/**
 * texture.worker.js — module worker that owns all procedural generation.
 *
 * Runs off the main thread so the observatory UI stays responsive while
 * surfaces are synthesised. Falls back gracefully: if this worker cannot be
 * created, TextureManager generates everything inline on the main thread.
 */

import { generateSurface, heightsToNormal, generateRings, generateNebula } from './textureGen.js';

self.onmessage = (ev) => {
  const msg = ev.data;
  const { id, task } = msg;

  try {
    if (task === 'surface') {
      const { kind, width, height, opts } = msg;
      const { pixels, heights } = generateSurface(kind, width, height, opts);

      let normal = null;
      if (heights && opts.normal) {
        normal = heightsToNormal(heights, width, height, opts.normalStrength ?? 2.2);
      }

      const payload = { id, ok: true, pixels, normal, width, height };
      const transfer = [pixels.buffer];
      if (normal) transfer.push(normal.buffer);
      self.postMessage(payload, transfer);

    } else if (task === 'rings') {
      const { width, height, opts } = msg;
      const pixels = generateRings(width, height, opts);
      self.postMessage({ id, ok: true, pixels, width, height }, [pixels.buffer]);

    } else if (task === 'nebula') {
      const { width, height, seed } = msg;
      const pixels = generateNebula(width, height, seed);
      self.postMessage({ id, ok: true, pixels, width, height }, [pixels.buffer]);

    } else {
      self.postMessage({ id, ok: false, error: `Unknown task "${task}"` });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
  }
};
