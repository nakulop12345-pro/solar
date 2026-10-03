/**
 * ui.js — every DOM interaction in one place.
 *
 * The UI never touches the renderer directly; it publishes intent through the
 * callbacks supplied at construction time. That keeps the module testable and
 * prevents accidental coupling between presentation and simulation.
 */

import { settings, saveSettings, resetSettings, QUALITY_PRESETS } from './settings.js';
import { describeSpeed, jdToISO, jdToClock, jdToDate, dateToJD } from './astronomy.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Guarded lookup — never returns null silently for a required element. */
function $(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`[NAKUL SOLAR SYSTEM] Missing DOM element #${id}`);
  return el;
}

export const SPEEDS = [
  { mult: 1,        label: '1×' },
  { mult: 10,       label: '10×' },
  { mult: 100,      label: '100×' },
  { mult: 1000,     label: '1K×' },
  { mult: 10000,    label: '10K×' },
  { mult: 100000,   label: '100K×' },
  { mult: 1000000,  label: '1M×' },
  { mult: 10000000, label: '10M×' },
];

export class UI {
  /**
   * @param {object} handlers  callbacks supplied by main.js
   */
  constructor(handlers) {
    this.h = handlers;
    this.expanded = new Set(['sun']);
    this.selectedId = null;
    this.rows = new Map();

    this._cacheElements();
    this._bindGlobal();
    this._buildSpeedPresets();
    this._bindSettings();
    this._bindBottomBar();
    this._bindTopBar();
    this._applySettingsToControls();
    this._bindSearch();

    document.body.classList.toggle('reduce-motion', settings.reducedMotion);
  }

  /* ═══════════════ ELEMENT CACHE ═══════════════ */

  _cacheElements() {
    this.el = {
      loading: $('loading-screen'),
      loadingBar: $('loading-bar'),
      loadingStatus: $('loading-status'),
      loadingPercent: $('loading-percent'),
      loadingError: $('loading-error'),
      loadingErrorMsg: $('loading-error-msg'),
      loadingContinue: $('loading-continue'),

      simDate: $('sim-date'),
      simSpeed: $('sim-speed-label'),

      sidebar: $('sidebar'),
      sidebarOpen: $('sidebar-open'),
      sidebarClose: $('sidebar-close'),
      objectTree: $('object-tree'),

      infopanel: $('infopanel'),
      infoContent: $('info-content'),
      infoClose: $('info-close'),
      btnFocus: $('btn-focus'),
      btnTrack: $('btn-track'),

      btnPlay: $('btn-play'),
      iconPlay: $('icon-play'),
      iconPause: $('icon-pause'),
      btnStepBack: $('btn-step-back'),
      btnStepFwd: $('btn-step-fwd'),
      speedSlider: $('speed-slider'),
      speedPresets: $('speed-presets'),
      dateInput: $('date-input'),
      timeInput: $('time-input'),
      btnToday: $('btn-today'),
      btnJ2000: $('btn-j2000'),
      btnResetTime: $('btn-reset-time'),
      fps: $('fps-counter'),
      scaleReadout: $('scale-readout'),

      btnSearch: $('btn-search'),
      btnObservatory: $('btn-observatory'),
      btnSettings: $('btn-settings'),
      btnAbout: $('btn-about'),
      btnSolarView: $('btn-solar-view'),

      searchInput: $('search-input'),
      searchClear: $('search-clear'),

      settingsModal: $('settings-modal'),
      aboutModal: $('about-modal'),
      toast: $('toast'),

      obsHud: $('observatory-hud'),
      obsTarget: $('obs-target'),
      obsDate: $('obs-date'),
      obsSpeed: $('obs-speed'),
      obsExit: $('obs-exit'),

      labelLayer: $('label-layer'),
      reticle: $('reticle'),
    };
  }

  /* ═══════════════ GLOBAL ═══════════════ */

  _bindGlobal() {
    // Modal close buttons + backdrop.
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-close');
        this.closeModal(id);
      });
    });

    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (!this.el.settingsModal.hidden) { this.closeModal('settings-modal'); return; }
        if (!this.el.aboutModal.hidden) { this.closeModal('about-modal'); return; }
        if (this.h.isCinematic()) { this.h.setCinematic(false); return; }
        if (typing) { e.target.blur(); return; }
        this.h.goHome();
        return;
      }

      if (typing) return;

      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); this.h.togglePlay(); break;
        case 'f': this._focusSearch(); break;
        case 'o': this.h.setCinematic(!this.h.isCinematic()); break;
        case 's': this.openModal('settings-modal'); break;
        case 'l': this.h.toggleLabels(); break;
        case 'r': this.h.goHome(); break;
        default: break;
      }
    });

    this.el.loadingContinue?.addEventListener('click', () => this.h.dismissLoading());
    this.el.obsExit?.addEventListener('click', () => this.h.setCinematic(false));
  }

  /* ═══════════════ TOP BAR ═══════════════ */

  _bindTopBar() {
    this.el.btnSettings?.addEventListener('click', () => this.openModal('settings-modal'));
    this.el.btnAbout?.addEventListener('click', () => this.openModal('about-modal'));
    this.el.btnObservatory?.addEventListener('click', () => this.h.setCinematic(!this.h.isCinematic()));
    this.el.btnSearch?.addEventListener('click', () => this._focusSearch());
    this.el.btnSolarView?.addEventListener('click', () => this.h.goHome());

    this.el.sidebarOpen?.addEventListener('click', () => this.el.sidebar.classList.add('open'));
    this.el.sidebarClose?.addEventListener('click', () => this.el.sidebar.classList.remove('open'));
    this.el.infoClose?.addEventListener('click', () => this.el.infopanel.classList.remove('open'));

    this.el.btnFocus?.addEventListener('click', () => {
      if (this.selectedId) this.h.focus(this.selectedId, false);
    });
    this.el.btnTrack?.addEventListener('click', () => {
      if (this.selectedId) this.h.focus(this.selectedId, true);
    });
  }

  _focusSearch() {
    if (window.innerWidth <= 900) this.el.sidebar.classList.add('open');
    this.el.searchInput?.focus();
    this.el.searchInput?.select();
  }

  /* ═══════════════ BOTTOM BAR ═══════════════ */

  _bindBottomBar() {
    this.el.btnPlay?.addEventListener('click', () => this.h.togglePlay());
    this.el.btnStepBack?.addEventListener('click', () => this.h.stepDays(-1));
    this.el.btnStepFwd?.addEventListener('click', () => this.h.stepDays(1));

    this.el.speedSlider?.addEventListener('input', (e) => {
      const idx = Math.max(0, Math.min(SPEEDS.length - 1, parseInt(e.target.value, 10) || 0));
      this.h.setSpeed(SPEEDS[idx].mult);
    });

    this.el.btnToday?.addEventListener('click', () => this.h.setDate(dateToJD(new Date())));
    this.el.btnJ2000?.addEventListener('click', () => this.h.setDate(2451545.0));
    this.el.btnResetTime?.addEventListener('click', () => {
      this.h.setSpeed(1);
      this.h.setDate(dateToJD(new Date()));
      this.h.setPlaying(false);
      this.toast('Time reset to now · 1× speed');
    });

    const commitDate = () => {
      const dv = this.el.dateInput?.value;
      if (!dv) return;
      const tv = this.el.timeInput?.value || '00:00';
      const [y, mo, d] = dv.split('-').map(Number);
      const [hh, mm] = tv.split(':').map(Number);
      if (!isFinite(y) || !isFinite(mo) || !isFinite(d)) return;
      const dt = new Date(Date.UTC(y, mo - 1, d, hh || 0, mm || 0, 0));
      if (isNaN(dt.getTime())) return;
      this.h.setDate(dateToJD(dt));
    };

    this.el.dateInput?.addEventListener('change', commitDate);
    this.el.timeInput?.addEventListener('change', commitDate);
  }

  _buildSpeedPresets() {
    const host = this.el.speedPresets;
    if (!host) return;
    host.innerHTML = '';
    SPEEDS.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.label;
      b.dataset.index = String(i);
      b.title = `${s.mult.toLocaleString('en-US')}× · ${describeSpeed(s.mult)}`;
      b.addEventListener('click', () => this.h.setSpeed(s.mult));
      host.appendChild(b);
    });
  }

  /* ═══════════════ SETTINGS ═══════════════ */

  _bindSettings() {
    const q = $('set-quality');
    const stars = $('set-stars');
    const valStars = $('val-stars');

    q?.addEventListener('change', () => {
      settings.quality = q.value;
      saveSettings();
      this.toast('Quality saved — press “Apply & Reload”');
    });

    stars?.addEventListener('input', () => {
      settings.starDensity = parseFloat(stars.value);
      saveSettings();
      if (valStars) valStars.textContent = `${Math.round(settings.starDensity * 100)}%`;
      this.h.onStarDensity(settings.starDensity);
    });

    const toggles = [
      ['set-atmos', 'atmospheres', v => this.h.onAtmospheres(v)],
      ['set-orbits', 'orbits', v => this.h.onOrbits(v)],
      ['set-moons', 'moons', v => this.h.onMoons(v)],
      ['set-bloom', 'bloom', v => this.h.onBloom(v)],
      ['set-labels', 'labels', v => this.h.onLabels(v)],
      ['set-cinematic', 'cinematic', v => this.h.setCinematic(v)],
      ['set-reduced', 'reducedMotion', v => this.h.onReducedMotion(v)],
      ['set-sound', 'sound', v => this.h.onSound(v)],
    ];

    for (const [id, key, apply] of toggles) {
      const el = $(id);
      if (!el) continue;
      el.addEventListener('change', () => {
        settings[key] = el.checked;
        saveSettings();
        apply(el.checked);
      });
    }

    $('btn-apply-quality')?.addEventListener('click', () => {
      saveSettings();
      this.toast('Reloading with new quality…');
      setTimeout(() => window.location.reload(), 420);
    });

    $('btn-reset-settings')?.addEventListener('click', () => {
      resetSettings();
      this._applySettingsToControls();
      this.h.applyAllSettings();
      this.toast('Settings restored to defaults');
    });
  }

  _applySettingsToControls() {
    const set = (id, v) => { const e = $(id); if (e) e.checked = !!v; };
    const q = $('set-quality'); if (q) q.value = settings.quality;

    const stars = $('set-stars'); if (stars) stars.value = String(settings.starDensity);
    const vs = $('val-stars'); if (vs) vs.textContent = `${Math.round(settings.starDensity * 100)}%`;

    set('set-atmos', settings.atmospheres);
    set('set-orbits', settings.orbits);
    set('set-moons', settings.moons);
    set('set-bloom', settings.bloom);
    set('set-labels', settings.labels);
    set('set-cinematic', settings.cinematic);
    set('set-reduced', settings.reducedMotion);
    set('set-sound', settings.sound);
  }

  openModal(id) {
    const el = $(id);
    if (!el) return;
    el.hidden = false;
    const focusable = el.querySelector('button, input, select');
    focusable?.focus?.();
  }

  closeModal(id) {
    const el = $(id);
    if (!el) return;
    el.hidden = true;
  }

  /* ═══════════════ SEARCH ═══════════════ */

  _bindSearch() {
    const input = this.el.searchInput;
    const clear = this.el.searchClear;
    if (!input) return;

    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (clear) clear.hidden = q.length === 0;
      this.filterTree(q);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = input.value.trim();
      if (!q) return;
      const match = this._findBest(q);
      if (match) {
        this.select(match.id);
        this.h.focus(match.id, false);
      } else {
        this.toast(`No object matching “${q}”`);
      }
    });

    clear?.addEventListener('click', () => {
      input.value = '';
      clear.hidden = true;
      this.filterTree('');
      input.focus();
    });
  }

  _findBest(query) {
    const q = query.toLowerCase();
    const all = this.h.listObjects();
    let exact = all.find(o => o.id === q);
    if (exact) return exact;
    let starts = all.find(o => o.name.toLowerCase().startsWith(q));
    if (starts) return starts;
    return all.find(o => o.name.toLowerCase().includes(q));
  }

  /* ═══════════════ OBJECT TREE ═══════════════ */

  /** @param {Array<{id,name,type,color,parent?,isMoon?,isPlanet?,isSun?}>} objects */
  buildTree(objects) {
    const host = this.el.objectTree;
    if (!host) return;
    host.innerHTML = '';
    this.rows.clear();

    const sun = objects.find(o => o.isSun);
    const planets = objects.filter(o => o.isPlanet);
    const moons = objects.filter(o => o.isMoon);

    if (sun) host.appendChild(this._makeRow(sun, false));

    for (const p of planets) {
      const row = this._makeRow(p, true);
      host.appendChild(row);

      const kids = moons.filter(m => m.parent === p.id);
      if (kids.length) {
        const wrap = document.createElement('div');
        wrap.className = 'tree-children';
        wrap.dataset.parent = p.id;
        for (const k of kids) wrap.appendChild(this._makeRow(k, false, true));
        host.appendChild(wrap);

        const caret = row.querySelector('.tree-caret');
        caret?.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleGroup(p.id);
        });
      }
    }
  }

  _makeRow(obj, hasChildren, isChild = false) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tree-row' + (isChild ? ' child' : '');
    row.dataset.id = obj.id;
    row.setAttribute('role', 'treeitem');

    if (hasChildren && obj.moonCount) {
      const caret = document.createElement('span');
      caret.className = 'tree-caret';
      caret.textContent = '▶';
      row.appendChild(caret);
    } else {
      const spacer = document.createElement('span');
      spacer.style.width = '12px';
      spacer.style.flex = '0 0 auto';
      row.appendChild(spacer);
    }

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = obj.color || '#888';
    swatch.style.color = obj.color || '#888';
    row.appendChild(swatch);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = obj.name;
    row.appendChild(name);

    if (obj.moonCount) {
      const tag = document.createElement('span');
      tag.className = 'tree-tag';
      tag.textContent = String(obj.moonCount);
      row.appendChild(tag);
    }

    row.addEventListener('click', () => {
      this.select(obj.id);
      this.h.focus(obj.id, false);
    });

    this.rows.set(obj.id, { row, isChild, parentId: obj.parent || null });
    return row;
  }

  _toggleGroup(planetId) {
    const wrap = this.el.objectTree?.querySelector(`.tree-children[data-parent="${planetId}"]`);
    const row = this.rows.get(planetId)?.row;
    if (!wrap) return;
    const open = wrap.classList.toggle('open');
    row?.querySelector('.tree-caret')?.classList.toggle('open', open);
    if (open) this.expanded.add(planetId); else this.expanded.delete(planetId);
  }

  filterTree(query) {
    const q = query.trim().toLowerCase();
    const host = this.el.objectTree;
    if (!host) return;

    if (!q) {
      for (const [id, rec] of this.rows) {
        rec.row.style.display = '';
        if (rec.isChild) {
          const wrap = host.querySelector(`.tree-children[data-parent="${rec.parentId}"]`);
          if (wrap) wrap.style.display = '';
        }
      }
      return;
    }

    const matchingParents = new Set();
    for (const [id, rec] of this.rows) {
      const text = rec.row.textContent.toLowerCase();
      const hit = text.includes(q);
      rec.row.style.display = hit ? '' : 'none';
      if (hit && rec.isChild) matchingParents.add(rec.parentId);
    }

    // Force-expand any group that contains a hit.
    for (const [id, rec] of this.rows) {
      if (rec.isChild) {
        const wrap = host.querySelector(`.tree-children[data-parent="${rec.parentId}"]`);
        if (wrap) wrap.style.display = matchingParents.has(rec.parentId) ? '' : 'none';
      }
    }
  }

  setActive(id) {
    for (const [, rec] of this.rows) rec.row.classList.remove('active');
    const rec = this.rows.get(id);
    if (rec) {
      rec.row.classList.add('active');
      // Auto-expand the parent group so the selection is visible.
      if (rec.isChild && rec.parentId) {
        const wrap = this.el.objectTree?.querySelector(`.tree-children[data-parent="${rec.parentId}"]`);
        wrap?.classList.add('open');
        this.rows.get(rec.parentId)?.row.querySelector('.tree-caret')?.classList.add('open');
      }
    }
  }

  /* ═══════════════ INFO PANEL ═══════════════ */

  /**
   * @param {object|null} body  a body record from SolarSystem
   */
  showInfo(body) {
    const host = this.el.infoContent;
    if (!host) return;

    if (!body) {
      host.innerHTML = `
        <div class="info-empty">
          <div class="info-empty-glyph">◍</div>
          <p>Select any body to inspect its physical and orbital characteristics.</p>
        </div>`;
      if (this.el.btnFocus) this.el.btnFocus.disabled = true;
      if (this.el.btnTrack) this.el.btnTrack.disabled = true;
      this.selectedId = null;
      this.setActive('');
      return;
    }

    this.selectedId = body.id;
    if (this.el.btnFocus) this.el.btnFocus.disabled = false;
    if (this.el.btnTrack) this.el.btnTrack.disabled = false;
    this.setActive(body.id);
    this.el.infopanel?.classList.add('open');

    const d = body.data || {};
    const rows = [];

    const push = (k, v) => { if (v !== undefined && v !== null && v !== '') rows.push([k, v]); };

    const fmt = (n, digits = 2) => Number(n).toLocaleString('en-US', {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    });

    if (body.isSun) {
      push('Classification', 'G2V main-sequence star');
      push('Diameter', `${(d.radiusKm * 2).toLocaleString('en-US')} km`);
      push('Mass', '1.9885 × 10³⁰ kg');
      push('Surface gravity', '274 m/s²');
      push('Rotation period', '25.38 days (equatorial)');
      push('Axial tilt', '7.25°');
      push('Surface temperature', '5,505 °C');
      push('Core temperature', '≈ 15,000,000 °C');
    } else {
      push('Classification', d.type || body.type);
      push('Diameter', `${(d.radiusKm * 2).toLocaleString('en-US', { maximumFractionDigits: 1 })} km`);
      if (d.massKg) push('Mass', `${d.massKg.toExponential(3)} kg`);
      if (d.gravity) push('Surface gravity', `${fmt(d.gravity, 2)} m/s²`);
      push('Rotation period', `${fmt(Math.abs(d.rotationPeriodDays), 4)} d${d.rotationPeriodDays < 0 ? ' (retrograde)' : ''}`);
      push('Axial tilt', `${fmt(d.axialTilt, 2)}°`);
      if (d.tempC) push('Temperature', d.tempC);
      if (d.moons !== undefined) push('Known satellites', String(d.moons));
    }

    // Live orbital readout for planets.
    if (body.isPlanet && d.elements) {
      const a = d.elements.a;
      push('Semi-major axis', `${fmt(a, 5)} AU`);
      push('Orbital eccentricity', fmt(d.elements.e, 5));
      push('Orbital inclination', `${fmt(d.elements.I, 3)}°`);
      const periodYears = Math.pow(a, 1.5);
      push('Orbital period', periodYears < 1
        ? `${fmt(periodYears * 365.25, 2)} days`
        : `${fmt(periodYears, 3)} years`);
      if (body.position) {
        const rAU = body.position.length() / 120;
        push('Current heliocentric distance', `${fmt(rAU, 4)} AU`);
      }
    }

    if (body.isMoon && d.parent) {
      const parent = this.h.getObject(d.parent);
      push('Primary', parent ? parent.name : d.parent);
      push('Orbital radius', `${d.distKm.toLocaleString('en-US')} km`);
      push('Orbital period', `${fmt(d.periodDays, 4)} days`);
      push('Orbital inclination', `${fmt(d.inclination || 0, 2)}°${d.retrograde ? ' (retrograde)' : ''}`);
    }

    const swatchStyle = `background:radial-gradient(circle at 34% 30%, ${lighten(body.color)}, ${body.color} 62%, #05070c 130%); color:${body.color}`;

    host.innerHTML = `
      <div class="info-hero">
        <div class="info-orb" style="${swatchStyle}"></div>
        <div class="info-heading">
          <h2 class="info-name">${escapeHtml(body.name)}</h2>
          <p class="info-type">${escapeHtml(body.type || '')}</p>
        </div>
      </div>
      <div class="info-facts">
        ${rows.map(([k, v]) => `
          <div class="fact"><span class="fact-k">${escapeHtml(k)}</span><span class="fact-v">${escapeHtml(v)}</span></div>
        `).join('')}
      </div>
      ${d.atmosphere ? `
        <div class="info-block">
          <h4>Atmosphere</h4>
          <p>${escapeHtml(d.atmosphere)}</p>
        </div>` : ''}
      ${Array.isArray(d.facts) && d.facts.length ? `
        <div class="info-block">
          <h4>Notes</h4>
          <ul>${d.facts.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
        </div>` : ''}
    `;
  }

  /* ═══════════════ LABELS ═══════════════ */

  ensureLabel(id, name) {
    if (!this.el.labelLayer) return null;
    let el = this.el.labelLayer.querySelector(`[data-label="${id}"]`);
    if (el) return el;
    el = document.createElement('div');
    el.className = 'label';
    el.dataset.label = id;
    el.textContent = name;
    this.el.labelLayer.appendChild(el);
    return el;
  }

  setLabelsVisible(on) {
    if (this.el.labelLayer) this.el.labelLayer.style.display = on ? '' : 'none';
  }

  clearLabels() {
    if (this.el.labelLayer) this.el.labelLayer.innerHTML = '';
  }

  /* ═══════════════ CLOCK / READOUTS ═══════════════ */

  setClock(jd, speedMult, playing) {
    if (this.el.simDate) {
      this.el.simDate.textContent = `${jdToISO(jd)}  ${jdToClock(jd)}`;
    }
    if (this.el.simSpeed) {
      const rate = describeSpeed(speedMult);
      this.el.simSpeed.textContent = playing
        ? `${speedMult.toLocaleString('en-US')}× · ${rate}`
        : `PAUSED · ${speedMult.toLocaleString('en-US')}×`;
    }
    if (this.el.obsDate) this.el.obsDate.textContent = `${jdToISO(jd)} · ${jdToClock(jd)}`;
    if (this.el.obsSpeed) {
      this.el.obsSpeed.textContent = playing
        ? `${speedMult.toLocaleString('en-US')}× · ${describeSpeed(speedMult)}`
        : 'PAUSED';
    }

    // Date/time inputs — only when the user is not editing them.
    const d = jdToDate(jd);
    if (this.el.dateInput && document.activeElement !== this.el.dateInput) {
      this.el.dateInput.value = `${String(d.getUTCFullYear()).padStart(4, '0')}-` +
        `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    if (this.el.timeInput && document.activeElement !== this.el.timeInput) {
      this.el.timeInput.value = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    }
  }

  setPlayState(playing) {
    if (this.el.iconPlay) this.el.iconPlay.hidden = playing;
    if (this.el.iconPause) this.el.iconPause.hidden = !playing;
    this.el.btnPlay?.setAttribute('aria-label', playing ? 'Pause simulation' : 'Play simulation');
  }

  setSpeedUI(mult) {
    let idx = 0, best = Infinity;
    SPEEDS.forEach((s, i) => {
      const d = Math.abs(Math.log(s.mult) - Math.log(mult));
      if (d < best) { best = d; idx = i; }
    });
    if (this.el.speedSlider) this.el.speedSlider.value = String(idx);
    this.el.speedPresets?.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.index) === idx);
    });
  }

  setFPS(fps) {
    if (this.el.fps) this.el.fps.textContent = `${Math.round(fps)} FPS`;
  }

  setScaleReadout(text) {
    if (this.el.scaleReadout) this.el.scaleReadout.textContent = text;
  }

  /* ═══════════════ OBSERVATORY ═══════════════ */

  setObservatory(on, targetName) {
    document.body.classList.toggle('observatory', on);
    this.el.obsHud?.classList.toggle('on', on);

    const hide = on ? 'none' : '';
    if (this.el.sidebar) this.el.sidebar.style.display = hide;
    if (this.el.infopanel) this.el.infopanel.style.display = hide;
    if (this.el.simDate && this.el.simDate.parentElement?.parentElement) {
      // keep the top bar but dim it
    }
    document.getElementById('topbar')?.style.setProperty('opacity', on ? '0' : '1');
    document.getElementById('bottombar')?.style.setProperty('opacity', on ? '0' : '1');
    document.getElementById('topbar')?.style.setProperty('pointer-events', on ? 'none' : '');
    document.getElementById('bottombar')?.style.setProperty('pointer-events', on ? 'none' : '');
    this.el.btnObservatory?.classList.toggle('on', on);
    if (on && targetName && this.el.obsTarget) this.el.obsTarget.textContent = targetName.toUpperCase();
    else if (this.el.obsTarget) this.el.obsTarget.textContent = 'OBSERVATORY MODE';
  }

  setReticle(on) { this.el.reticle?.classList.toggle('on', on); }

  /* ═══════════════ LOADING ═══════════════ */

  setLoading(pct, status) {
    const p = Math.max(0, Math.min(1, pct));
    if (this.el.loadingBar) this.el.loadingBar.style.width = `${(p * 100).toFixed(1)}%`;
    if (this.el.loadingPercent) this.el.loadingPercent.textContent = `${Math.round(p * 100)}%`;
    if (status && this.el.loadingStatus) this.el.loadingStatus.textContent = status;
  }

  loadingError(message) {
    if (this.el.loadingError) this.el.loadingError.hidden = false;
    if (this.el.loadingErrorMsg) this.el.loadingErrorMsg.textContent = message;
  }

  dismissLoading() {
    this.el.loading?.classList.add('done');
  }

  /* ═══════════════ TOAST ═══════════════ */

  toast(message, ms = 2400) {
    const el = this.el.toast;
    if (!el) return;
    el.textContent = message;
    el.classList.add('on');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('on'), ms);
  }
}

/* ─────────────────────── tiny helpers ─────────────────────── */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function lighten(hex) {
  try {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = Math.min(255, ((n >> 16) & 255) + 70);
    const g = Math.min(255, ((n >> 8) & 255) + 70);
    const b = Math.min(255, (n & 255) + 70);
    return `rgb(${r},${g},${b})`;
  } catch (_) {
    return '#ffffff';
  }
}
