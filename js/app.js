let currentTab = 'planta';
let currentWidth = 8.0;
let currentLength = 16.0;
let currentDensity = 5.0;
let sheetPxPerM = 66.7;
let renderTimer = null;

// ---- Parámetros de diseño (m) ----
const FLOOR_H = 0.20;
const WALL_H = 0.30;
const BLOCK_LENGTH = 0.40;
const BLOCK_COURSE_H = 0.20;
const EAVE_H = 3.00;
const RIDGE_LOW_H = 3.70;
const RIDGE_HIGH_H = 4.00;
const VENT_GAP = RIDGE_HIGH_H - RIDGE_LOW_H;
const OVERLAP = 0.40;
const EAVE_OVERHANG = 1.20;
const GABLE_OVERHANG = 0.60;
const DOOR_W = 1.00;
const DOOR_H = 2.10;
const PLAN_VIEWBOX_HEIGHT = 488;
const STRUCTURE_CONCEPT_NOTE = 'Borrador conceptual para finca rural abierta en Monagas. Supone pares tubulares 100 × 50 × 2 mm y correas 50 × 50 × 2 mm; perfiles y precios son referenciales, no verificados localmente. Viento de cálculo, uniones, arriostramientos, suelo y cimentación no están definidos ni calculados. No construir con este modelo sin validación estructural.';

// ---- Reparto de pórticos ----
const BAY_TARGET = 4.0;
function bayLayout(L) {
  const count = Math.max(2, Math.round(L / BAY_TARGET));
  return { count, spacing: L / count };
}

// ---- Geometría del techo compartida por las láminas 2D y la vista 3D ----
function roofModel(W) {
  const sLow = (RIDGE_LOW_H - EAVE_H) / (W / 2);
  const sHigh = (RIDGE_HIGH_H - EAVE_H) / (W / 2);
  const eave = FLOOR_H + EAVE_H;
  const low = FLOOR_H + RIDGE_LOW_H;
  const high = FLOOR_H + RIDGE_HIGH_H;
  const yLow = (x) => low - (W / 2 - x) * sLow;
  const yHigh = (x) => high - (x - W / 2) * sHigh;
  const tieY = eave + (low - 0.06 - eave) * (2 / 3);
  const tieX1 = W / 2 - (low - 0.06 - tieY) / sLow;
  const tieX2 = W / 2 + (high - 0.06 - tieY) / sHigh;
  const tipX = W / 2 - OVERLAP;
  const tipY = high + OVERLAP * sHigh;
  const rl = { x1: -EAVE_OVERHANG + 0.05, x2: W / 2 - 0.08 };
  const rh = { x1: W / 2 + 0.08, x2: W + EAVE_OVERHANG - 0.05 };
  return {
    sLow, sHigh, eave, low, high, yLow, yHigh,
    tieY, tieX1, tieX2, tipX, tipY,
    rafterLow: { x1: rl.x1, y1: yLow(rl.x1) - 0.06, x2: rl.x2, y2: yLow(rl.x2) - 0.06 },
    rafterHigh: { x1: rh.x1, y1: yHigh(rh.x1) - 0.06, x2: rh.x2, y2: yHigh(rh.x2) - 0.06 },
    kingTop: high - 0.06
  };
}

const SHEET_TITLES = {
  corte: 'CORTE TRANSVERSAL ASIMÉTRICO',
  planta: 'PLANTA ARQUITECTÓNICA CON PUERTA FRONTAL',
  frontal: 'FACHADA FRONTAL CON PUERTA ESTÁNDAR 1.00 x 2.10 m',
  fachada: 'FACHADA LATERAL LONGITUDINAL',
  detalle: 'DETALLE DE CUMBRERA DESFASADA'
};

function setTab(tabId) {
  currentTab = tabId;
  ['planta', 'frontal', 'fachada', 'presupuesto', '3d'].forEach(id => {
    const btn = document.getElementById('btn-' + id);
    if (btn) {
      if (id === tabId) {
        btn.classList.add('active');
        btn.classList.remove('text-slate-500');
      } else {
        btn.classList.remove('active');
        btn.classList.add('text-slate-500');
      }
    }
  });
  updatePrintHeader();
  const bv = document.getElementById('budget-view');
  if (bv) { bv.classList.add('hidden'); bv.classList.remove('flex'); }
  const svgButton = document.getElementById('btn-download-svg');
  if (svgButton) svgButton.classList.toggle('hidden', tabId === '3d' || tabId === 'presupuesto');

  if (tabId === 'presupuesto') {
    const vp = document.getElementById('plan-viewport');
    const v3 = document.getElementById('view3d');
    if (vp) vp.classList.add('hidden');
    if (v3) v3.classList.add('hidden');
    stop3D();
    if (bv) { bv.classList.remove('hidden'); bv.classList.add('flex'); }
    enterBudget();
    return;
  }
  if (tabId === '3d') {
    enter3D();
    return;
  }
  exit3D();
  renderCurrentView();
  fitView();
}

function setPreset(w, l) {
  const wEl = document.getElementById('input-ancho');
  const lEl = document.getElementById('input-largo');
  if (!wEl || !lEl) return;
  wEl.value = w.toFixed(1);
  lEl.value = l.toFixed(1);
  updateDimensions();
}

    // ---- Preset de producción: dimensiones + densidad ----
    function presetBtn(btn) {
      const [w, l] = btn.dataset.preset.split('x').map(Number);
      const wEl = document.getElementById('input-ancho');
      const lEl = document.getElementById('input-largo');
      const dEl = document.getElementById('input-densidad');
      if (!wEl || !lEl || !dEl) return;
      wEl.value = w.toFixed(1);
      lEl.value = l.toFixed(1);
      if (btn.dataset.d) dEl.value = parseFloat(btn.dataset.d).toFixed(1);
      updateDimensions();
      showToast(`Modelo aplicado: ${w} × ${l} m`, true);
    }

    // ---- Estado persistente: localStorage + enlace compartido (#w8l16d5) ----
    const STORE_KEY = 'galpon.proyecto.v1';
    function saveProject() {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ w: currentWidth, l: currentLength, d: currentDensity }));
      } catch (_) {}
      try {
        const h = `#w${currentWidth.toFixed(1)}l${currentLength.toFixed(1)}d${currentDensity.toFixed(1)}`;
        history.replaceState(null, '', h);
      } catch (_) {}
    }
    function loadProject() {
      // Prioridad: el hash es un enlace compartido explícito
      const m = (location.hash || '').match(/^#w([\d.]+)l([\d.]+)d([\d.]+)$/);
      if (m) return { w: +m[1], l: +m[2], d: +m[3] };
      try {
        const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (s && Number.isFinite(s.w) && Number.isFinite(s.l) && Number.isFinite(s.d)) return s;
      } catch (_) {}
      return null;
    }
    function copyProjectLink() {
  const url = location.href;
  const done = () => showToast('Enlace copiado: comparte este galpón', true);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => window.prompt('Copia el enlace del proyecto:', url));
  } else {
    window.prompt('Copia el enlace del proyecto:', url);
  }
}

function showToast(msg, isSuccess = true) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  const toastIcon = document.getElementById('toast-icon');
  if (!toast || !toastMsg || !toastIcon) return;
  toastMsg.innerText = msg;
  toastIcon.innerHTML = isSuccess
    ? '<svg class="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m5 12 4 4L19 6"/></svg>'
    : '<svg class="h-4 w-4 text-sky-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 11v5m0-8h.01"/></svg>';
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3500);
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// Devuelve el número del campo o el valor actual si está vacío / no es numérico
function numOr(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function updateDimensions() {
  const wEl = document.getElementById('input-ancho');
  const lEl = document.getElementById('input-largo');
  const dEl = document.getElementById('input-densidad');

  if (!wEl || !lEl || !dEl) return;

  currentWidth = clamp(numOr(wEl.value, currentWidth), 4.0, 14.0);
  currentLength = clamp(numOr(lEl.value, currentLength), 6.0, 40.0);
  currentDensity = clamp(numOr(dEl.value, currentDensity), 3.0, 8.0);

  const area = currentWidth * currentLength;
  const aves = Math.floor(area * currentDensity);

  const elArea = document.getElementById('badge-area');
  const elAves = document.getElementById('badge-aves');
  const elDens = document.getElementById('badge-dens');
  const elDimens = document.getElementById('badge-dimens');
  if (elArea) elArea.innerText = `${area.toFixed(1)} m²`;
  if (elAves) elAves.innerText = `${aves} gallinas`;
  if (elDens) elDens.innerText = `(${currentDensity.toFixed(1)}/m²)`;
  if (elDimens) elDimens.innerText = `${currentWidth.toFixed(1)} × ${currentLength.toFixed(1)} m`;

  updatePresetState();
  saveProject();
  updatePrintHeader();
  updateScaleBar();
  if (currentTab === 'presupuesto') renderBudget();

  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    renderCurrentView();
    if (currentTab === '3d') {
      if (!scene3D || scene3D.size[0] !== currentWidth || scene3D.size[1] !== currentLength || scene3D.birdsTotal !== aves) {
        rebuild3D();
        CAM.dist = fit3DDistance();
      }
      render3D();
    }
  }, 150);
}

    // Marca el preset activo según las dimensiones actuales
    function updatePresetState() {
  document.querySelectorAll('[data-preset]').forEach(btn => {
    const [w, l] = btn.dataset.preset.split('x').map(Number);
    const act = Math.abs(w - currentWidth) < 0.01 && Math.abs(l - currentLength) < 0.01;
    btn.classList.toggle('preset-active', act);
  });
}    // +/- de los campos numéricos
    function stepInput(id, delta) {
      const el = document.getElementById(id);
      if (!el) return;
      const min = parseFloat(el.min);
      const max = parseFloat(el.max);
      const base = numOr(el.value, min);
      el.value = clamp(base + delta, min, max).toFixed(1);
      updateDimensions();
    }

    function resetDimensions() {
      const wEl = document.getElementById('input-ancho');
      const lEl = document.getElementById('input-largo');
      const dEl = document.getElementById('input-densidad');
      if (!wEl || !lEl || !dEl) return;
      wEl.value = '8.0';
      lEl.value = '16.0';
      dEl.value = '5.0';
      updateDimensions();
      fitView();
      showToast('Dimensiones restablecidas: 8 × 16 m');
    }

    // Reescribe los campos con el valor realmente usado (al salir del input)
    function sanitizeInputs() {
      const wEl = document.getElementById('input-ancho');
      const lEl = document.getElementById('input-largo');
      const dEl = document.getElementById('input-densidad');
      if (!wEl || !lEl || !dEl) return;
      wEl.value = currentWidth.toFixed(1);
      lEl.value = currentLength.toFixed(1);
      dEl.value = currentDensity.toFixed(1);
    }

    function updatePrintHeader() {
      const titles = {
        'planta': 'LÁMINA 1: PLANTA ARQUITECTÓNICA Y ESTRUCTURAL CON PUERTA FRONTAL',
        'frontal': 'LÁMINA 2: FACHADA FRONTAL / CULATA CON PUERTA ESTÁNDAR (1.00 x 2.10 m)',
        'fachada': 'LÁMINA 3: FACHADA LATERAL LONGITUDINAL CON VENTILACIÓN CENITAL',
        'presupuesto': 'PRESUPUESTO ESTIMADO DE MATERIALES'
      };
      const titleElem = document.getElementById('print-sheet-title');
      const dimsElem = document.getElementById('print-sheet-dims');
      const capElem = document.getElementById('print-sheet-capacity');
      if (titleElem) titleElem.innerText = titles[currentTab] || 'PLANO ARQUITECTÓNICO';
      if (dimsElem) dimsElem.innerText = `Dimensiones: ${currentWidth.toFixed(2)} x ${currentLength.toFixed(2)} m (${(currentWidth * currentLength).toFixed(1)} m²)`;
      if (capElem) capElem.innerText = `Capacidad: ${Math.floor(currentWidth * currentLength * currentDensity)} gallinas (${currentDensity.toFixed(1)} aves/m²)`;

      // Barra de lámina del visor
      const is3d = currentTab === '3d';
      const shortNames = {
        planta: 'Planta arquitectónica',
        frontal: 'Fachada frontal (puerta)',
        fachada: 'Fachada lateral',
        'presupuesto': 'Presupuesto de materiales',
        '3d': 'Vista 3D del galpón'
      };
      const order = ['planta', 'frontal', 'fachada'];
      const idx = order.indexOf(currentTab) + 1;
      const isBudget = currentTab === 'presupuesto';
      const st = document.getElementById('sheet-title');
      const sb = document.getElementById('sheet-badge');
      const sm = document.getElementById('sheet-meta');
      if (st) st.textContent = shortNames[currentTab] || 'Plano';
      if (sb) sb.textContent = is3d ? 'Vista 3D' : isBudget ? 'Presupuesto' : `Lámina ${idx} / ${order.length}`;
      if (sm) {
        const bay = bayLayout(currentLength);
        const dims = `${currentWidth.toFixed(2)} × ${currentLength.toFixed(2)} m · ${(currentWidth * currentLength).toFixed(1)} m² · ${Math.floor(currentWidth * currentLength * currentDensity)} aves`;
        sm.textContent = isBudget ? `${dims} · materiales e insumos` : `${dims}`;
      }
      if (is3d && titleElem) titleElem.innerText = 'VISTA 3D · PERSPECTIVA DEL GALPÓN';
      if (isBudget && titleElem) titleElem.innerText = 'PRESUPUESTO · MATERIALES E INSUMOS';
    }

    // DIMENSION HELPER FUNCTIONS CON MASKS Y TEXT PROTECTORS PARA EVITAR SOLAPAMIENTOS
    function drawDimH(x1, x2, y, val, color = "#1e293b", badgeBg = "#ffffff") {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const midX = (x1 + x2) / 2;
      const valStr = String(val);
      const textW = Math.max(30, valStr.length * 7.5 + 8);
      return `
        <g class="dim-h">
          <line x1="${minX}" y1="${y}" x2="${maxX}" y2="${y}" stroke="${color}" stroke-width="1.2"/>
          <line x1="${minX}" y1="${y - 4.5}" x2="${minX}" y2="${y + 4.5}" stroke="${color}" stroke-width="1.3"/>
          <line x1="${maxX}" y1="${y - 4.5}" x2="${maxX}" y2="${y + 4.5}" stroke="${color}" stroke-width="1.3"/>
          <rect x="${midX - textW/2}" y="${y - 7.5}" width="${textW}" height="15" fill="${badgeBg}" rx="3" stroke="#cbd5e1" stroke-width="0.8"/>
          <text x="${midX}" y="${y + 3.5}" fill="${color}" font-size="10.5" font-weight="bold" text-anchor="middle">${valStr}</text>
        </g>
      `;
    }

    function drawDimV(y1, y2, x, val, color = "#1e293b", badgeBg = "#ffffff", forceOffset = false) {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      const midY = (y1 + y2) / 2;
      const span = maxY - minY;
      const valStr = String(val);
      const textW = Math.max(26, valStr.length * 7.2 + 8);

      // Si el tramo es muy pequeño (<32px como 0.20m o 0.40m), dibuja el badge horizontal a un lado con línea guía
      if (span < 34 || forceOffset) {
        return `
          <g class="dim-v">
            <line x1="${x}" y1="${minY}" x2="${x}" y2="${maxY}" stroke="${color}" stroke-width="1.2"/>
            <line x1="${x - 4}" y1="${minY}" x2="${x + 4}" y2="${minY}" stroke="${color}" stroke-width="1.3"/>
            <line x1="${x - 4}" y1="${maxY}" x2="${x + 4}" y2="${maxY}" stroke="${color}" stroke-width="1.3"/>
            <line x1="${x}" y1="${midY}" x2="${x + 6}" y2="${midY}" stroke="${color}" stroke-width="0.9"/>
            <rect x="${x + 6}" y="${midY - 7.5}" width="${textW}" height="15" fill="${badgeBg}" rx="3" stroke="#cbd5e1" stroke-width="0.8"/>
            <text x="${x + 6 + textW/2}" y="${midY + 3.5}" fill="${color}" font-size="10" font-weight="bold" text-anchor="middle">${valStr}</text>
          </g>
        `;
      }

      return `
        <g class="dim-v">
          <line x1="${x}" y1="${minY}" x2="${x}" y2="${maxY}" stroke="${color}" stroke-width="1.2"/>
          <line x1="${x - 4.5}" y1="${minY}" x2="${x + 4.5}" y2="${minY}" stroke="${color}" stroke-width="1.3"/>
          <line x1="${x - 4.5}" y1="${maxY}" x2="${x + 4.5}" y2="${maxY}" stroke="${color}" stroke-width="1.3"/>
          <rect x="${x - 8}" y="${midY - textW/2}" width="16" height="${textW}" fill="${badgeBg}" rx="3" stroke="#cbd5e1" stroke-width="0.8"/>
          <text x="${x}" y="${midY + 3.5}" fill="${color}" font-size="10.5" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${x} ${midY})">${valStr}</text>
        </g>
      `;
    }

function renderCurrentView() {
  const container = document.getElementById('svg-container');
  if (!container) return;
  const sheets = { planta: getPlantaSVG, frontal: getFrontalSVG, fachada: getFachadaSVG };
  const renderSheet = sheets[currentTab];
  if (renderSheet) container.innerHTML = decoratePlanSvg(renderSheet(), currentTab);
}

function decoratePlanSvg(markup, sheetId) {
  const titles = {
    planta: 'PLANTA ARQUITECTÓNICA',
    frontal: 'FACHADA FRONTAL',
    fachada: 'FACHADA LATERAL'
  };
  const index = ['planta', 'frontal', 'fachada'].indexOf(sheetId) + 1;
  const sheetFrame = `
    <g class="sheet-frame" pointer-events="none">
      <rect x="10" y="10" width="900" height="468" fill="none" stroke="#94a3b8" stroke-width="1"/>
      <rect x="20" y="447" width="880" height="26" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.8"/>
      <path d="M270 447v26M655 447v26" fill="none" stroke="#cbd5e1" stroke-width="0.8"/>
      <text x="28" y="458" fill="#0f172a" font-size="8" font-weight="700">GALPÓN AVÍCOLA · CONCEPTUAL</text>
      <text x="28" y="469" fill="#64748b" font-size="7">Cotas en metros · revisar antes de ejecutar</text>
      <text x="282" y="463" fill="#0f172a" font-size="9" font-weight="700">${titles[sheetId]}</text>
      <text x="668" y="458" fill="#0f172a" font-size="8" font-weight="700">${currentWidth.toFixed(2)} × ${currentLength.toFixed(2)} m · ${(currentWidth * currentLength).toFixed(1)} m²</text>
      <text x="668" y="469" fill="#64748b" font-size="7">LÁMINA ${String(index).padStart(2, '0')} / 03 · DISEÑO REFERENCIAL</text>
    </g>
  `;
  return markup
    .replace('viewBox="0 0 920 440"', `viewBox="0 0 920 ${PLAN_VIEWBOX_HEIGHT}"`)
    .replace('</svg>', `${sheetFrame}</svg>`);
}

    // ==========================================
    // 1. CORTE TRANSVERSAL
    // ==========================================
    function getCorteSVG() {
      const W = currentWidth;
      const totalRoofW = W + 2 * EAVE_OVERHANG;

      const VSCALE = 68; // px por metro en vertical
      const sc = Math.min(VSCALE, 560 / totalRoofW);
      sheetPxPerM = sc; // escala horizontal de esta lámina (para la barra de escala)
      const gW_px = W * sc;
      const oH_px = EAVE_OVERHANG * sc;
      const secX = (920 - gW_px) / 2;
      const secY = 385;

      const flrH = FLOOR_H * VSCALE;
      const blkH = WALL_H * VSCALE;
      const eavH = EAVE_H * VSCALE;
      const lowRidgeH = RIDGE_LOW_H * VSCALE;
      const highRidgeH = RIDGE_HIGH_H * VSCALE;
      const overlap_px = OVERLAP * sc;

      const midX = secX + gW_px / 2;
      const eaveY = secY - flrH - eavH;
      const lowRidgeY = secY - flrH - lowRidgeH;
      const highRidgeY = secY - flrH - highRidgeH;

      const leftSlope = (lowRidgeH - eavH) / (gW_px / 2);
      const leftEaveY = eaveY + oH_px * leftSlope;

      const rightSlope = (highRidgeH - eavH) / (gW_px / 2);
      const rightEaveY = eaveY + oH_px * rightSlope;
      const overlapTipX = midX - overlap_px;
      const overlapTipY = highRidgeY - overlap_px * rightSlope;

      // Geometría compartida con la vista 3D (misma estructura, mismas cotas)
      const geo = roofModel(W);
      const bay = bayLayout(currentLength);
      const PX = (x) => secX + x * sc;
      const PY = (h) => secY - h * VSCALE;
      // Correas y tubos longitudinales: en el corte se ven como pequeñas secciones
      const sectionTubes = [
        { x: -EAVE_OVERHANG + 0.05, y: geo.yLow(-EAVE_OVERHANG + 0.05) - 0.06, c: '#3f4a57', s: 8 },
        { x: W + EAVE_OVERHANG - 0.05, y: geo.yHigh(W + EAVE_OVERHANG - 0.05) - 0.06, c: '#3f4a57', s: 8 },
        { x: 0.05 + 0.5 * (W / 2 - 0.05), y: geo.yLow(0.05 + 0.5 * (W / 2 - 0.05)) - 0.20, c: '#3f4a57', s: 8 },
        { x: W - 0.05 - 0.5 * (W / 2 - 0.05), y: geo.yHigh(W - 0.05 - 0.5 * (W / 2 - 0.05)) - 0.20, c: '#3f4a57', s: 8 },
        { x: W / 2, y: geo.low - 0.11, c: '#3f4a57', s: 10 }
      ];
      const sectionTubesSvg = sectionTubes.map(t =>
        `<rect x="${PX(t.x) - t.s / 2}" y="${PY(t.y) - t.s / 2}" width="${t.s}" height="${t.s}" fill="${t.c}" stroke="#0f172a" stroke-width="0.8"/>`
      ).join('');

      return `
        <svg viewBox="0 0 920 440" class="w-full max-w-4xl h-auto" xmlns="http://www.w3.org/2000/svg">
          <!-- Terreno Natural NTN ±0.00 -->
          <line x1="30" y1="${secY}" x2="890" y2="${secY}" stroke="#64748b" stroke-width="1.8"/>
          <text x="40" y="${secY + 18}" fill="#64748b" font-size="11" font-weight="bold">NTN ±0.00</text>

          <!-- Relleno y Piso de Concreto Elevado (+0.20m) -->
          <rect x="${secX}" y="${secY - flrH}" width="${gW_px}" height="${flrH}" fill="#f1f5f9" stroke="#334155" stroke-width="1.2"/>
          <polygon points="${secX - 35},${secY} ${secX},${secY - flrH} ${secX},${secY}" fill="#e2e8f0" stroke="#334155" stroke-width="0.8"/>
          <polygon points="${secX + gW_px},${secY - flrH} ${secX + gW_px + 35},${secY} ${secX + gW_px},${secY}" fill="#e2e8f0" stroke="#334155" stroke-width="0.8"/>
          <text x="40" y="${secY - flrH - 5}" fill="#0284c7" font-size="11" font-weight="bold">NPT +0.20</text>

          <!-- Culata posterior: zócalo cerrado y malla superior, sin puerta -->
          <rect x="${secX}" y="${secY - flrH - blkH}" width="${gW_px}" height="${blkH}" fill="#94a3b8" stroke="#1e293b" stroke-width="1.2"/>
          <polygon points="${secX},${secY - flrH - blkH} ${secX},${eaveY} ${midX},${lowRidgeY} ${midX},${secY - flrH - blkH}" fill="#e0f2fe" fill-opacity="0.35" stroke="#38bdf8" stroke-width="0.8" stroke-dasharray="3 2"/>
          <polygon points="${midX},${secY - flrH - blkH} ${midX},${highRidgeY} ${secX + gW_px},${eaveY} ${secX + gW_px},${secY - flrH - blkH}" fill="#e0f2fe" fill-opacity="0.35" stroke="#38bdf8" stroke-width="0.8" stroke-dasharray="3 2"/>
          <rect x="${midX - 94}" y="${secY - flrH - blkH + 8}" width="188" height="15" fill="#ffffff" rx="3" stroke="#94a3b8" stroke-width="0.7"/>
          <text x="${midX}" y="${secY - flrH - blkH + 19}" fill="#475569" font-size="9" font-weight="bold" text-anchor="middle">CULATA POSTERIOR CERRADA</text>

          <!-- Paredes laterales de bloques (0.30 m) -->
          <rect x="${secX}" y="${secY - flrH - blkH}" width="12" height="${blkH}" fill="#94a3b8" stroke="#1e293b" stroke-width="1.2"/>
          <rect x="${secX + gW_px - 12}" y="${secY - flrH - blkH}" width="12" height="${blkH}" fill="#94a3b8" stroke="#1e293b" stroke-width="1.2"/>

          <!-- Columnas laterales de soporte: rematan en la correa de alero, igual que en 3D -->
          <line x1="${secX + 6}" y1="${secY - flrH - blkH}" x2="${secX + 6}" y2="${PY(geo.eave - 0.22)}" stroke="#0f172a" stroke-width="2.2"/>
          <line x1="${secX + gW_px - 6}" y1="${secY - flrH - blkH}" x2="${secX + gW_px - 6}" y2="${PY(geo.eave - 0.22)}" stroke="#0f172a" stroke-width="2.2"/>

          <!-- Mallas antipájaros laterales -->
          <line x1="${secX + 6}" y1="${secY - flrH - blkH}" x2="${secX + 6}" y2="${eaveY}" stroke="#38bdf8" stroke-width="1" stroke-dasharray="3 2"/>
          <line x1="${secX + gW_px - 6}" y1="${secY - flrH - blkH}" x2="${secX + gW_px - 6}" y2="${eaveY}" stroke="#38bdf8" stroke-width="1" stroke-dasharray="3 2"/>

          <!-- Pares del pórtico (mismo trazado que la vista 3D) -->
          <line x1="${PX(geo.rafterLow.x1)}" y1="${PY(geo.rafterLow.y1)}"
                x2="${PX(geo.rafterLow.x2)}" y2="${PY(geo.rafterLow.y2)}"
                stroke="#4b5563" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="${PX(geo.tipX)}" y1="${PY(geo.yHigh(geo.tipX) - 0.06)}"
                x2="${PX(geo.rafterHigh.x1)}" y2="${PY(geo.rafterHigh.y1)}"
                stroke="#4b5563" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="${PX(geo.rafterHigh.x1)}" y1="${PY(geo.rafterHigh.y1)}"
                x2="${PX(geo.rafterHigh.x2)}" y2="${PY(geo.rafterHigh.y2)}"
                stroke="#4b5563" stroke-width="4.5" stroke-linecap="round"/>

          <!-- Tensor alto: la representación visual prioriza su legibilidad -->
          <line x1="${PX(geo.tieX1)}" y1="${PY(geo.tieY)}"
                x2="${PX(geo.tieX2)}" y2="${PY(geo.tieY)}"
                stroke="#334155" stroke-width="3.6"/>
          <circle cx="${PX(geo.tieX1)}" cy="${PY(geo.tieY)}" r="3.2" fill="#334155"/>
          <circle cx="${PX(geo.tieX2)}" cy="${PY(geo.tieY)}" r="3.2" fill="#334155"/>

          <!-- Pendolón central: del tensor alto a la cara inferior de la lámina alta -->
          <line x1="${midX}" y1="${PY(geo.tieY)}"
                x2="${midX}" y2="${PY(geo.kingTop)}" stroke="#334155" stroke-width="3.4"/>

          <!-- ABERTURA VERTICAL DE VENTILACIÓN (0.30m) ENTRE 3.70m y 4.00m -->
          <line x1="${midX}" y1="${lowRidgeY}" x2="${midX}" y2="${highRidgeY}" stroke="#10b981" stroke-width="2.2" stroke-dasharray="4 2"/>

          <!-- TECHO ROJO (Vertiente baja: 3.70m) - TERMINA EXACTAMENTE EN MIDX -->
          <line x1="${secX - oH_px}" y1="${leftEaveY + 3}" x2="${midX}" y2="${lowRidgeY + 3}" stroke="#475569" stroke-width="1.8"/>
          <line x1="${secX - oH_px}" y1="${leftEaveY}" x2="${midX}" y2="${lowRidgeY}" stroke="#dc2626" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="${midX}" cy="${lowRidgeY}" r="3.5" fill="#dc2626"/>

          <!-- TECHO AZUL (Vertiente alta: 4.00m) - TRASLAPA 0.40m HACIA LA IZQUIERDA -->
          <line x1="${secX + gW_px + oH_px}" y1="${rightEaveY + 3}" x2="${overlapTipX}" y2="${overlapTipY + 3}" stroke="#475569" stroke-width="1.8"/>
          <line x1="${secX + gW_px + oH_px}" y1="${rightEaveY}" x2="${overlapTipX}" y2="${overlapTipY}" stroke="#2563eb" stroke-width="2.8" stroke-linecap="round"/>
          <circle cx="${secX + gW_px + oH_px}" cy="${rightEaveY}" r="3" fill="#2563eb"/>
          <circle cx="${overlapTipX}" cy="${overlapTipY}" r="3" fill="#2563eb"/>
          <!-- Goterón en voladizo -->
          <line x1="${overlapTipX}" y1="${overlapTipY}" x2="${overlapTipX}" y2="${overlapTipY + 8}" stroke="#2563eb" stroke-width="2"/>

          <!-- Correas de alero, correas intermedias y tubular de cumbrera (secciones) -->
          ${sectionTubesSvg}
          <!-- Tubo a lo largo bajo el borde libre de la lámina alta -->
          <rect x="${PX(geo.tipX) - 6}" y="${PY(geo.tipY - 0.06)}" width="6" height="6" fill="#3f4a57" stroke="#0f172a" stroke-width="0.8"/>

          <!-- IDENTIFICADORES DE TECHO CON BADGE DE PROTECCIÓN -->
          <rect x="${(secX + midX)/2 - 32}" y="${(eaveY + lowRidgeY)/2 - 25}" width="64" height="17" fill="#ffffff" rx="3" stroke="#fca5a5" stroke-width="0.8"/>
          <text x="${(secX + midX)/2}" y="${(eaveY + lowRidgeY)/2 - 13}" fill="#dc2626" font-size="11" font-weight="bold" text-anchor="middle">3.70 m (Baja)</text>

          <rect x="${(secX + gW_px + midX)/2 - 32}" y="${(eaveY + highRidgeY)/2 - 25}" width="64" height="17" fill="#ffffff" rx="3" stroke="#93c5fd" stroke-width="0.8"/>
          <text x="${(secX + gW_px + midX)/2}" y="${(eaveY + highRidgeY)/2 - 13}" fill="#2563eb" font-size="11" font-weight="bold" text-anchor="middle">4.00 m (Alta)</text>

          <!-- FLECHAS DE FLUJO DE AIRE CALIENTE (CONVECCIÓN) -->
          <path d="M ${midX - 25} ${lowRidgeY + 28} L ${midX - 10} ${lowRidgeY - 4}" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="4 2"/>
          <polygon points="${midX - 10},${lowRidgeY - 8} ${midX - 15},${lowRidgeY - 1} ${midX - 7},${lowRidgeY - 2}" fill="#f59e0b"/>
          
          <path d="M ${midX - 12} ${lowRidgeY + 30} L ${midX - 2} ${lowRidgeY - 2}" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="4 2"/>
          <polygon points="${midX - 2},${lowRidgeY - 7} ${midX - 6},${lowRidgeY + 1} ${midX + 2},${lowRidgeY - 1}" fill="#f59e0b"/>

          <!-- COTA TRASLAPE 0.40m (EN AZUL) -->
          <line x1="${overlapTipX}" y1="${highRidgeY - 20}" x2="${midX}" y2="${highRidgeY - 20}" stroke="#2563eb" stroke-width="1.2"/>
          <line x1="${overlapTipX}" y1="${highRidgeY - 25}" x2="${overlapTipX}" y2="${highRidgeY - 15}" stroke="#2563eb" stroke-width="1.4"/>
          <line x1="${midX}" y1="${highRidgeY - 25}" x2="${midX}" y2="${highRidgeY - 15}" stroke="#2563eb" stroke-width="1.4"/>
          <rect x="${(overlapTipX + midX)/2 - 16}" y="${highRidgeY - 28}" width="32" height="15" fill="#ffffff" rx="3" stroke="#2563eb" stroke-width="0.8"/>
          <text x="${(overlapTipX + midX)/2}" y="${highRidgeY - 17}" fill="#2563eb" font-size="10.5" font-weight="bold" text-anchor="middle">${OVERLAP.toFixed(2)}</text>

          <!-- COTA ABERTURA VERTICAL 0.30m (EN VERDE) -->
          <line x1="${midX + 18}" y1="${highRidgeY}" x2="${midX + 18}" y2="${lowRidgeY}" stroke="#10b981" stroke-width="1.2"/>
          <line x1="${midX + 13}" y1="${highRidgeY}" x2="${midX + 23}" y2="${highRidgeY}" stroke="#10b981" stroke-width="1.4"/>
          <line x1="${midX + 13}" y1="${lowRidgeY}" x2="${midX + 23}" y2="${lowRidgeY}" stroke="#10b981" stroke-width="1.4"/>
          <rect x="${midX + 24}" y="${(highRidgeY + lowRidgeY)/2 - 8}" width="32" height="16" fill="#ffffff" rx="3" stroke="#10b981" stroke-width="0.8"/>
          <text x="${midX + 40}" y="${(highRidgeY + lowRidgeY)/2 + 4}" fill="#10b981" font-size="10.5" font-weight="bold" text-anchor="middle">${VENT_GAP.toFixed(2)}</text>

          <!-- PENDIENTE DEL PISO -->
          <text x="${secX + 40}" y="${secY - flrH - 6}" fill="#0f172a" font-size="10.5" font-weight="bold">Pendiente longitudinal 1.0%</text>

          <!-- Coherencia con el reparto de pórticos de las demás láminas y del 3D -->
          <text x="40" y="${secY + 36}" fill="#475569" font-size="10" font-weight="bold">Pórticos cada ${bay.spacing.toFixed(2)} m (${bay.count}) · tubos de borde en los 4 aleros</text>

          <!-- COTAS HORIZONTALES SUPERIORES (ESCALONADAS PARA NO CHOCAR) -->
          ${drawDimH(secX - oH_px, secX, 52, EAVE_OVERHANG.toFixed(2))}
          ${drawDimH(secX, secX + gW_px, 52, W.toFixed(2))}
          ${drawDimH(secX + gW_px, secX + gW_px + oH_px, 52, EAVE_OVERHANG.toFixed(2))}
          ${drawDimH(secX - oH_px, secX + gW_px + oH_px, 24, totalRoofW.toFixed(2))}

          <!-- COTAS VERTICALES DERECHAS (COLUMNAS SEPARADAS PARA NO TAPARSE) -->
          <!-- Columna 1: Piso (+0.20) y muro perimetral -->
          ${drawDimV(secY, secY - flrH, secX + gW_px + oH_px + 18, FLOOR_H.toFixed(2), '#334155', '#ffffff', true)}
          ${drawDimV(secY - flrH, secY - flrH - blkH, secX + gW_px + oH_px + 18, WALL_H.toFixed(2), '#334155', '#ffffff', true)}

          <!-- Columna 2: Altura Pared Lateral (3.00m) -->
          ${drawDimV(secY - flrH, eaveY, secX + gW_px + oH_px + 72, EAVE_H.toFixed(2))}

          <!-- Columna 3: Altura Cumbrera Baja (3.70m) -->
          ${drawDimV(secY - flrH, lowRidgeY, secX + gW_px + oH_px + 102, RIDGE_LOW_H.toFixed(2), '#dc2626')}

          <!-- Columna 4: Altura Cumbrera Alta (4.00m) -->
          ${drawDimV(secY - flrH, highRidgeY, secX + gW_px + oH_px + 132, RIDGE_HIGH_H.toFixed(2), '#2563eb')}
        </svg>
      `;
    }

    // ==========================================
    // 2. PLANTA ARQUITECTÓNICA
    // ==========================================
    function getPlantaSVG() {
      const W = currentWidth;
      const L = currentLength;
      const totalRoofW = W + 2 * EAVE_OVERHANG;
      const totalRoofL = L + 2 * GABLE_OVERHANG;

      const sc = Math.min(620 / totalRoofL, 300 / totalRoofW);
      sheetPxPerM = sc;
      const gL_px = L * sc;
      const gW_px = W * sc;
      const eLat_px = EAVE_OVERHANG * sc;
      const eGable_px = GABLE_OVERHANG * sc;

      const ox = (920 - gL_px) / 2;
      const oy = (400 - gW_px) / 2 + 15;

      const bay = bayLayout(L);
      const numBays = bay.count;
      const baySpacing = bay.spacing;
      const baySpacing_px = gL_px / numBays;

      let baysSvg = '';
      let colsSvg = '';
      for (let i = 0; i <= numBays; i++) {
        const cx = ox + i * baySpacing_px;
        colsSvg += `
          <rect x="${cx - 3.5}" y="${oy - 3.5}" width="7" height="7" fill="#0f172a" rx="1"/>
          <rect x="${cx - 3.5}" y="${oy + gW_px - 3.5}" width="7" height="7" fill="#0f172a" rx="1"/>
        `;
        if (i < numBays) {            const nextX = ox + (i + 1) * baySpacing_px;
          baysSvg += drawDimH(cx, nextX, oy + gW_px + eLat_px + 20, baySpacing.toFixed(2));
        }
      }

      // Puerta Frontal en Culata Izquierda (Eje 1 / Fachada Frontal)
      const doorW_px = DOOR_W * sc;
      const doorY1 = oy + (gW_px - doorW_px) / 2;
      const doorY2 = doorY1 + doorW_px;

      const ridgeY = oy + gW_px / 2;
      const overlapY = ridgeY - (OVERLAP * sc);

      return `
        <svg viewBox="0 0 920 440" class="w-full max-w-4xl h-auto" xmlns="http://www.w3.org/2000/svg">
          <!-- Proyección del Techo (Línea discontinua roja) -->
          <rect x="${ox - eGable_px}" y="${oy - eLat_px}" width="${gL_px + 2*eGable_px}" height="${gW_px + 2*eLat_px}" 
                fill="none" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="5 3" rx="2"/>
          <!-- Tubos de borde de lámina: aleros laterales y culatas (marco interior) -->
          <rect x="${ox - eGable_px + 4}" y="${oy - eLat_px + 4}" width="${gL_px + 2*eGable_px - 8}" height="${gW_px + 2*eLat_px - 8}"
                fill="none" stroke="#475569" stroke-width="1.6" rx="1"/>

          <!-- Piso del Galpón (+0.20m) -->
          <rect x="${ox}" y="${oy}" width="${gL_px}" height="${gW_px}" fill="#f8fafc" stroke="#1e293b" stroke-width="1.5"/>

          <!-- Muro perimetral de bloque (0.30 m de alto, 15 cm ancho gráfico) -->
          <!-- Pared Norte y Sur -->
          <rect x="${ox}" y="${oy}" width="${gL_px}" height="6" fill="#94a3b8"/>
          <rect x="${ox}" y="${oy + gW_px - 6}" width="${gL_px}" height="6" fill="#94a3b8"/>
          <!-- Culata Posterior (Derecha) -->
          <rect x="${ox + gL_px - 6}" y="${oy}" width="6" height="${gW_px}" fill="#94a3b8"/>
          <!-- Culata Frontal (Izquierda) con vano para PUERTA ESTÁNDAR 1.00m -->
          <rect x="${ox}" y="${oy}" width="6" height="${doorY1 - oy}" fill="#94a3b8"/>
          <rect x="${ox}" y="${doorY2}" width="6" height="${oy + gW_px - doorY2}" fill="#94a3b8"/>

          <!-- DETALLE DE PUERTA ESTÁNDAR P-1 (1.00 x 2.10 m) -->
          <!-- Jambas / Marcos -->
          <rect x="${ox - 2}" y="${doorY1 - 2}" width="6" height="4" fill="#0f172a"/>
          <rect x="${ox - 2}" y="${doorY2 - 2}" width="6" height="4" fill="#0f172a"/>
          <!-- Hoja de puerta abierta a 90° hacia el exterior -->
          <line x1="${ox}" y1="${doorY1}" x2="${ox - doorW_px}" y2="${doorY1}" stroke="#4f46e5" stroke-width="2.4"/>
          <!-- Arco de abatimiento -->
          <path d="M ${ox - doorW_px} ${doorY1} A ${doorW_px} ${doorW_px} 0 0 1 ${ox} ${doorY2}" fill="none" stroke="#6366f1" stroke-width="1.2" stroke-dasharray="3 2"/>
          
          <!-- Cota y etiqueta de puerta (fuera del arco de abatimiento) -->
          <line x1="${ox - 10}" y1="${doorY1}" x2="${ox - 10}" y2="${doorY2}" stroke="#4f46e5" stroke-width="1.2"/>
          <line x1="${ox - 14}" y1="${doorY1}" x2="${ox - 6}" y2="${doorY1}" stroke="#4f46e5" stroke-width="1.2"/>
          <line x1="${ox - 14}" y1="${doorY2}" x2="${ox - 6}" y2="${doorY2}" stroke="#4f46e5" stroke-width="1.2"/>
          <rect x="${ox - doorW_px - 92}" y="${(doorY1 + doorY2)/2 - 16}" width="84" height="32" fill="#ffffff" rx="4" stroke="#818cf8" stroke-width="1"/>
          <text x="${ox - doorW_px - 50}" y="${(doorY1 + doorY2)/2 - 3}" fill="#3730a3" font-size="9.5" font-weight="bold" text-anchor="middle">PUERTA P-1</text>
          <text x="${ox - doorW_px - 50}" y="${(doorY1 + doorY2)/2 + 10}" fill="#4f46e5" font-size="9" font-weight="bold" text-anchor="middle">1.00 x 2.10 m</text>

          <!-- Cumbreras en planta -->
          <line x1="${ox - eGable_px}" y1="${ridgeY}" x2="${ox + gL_px + eGable_px}" y2="${ridgeY}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4 2"/>
          <line x1="${ox - eGable_px}" y1="${overlapY}" x2="${ox + gL_px + eGable_px}" y2="${overlapY}" stroke="#2563eb" stroke-width="1.6"/>
          <rect x="${ox - eGable_px}" y="${overlapY}" width="${gL_px + 2*eGable_px}" height="${ridgeY - overlapY}" fill="#bfdbfe" opacity="0.35"/>
          <text x="${ox + gL_px/2}" y="${overlapY - 4}" fill="#2563eb" font-size="9.5" font-weight="bold" text-anchor="middle">Traslape Cumbrera ${OVERLAP.toFixed(2)} m</text>

          <!-- Columnas y Cotas entre ejes -->
          ${colsSvg}
          ${baysSvg}

          <!-- COTAS HORIZONTALES INFERIORES -->
          ${drawDimH(ox, ox + gL_px, oy + gW_px + eLat_px + 40, L.toFixed(2))}
          ${drawDimH(ox - eGable_px, ox + gL_px + eGable_px, oy + gW_px + eLat_px + 60, totalRoofL.toFixed(2))}

          <!-- COTAS VERTICALES DERECHAS (NO SOLAPAN CON LA PUERTA DE LA IZQUIERDA) -->
          ${drawDimV(oy, oy + gW_px, ox + gL_px + eGable_px + 20, W.toFixed(2))}
          ${drawDimV(oy - eLat_px, oy + gW_px + eLat_px, ox + gL_px + eGable_px + 74, totalRoofW.toFixed(2))}
          ${drawDimV(oy - eLat_px, oy, ox + gL_px + eGable_px + 20, EAVE_OVERHANG.toFixed(2), '#334155', '#ffffff', true)}
          ${drawDimV(oy + gW_px, oy + gW_px + eLat_px, ox + gL_px + eGable_px + 20, EAVE_OVERHANG.toFixed(2), '#334155', '#ffffff', true)}

          <!-- COTAS HORIZONTALES SUPERIORES (ALERONES DE CULATA) -->
          ${drawDimH(ox - eGable_px, ox, oy - eLat_px - 14, GABLE_OVERHANG.toFixed(2))}
          ${drawDimH(ox + gL_px, ox + gL_px + eGable_px, oy - eLat_px - 14, GABLE_OVERHANG.toFixed(2))}

          <!-- Pendiente de piso -->
          <text x="${ox + 40}" y="${oy + gW_px/2 + 25}" font-size="10.5" font-weight="bold" fill="#0f172a">Pendiente Piso 1.0%</text>

          <!-- Rosa de los Vientos (Orientación Este - Oeste) -->
          <g transform="translate(835, 65)">
            <circle cx="0" cy="0" r="18" fill="#ffffff" stroke="#334155" stroke-width="1.2"/>
            <polygon points="0,0 -3.5,0 0,-15" fill="#0f172a"/>
            <line x1="-15" y1="0" x2="15" y2="0" stroke="#0f172a" stroke-width="1"/>
            <text x="0" y="-19" font-size="9" font-weight="bold" fill="#0f172a" text-anchor="middle">N</text>
            <text x="21" y="3.5" font-size="9" font-weight="bold" fill="#dc2626" text-anchor="start">E</text>
            <text x="-26" y="3.5" font-size="9" font-weight="bold" fill="#dc2626" text-anchor="end">O (Frontal)</text>
          </g>
        </svg>
      `;
    }

    // ==========================================
    // 3. FACHADA FRONTAL / CULATA CON PUERTA
    // ==========================================
    function getFrontalSVG() {
      const W = currentWidth;
      const totalRoofW = W + 2 * EAVE_OVERHANG;

      const VSCALE = 68;
      const sc = Math.min(VSCALE, 560 / totalRoofW);
      sheetPxPerM = sc;
      const gW_px = W * sc;
      const oH_px = EAVE_OVERHANG * sc;
      const secX = (920 - gW_px) / 2;
      const secY = 385;

      const flrH = FLOOR_H * VSCALE;
      const blkH = WALL_H * VSCALE;
      const eavH = EAVE_H * VSCALE;
      const lowRidgeH = RIDGE_LOW_H * VSCALE;
      const highRidgeH = RIDGE_HIGH_H * VSCALE;
      const overlap_px = OVERLAP * sc;

      const midX = secX + gW_px / 2;
      const eaveY = secY - flrH - eavH;
      const lowRidgeY = secY - flrH - lowRidgeH;
      const highRidgeY = secY - flrH - highRidgeH;

      const leftSlope = (lowRidgeH - eavH) / (gW_px / 2);
      const leftEaveY = eaveY + oH_px * leftSlope;

      const rightSlope = (highRidgeH - eavH) / (gW_px / 2);
      const rightEaveY = eaveY + oH_px * rightSlope;
      const overlapTipX = midX - overlap_px;
      const overlapTipY = highRidgeY - overlap_px * rightSlope;

      // Tensor alto (collarín) del pórtico de culata — misma geometría que el 3D y el corte
      const geoF = roofModel(W);
      const tieYpx = secY - flrH - (geoF.tieY - FLOOR_H) * VSCALE;
      const tieX1px = secX + geoF.tieX1 * sc;
      const tieX2px = secX + geoF.tieX2 * sc;

      // PUERTA FRONTAL ESTÁNDAR (1.00 x 2.10 m)
      const doorW_px = DOOR_W * sc;
      const doorH_px = DOOR_H * VSCALE;
      const doorLeftX = midX - doorW_px / 2;
      const doorTopY = secY - flrH - doorH_px;

      return `
        <svg viewBox="0 0 920 440" class="w-full max-w-4xl h-auto" xmlns="http://www.w3.org/2000/svg">
          <!-- Terreno Natural NTN ±0.00 -->
          <line x1="30" y1="${secY}" x2="890" y2="${secY}" stroke="#64748b" stroke-width="1.8"/>
          <text x="40" y="${secY + 18}" fill="#64748b" font-size="11" font-weight="bold">NTN ±0.00</text>

          <!-- Escalón / Rampa y Piso +0.20m -->
          <rect x="${secX}" y="${secY - flrH}" width="${gW_px}" height="${flrH}" fill="#f1f5f9" stroke="#334155" stroke-width="1.2"/>
          <polygon points="${secX - 35},${secY} ${secX},${secY - flrH} ${secX},${secY}" fill="#e2e8f0" stroke="#334155" stroke-width="0.8"/>
          <polygon points="${secX + gW_px},${secY - flrH} ${secX + gW_px + 35},${secY} ${secX + gW_px},${secY}" fill="#e2e8f0" stroke="#334155" stroke-width="0.8"/>
          <text x="40" y="${secY - flrH - 5}" fill="#0284c7" font-size="11" font-weight="bold">NPT +0.20</text>

          <!-- Pared de Culata: Muro de bloques 0.30 m a los lados de la puerta -->
          <rect x="${secX}" y="${secY - flrH - blkH}" width="${doorLeftX - secX}" height="${blkH}" fill="#94a3b8" stroke="#1e293b" stroke-width="1.2"/>
          <rect x="${doorLeftX + doorW_px}" y="${secY - flrH - blkH}" width="${secX + gW_px - (doorLeftX + doorW_px)}" height="${blkH}" fill="#94a3b8" stroke="#1e293b" stroke-width="1.2"/>

          <!-- Malla y cerramiento superior de culata -->
          <polygon points="${secX},${secY - flrH - blkH} ${secX},${eaveY} ${midX},${lowRidgeY} ${midX},${secY - flrH - blkH}" fill="#e0f2fe" opacity="0.4"/>
          <polygon points="${midX},${secY - flrH - blkH} ${midX},${highRidgeY} ${secX + gW_px},${eaveY} ${secX + gW_px},${secY - flrH - blkH}" fill="#e0f2fe" opacity="0.4"/>

          <!-- Estructura de columnas culata -->
          <line x1="${secX}" y1="${secY - flrH}" x2="${secX}" y2="${eaveY}" stroke="#0f172a" stroke-width="2.5"/>
          <line x1="${secX + gW_px}" y1="${secY - flrH}" x2="${secX + gW_px}" y2="${eaveY}" stroke="#0f172a" stroke-width="2.5"/>
          <line x1="${midX}" y1="${doorTopY}" x2="${midX}" y2="${lowRidgeY}" stroke="#0f172a" stroke-width="2.2"/>

          <!-- TENSOR ALTO (COLLARÍN) DEL PÓRTICO DE CULATA -->
          <line x1="${tieX1px}" y1="${tieYpx}" x2="${tieX2px}" y2="${tieYpx}" stroke="#334155" stroke-width="2.4"/>
          <circle cx="${tieX1px}" cy="${tieYpx}" r="2.6" fill="#334155"/>
          <circle cx="${tieX2px}" cy="${tieYpx}" r="2.6" fill="#334155"/>
          <text x="${(tieX1px + midX) / 2}" y="${tieYpx + 12}" fill="#334155" font-size="9" font-weight="bold" text-anchor="middle">Tensor alto (collarín)</text>

          <!-- PUERTA ESTÁNDAR P-1 (1.00 x 2.10 m) EN PRIMER PLANO -->
          <!-- Marco exterior -->
          <rect x="${doorLeftX}" y="${doorTopY}" width="${doorW_px}" height="${doorH_px}" fill="#ffffff" stroke="#1e293b" stroke-width="2.2"/>
          <!-- Zócalo inferior metálico de puerta (0.90m) -->
          <rect x="${doorLeftX + 3}" y="${secY - flrH - (0.90 * 68)}" width="${doorW_px - 6}" height="${0.90 * 68 - 2}" fill="#cbd5e1" stroke="#475569" stroke-width="1.2"/>
          <!-- Malla metálica superior de puerta -->
          <rect x="${doorLeftX + 3}" y="${doorTopY + 3}" width="${doorW_px - 6}" height="${doorH_px - (0.90 * 68) - 4}" fill="#f8fafc" stroke="#38bdf8" stroke-width="1" stroke-dasharray="3 2"/>
          <!-- Manija / Cerradura -->
          <circle cx="${doorLeftX + doorW_px - 8}" cy="${secY - flrH - (1.00 * 68)}" r="3" fill="#0f172a"/>
          <line x1="${doorLeftX + doorW_px - 8}" y1="${secY - flrH - (1.00 * 68)}" x2="${doorLeftX + doorW_px - 14}" y2="${secY - flrH - (1.00 * 68)}" stroke="#0f172a" stroke-width="2"/>

          <!-- COTAS ESPECÍFICAS DE LA PUERTA (1.00m x 2.10m) -->
          ${drawDimH(doorLeftX, doorLeftX + doorW_px, secY - flrH + 22, '1.00')}
          ${drawDimV(secY - flrH, doorTopY, doorLeftX - 16, '2.10', '#4f46e5', '#ffffff')}
          
          <rect x="${midX - 82}" y="${doorTopY - 26}" width="164" height="20" fill="#ffffff" rx="4" stroke="#6366f1" stroke-width="1.2"/>
          <text x="${midX}" y="${doorTopY - 12}" fill="#3730a3" font-size="10" font-weight="bold" text-anchor="middle">PUERTA P-1 (1.00 x 2.10 m)</text>

          <!-- ABERTURA CENITAL DE CUMBRERA (0.30m) -->
          <rect x="${midX - 2}" y="${highRidgeY}" width="4" height="${lowRidgeY - highRidgeY}" fill="#10b981"/>
          <line x1="${midX}" y1="${lowRidgeY}" x2="${midX}" y2="${highRidgeY}" stroke="#10b981" stroke-width="2" stroke-dasharray="3 2"/>

          <!-- TECHO ROJO (Baja 3.70m) -->
          <line x1="${secX - oH_px}" y1="${leftEaveY}" x2="${midX}" y2="${lowRidgeY}" stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>

          <!-- Tensor de alero de la culata (ya existe en los pórticos extremos del 3D) -->
          <line x1="${secX}" y1="${secY - flrH - (EAVE_H - 0.16) * VSCALE}" x2="${secX + gW_px}" y2="${secY - flrH - (EAVE_H - 0.16) * VSCALE}" stroke="#3f4a57" stroke-width="3.5" stroke-linecap="round"/>
          <text x="${midX}" y="${secY - flrH - (EAVE_H - 0.16) * VSCALE + 13}" fill="#334155" font-size="9" font-weight="bold" text-anchor="middle">Tensor de alero (culata)</text>

          <!-- TECHO AZUL (Alta 4.00m con traslape 0.40m) -->
          <line x1="${secX + gW_px + oH_px}" y1="${rightEaveY}" x2="${overlapTipX}" y2="${overlapTipY}" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>
          <line x1="${overlapTipX}" y1="${overlapTipY}" x2="${overlapTipX}" y2="${overlapTipY + 6}" stroke="#2563eb" stroke-width="2"/>

          <!-- Tubos de borde de culata: recorren el alero de la fachada y fijan la lámina -->
          <line x1="${secX - oH_px}" y1="${leftEaveY + 6}" x2="${midX}" y2="${lowRidgeY + 6}" stroke="#3f4a57" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="${secX + gW_px + oH_px}" y1="${rightEaveY + 6}" x2="${overlapTipX}" y2="${overlapTipY + 6}" stroke="#3f4a57" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="${secX - oH_px - 6}" y1="${leftEaveY + 6}" x2="${secX - oH_px - 6}" y2="${leftEaveY + 26}" stroke="#3f4a57" stroke-width="1" stroke-dasharray="2 2"/>
          <rect x="${secX - oH_px - 76}" y="${leftEaveY + 26}" width="146" height="15" fill="#ffffff" rx="3" stroke="#94a3b8" stroke-width="0.8"/>
          <text x="${secX - oH_px - 3}" y="${leftEaveY + 37}" fill="#334155" font-size="9.5" font-weight="bold" text-anchor="middle">Tubo de borde de culata</text>

          <!-- COTAS HORIZONTALES SUPERIORES -->
          ${drawDimH(secX - oH_px, secX, 52, EAVE_OVERHANG.toFixed(2))}
          ${drawDimH(secX, secX + gW_px, 52, W.toFixed(2))}
          ${drawDimH(secX + gW_px, secX + gW_px + oH_px, 52, EAVE_OVERHANG.toFixed(2))}
          ${drawDimH(secX - oH_px, secX + gW_px + oH_px, 24, totalRoofW.toFixed(2))}

          <!-- COTAS VERTICALES DERECHAS -->
          ${drawDimV(secY - flrH, eaveY, secX + gW_px + oH_px + 22, EAVE_H.toFixed(2))}
          ${drawDimV(secY - flrH, lowRidgeY, secX + gW_px + oH_px + 52, RIDGE_LOW_H.toFixed(2), '#dc2626')}
          ${drawDimV(secY - flrH, highRidgeY, secX + gW_px + oH_px + 82, RIDGE_HIGH_H.toFixed(2), '#2563eb')}
        </svg>
      `;
    }

    // ==========================================
    // 4. FACHADA LATERAL LONGITUDINAL
    // ==========================================
    function getFachadaSVG() {
      const L = currentLength;
      const totalRoofL = L + 2 * GABLE_OVERHANG;

      const VSCALE = 64;
      const sc = Math.min(540 / totalRoofL, 46);
      sheetPxPerM = sc;
      const gL_px = L * sc;
      const eGable_px = GABLE_OVERHANG * sc;
      const longX = (920 - gL_px) / 2;
      const longY = 360;

      const flrH = FLOOR_H * VSCALE;
      const blkH = WALL_H * VSCALE;
      const eavH = EAVE_H * VSCALE;
      const lowRdH = RIDGE_LOW_H * VSCALE;
      const highRdH = RIDGE_HIGH_H * VSCALE;
      const ventH = VENT_GAP * VSCALE;

      const bay = bayLayout(L);
      const numBays = bay.count;
      const baySpacing = bay.spacing;
      const baySpacing_px = gL_px / numBays;

      let colsSvg = '';
      let meshSvg = '';
      let baysSvg = '';

      for (let i = 0; i <= numBays; i++) {
        const cx = longX + i * baySpacing_px;
        colsSvg += `<rect x="${cx - 3.5}" y="${longY - flrH - eavH}" width="7" height="${eavH - blkH}" fill="#0f172a"/>`;
        if (i < numBays) {
          const nextX = longX + (i + 1) * baySpacing_px;
          meshSvg += `<rect x="${cx + 3.5}" y="${longY - flrH - eavH}" width="${baySpacing_px - 7}" height="${eavH - blkH}" fill="#f0f9ff" stroke="#38bdf8" stroke-width="0.8" stroke-dasharray="3 3"/>`;
          baysSvg += drawDimH(cx, nextX, 54, baySpacing.toFixed(2));
        }
      }

      return `
        <svg viewBox="0 0 920 440" class="w-full max-w-4xl h-auto" xmlns="http://www.w3.org/2000/svg">
          <!-- Terreno Natural NTN -->
          <line x1="30" y1="${longY}" x2="890" y2="${longY}" stroke="#64748b" stroke-width="1.8"/>
          <text x="40" y="${longY + 18}" fill="#64748b" font-size="11" font-weight="bold">NTN ±0.00</text>

          <!-- Piso Elevado +0.20m -->
          <rect x="${longX}" y="${longY - flrH}" width="${gL_px}" height="${flrH}" fill="#e2e8f0" stroke="#334155" stroke-width="1.2"/>
          <text x="40" y="${longY - flrH - 5}" fill="#0284c7" font-size="11" font-weight="bold">NPT +0.20</text>

          <!-- Muro perimetral de bloque 0.30 m -->
          <rect x="${longX}" y="${longY - flrH - blkH}" width="${gL_px}" height="${blkH}" fill="#94a3b8" stroke="#1e293b" stroke-width="1.2"/>

          <!-- Mallas antipájaros y columnas -->
          ${meshSvg}
          ${colsSvg}

          <!-- Alero lateral inferior (3.00m) -->
          <line x1="${longX - eGable_px}" y1="${longY - flrH - eavH}" x2="${longX + gL_px + eGable_px}" y2="${longY - flrH - eavH}" stroke="#dc2626" stroke-width="2.6"/>

          <!-- Banda de Abertura Cenital Continua (0.30m) -->
          <line x1="${longX - eGable_px}" y1="${longY - flrH - lowRdH}" x2="${longX + gL_px + eGable_px}" y2="${longY - flrH - lowRdH}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4 2"/>
          <rect x="${longX - eGable_px}" y="${longY - flrH - highRdH}" width="${gL_px + 2*eGable_px}" height="${ventH}" fill="#ecfdf5" stroke="#10b981" stroke-width="1.2" stroke-dasharray="3 2"/>
          <text x="${longX + gL_px/2}" y="${longY - flrH - highRdH + ventH/2 + 4}" fill="#047857" font-size="10" font-weight="bold" text-anchor="middle">Abertura de Ventilación Continua (${VENT_GAP.toFixed(2)} m)</text>

          <!-- Cumbrera Alta (4.00m) -->
          <line x1="${longX - eGable_px}" y1="${longY - flrH - highRdH}" x2="${longX + gL_px + eGable_px}" y2="${longY - flrH - highRdH}" stroke="#2563eb" stroke-width="2.6"/>

          <!-- COTAS HORIZONTALES (ESCALONADAS PARA NO SALIRSE NI CHOCAR) -->
          ${baysSvg}
          ${drawDimH(longX, longX + gL_px, 32, L.toFixed(2))}
          ${drawDimH(longX - eGable_px, longX + gL_px + eGable_px, 10, totalRoofL.toFixed(2))}
          ${drawDimH(longX - eGable_px, longX, 54, GABLE_OVERHANG.toFixed(2))}
          ${drawDimH(longX + gL_px, longX + gL_px + eGable_px, 54, GABLE_OVERHANG.toFixed(2))}

          <!-- COTAS VERTICALES DERECHAS -->
          ${drawDimV(longY, longY - flrH, longX + gL_px + eGable_px + 20, FLOOR_H.toFixed(2), '#334155', '#ffffff', true)}
          ${drawDimV(longY - flrH, longY - flrH - blkH, longX + gL_px + eGable_px + 20, WALL_H.toFixed(2), '#334155', '#ffffff', true)}
          ${drawDimV(longY - flrH, longY - flrH - eavH, longX + gL_px + eGable_px + 52, EAVE_H.toFixed(2))}
          ${drawDimV(longY - flrH, longY - flrH - highRdH, longX + gL_px + eGable_px + 82, RIDGE_HIGH_H.toFixed(2), '#2563eb')}
        </svg>
      `;
    }

    // ==========================================
    // 5. DETALLE CUMBRERA ASIMÉTRICA
    // ==========================================
    function getDetalleSVG() {
      // Detalle ampliado de la cumbrera: 300 px/m, así 0.30 m = 90 px visibles
      const K = 300;
      sheetPxPerM = K;
      const W = currentWidth;
      const cx = 460;
      const yLow = 265;                        // cumbrera baja  +3.70 m
      const yHigh = yLow - VENT_GAP * K;       // cumbrera alta +4.00 m (90 px)

      const sLow = (RIDGE_LOW_H - EAVE_H) / (W / 2);
      const sHigh = (RIDGE_HIGH_H - EAVE_H) / (W / 2);

      // 1.00 m de vertiente a cada lado del eje
      const half = 1.0 * K;
      const xL = cx - half;
      const yL = yLow + half * sLow;
      const xR = cx + half;
      const yR = yHigh + half * sHigh;

      // Punta del alero alto: traslapa OVERLAP sobre la vertiente baja
      const xTip = cx - OVERLAP * K;
      const yTip = yHigh + OVERLAP * K * sHigh;

      const midVent = (yHigh + yLow) / 2;
      const dimY = yHigh - 55;

      // Malla antipájaros: retícula en X dentro de la abertura
      let mesh = '';
      for (let y = yHigh + 12; y < yLow; y += 12) {
        mesh += `<line x1="${cx - 7}" y1="${y}" x2="${cx + 7}" y2="${y - 10}" stroke="#10b981" stroke-width="1"/>`;
        mesh += `<line x1="${cx - 7}" y1="${y - 10}" x2="${cx + 7}" y2="${y}" stroke="#10b981" stroke-width="1"/>`;
      }

      return `
        <svg viewBox="0 0 920 440" class="w-full max-w-4xl h-auto" xmlns="http://www.w3.org/2000/svg">
          <!-- Columna central que sostiene la cumbrera baja -->
          <rect x="${cx - 5}" y="${yLow}" width="10" height="${400 - yLow}" fill="#0f172a"/>
          <text x="${cx + 15}" y="392" fill="#475569" font-size="11" font-weight="bold">Columna central</text>

          <!-- Abertura vertical de ventilación (0.30 m) con malla antipájaros -->
          <rect x="${cx - 7}" y="${yHigh}" width="14" height="${VENT_GAP * K}" fill="#ecfdf5" stroke="#10b981" stroke-width="1" stroke-dasharray="3 2"/>
          ${mesh}
          <line x1="${cx - 11}" y1="${yHigh}" x2="${cx + 11}" y2="${yHigh}" stroke="#10b981" stroke-width="2.4"/>
          <line x1="${cx - 11}" y1="${yLow}" x2="${cx + 11}" y2="${yLow}" stroke="#10b981" stroke-width="2.4"/>

          <!-- Flechas de convección: el aire caliente escapa por la abertura -->
          <path d="M ${cx - 60} ${yLow + 80} L ${cx - 22} ${yHigh + 40}" stroke="#f59e0b" stroke-width="2.6" stroke-dasharray="6 3"/>
          <polygon points="${cx - 22},${yHigh + 32} ${cx - 29},${yHigh + 46} ${cx - 15},${yHigh + 46}" fill="#f59e0b"/>

          <path d="M ${cx - 100} ${yLow + 70} L ${cx - 50} ${yHigh + 65}" stroke="#f59e0b" stroke-width="2.6" stroke-dasharray="6 3"/>
          <polygon points="${cx - 50},${yHigh + 57} ${cx - 57},${yHigh + 71} ${cx - 43},${yHigh + 71}" fill="#f59e0b"/>

          <!-- TECHO ROJO: vertiente baja, termina en el eje -->
          <line x1="${xL}" y1="${yL + 6}" x2="${cx}" y2="${yLow + 6}" stroke="#475569" stroke-width="4"/>
          <line x1="${xL}" y1="${yL}" x2="${cx}" y2="${yLow}" stroke="#dc2626" stroke-width="6" stroke-linecap="round"/>
          <circle cx="${cx}" cy="${yLow}" r="4" fill="#dc2626"/>

          <!-- TECHO AZUL: vertiente alta, traslapa sobre la baja -->
          <line x1="${xR}" y1="${yR + 6}" x2="${xTip}" y2="${yTip + 6}" stroke="#475569" stroke-width="4"/>
          <line x1="${xR}" y1="${yR}" x2="${xTip}" y2="${yTip}" stroke="#2563eb" stroke-width="6.5" stroke-linecap="round"/>
          <circle cx="${xTip}" cy="${yTip}" r="4.5" fill="#2563eb"/>
          <!-- Tubo de borde bajo la lámina que sobresale: la mantiene fija al igual que en los aleros -->
          <rect x="${xTip - 18}" y="${yTip + 8}" width="18" height="18" fill="#3f4a57" stroke="#0f172a" stroke-width="1"/>
          <line x1="${xTip - 9}" y1="${yTip + 26}" x2="${xTip - 9}" y2="${yTip + 38}" stroke="#2563eb" stroke-width="2.5"/>
          <line x1="${xTip - 9}" y1="${yTip + 8}" x2="${xTip - 9}" y2="${yTip + 3}" stroke="#3f4a57" stroke-width="1.4"/>
          <text x="${xTip - 9}" y="${yTip + 54}" fill="#334155" font-size="11" font-weight="bold" text-anchor="middle">Tubo de borde</text>

          <!-- Etiquetas de altura de cada cumbrera -->
          <rect x="${xL - 4}" y="${yL + 16}" width="88" height="24" fill="#ffffff" rx="4" stroke="#fca5a5" stroke-width="1"/>
          <text x="${xL + 40}" y="${yL + 33}" font-size="14" font-weight="bold" fill="#dc2626" text-anchor="middle">${RIDGE_LOW_H.toFixed(2)} m</text>

          <rect x="${cx + 40}" y="${yHigh - 40}" width="90" height="24" fill="#ffffff" rx="4" stroke="#93c5fd" stroke-width="1"/>
          <text x="${cx + 85}" y="${yHigh - 23}" font-size="14" font-weight="bold" fill="#2563eb" text-anchor="middle">${RIDGE_HIGH_H.toFixed(2)} m</text>

          <!-- Cota del traslape, con líneas de referencia a las dos cumbreras -->
          <line x1="${xTip}" y1="${yTip - 8}" x2="${xTip}" y2="${dimY + 6}" stroke="#93c5fd" stroke-width="0.9" stroke-dasharray="3 2"/>
          <line x1="${cx}" y1="${yHigh - 8}" x2="${cx}" y2="${dimY + 6}" stroke="#93c5fd" stroke-width="0.9" stroke-dasharray="3 2"/>
          <line x1="${xTip}" y1="${dimY}" x2="${cx}" y2="${dimY}" stroke="#2563eb" stroke-width="1.6"/>
          <line x1="${xTip}" y1="${dimY - 8}" x2="${xTip}" y2="${dimY + 8}" stroke="#2563eb" stroke-width="2"/>
          <line x1="${cx}" y1="${dimY - 8}" x2="${cx}" y2="${dimY + 8}" stroke="#2563eb" stroke-width="2"/>
          <rect x="${(xTip + cx) / 2 - 26}" y="${dimY - 30}" width="52" height="24" fill="#ffffff" rx="4" stroke="#2563eb" stroke-width="1.2"/>
          <text x="${(xTip + cx) / 2}" y="${dimY - 12}" font-size="14" font-weight="bold" fill="#2563eb" text-anchor="middle">${OVERLAP.toFixed(2)}</text>

          <!-- Cota de la abertura: se mide en el propio hueco, entre las dos cumbreras -->
          <line x1="${cx - 9}" y1="${yHigh}" x2="${cx - 9}" y2="${yLow}" stroke="#10b981" stroke-width="1.8"/>
          <line x1="${cx - 17}" y1="${yHigh}" x2="${cx - 1}" y2="${yHigh}" stroke="#10b981" stroke-width="2"/>
          <line x1="${cx - 17}" y1="${yLow}" x2="${cx - 1}" y2="${yLow}" stroke="#10b981" stroke-width="2"/>
          <rect x="${cx + 8}" y="${midVent - 12}" width="52" height="24" fill="#ffffff" rx="4" stroke="#10b981" stroke-width="1.2"/>
          <text x="${cx + 34}" y="${midVent + 6}" font-size="14" font-weight="bold" fill="#10b981" text-anchor="middle">${VENT_GAP.toFixed(2)}</text>

          <!-- Leyenda del detalle -->

        </svg>
      `;
    }

    // ==========================================
    // EXPORTACIÓN A PDF (DIRECTO CON jsPDF & CANVAS)
    // ==========================================
    // Ancho de la caja donde se dibuja el plano dentro del A4 (mm)
    const PDF_BOX = { x: 10, y: 24, w: 277, h: 168 };
    // Relación de aspecto de los planos (viewBox 920 x 440)
    const PLAN_ASPECT = PLAN_VIEWBOX_HEIGHT / 920;

    function fitPlanInBox(pdf, imgData, aspect = PLAN_ASPECT) {
      // Conserva la proporción de la imagen y la centra en la caja (evita deformación)
      let w = PDF_BOX.w;
      let h = w * aspect;
      if (h > PDF_BOX.h) {
        h = PDF_BOX.h;
        w = h / aspect;
      }
      const x = PDF_BOX.x + (PDF_BOX.w - w) / 2;
      const y = PDF_BOX.y + (PDF_BOX.h - h) / 2;
      pdf.addImage(imgData, 'JPEG', x, y, w, h);
    }

    async function addVectorPlanToPdf(pdf, svgElement) {
      if (typeof pdf.svg !== 'function') return false;
      const svg = svgElement.cloneNode(true);
      svg.setAttribute('width', '920');
      svg.setAttribute('height', String(PLAN_VIEWBOX_HEIGHT));
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = 'text{user-select:none;font-family:"Segoe UI",Arial,sans-serif;paint-order:stroke fill;stroke:#fff;stroke-width:1px;stroke-linejoin:round}.sheet-frame text{stroke:none}text[fill="#64748b"],text[fill="#475569"]{fill:#334155}';
      svg.insertBefore(style, svg.firstChild);

      let width = PDF_BOX.w;
      let height = width * PLAN_ASPECT;
      if (height > PDF_BOX.h) {
        height = PDF_BOX.h;
        width = height / PLAN_ASPECT;
      }
      await pdf.svg(svg, {
        x: PDF_BOX.x + (PDF_BOX.w - width) / 2,
        y: PDF_BOX.y + (PDF_BOX.h - height) / 2,
        width,
        height
      });
      return true;
    }

    async function addPlanGraphicToPdf(pdf, svgElement) {
      try {
        if (await addVectorPlanToPdf(pdf, svgElement)) return;
      } catch (error) {
        console.error('No se pudo convertir el SVG a vectores; se usará la exportación raster.', error);
      }
      const canvas = await svgToCanvas(svgElement.outerHTML, 2400);
      fitPlanInBox(pdf, canvas.toDataURL('image/jpeg', 0.95));
    }

    function svgToCanvas(svgString, width = 2400) {
      const height = Math.round(width * PLAN_ASPECT);
      return new Promise((resolve, reject) => {
        const img = new Image();
        // Fija el tamaño intrínseco del SVG para que el rasterizado sea exacto
        const sizedSvg = svgString.replace('<svg ', `<svg width="920" height="${PLAN_VIEWBOX_HEIGHT}" `);
        const svgBlob = new Blob([sizedSvg], { type: 'image/svg+xml;charset=utf-8' });
        const urlApi = window.URL || window.webkitURL;
        const blobURL = urlApi.createObjectURL(svgBlob);

        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          // Fondo blanco arquitectónico
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);

          // El canvas conserva la proporción del SVG, así que no hay distorsión
          ctx.drawImage(img, 0, 0, width, height);
          urlApi.revokeObjectURL(blobURL);
          resolve(canvas);
        };

        img.onerror = (e) => {
          urlApi.revokeObjectURL(blobURL);
          reject(e);
        };

        img.src = blobURL;
      });
    }

    async function downloadActiveSheetPDF() {
      const btn = document.getElementById('btn-download-pdf');
      const originalText = btn.innerHTML;
      btn.innerHTML = `<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><span>Generando PDF...</span>`;
      btn.disabled = true;

      try {
        if (currentTab === 'presupuesto') {
          downloadBudgetPDF();
          return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
          // Si jsPDF no estuviera disponible, recurre a impresión nativa
          window.print();
          showToast('Abriendo diálogo de impresión / Guardar PDF', true);
          return;
        }

        let imgData, imgAspect, svgElem = null;
        if (currentTab === '3d') {
          const c3 = document.getElementById('canvas3d');
          if (!c3) throw new Error('No hay vista 3D');
          imgData = c3.toDataURL('image/jpeg', 0.95);
          imgAspect = c3.height / c3.width;
        } else {
          const container = document.getElementById('svg-container');
          svgElem = container && container.querySelector('svg');
          if (!svgElem) throw new Error('No se encontró el plano activo');
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
        });

        // 297mm x 210mm (A4 Horizontal)
        // Membrete Superior
        pdf.setFillColor(15, 23, 42); // slate-900
        pdf.rect(10, 8, 277, 14, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(255, 255, 255);
        pdf.text('PLANO ARQUITECTÓNICO - GALPÓN AVÍCOLA CLIMA CÁLIDO', 14, 15);
        pdf.setFontSize(8.5);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Medidas: ${currentWidth.toFixed(2)} x ${currentLength.toFixed(2)} m (${(currentWidth * currentLength).toFixed(1)} m²) | Capacidad: ${Math.floor(currentWidth * currentLength * currentDensity)} gallinas`, 14, 19.5);

        pdf.setFont('helvetica', 'bold');
        pdf.text(`LÁMINA: ${currentTab === '3d' ? 'VISTA 3D · PERSPECTIVA' : (SHEET_TITLES[currentTab] || currentTab.toUpperCase())}`, 282, 17, { align: 'right' });

        // Plano Gráfico Central
        if (svgElem) await addPlanGraphicToPdf(pdf, svgElem);
        else fitPlanInBox(pdf, imgData, imgAspect);

        // Pie de Página Técnico
        pdf.setDrawColor(203, 213, 225);
        pdf.line(10, 196, 287, 196);
        pdf.setFontSize(7.5);
        pdf.setTextColor(71, 85, 105);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Especificaciones: Techo asimétrico desfasado | Ventilación ${VENT_GAP.toFixed(2)} m | Traslape ${OVERLAP.toFixed(2)} m | Puerta P-1 ${DOOR_W.toFixed(2)} x ${DOOR_H.toFixed(2)} m | Muro ${WALL_H.toFixed(2)} m | Piso +${FLOOR_H.toFixed(2)} m (1.0%)`, 14, 202);
        pdf.text('Cotas en metros (m) - Escala indicativa', 282, 202, { align: 'right' });

        const fileName = currentTab === '3d'
          ? `Vista3D_Galpon_${currentWidth.toFixed(1)}x${currentLength.toFixed(1)}m.pdf`
          : `Plano_Galpon_${currentTab}_${currentWidth.toFixed(1)}x${currentLength.toFixed(1)}m.pdf`;
        pdf.save(fileName);
        showToast(`¡PDF descargado: ${fileName}!`, true);
      } catch (err) {
        console.error('Error generando PDF:', err);
        // Fallback a impresión
        window.print();
        showToast('Abriendo ventana de impresión como PDF', true);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    async function downloadAllSheetsPDF() {
      const btn = document.getElementById('btn-download-all');
      const originalText = btn.innerHTML;
      btn.innerHTML = `<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><span>Compilando 3 láminas...</span>`;
      btn.disabled = true;

      try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
          window.print();
          showToast('jsPDF no disponible: abriendo diálogo de impresión', false);
          return;
        }

        const sheets = [
          { id: 'planta', title: SHEET_TITLES.planta, getSvg: getPlantaSVG },
          { id: 'frontal', title: SHEET_TITLES.frontal, getSvg: getFrontalSVG },
          { id: 'fachada', title: SHEET_TITLES.fachada, getSvg: getFachadaSVG }
        ];

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
        });

        for (let i = 0; i < sheets.length; i++) {
          const sheet = sheets[i];
          if (i > 0) pdf.addPage('a4', 'landscape');

          const sheetSvg = new DOMParser().parseFromString(decoratePlanSvg(sheet.getSvg(), sheet.id), 'image/svg+xml').documentElement;

          // Membrete Superior
          pdf.setFillColor(15, 23, 42);
          pdf.rect(10, 8, 277, 14, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(11);
          pdf.setTextColor(255, 255, 255);
          pdf.text(`PLANO ARQUITECTÓNICO - ${sheet.title}`, 14, 15);
          pdf.setFontSize(8.5);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`Galpón Avícola: ${currentWidth.toFixed(2)} x ${currentLength.toFixed(2)} m (${(currentWidth * currentLength).toFixed(1)} m²) | Capacidad: ${Math.floor(currentWidth * currentLength * currentDensity)} aves`, 14, 19.5);
          
          pdf.setFont('helvetica', 'bold');
          pdf.text(`LÁMINA ${i + 1} DE 3`, 282, 17, { align: 'right' });

          // Gráfico
          await addPlanGraphicToPdf(pdf, sheetSvg);

          // Pie de Página
          pdf.setDrawColor(203, 213, 225);
          pdf.line(10, 196, 287, 196);
          pdf.setFontSize(7.5);
          pdf.setTextColor(71, 85, 105);
          pdf.setFont('helvetica', 'normal');
          pdf.text('Diseño bioclimático para clima cálido | Ventilación Cenital Asimétrica | Puerta Estándar 1.00 x 2.10 m', 14, 202);
          pdf.text(`Lámina ${i + 1}/3 - Cotas en metros (m)`, 282, 202, { align: 'right' });
        }

        const fileName = `Juego_Completo_Galpon_${currentWidth.toFixed(1)}x${currentLength.toFixed(1)}m.pdf`;
        pdf.save(fileName);
        showToast(`¡Juego completo descargado (3 láminas)!`, true);
      } catch (err) {
        console.error('Error generando dossier completo:', err);
        window.print();
        showToast('Abriendo ventana de impresión como PDF', false);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    // ==========================================
    // PRESUPUESTO DE MATERIALES
    // ==========================================
    const BUDGET_STORE_KEY = 'galpon.presupuesto.v2';
    const LEGACY_BUDGET_STORE_KEY = 'galpon.presupuesto.v1';
    const BUDGET_GROUPS = [
      { id: 'cubierta', label: 'Cubierta de zinc' },
      { id: 'estructura', label: 'Estructura de pórticos' },
      { id: 'cerramientos', label: 'Cerramientos y puertas' },
      { id: 'piso', label: 'Piso y cimentación' },
      { id: 'equipo', label: 'Equipamiento avícola' },
      { id: 'aves', label: 'Aves' }
    ];

    // Precios de referencia (USD). Se pueden editar en pantalla y quedan guardados.
    const BUDGET_SEED = {
      zinc: 14.50,
      tubo100: 3.20,
      tubo150: 6.50,
      tubo50: 1.60,
      tubo60: 1.90,
      tuboPar: 2.40,
      tuboCorrea: 1.60,
      varilla: 1.50,
      malla: 3.40,
      bloque: 0.55,
      puerta: 110.00,
      cemento: 9.80,
      mortero: 9.80,
      arena: 22.00,
      grava: 26.00,
      mallaPiso: 2.20,
      tornilleria: 0.85,
      nido: 6.50,
      comedero: 13.00,
      niple: 1.30,
      tuberia: 0.95,
      aserrin: 20.00,
      tanque: 180.00,
      bombilla: 7.50,
      pollona: 4.90
    };

    function loadBudgetOverrides() {
      try {
        const raw = localStorage.getItem(BUDGET_STORE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved === 'object' && saved.prices && typeof saved.prices === 'object') {
          const quantities = { ...(saved.quantities || {}) };
          if (quantities.tuboPar === undefined && quantities.maderaPar !== undefined) quantities.tuboPar = quantities.maderaPar;
          if (quantities.tuboCorrea === undefined && quantities.maderaCorrea !== undefined) quantities.tuboCorrea = quantities.maderaCorrea;
          return {
            prices: saved.prices,
            specs: saved.specs || {},
            quantities,
            units: saved.units || {}
          };
        }
        const legacyRaw = localStorage.getItem(LEGACY_BUDGET_STORE_KEY);
        const legacy = legacyRaw ? JSON.parse(legacyRaw) : {};
        return { prices: legacy && typeof legacy === 'object' ? legacy : {}, specs: {}, quantities: {}, units: {} };
      } catch (error) {
        console.error('No se pudieron cargar las personalizaciones del presupuesto.', error);
        return { prices: {}, specs: {}, quantities: {}, units: {} };
      }
    }
    let BUDGET_OVERRIDES = loadBudgetOverrides();
    function saveBudgetOverrides() {
      try {
        localStorage.setItem(BUDGET_STORE_KEY, JSON.stringify(BUDGET_OVERRIDES));
        return true;
      } catch (error) {
        console.error('No se pudieron guardar las personalizaciones del presupuesto.', error);
        showToast('No se pudieron guardar los cambios del presupuesto en este navegador.', false);
        return false;
      }
    }
    function budgetPrice(id, seed) {
      const v = BUDGET_OVERRIDES.prices[id];
      return Number.isFinite(v) && v >= 0 ? v : seed;
    }
    function budgetOverrideValue(field, id, fallback) {
      const value = BUDGET_OVERRIDES[field][id];
      return value === undefined ? fallback : value;
    }

    function escapeBudgetText(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[char]);
    }

    function fmtMoney(n) {
      const v = Number.isFinite(n) ? n : 0;
      return '$' + v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fmtQty(q) {
      if (!Number.isFinite(q)) return '0';
      return q.toLocaleString('es-ES', { maximumFractionDigits: 3 });
    }

    function fmtInputNumber(value) {
      return Number.isFinite(value) ? String(value) : '0';
    }

    // Cantidades calculadas a partir de la misma geometría de planos y 3D
    function budgetModel() {
      const W = currentWidth, L = currentLength;
      const area = W * L;
      const birds = Math.floor(area * currentDensity);
      const bay = bayLayout(L);
      const geo = roofModel(W);
      const oL = EAVE_OVERHANG, oC = GABLE_OVERHANG;
      const nPor = bay.count + 1;
      const roofL = L + 2 * oC;

      // Cubierta: tiras de lámina a lo largo del galpón, 2 tramos por vertiente
      const runLow = W / 2 + oL;
      const runHigh = W + oL - geo.tipX;
      const lenLow = runLow * Math.hypot(1, geo.sLow);
      const lenHigh = runHigh * Math.hypot(1, geo.sHigh);
      const nRuns = Math.ceil(roofL / 0.90);
      const nSheets = nRuns * (Math.ceil(lenLow / 3.05) + Math.ceil(lenHigh / 3.05));

      const rafter = (r) => Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
      const ridgeExtension = Math.hypot(
        geo.tipX - geo.rafterHigh.x1,
        geo.yHigh(geo.tipX) - 0.06 - geo.rafterHigh.y1
      );
      const pares = nPor * (rafter(geo.rafterLow) + rafter(geo.rafterHigh) + ridgeExtension);
      const colH = geo.eave - 0.22 - FLOOR_H;
      const columnas = 2 * nPor * colH;
      const correas = 4 * roofL;
      const tuboAlero = 2 * roofL;
      const tuboCulata = 2 * (lenLow + lenHigh);
      const tuboLibre = roofL;
      const varilla = nPor * ((geo.tieX2 - geo.tieX1) + (geo.kingTop - geo.tieY)) + 2 * (W - 0.10);

      const TOP = FLOOR_H + WALL_H;
      const mallaLat = 2 * (geo.eave - TOP) * (L - 0.30);
      const mallaCulata = 2 * (
        ((geo.low - TOP) + (geo.eave - TOP)) / 2 * (W / 2) +
        ((geo.high - TOP) + (geo.eave - TOP)) / 2 * (W / 2)
      ) - DOOR_W * Math.max(0, FLOOR_H + DOOR_H - TOP);
      const malla = (mallaLat + mallaCulata + VENT_GAP * roofL) * 1.08;

      const perim = 2 * (W + L) - DOOR_W;
      const bloques = Math.ceil((perim * WALL_H / (BLOCK_LENGTH * BLOCK_COURSE_H)) * 1.05);
      const mortero = Math.ceil((perim * WALL_H) * 0.35);

      const vol = area * FLOOR_H;
      const cemento = Math.ceil(vol * 7);
      const arena = vol * 0.55;
      const grava = vol * 0.85;
      const mallaPiso = area * 1.08;

      const nidos = Math.ceil(birds / 5);
      const comederos = Math.max(2, Math.ceil(birds / 30));
      const niples = Math.max(4, Math.ceil(birds / 10));
      const lineas = 2 * Math.max(0, L - 0.8) + 6;
      const bombillas = Math.max(2, Math.round(L / 2));

      const L1 = (id, group, name, spec, unit, qty, price) => ({ id, group, name, spec, unit, qty: Math.max(0, qty), price });

      const lines = [
        L1('zinc', 'cubierta', 'Lámina de zinc calibre 26', `0.90 × 3.05 m · ${nRuns} tiras por vertiente · 2 tramos`, 'u', nSheets, BUDGET_SEED.zinc),

        L1('tubo100', 'estructura', 'Tubo cuadrado 100 × 100 × 2 mm', `Columnas de ${colH.toFixed(2)} m · 2 por pórtico`, 'm', columnas, BUDGET_SEED.tubo100),
        L1('tubo150', 'estructura', 'Tubo cuadrado 150 × 150 × 3 mm', 'Tubular de cumbrera corrido', 'm', roofL, BUDGET_SEED.tubo150),
        L1('tuboPar', 'estructura', 'Tubo rectangular 100 × 50 × 2 mm', `${nPor} pórticos · 2 pares y prolongación hasta el tubo de borde · supuesto conceptual`, 'm', pares, BUDGET_SEED.tuboPar),
        L1('tuboCorrea', 'estructura', 'Tubo cuadrado 50 × 50 × 2 mm para correas', '2 de alero + 1 intermedia por vertiente · supuesto conceptual', 'm', correas, BUDGET_SEED.tuboCorrea),
        L1('tubo50', 'estructura', 'Tubo cuadrado 50 × 50 × 2 mm', 'Bordes longitudinales de alero y faldones de ambas culatas', 'm', tuboAlero + tuboCulata, BUDGET_SEED.tubo50),
        L1('tubo60', 'estructura', 'Tubo cuadrado 60 × 60 × 2 mm', 'Borde libre de la lámina alta en cumbrera', 'm', tuboLibre, BUDGET_SEED.tubo60),
        L1('varilla', 'estructura', 'Varilla roscada 3/8"', 'Tensor alto y pendolón por pórtico + tensores de alero en culatas', 'm', varilla, BUDGET_SEED.varilla),

        L1('malla', 'cerramientos', 'Malla antipájaros 1" × 1" cal. 14', 'Laterales, culatas y abertura cenital (8% desperdicio)', 'm²', malla, BUDGET_SEED.malla),
        L1('bloque', 'cerramientos', 'Bloque de concreto 15 × 20 × 40 cm', `Muro de ${WALL_H.toFixed(2)} m · piezas superiores recortadas · 5% desperdicio`, 'u', bloques, BUDGET_SEED.bloque),
        L1('puerta', 'cerramientos', 'Puerta metálica P-1 con marco y malla', '1.00 × 2.10 m · culata frontal', 'u', 1, BUDGET_SEED.puerta),
        L1('tornilleria', 'cerramientos', 'Tornillería, clavos y sellos', 'Fijación de láminas, correas y malla', 'm²', area, BUDGET_SEED.tornilleria),

        L1('cemento', 'piso', 'Cemento gris 42.5 kg', `Losa de ${FLOOR_H.toFixed(2)} m · ${vol.toFixed(1)} m³ de concreto`, 'saco', cemento, BUDGET_SEED.cemento),
        L1('mortero', 'piso', 'Cemento para pega de bloque', `Muro de ${WALL_H.toFixed(2)} m de altura`, 'saco', mortero, BUDGET_SEED.mortero),
        L1('arena', 'piso', 'Arena lavada', 'Concreto de la losa', 'm³', arena, BUDGET_SEED.arena),
        L1('grava', 'piso', 'Piedra picada / grava', 'Concreto de la losa', 'm³', grava, BUDGET_SEED.grava),
        L1('mallaPiso', 'piso', 'Malla electrosoldada 6 mm', 'Refuerzo de la losa (8% traslape)', 'm²', mallaPiso, BUDGET_SEED.mallaPiso),

        L1('nido', 'equipo', 'Nidal con módulo de 2 niveles', '1 nido por cada 5 aves', 'u', nidos, BUDGET_SEED.nido),
        L1('comedero', 'equipo', 'Comedero tipo campana 30 kg', '1 por cada 30 aves', 'u', comederos, BUDGET_SEED.comedero),
        L1('niple', 'equipo', 'Bebedero de niple con copa', '1 por cada 10 aves', 'u', niples, BUDGET_SEED.niple),
        L1('tuberia', 'equipo', 'Tubería PE 1/2" para bebederos', '2 líneas + acometida', 'm', lineas, BUDGET_SEED.tuberia),
        L1('tanque', 'equipo', 'Tanque de agua 1.000 L con base', 'Elevado junto a la culata frontal', 'u', 1, BUDGET_SEED.tanque),
        L1('bombilla', 'equipo', 'Bombilla LED con cable y portalámpara', `1 cada 2 m de largo · ${bombillas} puntos`, 'u', bombillas, BUDGET_SEED.bombilla),
        L1('aserrin', 'equipo', 'Aserrín / viruta para cama', '6 cm de espesor sobre la losa', 'm³', area * 0.06, BUDGET_SEED.aserrin),

        L1('pollona', 'aves', 'Pollona ponedora 18 semanas', `Vacunada, sexada · ${birds} aves`, 'u', birds, BUDGET_SEED.pollona)
      ];

      const customizedLines = lines.map((item) => ({
        ...item,
        spec: budgetOverrideValue('specs', item.id, item.spec),
        qty: budgetOverrideValue('quantities', item.id, item.qty),
        unit: budgetOverrideValue('units', item.id, item.unit)
      }));
      return { birds, lines: customizedLines, area };
    }

    function budgetTotals(model) {
      const materials = model.lines.reduce((s, it) => s + budgetPrice(it.id, it.price) * it.qty, 0);
      const contingency = materials * 0.10;
      const total = materials + contingency;
      return {
        materials, contingency, total,
        perBird: model.birds > 0 ? total / model.birds : 0,
        birds: model.birds
      };
    }

    function renderBudgetTotals(model) {
      const el = document.getElementById('budget-totals');
      if (!el) return;
      const t = budgetTotals(model);
      el.innerHTML = `
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs text-slate-600"><span>Materiales e insumos (${model.lines.length} partidas)</span><b class="tabular-nums">${fmtMoney(t.materials)}</b></div>
          <div class="flex items-center justify-between text-xs text-slate-600"><span>Imprevistos (10%)</span><b class="tabular-nums">${fmtMoney(t.contingency)}</b></div>
          <div class="mt-1 flex items-center justify-between border-t border-slate-300 pt-2">
            <span class="text-sm font-bold text-slate-900">Total estimado</span>
            <span class="text-lg font-extrabold tabular-nums text-slate-900">${fmtMoney(t.total)}</span>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-[11px] text-slate-500">Costo por ave · ${t.birds} aves</span>
            <span class="text-[11px] font-semibold tabular-nums text-slate-600">${fmtMoney(t.perBird)} / ave</span>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <button onclick="downloadBudgetPDF()" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 active:scale-95">Descargar presupuesto PDF</button>
            <span class="text-[10px] text-slate-400">${STRUCTURE_CONCEPT_NOTE} No incluye cimentaciones independientes, anclajes, mano de obra, transporte ni permisos. Al cambiar una dimensión del material, revisa y ajusta la cantidad.</span>
          </div>
        </div>`;
    }

    function renderBudget() {
      const list = document.getElementById('budget-list');
      const sub = document.getElementById('budget-subtitle');
      if (!list) return;
      const model = budgetModel();
      const bay = bayLayout(currentLength);
      if (sub) {
        sub.textContent = `${currentWidth.toFixed(2)} × ${currentLength.toFixed(2)} m · ${(currentWidth * currentLength).toFixed(1)} m² · ${model.birds} aves`;
      }

      let html = `<div class="b-head"><span>Material · especificación / dimensiones</span><span class="text-right">Cantidad</span><span>Unidad</span><span class="text-right">P. unitario</span><span class="text-right">Subtotal</span></div>`;
      for (const g of BUDGET_GROUPS) {
        const items = model.lines.filter(l => l.group === g.id);
        if (!items.length) continue;
        const gTotal = items.reduce((s, it) => s + budgetPrice(it.id, it.price) * it.qty, 0);
        html += `<div class="b-group"><span>${g.label}</span><span class="bg-line"></span><span class="b-group-total" id="b-gt-${g.id}">${fmtMoney(gTotal)}</span></div>`;
        for (const it of items) {
          const p = budgetPrice(it.id, it.price);
          html += `<div class="b-row">
            <div class="b-main">
              <div class="b-name">${escapeBudgetText(it.name)}</div>
              <input class="b-spec-input" type="text" maxlength="120" value="${escapeBudgetText(it.spec)}"
                     onchange="setBudgetOverride('${it.id}', 'specs', this.value)"
                     aria-label="Especificación o dimensiones de ${escapeBudgetText(it.name)}">
            </div>
            <label class="b-qty" data-label="Cantidad">
              <input type="number" min="0" step="any" value="${fmtInputNumber(it.qty)}"
                     onchange="setBudgetOverride('${it.id}', 'quantities', this.value)"
                     aria-label="Cantidad de ${escapeBudgetText(it.name)}">
            </label>
            <label class="b-unit" data-label="Unidad">
              <input type="text" maxlength="16" value="${escapeBudgetText(it.unit)}"
                     onchange="setBudgetOverride('${it.id}', 'units', this.value)"
                     aria-label="Unidad de ${escapeBudgetText(it.name)}">
            </label>
            <label class="b-price" data-label="P. unitario"><span class="cur">$</span>
              <input type="number" min="0" step="0.01" inputmode="decimal" value="${p.toFixed(2)}"
                     onchange="setBudgetOverride('${it.id}', 'prices', this.value)"
                     aria-label="Precio unitario">
            </label>
            <div class="b-sub" data-label="Subtotal" id="b-sub-${it.id}">${fmtMoney(p * it.qty)}</div>
          </div>`;
        }
      }
      list.innerHTML = html;
      renderBudgetTotals(model);
    }

    function setBudgetOverride(id, field, raw) {
      const defaults = budgetModel().lines.find((item) => item.id === id);
      if (!defaults || !Object.prototype.hasOwnProperty.call(BUDGET_OVERRIDES, field)) return;
      let value;
      if (field === 'specs' || field === 'units') {
        value = String(raw).trim();
        if (!value || value.length > (field === 'specs' ? 120 : 16)) {
          showToast(field === 'specs' ? 'La especificación no puede estar vacía.' : 'La unidad no puede estar vacía.', false);
          renderBudget();
          return;
        }
      } else {
        value = Number(String(raw).replace(',', '.'));
        if (!Number.isFinite(value) || value < 0) {
          showToast('Introduce un valor numérico igual o mayor que cero.', false);
          renderBudget();
          return;
        }
      }
      BUDGET_OVERRIDES[field][id] = value;
      saveBudgetOverrides();
      refreshBudgetTotals();
    }

    function refreshBudgetTotals() {
      const model = budgetModel();
      for (const item of model.lines) {
        const cell = document.getElementById('b-sub-' + item.id);
        if (cell) cell.textContent = fmtMoney(budgetPrice(item.id, item.price) * item.qty);
      }
      for (const g of BUDGET_GROUPS) {
        const el = document.getElementById('b-gt-' + g.id);
        if (!el) continue;
        const sum = model.lines.filter(l => l.group === g.id).reduce((s, it) => s + budgetPrice(it.id, it.price) * it.qty, 0);
        el.textContent = fmtMoney(sum);
      }
      renderBudgetTotals(model);
    }

    function resetBudgetPrices() {
      BUDGET_OVERRIDES = { prices: {}, specs: {}, quantities: {}, units: {} };
      const saved = saveBudgetOverrides();
      renderBudget();
      if (saved) showToast('Especificaciones, cantidades, unidades y precios restablecidos', true);
    }

    function enterBudget() {
      const zg = document.getElementById('zoom-group');
      const sc = document.getElementById('scale-chip');
      const l2 = document.getElementById('legend-2d');
      const l3 = document.getElementById('legend-3d');
      const png = document.getElementById('btn-download-png');
      if (zg) zg.classList.add('hidden');
      if (sc) sc.classList.add('hidden');
      if (png) png.classList.add('hidden');
      if (l2) l2.style.display = 'none';
      if (l3) l3.style.display = 'none';
      renderBudget();
    }

    function downloadBudgetPDF() {
      const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDFCtor) { window.print(); showToast('Abriendo diálogo de impresión / Guardar PDF', true); return; }
      const pdf = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const model = budgetModel();
      const t = budgetTotals(model);
      const M = 14, R = 196;

      pdf.setFillColor(15, 23, 42);
      pdf.rect(M, 10, R - M, 17, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('GALPÓN AVÍCOLA · PRESUPUESTO DE MATERIALES', M + 4, 17.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(`${currentWidth.toFixed(2)} × ${currentLength.toFixed(2)} m (${(currentWidth * currentLength).toFixed(1)} m²) · ${model.birds} aves · ${currentDensity.toFixed(1)} aves/m² · ${bayLayout(currentLength).count + 1} pórticos`, M + 4, 23);

      let y = 33;
      pdf.setFontSize(7.2);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 116, 139);
      pdf.text('MATERIAL', M, y);
      pdf.text('ESPECIFICACIÓN', 84, y);
      pdf.text('CANT.', 150, y, { align: 'right' });
      pdf.text('P. UNIT.', 174, y, { align: 'right' });
      pdf.text('SUBTOTAL', R, y, { align: 'right' });
      y += 2;
      pdf.setDrawColor(203, 213, 225);
      pdf.line(M, y, R, y);
      y += 5;

      for (const g of BUDGET_GROUPS) {
        const items = model.lines.filter(l => l.group === g.id);
        if (!items.length) continue;
        if (y > 258) { pdf.addPage(); y = 18; }
        const gTotal = items.reduce((s, it) => s + budgetPrice(it.id, it.price) * it.qty, 0);
        pdf.setFillColor(241, 245, 249);
        pdf.rect(M, y - 4, R - M, 6, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(15, 23, 42);
        pdf.text(g.label.toUpperCase(), M + 2, y);
        pdf.text(fmtMoney(gTotal), R - 2, y, { align: 'right' });
        y += 6.5;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.2);
        for (const it of items) {
          const p = budgetPrice(it.id, it.price);
          const nameLines = pdf.splitTextToSize(it.name, 66);
          const specLines = pdf.splitTextToSize(it.spec, 52);
          const n = Math.max(nameLines.length, specLines.length, 1);
          const h = n * 3.3 + 2.6;
          if (y + h > 268) { pdf.addPage(); y = 18; }
          pdf.setTextColor(30, 41, 59);
          nameLines.forEach((ln, i) => pdf.text(ln, M, y + i * 3.3));
          pdf.setTextColor(100, 116, 139);
          specLines.forEach((ln, i) => pdf.text(ln, 84, y + i * 3.3));
          pdf.setTextColor(15, 23, 42);
          pdf.text(`${fmtQty(it.qty)} ${it.unit}`, 150, y, { align: 'right' });
          pdf.text(fmtMoney(p), 174, y, { align: 'right' });
          pdf.setFont('helvetica', 'bold');
          pdf.text(fmtMoney(p * it.qty), R, y, { align: 'right' });
          pdf.setFont('helvetica', 'normal');
          pdf.setDrawColor(241, 245, 249);
          pdf.line(M, y + h - 2.6, R, y + h - 2.6);
          y += h;
        }
      }

      if (y > 236) { pdf.addPage(); y = 18; }
      y += 4;
      pdf.setDrawColor(15, 23, 42);
      pdf.line(110, y, R, y);
      y += 6;
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(51, 65, 85);
      pdf.text('Materiales e insumos', 110, y);
      pdf.text(fmtMoney(t.materials), R, y, { align: 'right' });
      y += 5.5;
      pdf.text('Imprevistos (10%)', 110, y);
      pdf.text(fmtMoney(t.contingency), R, y, { align: 'right' });
      y += 7;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(15, 23, 42);
      pdf.text('TOTAL ESTIMADO', 110, y);
      pdf.text(fmtMoney(t.total), R, y, { align: 'right' });
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Costo por ave: ${fmtMoney(t.perBird)}`, R, y, { align: 'right' });

      pdf.setFontSize(6.6);
      pdf.text(pdf.splitTextToSize(
        `Estimación referencial en USD. ${STRUCTURE_CONCEPT_NOTE} No incluye cimentación, anclajes, mano de obra, transporte, instalaciones eléctricas ni permisos.`,
        R - M
      ), M, 283);

      const fileName = `Presupuesto_Galpon_${currentWidth.toFixed(1)}x${currentLength.toFixed(1)}m.pdf`;
      pdf.save(fileName);
      showToast(`Presupuesto descargado: ${fileName}`, true);
    }

    // ---- Exportar presupuesto a Excel (.xlsx) con fórmulas ----
    function downloadBudgetXLSX() {
      if (!window.XLSX) { showToast('No se pudo cargar el módulo de Excel', false); return; }
      const model = budgetModel();
      const t = budgetTotals(model);
      const rows = [];
      let r = 1; // fila de encabezado
      rows.push(['Partida', 'Especificación', 'Unidad', 'Cantidad', 'Precio USD', 'Subtotal USD']);
      const groups = new Map();
      for (const it of model.lines) {
        if (!groups.has(it.group)) groups.set(it.group, []);
        groups.get(it.group).push(it);
      }
      const GROUP_LABEL = { cubierta: 'CUBIERTA', estructura: 'ESTRUCTURA', cerramientos: 'MUROS Y CERRAMIENTOS', piso: 'PISO DE CONCRETO', equipo: 'EQUIPAMIENTO', aves: 'LA CAMADA' };
      const priceOf = (id, seed) => budgetPrice(id, seed);
      for (const [g, items] of groups) {
        rows.push([GROUP_LABEL[g] || g.toUpperCase(), '', '', '', '', '']);
        r++;
        for (const it of items) {
          const p = priceOf(it.id, it.price);
          const qty = it.qty;
          r++;
          // fila de datos con fórmula de subtotal (E=precio, D=cantidad)
          rows.push([
            it.name, it.spec, it.unit, qty,
            p, { f: `D${r}*E${r}`, v: +(qty * p).toFixed(2) }
          ]);
        }
      }
      const n = rows.length;
      rows.push(['', '', '', '', 'Materiales', { f: `SUM(F2:F${n})`, v: +t.materials.toFixed(2) }]);
      rows.push(['', '', '', '', 'Imprevistos 10%', { f: `F${n + 1}*0.1`, v: +t.contingency.toFixed(2) }]);
      rows.push(['', '', '', '', 'TOTAL', { f: `F${n + 1}+F${n + 2}`, v: +t.total.toFixed(2) }]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 38 }, { wch: 46 }, { wch: 7 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto');
      const meta = XLSX.utils.aoa_to_sheet([
        [`Galpón avícola techo asimétrico · ${currentWidth.toFixed(2)} × ${currentLength.toFixed(2)} m`],
        [`Área ${model.area.toFixed(1)} m² · ${model.birds} aves · generación ${new Date().toLocaleDateString('es')}`],
        [`Estimación referencial en USD. ${STRUCTURE_CONCEPT_NOTE} No incluye cimentación, anclajes, mano de obra, transporte, instalaciones eléctricas ni permisos.`]
      ]);
      XLSX.utils.book_append_sheet(wb, meta, 'Proyecto');
      const fileName = `Presupuesto_Galpon_${currentWidth.toFixed(1)}x${currentLength.toFixed(1)}m.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast(`Excel descargado: ${fileName}`, true);
    }

    // ==========================================
    // VISOR: ZOOM, PANEO Y ESCALA GRÁFICA
    // ==========================================
    const VIEW = { z: 1, x: 0, y: 0, min: 0.4, max: 6, rot: 0 };
    const SVG_ASPECT = PLAN_VIEWBOX_HEIGHT / 920;
    // En móvil el plano se muestra en vertical (girado 90°) llenando ancho y alto de la pantalla
    function isNarrowScreen() { return window.innerWidth <= 640; }
    VIEW.rot = isNarrowScreen() ? 90 : 0;

    function viewportEl() { return document.getElementById('plan-viewport'); }
    function stageEl() { return document.getElementById('plan-stage'); }

    function applyView() {
      const stage = stageEl();
      if (stage) stage.style.transform = `translate(${VIEW.x}px, ${VIEW.y}px) rotate(${VIEW.rot || 0}deg) scale(${VIEW.z})`;
      const label = document.getElementById('zoom-level');
      if (label) label.textContent = Math.round(VIEW.z * 100) + '%';
      updateScaleBar();
    }

    function zoomAt(factor, clientX, clientY) {
      const vp = viewportEl();
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const cx = (clientX == null) ? rect.width / 2 : clientX - rect.left;
      const cy = (clientY == null) ? rect.height / 2 : clientY - rect.top;
      const z2 = clamp(VIEW.z * factor, VIEW.min, VIEW.max);
      if (Math.abs(z2 - VIEW.z) < 0.0001) return;
      const k = z2 / VIEW.z;
      // Mantiene fijo el punto bajo el cursor
      VIEW.x = cx - (cx - VIEW.x) * k;
      VIEW.y = cy - (cy - VIEW.y) * k;
      VIEW.z = z2;
      applyView();
    }

    function zoomStep(dir) {
      if (currentTab === '3d') { zoom3D(dir > 0 ? 0.85 : 1.18); return; }
      zoomAt(dir > 0 ? 1.25 : 0.8);
    }

    function fitView() {
      if (currentTab === '3d') { set3DView('iso'); return; }
      const vp = viewportEl();
      const svg = vp && vp.querySelector('svg');
      if (!vp || !svg) return;
      // En móvil el visor ocupa desde su posición hasta el fondo de la pantalla
      if (isNarrowScreen()) {
        const topDoc = vp.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0);
        const h = Math.max(300, Math.round(window.innerHeight - topDoc));
        vp.style.height = h + 'px';
        vp.style.minHeight = h + 'px';
      } else {
        vp.style.height = '';
        vp.style.minHeight = '';
        vp.style.touchAction = '';
      }
      const rect = vp.getBoundingClientRect();
      const layoutW = (svg.clientWidth || (svg.getBoundingClientRect().width / VIEW.z)) || rect.width;
      if (!layoutW) return;
      const layoutH = layoutW * SVG_ASPECT;
      // En pantallas angostas el plano llena TODA la pantalla; en desktop escala 100%
      const narrow = rect.width < 700;
      let z;
      if (VIEW.rot === 90) {
        // Vertical: el plano girado llena el ANCHO de la pantalla y su altura completa
        // queda dentro de la página; el scroll llega hasta el final del plano
        z = Math.min(VIEW.max, rect.width / layoutH);
        VIEW.z = clamp(z, VIEW.min, VIEW.max);
        const sheetH = layoutW * VIEW.z;
        vp.style.height = Math.max(300, Math.round(sheetH)) + 'px';
        vp.style.minHeight = '';
        // Deslizar hacia abajo = scroll de la página (el plano ya está completo);
        // el pellizco sigue siendo zoom del plano
        vp.style.touchAction = 'pan-y';
        VIEW.x = rect.width / 2 + (layoutH * VIEW.z) / 2;
        VIEW.y = 0;
      } else if (narrow) {
        // Horizontal, cubre todo el visor (se recorre arrastrando)
        z = Math.min(VIEW.max, Math.max(rect.width / layoutW, rect.height / layoutH));
        VIEW.z = clamp(z, VIEW.min, VIEW.max);
        VIEW.x = (rect.width - layoutW * VIEW.z) / 2;
        VIEW.y = Math.max(0, (rect.height - layoutH * VIEW.z) / 2);
      } else {
        z = rect.height > 40 ? Math.min(1, rect.height / layoutH) : 1;
        VIEW.z = clamp(z, VIEW.min, 1);
        VIEW.x = Math.max(0, (rect.width - layoutW * VIEW.z) / 2);
        VIEW.y = Math.max(0, (rect.height - layoutH * VIEW.z) / 2);
      }
      applyView();
    }

    function updateScaleBar() {
      const vp = viewportEl();
      const svg = vp && vp.querySelector('svg');
      const bar = document.getElementById('scale-bar');
      const label = document.getElementById('scale-label');
      if (!svg || !bar || !label) return;
      const layoutW = svg.clientWidth || (svg.getBoundingClientRect().width / VIEW.z);
      if (!layoutW) return;
      const pxPerM = (layoutW / 920) * sheetPxPerM * VIEW.z;
      if (!isFinite(pxPerM) || pxPerM <= 0) return;
      const options = [0.5, 1, 2, 5, 10, 20, 50];
      const meters = options.find(v => v * pxPerM >= 70) || 50;
      bar.style.width = Math.round(meters * pxPerM) + 'px';
      label.textContent = String(meters).replace('.', ',') + ' m';
    }

    function toggleFullscreen() {
      const el = document.getElementById('viewer');
      if (!el) return;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
          el.requestFullscreen().then(() => {
            // En móvil, intenta girar a horizontal para que el plano se vea completo
            const so = screen.orientation;
            if (so && so.lock && window.matchMedia('(pointer: coarse)').matches) {
              so.lock('landscape').catch(() => {});
            }
            setTimeout(fitView, 220);
          }).catch(() => showToast('Pantalla completa no disponible', false));
        }
      } else if (document.exitFullscreen) {
        const so = screen.orientation;
        if (so && so.unlock) { try { so.unlock(); } catch (_) {} }
        document.exitFullscreen();
      }
    }

    function downloadActiveSheetSVG() {
      const svg = document.querySelector('#svg-container svg');
      if (!svg) {
        showToast('Selecciona una lámina 2D para descargar en SVG', false);
        return;
      }
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', '920');
      clone.setAttribute('height', String(PLAN_VIEWBOX_HEIGHT));
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = 'text{user-select:none;font-family:"Segoe UI",Arial,sans-serif;paint-order:stroke fill;stroke:#fff;stroke-width:1px;stroke-linejoin:round}.sheet-frame text{stroke:none}text[fill="#64748b"],text[fill="#475569"]{fill:#334155}';
      clone.insertBefore(style, clone.firstChild);

      const source = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Plano_Galpon_${currentTab}_${currentWidth.toFixed(1)}x${currentLength.toFixed(1)}m.svg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Plano vectorial SVG descargado', true);
    }

    async function downloadActiveSheetPNG() {
      if (currentTab === 'presupuesto') {
        showToast('El presupuesto se descarga en PDF', false);
        return;
      }

      const btn = document.getElementById('btn-download-png');
      const original = btn.innerHTML;
      btn.disabled = true;
      try {
        let dataUrl, name;
        if (currentTab === '3d') {
          const c3 = document.getElementById('canvas3d');
          if (!c3) throw new Error('Sin vista 3D');
          dataUrl = c3.toDataURL('image/png');
          name = `Vista3D_${currentWidth.toFixed(1)}x${currentLength.toFixed(1)}m.png`;
        } else {
          const svg = document.querySelector('#svg-container svg');
          if (!svg) throw new Error('Sin lámina activa');
          const canvas = await svgToCanvas(svg.outerHTML, 2400);
          dataUrl = canvas.toDataURL('image/png');
          name = `Plano_${currentTab}_${currentWidth.toFixed(1)}x${currentLength.toFixed(1)}m.png`;
        }
        const link = document.createElement('a');
        link.download = name;
        link.href = dataUrl;
        link.click();
        showToast(currentTab === '3d' ? 'Vista 3D descargada en PNG' : 'Lámina descargada en PNG', true);
      } catch (err) {
        console.error('Error generando PNG:', err);
        showToast('No se pudo generar el PNG', false);
      } finally {
        btn.innerHTML = original;
        btn.disabled = false;
      }
    }

    function initViewer() {
      const vp = viewportEl();
      if (!vp) return;
      let drag = null;
      const active = new Map();
      let pinch = null;
      let lastTap = 0;

      vp.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
      }, { passive: false });

      vp.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        active.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (vp.setPointerCapture) {
          try { vp.setPointerCapture(e.pointerId); } catch (_) {}
        }
        if (active.size === 1) {
          drag = { x: e.clientX, y: e.clientY, ox: VIEW.x, oy: VIEW.y };
          vp.classList.add('dragging');
        } else if (active.size === 2) {
          const [a, b] = [...active.values()];
          pinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
          drag = null;
          vp.classList.remove('dragging');
        }
      });

      vp.addEventListener('pointermove', (e) => {
        if (!active.has(e.pointerId)) return;
        active.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pinch && active.size >= 2) {
          const [a, b] = [...active.values()];
          const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
          if (Math.abs(d - pinch.dist) > 0.4) {
            zoomAt(d / pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
            pinch.dist = d;
          }
          return;
        }

        if (!drag) return;
        VIEW.x = drag.ox + (e.clientX - drag.x);
        VIEW.y = drag.oy + (e.clientY - drag.y);
        applyView();
      });

      const endDrag = (e) => {
        active.delete(e.pointerId);
        if (active.size < 2) pinch = null;
        if (active.size === 0) {
          // Doble toque en móvil: ajusta la lámina
          if (e.pointerType !== 'mouse') {
            const now = Date.now();
            if (now - lastTap < 320) { fitView(); lastTap = 0; } else { lastTap = now; }
          }
          drag = null;
          vp.classList.remove('dragging');
        }
        if (vp.releasePointerCapture) {
          try { vp.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      vp.addEventListener('pointerup', endDrag);
      vp.addEventListener('pointercancel', endDrag);
      vp.addEventListener('dblclick', (e) => { e.preventDefault(); fitView(); });

      document.addEventListener('fullscreenchange', () => setTimeout(fitView, 80));
      let resizeT = 0;
      window.addEventListener('resize', () => {
        updateScaleBar();
        clearTimeout(resizeT);
        resizeT = setTimeout(() => {
          const rot = isNarrowScreen() ? 90 : 0;
          if (VIEW.rot !== rot) { VIEW.rot = rot; VIEW.x = 0; VIEW.y = 0; VIEW.z = 1; }
          if (currentTab !== '3d' && currentTab !== 'presupuesto') fitView();
        }, 170);
      });

      document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName ? e.target.tagName : '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
        const tabs = ['planta', 'frontal', 'fachada', 'presupuesto', '3d'];
        if (e.key === '+' || e.key === '=') { zoomStep(1); e.preventDefault(); }
        else if (e.key === '-' || e.key === '_') { zoomStep(-1); e.preventDefault(); }
        else if (e.key === '0') { fitView(); e.preventDefault(); }
        else if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); e.preventDefault(); }
        else if (e.key >= '1' && e.key <= '7') { setTab(tabs[Number(e.key) - 1]); e.preventDefault(); }
      });

      // La pista desaparece al primer gesto (o a los 8 s)
      const dismissHint = () => {
        const hint = document.getElementById('view-hint');
        if (hint && !hint.dataset.done) {
          hint.dataset.done = '1';
          hint.style.opacity = '0';
          setTimeout(() => hint.remove(), 600);
        }
      };
      vp.addEventListener('wheel', dismissHint, { passive: true });
      vp.addEventListener('pointerdown', dismissHint);
      setTimeout(dismissHint, 8000);
    }

    // ==========================================
    // VISTA 3D: materiales, equipamiento y sol
    // ==========================================
    const CAM = { yaw: 2.75, pitch: 0.58, dist: 22, auto: false, center: null, drag: null };
    const SUN = { hour: 10, auto: false, speed: 2, last: 0 };
    const LAYERS = { roof: true, structure: true, walls: true, mesh: true, equipment: true, litter: true, floor: true };
    const KIND_LAYER = { wall: 'walls', door: 'walls', structure: 'structure', roof: 'roof', mesh: 'mesh', equip: 'equipment', litter: 'litter', floor: 'floor' };
    let scene3D = null;
    let raf3D = 0;
    let CINE_SHADOW = true;
    let meshPattern = null;
    let threeRenderer = null;
    let threeScene = null;
    let threeCamera = null;
    let threeRoot = null;
    let threeSun = null;
    let threeSky = null;
    let threeFallbackNotified = false;
    let threeUnavailable = false;
    let threeTextures = null;

    function v3sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function v3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function v3cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function v3norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
    function rgbStr(c) { return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`; }

    // ---- Modelo del galpón ----
    function build3D(W, L, birds) {
      const NPT = FLOOR_H;
      const TOP = NPT + WALL_H;
      const TH = 0.15;
      const T = 0.06;
      const oL = EAVE_OVERHANG;
      const oC = GABLE_OVERHANG;
      // Misma geometría que usan las láminas 2D
      const geo = roofModel(W);
      const EAVE = geo.eave, LOW = geo.low, HIGH = geo.high;
      const yLow = geo.yLow, yHigh = geo.yHigh;

      const faces = [];
      const grid = [];
      const shadowPts = [];
      const roofLines = [];
      const detailLines = [];
      const lamps = [];
      const quad = (pts, color, alpha = 1, kind = null, lines = null) => faces.push({ pts, color: hex2rgb(color), alpha, kind, lines });

      function box(x0, x1, y0, y1, z0, z1, color, kind) {
        quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], color, 1, kind);
        quad([[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], color, 1, kind);
        quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], color, 1, kind);
        quad([[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]], color, 1, kind);
        quad([[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], color, 1, kind);
        quad([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], color, 1, kind);
      }

      function beam(p1, p2, w, color, kind, height = w) {
        const dir = v3norm(v3sub(p2, p1));
        let ref = [0, 1, 0];
        if (Math.abs(v3dot(dir, ref)) > 0.94) ref = [1, 0, 0];
        const side = v3norm(v3cross(dir, ref));
        const up = v3norm(v3cross(side, dir));
        const halfWidth = w / 2;
        const halfHeight = height / 2;
        const corners = (p) => [
          [p[0] + side[0] * halfWidth - up[0] * halfHeight, p[1] + side[1] * halfWidth - up[1] * halfHeight, p[2] + side[2] * halfWidth - up[2] * halfHeight],
          [p[0] + side[0] * halfWidth + up[0] * halfHeight, p[1] + side[1] * halfWidth + up[1] * halfHeight, p[2] + side[2] * halfWidth + up[2] * halfHeight],
          [p[0] - side[0] * halfWidth + up[0] * halfHeight, p[1] - side[1] * halfWidth + up[1] * halfHeight, p[2] - side[2] * halfWidth + up[2] * halfHeight],
          [p[0] - side[0] * halfWidth - up[0] * halfHeight, p[1] - side[1] * halfWidth - up[1] * halfHeight, p[2] - side[2] * halfWidth - up[2] * halfHeight]
        ];
        const a = corners(p1);
        const b = corners(p2);
        for (let i = 0; i < 4; i++) {
          const i2 = (i + 1) % 4;
          let lines = null;
          if (i === 1) {
            lines = [{
              a: [(a[1][0] + a[2][0]) / 2, (a[1][1] + a[2][1]) / 2, (a[1][2] + a[2][2]) / 2],
              b: [(b[1][0] + b[2][0]) / 2, (b[1][1] + b[2][1]) / 2, (b[1][2] + b[2][2]) / 2],
              color: 'rgba(20,30,40,0.35)'
            }];
          }
          quad([a[i], a[i2], b[i2], b[i]], color, 1, kind, lines);
        }
        quad([a[0], a[1], a[2], a[3]], color, 1, kind);
        quad([b[3], b[2], b[1], b[0]], color, 1, kind);
      }

      function frustum(cx, cz, rBot, rTop, yBot, h, color, kind) {
        const b = [[cx - rBot, yBot, cz - rBot], [cx + rBot, yBot, cz - rBot], [cx + rBot, yBot, cz + rBot], [cx - rBot, yBot, cz + rBot]];
        const t = [[cx - rTop, yBot + h, cz - rTop], [cx + rTop, yBot + h, cz - rTop], [cx + rTop, yBot + h, cz + rTop], [cx - rTop, yBot + h, cz + rTop]];
        for (let i = 0; i < 4; i++) quad([b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]], color, 1, kind);
        quad(t, color, 1, kind);
      }

      function cylinder(cx, cz, r, y0, y1, sides, color, kind) {
        const pts = [];
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
        }
        for (let i = 0; i < sides; i++) {
          const p = pts[i], q = pts[(i + 1) % sides];
          quad([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], color, 1, kind);
        }
        quad(pts.map(p => [p[0], y1, p[1]]), color, 1, kind);
      }

      // ---- Terreno de pasto ----
      const ground = [[-120, 0, -120], [W + 120, 0, -120], [W + 120, 0, L + 120], [-120, 0, L + 120]];
      for (let x = -12; x <= W + 12; x += 2) grid.push([[x, 0, -12], [x, 0, L + 12]]);
      for (let z = -12; z <= L + 12; z += 2) grid.push([[-12, 0, z], [W + 12, 0, z]]);

      // Briznas de pasto (brachiaria) en macollas de dos hojas
      const tufts = [];
      let semilla = 987654321;
      const rnd = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
      const grassTones = ['rgba(54,84,36,0.85)', 'rgba(84,118,48,0.9)', 'rgba(108,142,70,0.9)', 'rgba(128,158,86,0.85)'];
      // Densidad de pasto reducida para mejor rendimiento (menos trazos individuales)
      const tuftTries = Math.min(220, Math.round(180 * ((W + 40) * (L + 40)) / 2392));
      for (let i = 0; i < tuftTries; i++) {
        const x = -20 + rnd() * (W + 40);
        const z = -20 + rnd() * (L + 40);
        if (x > -2.2 && x < W + 4.5 && z > -3.5 && z < L + 2.2) continue;
        const h = 0.05 + rnd() * 0.17;
        const lean = (rnd() - 0.5) * 0.16;
        const tone = grassTones[Math.floor(rnd() * grassTones.length)];
        tufts.push({ a: [x, 0.004, z], b: [x + lean, h, z + (rnd() - 0.5) * 0.10], color: tone });
        tufts.push({ a: [x + 0.06, 0.004, z + 0.05], b: [x + 0.06 - lean * 0.8, h * 0.78, z + 0.05 + (rnd() - 0.5) * 0.10], color: tone });
      }
      // Manchas de pasto (más claro / más oscuro) para romper el color plano
      const grassPatches = [];
      for (let i = 0; i < 18; i++) {
        grassPatches.push({
          x: -24 + rnd() * (W + 48),
          z: -24 + rnd() * (L + 48),
          r: 2 + rnd() * 5,
          tone: rnd() < 0.55 ? 0 : 1,
          a: 0.10 + rnd() * 0.10
        });
      }

      // ---- Piso, cama de aserrín ----
      box(0, W, 0, NPT, 0, L, '#9aa0a6', 'floor');
      box(0.12, W - 0.12, NPT, NPT + 0.06, 0.12, L - 0.12, '#cbb083', 'litter');
      // Virutas de aserrín sobre la superficie
      const virutas = [];
      for (let i = 0; i < 100; i++) {
        const x = 0.25 + rnd() * (W - 0.5);
        const z = 0.25 + rnd() * (L - 0.5);
        const a = rnd() * Math.PI;
        const len = 0.05 + rnd() * 0.14;
        virutas.push({
          a: [x, NPT + 0.065, z],
          b: [x + Math.cos(a) * len, NPT + 0.065, z + Math.sin(a) * len],
          color: rnd() < 0.5 ? 'rgba(138,106,66,0.55)' : 'rgba(245,232,200,0.65)'
        });
      }
      quad([[0.12, NPT + 0.064, 0.12], [W - 0.12, NPT + 0.064, 0.12], [W - 0.12, NPT + 0.064, L - 0.12], [0.12, NPT + 0.064, L - 0.12]], '#cbb083', 1, 'litter', virutas);

      // ---- Muros de bloque 0.30 y puerta en la culata frontal ----
      const dx0 = W / 2 - DOOR_W / 2;
      const dx1 = W / 2 + DOOR_W / 2;
      // Un curso de bloque de 0.20 m y un remate superior recortado de 0.10 m.
      const wallPanel = (x0, x1, z0, z1) => {
        const firstCourseTop = NPT + Math.min(BLOCK_COURSE_H, WALL_H);
        box(x0, x1, NPT, firstCourseTop, z0, z1, '#a7acb2', 'wall');
        if (firstCourseTop < TOP) box(x0, x1, firstCourseTop, TOP, z0, z1, '#9aa0a6', 'wall');
      };
      wallPanel(0, dx0, L - TH, L);
      wallPanel(dx1, W, L - TH, L);
      wallPanel(dx0, dx1, L - TH, L);
      wallPanel(0, TH, 0, L);
      wallPanel(W - TH, W, 0, L);
      wallPanel(0, dx0, 0, TH);
      wallPanel(dx1, W, 0, TH);

      // Junta de mortero a media altura (hilada de bloque)
      const JY = NPT + Math.min(BLOCK_COURSE_H, WALL_H), JH = 0.018, JC = '#8b9197';
      quad([[-0.004, JY - JH, 0], [-0.004, JY - JH, L], [-0.004, JY + JH, L], [-0.004, JY + JH, 0]], JC, 1, 'wall');
      quad([[W + 0.004, JY - JH, L], [W + 0.004, JY - JH, 0], [W + 0.004, JY + JH, 0], [W + 0.004, JY + JH, L]], JC, 1, 'wall');
      quad([[0, JY - JH, L + 0.004], [W, JY - JH, L + 0.004], [W, JY + JH, L + 0.004], [0, JY + JH, L + 0.004]], JC, 1, 'wall');
      quad([[0, JY - JH, -0.004], [dx0, JY - JH, -0.004], [dx0, JY + JH, -0.004], [0, JY + JH, -0.004]], JC, 1, 'wall');
      quad([[dx1, JY - JH, -0.004], [W, JY - JH, -0.004], [W, JY + JH, -0.004], [dx1, JY + JH, -0.004]], JC, 1, 'wall');

      // ---- Columnas (un solo pie por línea, sin duplicados en esquinas) ----
      const nb = bayLayout(L).count;
      for (let i = 0; i <= nb; i++) {
        const z = (L * i) / nb;
        box(0, 0.10, NPT, EAVE - 0.22, z - 0.05, z + 0.05, '#4b5563', 'structure');
        box(W - 0.10, W, NPT, EAVE - 0.22, z - 0.05, z + 0.05, '#4b5563', 'structure');
      }

      // ---- Puerta metálica con marco ----
      box(dx0 + 0.05, dx1 - 0.05, NPT, NPT + DOOR_H, 0.03, 0.12, '#6b7a8f', 'door');
      beam([dx0, NPT, 0.075], [dx0, NPT + DOOR_H, 0.075], 0.06, '#4b5563', 'door');
      beam([dx1, NPT, 0.075], [dx1, NPT + DOOR_H, 0.075], 0.06, '#4b5563', 'door');
      beam([dx0, NPT + DOOR_H, 0.075], [dx1, NPT + DOOR_H, 0.075], 0.06, '#4b5563', 'door');
      // Soporte central de la puerta: tubo que baja del tubular de cumbrera al dintel (culata frontal)
      beam([W / 2, NPT + DOOR_H, 0.075], [W / 2, LOW - 0.11, 0.075], 0.05, '#4b5563', 'structure');
      // ---- Estructura de cubierta (idéntica a la del corte 2D) ----
      const STEEL = '#4b5563';
      // Un solo tubular de cumbrera, corrido en todo el largo
      beam([W / 2, LOW - 0.11, -oC], [W / 2, LOW - 0.11, L + oC], 0.15, STEEL, 'structure');
      // Correas de alero, justo encima de la línea de columnas (hasta el borde de la lámina)
      beam([0.05, EAVE - 0.16, -oC], [0.05, EAVE - 0.16, L + oC], 0.05, STEEL, 'structure');
      beam([W - 0.05, EAVE - 0.16, -oC], [W - 0.05, EAVE - 0.16, L + oC], 0.05, STEEL, 'structure');
      // Pares, tensor y pendolón en cada pórtico (uno por columna)
      for (let i = 0; i <= nb; i++) {
        const z = (L * i) / nb;
        beam([geo.rafterLow.x1, geo.rafterLow.y1, z], [geo.rafterLow.x2, geo.rafterLow.y2, z], 0.05, STEEL, 'structure', 0.10);
        beam([geo.tipX, geo.yHigh(geo.tipX) - 0.06, z], [geo.rafterHigh.x1, geo.rafterHigh.y1, z], 0.05, STEEL, 'structure', 0.10);
        beam([geo.rafterHigh.x1, geo.rafterHigh.y1, z], [geo.rafterHigh.x2, geo.rafterHigh.y2, z], 0.05, STEEL, 'structure', 0.10);
        // Tensor alto horizontal: toma el empuje de los pares y deja libre el paso
        beam([geo.tieX1, geo.tieY, z], [geo.tieX2, geo.tieY, z], 0.035, STEEL, 'structure');
        // Pendolón central: del tensor alto a la cara inferior de la lámina alta
        beam([W / 2, geo.tieY, z], [W / 2, geo.kingTop, z], 0.03, STEEL, 'structure');
        // Tensor de alero (rafter tie) solo en los pórticos de las culatas
        if (i === 0 || i === nb) {
          beam([0.05, EAVE - 0.16, z], [W - 0.05, EAVE - 0.16, z], 0.03, STEEL, 'structure');
        }
      }
      // Una sola correa intermedia por faldón
      for (const f of [0.5]) {
        const xl = 0.05 + f * (W / 2 - 0.05);
        const yl = yLow(xl) - 0.20;
        const xh = W - 0.05 - f * (W / 2 - 0.05);
        const yh = yHigh(xh) - 0.20;
        beam([xl, yl, -oC], [xl, yl, L + oC], 0.05, STEEL, 'structure');
        beam([xh, yh, -oC], [xh, yh, L + oC], 0.05, STEEL, 'structure');
      }
      // Tubulares de borde de alero: cruzan las puntas de los pares y llegan hasta el borde de la lámina
      beam([-oL + 0.05, yLow(-oL + 0.05) - 0.06, -oC], [-oL + 0.05, yLow(-oL + 0.05) - 0.06, L + oC], 0.05, STEEL, 'structure');
      beam([W + oL - 0.05, yHigh(W + oL - 0.05) - 0.06, -oC], [W + oL - 0.05, yHigh(W + oL - 0.05) - 0.06, L + oC], 0.05, STEEL, 'structure');

      // Tubos de borde de culata: recorren el alero de las fachadas frontal y trasera
      // y llegan hasta donde termina la lámina (cumbrera baja y borde del traslape).
      for (const zEnd of [-oC + 0.03, L + oC - 0.03]) {
        beam([-oL + 0.03, yLow(-oL + 0.03) - 0.09, zEnd], [W / 2, LOW - 0.09, zEnd], 0.05, STEEL, 'structure');
        beam([geo.tipX, geo.yHigh(geo.tipX) - 0.06, zEnd], [W + oL - 0.03, yHigh(W + oL - 0.03) - 0.06, zEnd], 0.05, STEEL, 'structure');
      }

      // Tubo a lo largo bajo el borde libre de la lámina alta (cumbrera desfasada)
      // Llega hasta donde termina la chapa que sobresale, igual que los tubos de alero.
      beam([geo.tipX, geo.yHigh(geo.tipX) - 0.06, -oC], [geo.tipX, geo.yHigh(geo.tipX) - 0.06, L + oC], 0.06, STEEL, 'structure');

      // ---- Techo de láminas de zinc ----
      const ZINC_TOP = '#9aa5af';
      const ZINC_BOTTOM = '#5f6a74';
      function tint(hex, k) {
        return '#' + hex2rgb(hex).map(v => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join('');
      }
      function plate(x1, y1, x2, y2) {
        const z1 = -oC, z2 = L + oC;
        const seg = 1.2; // paños de lámina, con tono ligeramente distinto cada uno
        for (let z = z1; z < z2 - 1e-6; z += seg) {
          const za = z, zb = Math.min(z2, z + seg);
          const k = 0.94 + rnd() * 0.12;
          const top = tint(ZINC_TOP, k);
          const bot = tint(ZINC_BOTTOM, k);
          quad([[x1, y1, za], [x2, y2, za], [x2, y2, zb], [x1, y1, zb]], top, 1, 'roof');
          quad([[x1, y1 - T, zb], [x2, y2 - T, zb], [x2, y2 - T, za], [x1, y1 - T, za]], bot, 1, 'roof');
        }
        quad([[x1, y1 - T, z1], [x2, y2 - T, z1], [x2, y2, z1], [x1, y1, z1]], ZINC_BOTTOM, 1, 'roof');
        quad([[x2, y2 - T, z2], [x1, y1 - T, z2], [x1, y1, z2], [x2, y2, z2]], ZINC_BOTTOM, 1, 'roof');
        quad([[x1, y1 - T, z1], [x1, y1 - T, z2], [x1, y1, z2], [x1, y1, z1]], ZINC_BOTTOM, 1, 'roof');
        quad([[x2, y2 - T, z2], [x2, y2 - T, z1], [x2, y2, z1], [x2, y2, z2]], ZINC_BOTTOM, 1, 'roof');
      }
      const xTip = geo.tipX;
      const yTip = geo.tipY;
      plate(-oL, yLow(-oL), W / 2, LOW);
      plate(xTip, yTip, W + oL, yHigh(W + oL));

      // El traslape de 0.40 m del faldón alto protege la abertura de la lluvia;
      // el tubo de borde corrido (estructura) mantiene fija la lámina que sobresale.
      // Canales de las láminas (nervios cada 0.25 m y juntas de lámina cada 1 m)
      for (let z = -oC + 0.125; z < L + oC; z += 0.25) {
        roofLines.push({ a: [-oL + 0.02, yLow(-oL + 0.02) + 0.012, z], b: [W / 2, LOW + 0.012, z] });
        roofLines.push({ a: [xTip, yTip + 0.012, z], b: [W + oL - 0.02, yHigh(W + oL - 0.02) + 0.012, z] });
      }
      for (let z = -oC + 1; z < L + oC; z += 1) {
        roofLines.push({ a: [-oL + 0.02, yLow(-oL + 0.02) + 0.014, z], b: [W / 2, LOW + 0.014, z], strong: true });
        roofLines.push({ a: [xTip, yTip + 0.014, z], b: [W + oL - 0.02, yHigh(W + oL - 0.02) + 0.014, z], strong: true });
      }

      // ---- Malla metálica (muros y cumbrera) ----
      const MZ = 0.03;
      const MESH = '#9aa4ae';
      const meshQuad = (pts) => quad(pts, MESH, 0.25, 'mesh');
      meshQuad([[0, TOP, TH + MZ], [W, TOP, TH + MZ], [W, EAVE, TH + MZ], [0, EAVE, TH + MZ]]);
      meshQuad([[0, TOP, L - TH - MZ], [W, TOP, L - TH - MZ], [W, EAVE, L - TH - MZ], [0, EAVE, L - TH - MZ]]);
      meshQuad([[TH + MZ, TOP, L - TH], [TH + MZ, TOP, TH], [TH + MZ, EAVE, TH], [TH + MZ, EAVE, L - TH]]);
      meshQuad([[W - TH - MZ, TOP, TH], [W - TH - MZ, TOP, L - TH], [W - TH - MZ, EAVE, L - TH], [W - TH - MZ, EAVE, TH]]);
      meshQuad([[dx0, NPT + DOOR_H, TH + MZ], [dx1, NPT + DOOR_H, TH + MZ], [dx1, EAVE, TH + MZ], [dx0, EAVE, TH + MZ]]);
      meshQuad([[0, TOP, TH + MZ], [dx0, TOP, TH + MZ], [dx0, EAVE, TH + MZ], [0, EAVE, TH + MZ]]);
      meshQuad([[dx1, TOP, TH + MZ], [W, TOP, TH + MZ], [W, EAVE, TH + MZ], [dx1, EAVE, TH + MZ]]);
      meshQuad([[0, EAVE, TH + MZ], [W / 2, LOW, TH + MZ], [W / 2, EAVE, TH + MZ]]);
      meshQuad([[W / 2, EAVE, TH + MZ], [W / 2, HIGH, TH + MZ], [W, EAVE, TH + MZ]]);
      meshQuad([[0, EAVE, L - TH - MZ], [W / 2, LOW, L - TH - MZ], [W / 2, EAVE, L - TH - MZ]]);
      meshQuad([[W / 2, EAVE, L - TH - MZ], [W / 2, HIGH, L - TH - MZ], [W, EAVE, L - TH - MZ]]);
      // Cumbrera
      meshQuad([[W / 2, LOW, -oC], [W / 2, HIGH, -oC], [W / 2, HIGH, L + oC], [W / 2, LOW, L + oC]]);

      // ---- Equipamiento ----
      const EQ = '#a8501f';
      // Nidos: 1 por cada 5 gallinas, en dos niveles contra el muro norte
      const nNests = Math.ceil(birds / 5);
      const perLevel = Math.ceil(nNests / 2);
      const bankLen = Math.min(L - 1.0, perLevel * 0.30);
      box(0.18, 0.56, NPT + 0.55, NPT + 0.95, 0.5, 0.5 + bankLen, '#8a6a45', 'equip');
      box(0.18, 0.56, NPT + 1.05, NPT + 1.45, 0.5, 0.5 + bankLen, '#8a6a45', 'equip');
      for (const y0 of [NPT + 0.55, NPT + 1.05]) {
        for (let z = 0.8; z < 0.5 + bankLen; z += 0.60) {
          detailLines.push({ a: [0.575, y0 + 0.04, z], b: [0.575, y0 + 0.36, z], color: 'rgba(60,40,25,0.55)' });
        }
      }

      // Comederos tipo campana: 1 por cada 30 aves
      const nFeed = Math.max(2, Math.ceil(birds / 30));
      const feedRows = [W * 0.28, W * 0.72];
      const perRow = Math.ceil(nFeed / 2);
      for (const fx of feedRows) {
        for (let i = 0; i < perRow; i++) {
          const t = perRow > 1 ? i / (perRow - 1) : 0.5;
          const z = 1.4 + (L - 2.8) * t;
          frustum(fx, z, 0.28, 0.16, 0.72, 0.34, EQ, 'equip');
        }
      }

      // Bebederos: líneas de niples con recuperador, 1 por cada 10 aves
      const nNip = Math.max(4, Math.ceil(birds / 10));
      const drinkRows = [W * 0.38, W * 0.62];
      for (const dx of drinkRows) {
        beam([dx, 0.95, 0.4], [dx, 0.95, L - 0.4], 0.05, '#9aa3ad', 'equip');
        const cups = Math.min(16, Math.ceil(nNip / 4));
        for (let i = 0; i < cups; i++) {
          const z = 0.8 + ((L - 1.6) * i) / Math.max(1, cups - 1);
          box(dx - 0.06, dx + 0.06, 0.80, 0.88, z - 0.06, z + 0.06, '#64748b', 'equip');
        }
      }

      // ---- Gallinas: muestra representativa escalada con el área y la densidad ----
      const HEN = ['#f2ecdf', '#e6d7b8', '#c98b52', '#9c6440', '#efe4cd'];
      const nHens = Math.min(30, Math.max(8, Math.round(birds / 8)));
      const henAt = (hx, hz) => {
        if (hx < 0.75 || hx > W - 0.75 || hz < 0.7 || hz > L - 0.7) return;
        const ry = rnd() * Math.PI * 2;
        const c = Math.cos(ry), s = Math.sin(ry);
        const base = NPT + 0.065;
        const P = (lx, ly, lz) => [hx + lx * c - lz * s, base + ly, hz + lx * s + lz * c];
        const col = HEN[Math.floor(rnd() * HEN.length)];
        const A = P(-0.075, 0.05, -0.13), B = P(0.075, 0.05, -0.13);
        const C = P(0.075, 0.05, 0.12), D = P(-0.075, 0.05, 0.12);
        const E = P(-0.075, 0.23, -0.13), F = P(0.075, 0.23, -0.13);
        const G = P(0.075, 0.23, 0.12), H = P(-0.075, 0.23, 0.12);
        quad([E, F, G, H], col, 1, 'equip');
        quad([D, C, G, H], col, 1, 'equip');
        quad([A, B, F, E], col, 1, 'equip');
        quad([B, C, G, F], col, 1, 'equip');
        quad([D, A, E, H], col, 1, 'equip');
        const h1 = P(-0.04, 0.23, 0.12), h2 = P(0.04, 0.23, 0.12), h3 = P(0.04, 0.23, 0.22), h4 = P(-0.04, 0.23, 0.22);
        const h5 = P(-0.04, 0.33, 0.12), h6 = P(0.04, 0.33, 0.12), h7 = P(0.04, 0.33, 0.22), h8 = P(-0.04, 0.33, 0.22);
        quad([h5, h6, h7, h8], col, 1, 'equip');
        quad([h4, h3, h7, h8], col, 1, 'equip');
        quad([h2, h3, h7, h6], col, 1, 'equip');
        quad([h1, h4, h8, h5], col, 1, 'equip');
        quad([P(0, 0.23, -0.13), P(-0.05, 0.34, -0.19), P(0.05, 0.34, -0.19)], col, 1, 'equip');
        quad([P(0, 0.33, 0.18), P(0, 0.35, 0.13), P(0, 0.35, 0.20)], '#c0392b', 1, 'equip');
      };
      let henPlaced = 0, henGuard = 0;
      while (henPlaced < nHens && henGuard++ < 500) {
        const hcx = 0.9 + rnd() * Math.max(0.1, W - 1.8);
        const hcz = 0.9 + rnd() * Math.max(0.1, L - 1.8);
        const k = 2 + Math.floor(rnd() * 4);
        for (let i = 0; i < k && henPlaced < nHens; i++) {
          const a = rnd() * Math.PI * 2, r = rnd() * 0.95;
          henAt(hcx + Math.cos(a) * r, hcz + Math.sin(a) * r);
          henPlaced++;
        }
      }

      // Bombillas colgando de la cumbrera
      const nLamp = Math.max(2, Math.round(L / 2));
      for (let i = 0; i < nLamp; i++) {
        const z = 1 + ((L - 2) * i) / Math.max(1, nLamp - 1);
        beam([W / 2, LOW - 0.05, z], [W / 2, 2.62, z], 0.02, '#475569', 'equip');
        box(W / 2 - 0.05, W / 2 + 0.05, 2.50, 2.62, z - 0.05, z + 0.05, '#fde68a', 'equip');
        lamps.push([W / 2, 2.56, z]);
      }

      // Tanque elevado junto a la esquina frontal
      const tx = W + 2.0, tz = -1.8;
      for (const sx of [-0.45, 0.45]) {
        for (const sz of [-0.45, 0.45]) {
          beam([tx + sx, 0, tz + sz], [tx + sx * 0.75, 2.35, tz + sz * 0.75], 0.08, '#6b7280', 'equip');
        }
      }
      box(tx - 0.55, tx + 0.55, 2.35, 2.42, tz - 0.55, tz + 0.55, '#6b7280', 'equip');
      cylinder(tx, tz, 0.55, 2.42, 3.55, 8, '#3b4c63', 'equip');
      cylinder(tx, tz, 0.10, 3.55, 3.62, 6, '#94a3b8', 'equip');
      // Tubería tanque → bebederos
      beam([tx, 2.45, tz], [tx, 1.05, tz], 0.06, '#9aa3ad', 'equip');
      beam([tx, 1.05, tz], [tx, 1.05, -0.4], 0.06, '#9aa3ad', 'equip');
      beam([tx, 1.05, -0.4], [W - 0.2, 1.05, -0.4], 0.06, '#9aa3ad', 'equip');
      beam([W - 0.2, 1.05, -0.4], [W - 0.2, 1.05, 0.4], 0.06, '#9aa3ad', 'equip');
      // Cabezal que alimenta las dos líneas de bebederos
      beam([W - 0.2, 1.05, 0.4], [W - 0.2, 0.95, 0.5], 0.05, '#9aa3ad', 'equip');
      beam([2.28, 0.95, 0.5], [W - 0.2, 0.95, 0.5], 0.05, '#9aa3ad', 'equip');

      // ---- Sombra ----
      const zs = [-oC, L + oC];
      for (const z of zs) {
        shadowPts.push([-oL, yLow(-oL), z], [W / 2, LOW, z], [xTip, yTip, z], [W + oL, yHigh(W + oL), z]);
        shadowPts.push([0, 0, z], [W, 0, z]);
      }
      shadowPts.push([tx - 0.6, 3.6, tz - 0.6], [tx + 0.6, 3.6, tz + 0.6]);

      return { faces, ground, grid, tufts, grassPatches, roofLines, detailLines, lamps, shadowPts, birds3D: nHens, center: [W / 2, 1.75, L / 2], size: [W, L] };
    }

    function rebuild3D() {
      const birds = Math.floor(currentWidth * currentLength * currentDensity);
      scene3D = build3D(currentWidth, currentLength, birds);
      scene3D.birdsTotal = birds;
      rebuildThreeScene();
      updateEquipInfo(birds);
    }

    function disposeThreeObject(object) {
      object.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
        }
      });
    }

    function addThreeLines(parent, lines, color, opacity = 1) {
      if (!lines.length) return;
      const positions = [];
      for (const line of lines) positions.push(...line[0], ...line[1]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
      parent.add(new THREE.LineSegments(geometry, material));
    }

    function makeCanvasTexture(width, height, paint, repeat = [1, 1]) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      paint(canvas.getContext('2d'), width, height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat[0], repeat[1]);
      return texture;
    }

    function createThreeTextures() {
      if (threeTextures) return threeTextures;
      let seed = 246813579;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      const roof = makeCanvasTexture(128, 512, (ctx, width, height) => {
        const base = ctx.createLinearGradient(0, 0, width, 0);
        base.addColorStop(0, '#596773');
        base.addColorStop(0.13, '#aeb9c1');
        base.addColorStop(0.28, '#d7dee2');
        base.addColorStop(0.44, '#89959e');
        base.addColorStop(0.62, '#c4cdd3');
        base.addColorStop(0.83, '#74818b');
        base.addColorStop(1, '#596773');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, width, height);

        for (let x = 0; x < width; x += 32) {
          const rib = ctx.createLinearGradient(x, 0, x + 32, 0);
          rib.addColorStop(0, 'rgba(27,39,48,0.22)');
          rib.addColorStop(0.20, 'rgba(245,249,250,0.28)');
          rib.addColorStop(0.43, 'rgba(255,255,255,0.36)');
          rib.addColorStop(0.72, 'rgba(31,44,55,0.12)');
          rib.addColorStop(1, 'rgba(25,36,45,0.22)');
          ctx.fillStyle = rib;
          ctx.fillRect(x, 0, 32, height);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(x + 9, 0, 1, height);
        }
        for (let i = 0; i < 520; i++) {
          const alpha = 0.025 + random() * 0.07;
          ctx.fillStyle = random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(25,35,42,${alpha})`;
          const y = Math.floor(random() * height);
          ctx.fillRect(0, y, width, 1);
        }
        for (const y of [2, height - 3]) {
          ctx.fillStyle = 'rgba(35,47,56,0.45)';
          ctx.fillRect(0, y, width, 2);
          ctx.fillStyle = 'rgba(239,244,246,0.35)';
          ctx.fillRect(0, y + 2, width, 1);
        }
      });

      const block = makeCanvasTexture(512, 192, (ctx, width, height) => {
        ctx.fillStyle = '#aaa9a1';
        ctx.fillRect(0, 0, width, height);
        for (let row = 0; row < 2; row++) {
          const y = row === 0 ? 0 : 128;
          const rowHeight = row === 0 ? 128 : 64;
          const offset = row * 128;
          for (let x = -offset; x < width; x += 256) {
            const shade = Math.floor(153 + random() * 30);
            ctx.fillStyle = `rgb(${shade},${shade},${shade - 5})`;
            ctx.fillRect(x + 3, y + 3, 250, rowHeight - 6);
            const face = ctx.createLinearGradient(x, y, x + 256, y + rowHeight);
            face.addColorStop(0, 'rgba(255,255,255,0.08)');
            face.addColorStop(1, 'rgba(35,35,30,0.08)');
            ctx.fillStyle = face;
            ctx.fillRect(x + 3, y + 3, 250, rowHeight - 6);
          }
        }
        ctx.strokeStyle = '#85877f';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(width, 0);
        ctx.moveTo(0, 128); ctx.lineTo(width, 128);
        ctx.moveTo(0, height - 1); ctx.lineTo(width, height - 1);
        for (let x = 0; x <= width; x += 256) {
          ctx.moveTo(x, 0); ctx.lineTo(x, 128);
          ctx.moveTo(x + 128, 128); ctx.lineTo(x + 128, height);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.strokeRect(4, 4, width - 8, height - 8);
      });

      const concrete = makeCanvasTexture(256, 256, (ctx, width, height) => {
        ctx.fillStyle = '#8b9093';
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < 3800; i++) {
          const shade = random() > 0.52 ? 255 : 25;
          const alpha = 0.015 + random() * 0.075;
          ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
          const r = 0.4 + random() * 1.8;
          ctx.fillRect(random() * width, random() * height, r, r);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let y = 12; y < height; y += 37) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y - 5);
          ctx.stroke();
        }
      });

      const wood = makeCanvasTexture(512, 128, (ctx, width, height) => {
        const base = ctx.createLinearGradient(0, 0, 0, height);
        base.addColorStop(0, '#56391f');
        base.addColorStop(0.22, '#9a7046');
        base.addColorStop(0.48, '#815a35');
        base.addColorStop(0.72, '#b08354');
        base.addColorStop(1, '#614326');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < 95; i++) {
          const y = random() * height;
          const sway = (random() - 0.5) * 16;
          ctx.strokeStyle = random() > 0.5 ? 'rgba(48,29,15,0.20)' : 'rgba(239,196,139,0.15)';
          ctx.lineWidth = 0.4 + random() * 1.3;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(width * 0.3, y + sway, width * 0.65, y - sway, width, y + sway * 0.3);
          ctx.stroke();
        }
        for (let i = 0; i < 8; i++) {
          const x = random() * width, y = random() * height;
          ctx.strokeStyle = 'rgba(48,30,17,0.24)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(x, y, 4 + random() * 7, 1.5 + random() * 3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      const bedding = makeCanvasTexture(256, 256, (ctx, width, height) => {
        ctx.fillStyle = '#b89a6c';
        ctx.fillRect(0, 0, width, height);
        const straw = ['#d3b783', '#e1c896', '#9d8055', '#c4a676', '#ead4a6'];
        for (let i = 0; i < 950; i++) {
          const x = random() * width, y = random() * height;
          ctx.strokeStyle = straw[Math.floor(random() * straw.length)];
          ctx.globalAlpha = 0.38 + random() * 0.48;
          ctx.lineWidth = 0.5 + random() * 1.3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 2 + random() * 15, y + (random() - 0.5) * 5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });

      const mesh = makeCanvasTexture(256, 256, (ctx, width, height) => {
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(42,54,64,0.78)';
        ctx.lineWidth = 2;
        for (let p = 0; p <= width; p += 26) {
          ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, height); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(width, p); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(226,232,236,0.5)';
        ctx.lineWidth = 1;
        for (let p = 4; p <= width; p += 26) {
          ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, height); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(width, p); ctx.stroke();
        }
      });

      const ground = makeCanvasTexture(256, 256, (ctx, width, height) => {
        ctx.fillStyle = '#71854d';
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < 2400; i++) {
          const x = random() * width, y = random() * height;
          const tone = random() > 0.52 ? '145,157,92' : '42,61,34';
          ctx.fillStyle = `rgba(${tone},${0.08 + random() * 0.22})`;
          ctx.beginPath();
          ctx.ellipse(x, y, 2 + random() * 7, 1 + random() * 3, random(), 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 300; i++) {
          const x = random() * width, y = random() * height;
          ctx.strokeStyle = random() > 0.5 ? 'rgba(176,184,111,0.28)' : 'rgba(36,54,30,0.24)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (random() - 0.5) * 3, y - 2 - random() * 6);
          ctx.stroke();
        }
      });

      const paintedSteel = makeCanvasTexture(256, 256, (ctx, width, height) => {
        const base = ctx.createLinearGradient(0, 0, width, 0);
        base.addColorStop(0, '#4b5660');
        base.addColorStop(0.35, '#87919a');
        base.addColorStop(0.62, '#626c75');
        base.addColorStop(1, '#3f4a54');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < 1800; i++) {
          ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(10,18,24,0.055)';
          ctx.fillRect(random() * width, random() * height, 1, 1 + random() * 5);
        }
      });

      const sky = makeCanvasTexture(4, 512, (ctx, width, height) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#78a9dc');
        gradient.addColorStop(0.48, '#c7def2');
        gradient.addColorStop(0.78, '#f2e7d4');
        gradient.addColorStop(1, '#d6c6a9');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      });

      threeTextures = { roof, block, concrete, wood, bedding, mesh, ground, paintedSteel, sky };
      return threeTextures;
    }

    function threeFaceUV(point, normal, kind, facePoints) {
      const ax = Math.abs(normal[0]), az = Math.abs(normal[2]);
      if (kind === 'roof') return [point[2] / 1.0, point[0] / 3.05];
      if (kind === 'wall' || kind === 'door' || kind === 'mesh') {
        if (kind === 'door') return ax > az ? [point[2] / 0.15, point[1] / 0.15] : [point[0] / 0.15, point[1] / 0.15];
        return ax > az ? [point[2] / 0.8, point[1] / 0.3] : [point[0] / 0.8, point[1] / 0.3];
      }
      if (kind === 'floor') return [point[0] / 0.8, point[2] / 0.8];
      if (kind === 'litter') return [point[0] / 0.6, point[2] / 0.6];

      const spans = [0, 1, 2].map((axis) => Math.max(...facePoints.map((vertex) => vertex[axis])) - Math.min(...facePoints.map((vertex) => vertex[axis])));
      const axes = [0, 1, 2].sort((a, b) => spans[b] - spans[a]);
      const values = [point[0], point[1], point[2]];
      return [values[axes[0]] / 0.6, values[axes[1]] / 0.12];
    }

    function rebuildThreeScene() {
      if (!threeScene || !scene3D || !window.THREE) return;
      if (threeRoot) {
        threeScene.remove(threeRoot);
        disposeThreeObject(threeRoot);
      }

      threeRoot = new THREE.Group();
      const textures = createThreeTextures();
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(480, 480),
        new THREE.MeshStandardMaterial({ map: textures.ground, color: 0xffffff, roughness: 1 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(currentWidth / 2, -0.015, currentLength / 2);
      textures.ground.repeat.set(120, 120);
      ground.receiveShadow = true;
      threeRoot.add(ground);

      const geometryByStyle = new Map();
      for (const face of scene3D.faces) {
        const key = `${face.kind || 'other'}:${face.alpha}:${face.color.join(',')}`;
        if (!geometryByStyle.has(key)) geometryByStyle.set(key, { kind: face.kind, alpha: face.alpha, color: face.color, positions: [], uvs: [] });
        const group = geometryByStyle.get(key);
        const normal = v3norm(v3cross(v3sub(face.pts[1], face.pts[0]), v3sub(face.pts[2], face.pts[0])));
        for (let i = 1; i < face.pts.length - 1; i++) {
          for (const point of [face.pts[0], face.pts[i], face.pts[i + 1]]) {
            group.positions.push(...point);
            group.uvs.push(...threeFaceUV(point, normal, group.kind, face.pts));
          }
        }
      }

      for (const group of geometryByStyle.values()) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(group.positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(group.uvs, 2));
        geometry.computeVertexNormals();
        const isMesh = group.kind === 'mesh';
        const isWood = group.kind === 'structure' && group.color[0] > 110 && group.color[0] > group.color[2] * 1.25;
        const isMetalFrame = group.kind === 'structure' && !isWood;
        const color = (Math.round(group.color[0]) << 16) | (Math.round(group.color[1]) << 8) | Math.round(group.color[2]);
        let map = null;
        if (group.kind === 'roof') map = textures.roof;
        else if (group.kind === 'wall') map = textures.block;
        else if (group.kind === 'floor') map = textures.concrete;
        else if (group.kind === 'litter') map = textures.bedding;
        else if (isWood) map = textures.wood;
        else if (isMesh) map = textures.mesh;
        else if (group.kind === 'door' || isMetalFrame) map = textures.paintedSteel;
        const bumpMap = group.kind === 'roof' || group.kind === 'wall' || group.kind === 'floor' || group.kind === 'litter' || isWood ? map : null;
        const material = new THREE.MeshStandardMaterial({
          map,
          bumpMap,
          bumpScale: group.kind === 'roof' ? 0.006 : isWood ? 0.012 : 0.009,
          color: isMesh ? 0xc7d1d8 : map ? 0xffffff : color,
          roughness: isMesh ? 0.83 : group.kind === 'roof' ? 0.42 : isWood ? 0.84 : isMetalFrame ? 0.58 : 0.92,
          metalness: group.kind === 'roof' ? 0.58 : isMetalFrame ? 0.42 : 0,
          side: THREE.DoubleSide,
          transparent: isMesh || group.alpha < 1,
          opacity: isMesh ? 0.38 : group.alpha,
          depthWrite: !(isMesh || group.alpha < 1)
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = !isMesh && group.alpha >= 1;
        mesh.receiveShadow = !isMesh;
        mesh.userData.layer = KIND_LAYER[group.kind] || null;
        mesh.userData.baseOpacity = material.opacity;
        threeRoot.add(mesh);
      }

      const gridLines = scene3D.grid.map((segment) => segment);
      addThreeLines(threeRoot, gridLines, 0x40513a, 0.13);
      addThreeLines(threeRoot, scene3D.tufts.map((t) => [t.a, t.b]), 0x55713d, 0.3);
      addThreeLines(threeRoot, scene3D.roofLines.map((line) => [line.a, line.b]), 0x364554, 0.18);
      addThreeLines(threeRoot, scene3D.detailLines.map((line) => [line.a, line.b]), 0x604c3e, 0.72);
      threeScene.add(threeRoot);
    }

    function ensureThreeRenderer(canvas) {
      if (!window.THREE || threeUnavailable) return false;
      if (!threeRenderer) {
        try {
          threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        } catch (error) {
          threeUnavailable = true;
          console.error('No se pudo inicializar el visor WebGL de Three.js.', error);
          return false;
        }
        threeRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
        threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        threeRenderer.toneMappingExposure = 1.1;
        threeRenderer.shadowMap.enabled = true;
        threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
        threeScene = new THREE.Scene();
        threeCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);
        threeSky = new THREE.HemisphereLight(0xe4f0ff, 0x596347, 1.15);
        threeScene.add(threeSky);
        threeScene.background = new THREE.Color(0xc7def2);
        threeSun = new THREE.DirectionalLight(0xffffff, 2.2);
        threeSun.castShadow = true;
        threeSun.shadow.mapSize.set(2048, 2048);
        threeSun.shadow.bias = -0.00015;
        threeSun.shadow.radius = 4;
        threeScene.add(threeSun);
        threeScene.add(threeSun.target);
        const sky = new THREE.Mesh(
          new THREE.SphereGeometry(350, 32, 24),
          new THREE.MeshBasicMaterial({ map: createThreeTextures().sky, side: THREE.BackSide, depthWrite: false })
        );
        sky.renderOrder = -1;
        threeScene.add(sky);
      }
      if (!threeRoot) rebuildThreeScene();
      return true;
    }

    function renderThree3D(canvas, forcedSize) {
      if (!ensureThreeRenderer(canvas) || !scene3D) return false;
      const pixelRatio = forcedSize ? 1 : Math.min(2, window.devicePixelRatio || 1);
      if (threeRenderer.getPixelRatio() !== pixelRatio) threeRenderer.setPixelRatio(pixelRatio);
      const width = forcedSize ? forcedSize[0] : canvas.clientWidth || 900;
      const height = forcedSize ? forcedSize[1] : canvas.clientHeight || 500;
      const size = threeRenderer.getSize(new THREE.Vector2());
      if (size.x !== width || size.y !== height) threeRenderer.setSize(width, height, false);

      const center = CAM.center || scene3D.center;
      const cosPitch = Math.cos(CAM.pitch);
      threeCamera.aspect = width / Math.max(1, height);
      threeCamera.position.set(
        center[0] + CAM.dist * cosPitch * Math.sin(CAM.yaw),
        center[1] + CAM.dist * Math.sin(CAM.pitch),
        center[2] + CAM.dist * cosPitch * Math.cos(CAM.yaw)
      );
      threeCamera.lookAt(center[0], center[1], center[2]);
      threeCamera.updateProjectionMatrix();

      const sun = sunVector(SUN.hour);
      const palette = skyPalette(sun.elDeg);
      const skyColor = new THREE.Color(
        (palette.top[0] + palette.bot[0]) / 510,
        (palette.top[1] + palette.bot[1]) / 510,
        (palette.top[2] + palette.bot[2]) / 510
      );
      threeScene.background = skyColor;
      threeScene.fog = new THREE.Fog(skyColor, Math.max(currentLength * 2, 36), Math.max(currentLength * 7, 130));
      const daylight = clamp((sun.elDeg + 6) / 18, 0, 1);
      threeSky.intensity = 0.38 + daylight * 1.0;
      threeSky.color.setRGB(0.65 + daylight * 0.25, 0.72 + daylight * 0.2, 1);
      threeSky.groundColor.setRGB(0.18 + daylight * 0.25, 0.2 + daylight * 0.22, 0.12 + daylight * 0.1);
      threeSun.intensity = daylight * 2.4;
      threeSun.position.set(
        center[0] + sun.S[0] * 50,
        center[1] + sun.S[1] * 50,
        center[2] + sun.S[2] * 50
      );
      threeSun.target.position.set(center[0], center[1], center[2]);
      const sky = threeScene.children.find((child) => child.isMesh && child.geometry.type === 'SphereGeometry');
      if (sky) sky.position.set(center[0], center[1], center[2]);
      threeSun.castShadow = CINE_SHADOW && sun.S[1] > 0.12 && daylight > 0.05;
      const shadowExtent = Math.max(currentWidth, currentLength) * 1.6 + 10;
      threeSun.shadow.camera.left = -shadowExtent;
      threeSun.shadow.camera.right = shadowExtent;
      threeSun.shadow.camera.top = shadowExtent;
      threeSun.shadow.camera.bottom = -shadowExtent;
      threeSun.shadow.camera.far = Math.max(currentWidth, currentLength) * 2.5 + 60;
      threeSun.shadow.camera.updateProjectionMatrix();

      threeRoot.traverse((child) => {
        if (child.isMesh && child.userData.layer) child.visible = !!LAYERS[child.userData.layer];
      });
      threeRenderer.render(threeScene, threeCamera);
      return true;
    }

    function fit3DDistance() {
      const half = 0.5 * Math.sqrt(currentWidth * currentWidth + currentLength * currentLength);
      return clamp(half / Math.tan((17 * Math.PI) / 180) * 1.12, 12, 150);
    }

    function updateEquipInfo(birds) {
      const el = document.getElementById('equip-info');
      if (!el) return;
      const nests = Math.ceil(birds / 5);
      const feed = Math.max(2, Math.ceil(birds / 30));
      const nip = Math.max(4, Math.ceil(birds / 10));
      const shown = scene3D && scene3D.birds3D ? scene3D.birds3D : 0;
      el.textContent = `${birds} aves · ${nests} nidos · ${feed} comederos · ${nip} niples${shown ? ` · ${shown} en escena` : ''}`;
    }

    // ---- Sol ----
    function sunVector(hour) {
      const H = ((hour - 12) * 15) * Math.PI / 180;
      const phi = 10 * Math.PI / 180;
      const el = Math.asin(Math.cos(phi) * Math.cos(H));
      const az = (90 + (hour - 6) * 15) * Math.PI / 180;
      return { el, elDeg: (el * 180) / Math.PI, S: [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)] };
    }

    function skyPalette(elDeg) {
      const night = { top: [9, 14, 28], bot: [24, 33, 50], ground: [26, 36, 26], grid: 0.07 };
      const dusk = { top: [246, 186, 140], bot: [253, 230, 190], ground: [96, 104, 66], grid: 0.12 };
      const day = { top: [183, 219, 255], bot: [243, 249, 255], ground: [116, 148, 78], grid: 0.15 };
      let a, b, t;
      if (elDeg >= 8) { a = day; b = day; t = 0; }
      else if (elDeg >= 0) { a = dusk; b = day; t = elDeg / 8; }
      else if (elDeg >= -12) { a = night; b = dusk; t = (elDeg + 12) / 12; }
      else { a = night; b = night; t = 0; }
      return {
        top: lerp3(a.top, b.top, t),
        bot: lerp3(a.bot, b.bot, t),
        ground: lerp3(a.ground, b.ground, t),
        gridAlpha: lerp(a.grid, b.grid, t)
      };
    }

    function convexHull(points) {
      const pts = points.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      if (pts.length < 3) return pts;
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lower = [];
      for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
      }
      const upper = [];
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
      }
      lower.pop();
      upper.pop();
      return lower.concat(upper);
    }

    function getMeshPattern(ctx) {
      if (meshPattern) return meshPattern;
      const c = document.createElement('canvas');
      c.width = c.height = 7;
      const g = c.getContext('2d');
      g.strokeStyle = 'rgba(71, 85, 105, 0.85)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, 0); g.lineTo(7, 7);
      g.moveTo(7, 0); g.lineTo(0, 7);
      g.stroke();
      meshPattern = ctx.createPattern(c, 'repeat');
      return meshPattern;
    }

    let grassPattern = null;
    function getGrassPattern(ctx) {
      if (grassPattern) return grassPattern;
      const c = document.createElement('canvas');
      c.width = c.height = 48;
      const g = c.getContext('2d');
      g.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        const x = (i * 37) % 48;
        const y = (i * 53) % 48;
        g.strokeStyle = i % 4 === 0 ? 'rgba(126, 156, 84, 0.30)' : 'rgba(42, 62, 26, 0.28)';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 1.5 + (i % 3), y - 2.5 - (i % 4));
        g.stroke();
      }
      grassPattern = ctx.createPattern(c, 'repeat');
      return grassPattern;
    }

    // ---- Render ----
    function render3DLegacy(targetCanvas, forcedSize) {
      const cv = targetCanvas || document.getElementById('canvas3d');
      if (!cv || !scene3D) return;
      if (!targetCanvas && currentTab !== '3d') return;
      const cssW = forcedSize ? forcedSize[0] : (cv.clientWidth || 900);
      const cssH = forcedSize ? forcedSize[1] : (cv.clientHeight || 500);
      // Resolución interna: al menos 2x para que la escena se vea nítida
      const dpr = forcedSize ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) {
        cv.width = Math.round(cssW * dpr);
        cv.height = Math.round(cssH * dpr);
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sun = sunVector(SUN.hour);
      const pal = skyPalette(sun.elDeg);
      const dayF = clamp((sun.elDeg + 6) / 18, 0, 1);

      const sky = ctx.createLinearGradient(0, 0, 0, cssH * 0.8);
      sky.addColorStop(0, rgbStr(pal.top));
      sky.addColorStop(0.55, rgbStr(lerp3(pal.top, pal.bot, 0.6)));
      sky.addColorStop(1, rgbStr(pal.bot));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cssW, cssH);

      // Nubes suaves (solo de día, se aclaran con el sol)
      if (dayF > 0.2) {
        for (let i = 0; i < 8; i++) {
          const cxp = ((i * 137 + 61) % 100) / 100 * cssW;
          const cyp = (0.06 + 0.26 * (((i * 71 + 23) % 100) / 100)) * cssH;
          const rx = 60 + (i % 4) * 34;
          const a = (0.10 + 0.16 * dayF) * (i % 3 === 0 ? 1.2 : 1);
          for (const off of [-0.55, 0, 0.6]) {
            const g = ctx.createRadialGradient(cxp + off * rx, cyp, 2, cxp + off * rx, cyp, rx * 0.8);
            g.addColorStop(0, `rgba(255,255,255,${a})`);
            g.addColorStop(0.6, `rgba(255,255,255,${a * 0.45})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(cxp + off * rx, cyp, rx * 0.8, rx * 0.26, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (dayF < 0.35) {
        ctx.fillStyle = `rgba(255,255,255,${(0.35 - dayF) * 2.2})`;
        for (let i = 0; i < 70; i++) {
          const sx = ((i * 97 + 31) % 100) / 100 * cssW;
          const sy = ((i * 53 + 11) % 55) / 100 * cssH;
          ctx.fillRect(sx, sy, 1.4, 1.4);
        }
      }

      const t = CAM.center || scene3D.center;
      const cp = Math.cos(CAM.pitch), sp = Math.sin(CAM.pitch);
      const eye = [t[0] + CAM.dist * cp * Math.sin(CAM.yaw),
                   t[1] + CAM.dist * sp,
                   t[2] + CAM.dist * cp * Math.cos(CAM.yaw)];
      const fwd = v3norm(v3sub(t, eye));
      const right = v3norm(v3cross(fwd, [0, 1, 0]));
      const up = v3cross(right, fwd);
      const f = (cssH / 2) / Math.tan((34 * Math.PI / 180) / 2);
      const cx = cssW / 2, cy = cssH * 0.44;
      const inside = eye[1] < 2.6;

      function proj(p) {
        const d = v3sub(p, eye);
        const z = v3dot(d, fwd);
        if (z <= 0.2) return null;
        return [cx + (v3dot(d, right) / z) * f, cy - (v3dot(d, up) / z) * f, z];
      }

      // Sol / luna
      const sunPos = proj([t[0] + sun.S[0] * 90, t[1] + sun.S[1] * 90, t[2] + sun.S[2] * 90]);
      if (sunPos && sun.elDeg > -3) {
        const warm = sun.elDeg < 10;
        const glow = ctx.createRadialGradient(sunPos[0], sunPos[1], 2, sunPos[0], sunPos[1], 46);
        glow.addColorStop(0, warm ? 'rgba(255,196,120,0.95)' : 'rgba(255,246,200,0.95)');
        glow.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sunPos[0], sunPos[1], 46, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = warm ? '#ffb86b' : '#fff3c4';
        ctx.beginPath();
        ctx.arc(sunPos[0], sunPos[1], 9, 0, Math.PI * 2);
        ctx.fill();
      } else if (sun.elDeg <= -3) {
        const moonPos = proj([t[0] - sun.S[0] * 90, t[1] - sun.S[1] * 90, t[2] - sun.S[2] * 90]);
        if (moonPos) {
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.arc(moonPos[0], moonPos[1], 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Transformación a espacio de cámara con recorte del plano cercano
      function toCam(p) {
        const d = v3sub(p, eye);
        return { x: v3dot(d, right), y: v3dot(d, up), z: v3dot(d, fwd) };
      }
      function clipNear(camPts) {
        const out = [];
        for (let i = 0; i < camPts.length; i++) {
          const a = camPts[i], b = camPts[(i + 1) % camPts.length];
          const ain = a.z >= 0.25, bin = b.z >= 0.25;
          if (ain) out.push(a);
          if (ain !== bin) {
            const k = (0.25 - a.z) / (b.z - a.z);
            out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: 0.25 });
          }
        }
        return out;
      }
      function screenPts(camPts) {
        return camPts.map(q => [cx + (q.x / q.z) * f, cy - (q.y / q.z) * f, q.z]);
      }
      function projectSeg(a3, b3) {
        const a = toCam(a3), b = toCam(b3);
        let ax = a.x, ay = a.y, az = a.z;
        let bx = b.x, by = b.y, bz = b.z;
        if (az < 0.25 && bz < 0.25) return null;
        if (az < 0.25) {
          const k = (0.25 - az) / (bz - az);
          ax += (bx - ax) * k; ay += (by - ay) * k; az = 0.25;
        } else if (bz < 0.25) {
          const k = (0.25 - bz) / (az - bz);
          bx += (ax - bx) * k; by += (ay - by) * k; bz = 0.25;
        }
        return [[cx + (ax / az) * f, cy - (ay / az) * f], [cx + (bx / bz) * f, cy - (by / bz) * f]];
      }

      // Terreno: degradado de perspectiva + manchas + textura de pasto
      const g2 = screenPts(clipNear(scene3D.ground.map(toCam)));
      if (g2.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(g2[0][0], g2[0][1]);
        for (let i = 1; i < g2.length; i++) ctx.lineTo(g2[i][0], g2[i][1]);
        ctx.closePath();
        const far = pal.ground.map(v => Math.min(255, v * 1.18));
        const near = pal.ground.map(v => v * 0.82);
        const gGrad = ctx.createLinearGradient(0, cssH * 0.34, 0, cssH);
        gGrad.addColorStop(0, rgbStr(far));
        gGrad.addColorStop(0.45, rgbStr(pal.ground));
        gGrad.addColorStop(1, rgbStr(near));
        ctx.fillStyle = gGrad;
        ctx.fill();

        ctx.save();
        ctx.clip();
        // Manchas de pasto ancladas al terreno
        for (const p of scene3D.grassPatches) {
          const c0 = proj([p.x, 0.012, p.z]);
          const c1 = proj([p.x + p.r, 0.012, p.z]);
          if (!c0 || !c1) continue;
          const rad = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
          if (!isFinite(rad) || rad < 4) continue;
          const tint = p.tone ? '92,126,58' : '52,80,34';
          const g = ctx.createRadialGradient(c0[0], c0[1], 1, c0[0], c0[1], rad);
          g.addColorStop(0, `rgba(${tint},${p.a})`);
          g.addColorStop(1, `rgba(${tint},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(c0[0], c0[1], rad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = getGrassPattern(ctx);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      ctx.strokeStyle = `rgba(60,80,40,${pal.gridAlpha})`;
      ctx.lineWidth = 1;
      for (const seg of scene3D.grid) {
        const s = projectSeg(seg[0], seg[1]);
        if (!s) continue;
        ctx.beginPath();
        ctx.moveTo(s[0][0], s[0][1]);
        ctx.lineTo(s[1][0], s[1][1]);
        ctx.stroke();
      }

      // Briznas de pasto
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      for (const t of scene3D.tufts) {
        const s = projectSeg(t.a, t.b);
        if (!s) continue;
        ctx.strokeStyle = t.color;
        ctx.beginPath();
        ctx.moveTo(s[0][0], s[0][1]);
        ctx.lineTo(s[1][0], s[1][1]);
        ctx.stroke();
      }

      // Bruma del horizonte
      const hz = proj([t[0] + Math.sin(CAM.yaw) * 800, 0, t[2] + Math.cos(CAM.yaw) * 800]);
      if (hz) {
        const cb = pal.bot;
        const g = ctx.createLinearGradient(0, hz[1] - 40, 0, hz[1] + 50);
        g.addColorStop(0, `rgba(${cb[0]},${cb[1]},${cb[2]},0)`);
        g.addColorStop(0.45, `rgba(${cb[0]},${cb[1]},${cb[2]},0.7)`);
        g.addColorStop(1, `rgba(${cb[0]},${cb[1]},${cb[2]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, hz[1] - 40, cssW, 90);
      }

      // Sombra
      if (sun.S[1] > 0.12 && dayF > 0.05 && CINE_SHADOW) {
        const sp2 = [];
        for (const p of scene3D.shadowPts) {
          const k = p[1] / sun.S[1];
          const q = proj([p[0] - sun.S[0] * k, 0.005, p[2] - sun.S[2] * k]);
          if (q) sp2.push([q[0], q[1]]);
        }
        const hull = convexHull(sp2);
        if (hull.length >= 3) {
          ctx.save();
          ctx.filter = 'blur(9px)';
          ctx.beginPath();
          ctx.moveTo(hull[0][0], hull[0][1]);
          for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i][0], hull[i][1]);
          ctx.closePath();
          ctx.fillStyle = `rgba(22,32,16,${0.12 + 0.16 * dayF})`;
          ctx.fill();
          ctx.restore();
        }
      }

      // Caras
      const baseItems = [];
      const items = [];
      const roofItems = [];
      const warm = sun.elDeg < 15;
      const sunTint = warm ? [1.0, 0.85, 0.68] : [1.0, 0.98, 0.94];
      for (const face of scene3D.faces) {
        if (face.kind && !LAYERS[KIND_LAYER[face.kind]]) continue;
        const clipped = clipNear(face.pts.map(toCam));
        if (clipped.length < 3) continue;
        const p2 = screenPts(clipped);
        let depth = 0;
        for (const q of clipped) depth += q.z;
        depth /= clipped.length;

        const a = face.pts[0], b = face.pts[1], c = face.pts[2];
        const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        let n = v3norm(v3cross(v3sub(b, a), v3sub(c, a)));
        if (v3dot(n, v3sub(eye, centroid)) < 0) n = [-n[0], -n[1], -n[2]];

        // Luz: ambiente de cielo azulado + sol (cálido al amanecer/atardecer)
        const diffuse = Math.max(0, v3dot(n, sun.S));
        const amb = 0.30 + 0.12 * dayF;
        const dif = dayF * (0.20 + 0.62 * diffuse);
        const ao = 0.68 + 0.32 * Math.min(1, centroid[1] / 4.4);
        const col = face.color;
        const rgb = [
          Math.min(255, col[0] * (amb * 0.82 + dif * sunTint[0]) * ao),
          Math.min(255, col[1] * (amb * 0.88 + dif * sunTint[1]) * ao),
          Math.min(255, col[2] * (amb * 0.98 + dif * sunTint[2]) * ao)
        ];
        const item = { p2, depth, fill: rgbStr(rgb), alpha: face.alpha, kind: face.kind, lines: face.lines };
        if (face.kind === 'floor' || face.kind === 'litter') baseItems.push(item);
        else if (face.kind === 'roof' && !inside) roofItems.push(item);
        else items.push(item);
      }
      baseItems.sort((a, b) => b.depth - a.depth);
      items.sort((a, b) => b.depth - a.depth);
      roofItems.sort((a, b) => b.depth - a.depth);

      ctx.lineWidth = 1;
      const pattern = getMeshPattern(ctx);
      const drawItem = (it) => {
        ctx.beginPath();
        ctx.moveTo(it.p2[0][0], it.p2[0][1]);
        for (let i = 1; i < it.p2.length; i++) ctx.lineTo(it.p2[i][0], it.p2[i][1]);
        ctx.closePath();

        if (it.kind === 'mesh') {
          ctx.globalAlpha = 0.20;
          ctx.fillStyle = it.fill;
          ctx.fill();
          ctx.globalAlpha = 0.65;
          ctx.fillStyle = pattern;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(51,65,85,0.6)';
          ctx.stroke();
        } else {
          ctx.globalAlpha = it.alpha;
          ctx.fillStyle = it.fill;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (it.lines) {
          ctx.lineWidth = 1;
          for (const ln of it.lines) {
            const s = projectSeg(ln.a, ln.b);
            if (!s) continue;
            ctx.strokeStyle = ln.color;
            ctx.beginPath();
            ctx.moveTo(s[0][0], s[0][1]);
            ctx.lineTo(s[1][0], s[1][1]);
            ctx.stroke();
          }
        }
      };
      // 1) piso y cama (siempre al fondo)  2) techo si miramos desde dentro
      baseItems.forEach(drawItem);
      if (inside) roofItems.forEach(drawItem);
      items.forEach(drawItem);

      // Detalles finos (separaciones de los nidos)
      if (LAYERS.equipment) {
        ctx.lineWidth = 1;
        for (const ln of scene3D.detailLines) {
          const s = projectSeg(ln.a, ln.b);
          if (!s) continue;
          ctx.strokeStyle = ln.color;
          ctx.beginPath();
          ctx.moveTo(s[0][0], s[0][1]);
          ctx.lineTo(s[1][0], s[1][1]);
          ctx.stroke();
        }
      }

      // Luz de las bombillas de noche (antes del techo, para que quede dentro)
      if (dayF < 0.45) {
        for (const lp of scene3D.lamps) {
          const q = proj(lp);
          if (!q) continue;
          const g = ctx.createRadialGradient(q[0], q[1], 1, q[0], q[1], 40);
          g.addColorStop(0, `rgba(255,240,190,${(0.45 - dayF) * 0.9})`);
          g.addColorStop(1, 'rgba(255,240,190,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(q[0], q[1], 40, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3) techo visto desde fuera: cubre la estructura
      if (!inside) roofItems.forEach(drawItem);

      // Canales del zinc
      if (LAYERS.roof) {
        ctx.strokeStyle = `rgba(45,58,72,${0.35 + 0.35 * dayF})`;
        ctx.lineWidth = 1.1;
        for (const ln of scene3D.roofLines) {
          const a = proj(ln.a), b = proj(ln.b);
          if (!a || !b) continue;
          ctx.lineWidth = ln.strong ? 1.8 : 0.8;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      }

      // Viñeta suave
      const vg = ctx.createRadialGradient(cx, cssH * 0.48, cssH * 0.25, cx, cssH * 0.48, Math.max(cssW, cssH) * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, cssW, cssH);
    }

    function render3D(targetCanvas, forcedSize) {
      if (targetCanvas) {
        const sourceCanvas = document.getElementById('canvas3d');
        if (sourceCanvas && renderThree3D(sourceCanvas, forcedSize)) {
          const ctx = targetCanvas.getContext('2d');
          const width = forcedSize ? forcedSize[0] : targetCanvas.width;
          const height = forcedSize ? forcedSize[1] : targetCanvas.height;
          ctx.drawImage(sourceCanvas, 0, 0, width, height);
          return;
        }
        render3DLegacy(targetCanvas, forcedSize);
        return;
      }
      const canvas = document.getElementById('canvas3d');
      if (!canvas || !scene3D || currentTab !== '3d') return;
      if (renderThree3D(canvas)) return;
      if (!threeFallbackNotified) {
        console.warn('Three.js no está disponible; se utilizará el renderizador 3D de respaldo.');
        showToast('Three.js no está disponible; usando visor de respaldo', false);
        threeFallbackNotified = true;
      }
      render3DLegacy();
    }

    function zoom3D(factor) {
      CAM.dist = clamp(CAM.dist * factor, 3, 160);
      render3D();
    }

    function set3DView(name) {
      const base = fit3DDistance();
      const W = currentWidth, L = currentLength;
      const viewSelect = document.getElementById('view3d-select');
      if (viewSelect && Array.from(viewSelect.options).some(option => option.value === name)) viewSelect.value = name;
      CAM.center = null;
      if (name === 'iso') { CAM.yaw = 2.75; CAM.pitch = 0.58; CAM.dist = base; }
      else if (name === 'frente') { CAM.yaw = Math.PI; CAM.pitch = 0.16; CAM.dist = base * 0.95; }
      else if (name === 'lateral') { CAM.yaw = Math.PI / 2; CAM.pitch = 0.16; CAM.dist = base * 0.95; }
      else if (name === 'planta') { CAM.yaw = Math.PI; CAM.pitch = 1.45; CAM.dist = base * 1.05; }
      else if (name === 'interior') {
        CAM.center = [W / 2, 1.5, L - 1.0];
        CAM.yaw = Math.PI;
        CAM.pitch = 0.03;
        CAM.dist = Math.max(4, Math.min(9, L * 0.62));
      }
      render3D();
    }

    function setLayer(name, on) {
      LAYERS[name] = !!on;
      render3D();
    }

    function toggleLayersPanel() {
      const p = document.getElementById('layers-panel');
      if (!p) return;
      p.classList.toggle('hidden');
      const b = document.getElementById('btn-3d-layers');
      if (b) b.classList.toggle('preset-active', !p.classList.contains('hidden'));
    }

    function toggle3DAuto() {
      CAM.auto = !CAM.auto;
      const b = document.getElementById('btn-3d-auto');
      if (b) b.classList.toggle('preset-active', CAM.auto);
      if (CAM.auto) start3DLoop();
    }

    function syncSunUI() {
      const h = Math.floor(SUN.hour) % 24;
      const m = Math.floor((SUN.hour % 1) * 60);
      const lbl = document.getElementById('sun-label');
      if (lbl) lbl.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      const sl = document.getElementById('sun-hour');
      if (sl && document.activeElement !== sl) sl.value = String(SUN.hour);
      const b = document.getElementById('btn-sun-play');
      if (b) {
        b.innerHTML = SUN.auto
          ? '<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 3h3v10H4zm5 0h3v10H9z"/></svg>'
          : '<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5a.7.7 0 011.05-.61l8 5a.7.7 0 010 1.22l-8 5A.7.7 0 014 12.5z"/></svg>';
        b.setAttribute('aria-label', SUN.auto ? 'Pausar ciclo solar' : 'Reproducir ciclo solar');
        b.classList.toggle('preset-active', SUN.auto);
      }
    }

    function setSunHour(v) {
      SUN.hour = clamp(parseFloat(v), 0, 24);
      syncSunUI();
      render3D();
    }

    function setSunSpeed(v) { SUN.speed = parseFloat(v) || 2; }

    function toggleSun() {
      SUN.auto = !SUN.auto;
      syncSunUI();
      if (SUN.auto) start3DLoop();
    }

    function start3DLoop() {
      if (raf3D) return;
      SUN.last = performance.now();
      raf3D = requestAnimationFrame(tick3D);
    }

    function tick3D(now) {
      raf3D = 0;
      const stamp = (typeof now === 'number' && now > 0) ? now : performance.now();
      const dt = Math.max(0, Math.min(0.25, (stamp - (SUN.last || stamp)) / 1000));
      SUN.last = stamp;
      let need = false;
      if (SUN.auto) {
        SUN.hour = (SUN.hour + SUN.speed * dt) % 24;
        syncSunUI();
        need = true;
      }
      if (CAM.auto) {
        CAM.yaw += 0.55 * dt;
        need = true;
      }
      if (need) render3D();
      if ((SUN.auto || CAM.auto) && currentTab === '3d') raf3D = requestAnimationFrame(tick3D);
    }

    function init3D() {
      const cv = document.getElementById('canvas3d');
      if (!cv) return;

      const active3d = new Map();
      let pinch3d = null;

      const start = (e) => {
        e.preventDefault(); // prevenir scroll en móvil
        active3d.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (cv.setPointerCapture) { try { cv.setPointerCapture(e.pointerId); } catch (_) {} }
        if (active3d.size === 1) {
          CAM.drag = { x: e.clientX, y: e.clientY };
          pinch3d = null;
          cv.style.cursor = 'grabbing';
        } else if (active3d.size >= 2) {
          CAM.drag = null;
          const [a, b] = [...active3d.values()];
          pinch3d = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
          cv.style.cursor = 'grabbing';
        }
      };

      const move = (e) => {
        if (!active3d.has(e.pointerId)) return;
        active3d.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pinch3d && active3d.size >= 2) {
          const [a, b] = [...active3d.values()];
          const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
          if (Math.abs(d - pinch3d.dist) > 0.5) {
            zoom3D(d / pinch3d.dist);
            pinch3d.dist = d;
          }
          return;
        }

        if (!CAM.drag) return;
        CAM.yaw -= (e.clientX - CAM.drag.x) * (CAM.center ? 0.004 : 0.008);
        CAM.pitch = clamp(CAM.pitch + (e.clientY - CAM.drag.y) * (CAM.center ? 0.003 : 0.006), 0.02, 1.5);
        CAM.drag = { x: e.clientX, y: e.clientY };
        render3D();
      };

      const end = (e) => {
        active3d.delete(e.pointerId);
        if (active3d.size < 2) pinch3d = null;
        if (active3d.size === 0) {
          CAM.drag = null;
          cv.style.cursor = 'grab';
        }
        if (cv.releasePointerCapture) { try { cv.releasePointerCapture(e.pointerId); } catch (_) {} }
      };

      cv.addEventListener('pointerdown', start);
      cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoom3D(e.deltaY < 0 ? 0.9 : 1.11);
      }, { passive: false });
      cv.style.cursor = 'grab';

      window.addEventListener('resize', () => { if (currentTab === '3d') render3D(); });
      document.addEventListener('fullscreenchange', () => {
        if (currentTab === '3d') setTimeout(render3D, 90);
      });
      syncSunUI();
    }

    function enter3D() {
      const vp = document.getElementById('plan-viewport');
      const v3 = document.getElementById('view3d');
      const zg = document.getElementById('zoom-group');
      const sc = document.getElementById('scale-chip');
      const tb = document.getElementById('view3d-toolbar');
      if (vp) vp.classList.add('hidden');
      if (v3) v3.classList.remove('hidden');
      if (zg) zg.classList.add('hidden');
      if (sc) sc.classList.add('hidden');
      if (tb) tb.classList.remove('hidden');
      const l2 = document.getElementById('legend-2d');
      const png = document.getElementById('btn-download-png');
      if (png) png.classList.remove('hidden');
      if (l2) l2.style.display = 'none';
      rebuild3D();
      CAM.center = null;
      CAM.dist = fit3DDistance();
      syncSunUI();
      init3D();
      render3D();
    }

    function stop3D() {
      CAM.auto = false;
      SUN.auto = false;
      if (raf3D) { cancelAnimationFrame(raf3D); raf3D = 0; }
      const btn = document.getElementById('btn-3d-auto');
      if (btn) btn.classList.remove('preset-active');
      const lp = document.getElementById('layers-panel');
      if (lp) lp.classList.add('hidden');
      const lb = document.getElementById('btn-3d-layers');
      if (lb) lb.classList.remove('preset-active');
      syncSunUI();
    }

    function exit3D() {
      const vp = document.getElementById('plan-viewport');
      const v3 = document.getElementById('view3d');
      const zg = document.getElementById('zoom-group');
      const sc = document.getElementById('scale-chip');
      const tb = document.getElementById('view3d-toolbar');
      const png = document.getElementById('btn-download-png');
      if (v3) v3.classList.add('hidden');
      if (vp) vp.classList.remove('hidden');
      if (zg) zg.classList.remove('hidden');
      if (sc) sc.classList.remove('hidden');
      if (tb) tb.classList.add('hidden');
      if (png) png.classList.remove('hidden');
      const l2 = document.getElementById('legend-2d');
      if (l2) l2.style.display = '';
      stop3D();
    }

    // ==========================================
    // CINEMÁTICA · VIDEO DEL VISOR 3D
    // ==========================================
    const CINE_DUR = 64;
    const CINE = { active: false, raf: 0, t0: 0, recorder: null, chunks: [], mime: '', cancelled: false, prev: null, lastUI: 0 };

    // MP4 (H.264) primero; WebM como respaldo en navegadores sin muxer MP4
    function pickVideoMime() {
      const list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      for (const m of list) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
      }
      return '';
    }

    function cineSeg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
    // Breves fundidos ocultan el cambio de techo al entrar y salir del recorrido interior.
    const CINE_CUTS = [[37.8, 38.2], [57.8, 58.2]];

    function cineCutFade(t) {
      let f = 0;
      const w = 0.20;
      for (const [a, b] of CINE_CUTS) {
        if (t < a - w || t > b + w) continue;
        if (t < a) f = Math.max(f, (t - (a - w)) / w);
        else if (t <= b) f = Math.max(f, 1);
        else f = Math.max(f, ((b + w) - t) / w);
      }
      return f;
    }

    function applyCinematic(t) {
      const W = currentWidth, L = currentLength;
      const fit = fit3DDistance();
      const mk = [
        { t: 0, sc: 1, cap: 'Vista isométrica · materiales y volumen completo', yaw: 2.45, pitch: 0.48, df: 1.38, c: [W / 2, 1.7, L / 2], sun: 8.2 },
        { t: 4, sc: 2, cap: 'Fachada frontal y acceso', yaw: Math.PI, pitch: 0.16, df: 0.96, c: [W / 2, 1.5, 0.2], sun: 8.7 },
        { t: 8, sc: 2, cap: 'Esquina frontal · cubierta y alero', yaw: Math.PI + 0.72, pitch: 0.38, df: 1.02, c: [W / 2, 1.7, 1.2], sun: 9.1 },
        { t: 12, sc: 3, cap: 'Costado longitudinal', yaw: Math.PI * 1.5, pitch: 0.16, df: 1.08, c: [W / 2, 1.6, L / 2], sun: 9.5 },
        { t: 16, sc: 4, cap: 'Fachada posterior · muro cerrado y ventilación alta', yaw: Math.PI * 2, pitch: 0.16, df: 0.96, c: [W / 2, 1.5, L - 0.2], sun: 9.9 },
        { t: 20, sc: 4, cap: 'Esquina posterior · encuentro de cubierta', yaw: Math.PI * 2 + 0.72, pitch: 0.38, df: 1.02, c: [W / 2, 1.7, L - 1.2], sun: 10.3 },
        { t: 24, sc: 5, cap: 'Costado opuesto y estructura longitudinal', yaw: Math.PI * 2.5, pitch: 0.16, df: 1.08, c: [W / 2, 1.6, L / 2], sun: 10.7 },
        { t: 28, sc: 5, cap: 'Órbita exterior de 360°', yaw: Math.PI * 3, pitch: 0.34, df: 1.12, c: [W / 2, 1.7, L / 2], sun: 11.1 },
        { t: 32, sc: 6, cap: 'Vista cenital · forma asimétrica de la cubierta', yaw: Math.PI * 3 + 0.55, pitch: 1.42, df: 1.3, c: [W / 2, 1.5, L / 2], sun: 11.5 },
        { t: 35, sc: 6, cap: 'Vista baja · cara inferior del alero y estructura', yaw: Math.PI * 3 + Math.PI / 2, pitch: -0.34, dist: 5.2, c: [W + 1.2, 2.3, L / 2], sun: 11.8 },
        { t: 38, sc: 7, cap: 'Vista interior tipo corte · cubierta y muros opacos retirados', yaw: Math.PI * 3, pitch: 0.04, dist: 4.2, c: [W / 2, 1.35, 4.2], sun: 12.1, interior: true },
        { t: 42, sc: 7, cap: 'Recorrido interior por el pasillo central', yaw: Math.PI * 3, pitch: 0.04, dist: Math.min(3.2, L * 0.2), c: [W / 2, 1.35, L * 0.45 + Math.min(3.2, L * 0.2)], sun: 12.4, interior: true },
        { t: 46, sc: 7, cap: 'Nidales, comederos y bebederos', yaw: Math.PI * 3 + 0.62, pitch: 0.03, dist: 2.7, c: [W * 0.35, 1.45, L * 0.52], sun: 12.8, interior: true },
        { t: 50, sc: 7, cap: 'Vista interior hacia la culata posterior', yaw: Math.PI * 4, pitch: 0.04, dist: 3.2, c: [W / 2, 1.4, L - 4.5], sun: 13.2, interior: true },
        { t: 54, sc: 7, cap: 'Vista interior alta · cerchas y ventilación cenital', yaw: Math.PI * 4 + 0.45, pitch: 0.82, dist: Math.max(2, Math.min(5, L * 0.22)), c: [W / 2, 2.0, L * 0.5], sun: 13.6, interior: true },
        { t: 58, sc: 8, cap: 'Salida al exterior · cubierta y luz natural', yaw: Math.PI * 5, pitch: 0.48, df: 1.12, c: [W / 2, 1.7, L / 2], sun: 14.0 },
        { t: 61, sc: 8, cap: 'Vista aérea final · ventilación para clima cálido', yaw: Math.PI * 5 + 0.42, pitch: 1.18, df: 1.3, c: [W / 2, 1.6, L / 2], sun: 14.3 },
        { t: CINE_DUR, sc: 8, cap: '', yaw: Math.PI * 5 + 0.9, pitch: 0.5, df: 1.36, c: [W / 2, 1.7, L / 2], sun: 14.6 }
      ];

      let i = 0;
      while (i < mk.length - 2 && t >= mk[i + 1].t) i++;
      const A = mk[i], B = mk[i + 1];
      const p0 = mk[Math.max(0, i - 1)], p3 = mk[Math.min(mk.length - 1, i + 2)];
      const u = cineSeg(t, A.t, B.t);
      const curve = (key, component) => {
        const value = (frame) => {
          if (key === 'dist') return frame.dist !== undefined ? frame.dist : fit * frame.df;
          return component === undefined ? frame[key] : frame[key][component];
        };
        const a = value(p0), b = value(A), c = value(B), d = value(p3);
        const span = B.t - A.t;
        const before = A.t - p0.t, after = p3.t - B.t;
        const m1 = before > 0 ? (c - a) * span / (B.t - p0.t) : 0;
        const m2 = after > 0 ? (d - b) * span / (p3.t - A.t) : 0;
        const u2 = u * u, u3 = u2 * u;
        return (2 * u3 - 3 * u2 + 1) * b + (u3 - 2 * u2 + u) * m1 +
          (-2 * u3 + 3 * u2) * c + (u3 - u2) * m2;
      };
      const on = A.interior
        ? { floor: true, litter: true, walls: false, mesh: true, structure: true, roof: false, equipment: true }
        : { floor: true, litter: true, walls: true, mesh: true, structure: true, roof: true, equipment: true };
      Object.assign(LAYERS, on);
      CINE_SHADOW = !A.interior;
      CAM.yaw = curve('yaw');
      CAM.pitch = clamp(curve('pitch'), -0.48, 1.5);
      CAM.dist = clamp(curve('dist'), 2, fit * 1.8);
      CAM.center = [0, 1, 2].map((axis) => curve('c', axis));
      SUN.hour = ((curve('sun') % 24) + 24) % 24;
      return { cap: (u < 0.85 ? A.cap : (B.cap || '')), sc: A.sc };
    }

    function cineRoundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawCineOverlay(ctx, t, cap) {
      const Wc = ctx.canvas.width, Hc = ctx.canvas.height, F = Wc / 1280;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (t < 3.6) {
        const a = 1 - cineSeg(t, 2.6, 3.6);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(8, 15, 26, 0.58)';
        cineRoundRect(ctx, 44 * F, 42 * F, 486 * F, 108 * F, 14 * F);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${30 * F}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('GALPÓN AVÍCOLA', 68 * F, 86 * F);
        ctx.fillStyle = '#bae6fd';
        ctx.font = `600 ${19 * F}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(`${currentWidth.toFixed(2)} × ${currentLength.toFixed(2)} m · ${Math.floor(currentWidth * currentLength * currentDensity)} aves`, 68 * F, 120 * F);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = `500 ${14 * F}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText('Techo asimétrico · ventilación cenital · clima cálido', 68 * F, 140 * F);
        ctx.globalAlpha = 1;
      }

      if (cap) {
        ctx.font = `600 ${19 * F}px ui-sans-serif, system-ui, sans-serif`;
        const tw = ctx.measureText(cap).width;
        const bw = Math.min(Wc - 88 * F, Math.max(320 * F, tw + 64 * F));
        ctx.fillStyle = 'rgba(8, 15, 26, 0.62)';
        cineRoundRect(ctx, 44 * F, Hc - 96 * F, bw, 50 * F, 12 * F);
        ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.textBaseline = 'middle';
        ctx.fillText(cap, 70 * F, Hc - 70 * F);
        ctx.textBaseline = 'alphabetic';
      }

      const fadeIn = 1 - cineSeg(t, 0, 0.6);
      const fadeOut = cineSeg(t, CINE_DUR - 1.0, CINE_DUR);
      const cut = cineCutFade(t);
      const fade = Math.max(fadeIn, fadeOut, cut);
      if (fade > 0.001) {
        ctx.fillStyle = `rgba(0,0,0,${fade})`;
        ctx.fillRect(0, 0, Wc, Hc);
      }
    }

    function cineTick(now) {
      if (!CINE.active) return;
      const t = (now - CINE.t0) / 1000;
      const tt = Math.min(t, CINE_DUR);
      const info = applyCinematic(tt);
      const canvas = document.getElementById('cine-canvas');
      if (!canvas) { stopCinematic(true); return; }
      render3D(canvas, [1600, 900]);
      const ctx = canvas.getContext('2d');
      drawCineOverlay(ctx, tt, info.cap);

      const prog = document.getElementById('cine-progress');
      if (prog) prog.style.width = `${(tt / CINE_DUR) * 100}%`;
      if (now - CINE.lastUI > 140) {
        CINE.lastUI = now;
        const time = document.getElementById('cine-time');
        if (time) time.textContent = `${tt.toFixed(1)} s / ${CINE_DUR} s`;
        const capEl = document.getElementById('cine-caption');
        if (capEl) capEl.textContent = `Escena ${info.sc} de 8 · ${info.cap}`;
      }

      if (t >= CINE_DUR) { stopCinematic(false); return; }
      CINE.raf = requestAnimationFrame(cineTick);
    }

    function startCinematic() {
      if (CINE.active) return;
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
        showToast('Tu navegador no permite grabar video. Prueba en Chrome o Edge.', false);
        return;
      }
      const canvas = document.getElementById('cine-canvas');
      const modal = document.getElementById('cine-modal');
      if (!canvas || !modal) return;

      setTab('3d');
      stop3D();

      CINE.prev = {
        layers: { ...LAYERS },
        sun: SUN.hour,
        cam: { yaw: CAM.yaw, pitch: CAM.pitch, dist: CAM.dist, center: CAM.center ? [...CAM.center] : null }
      };

      canvas.width = 1600;
      canvas.height = 900;
      // Primer cuadro listo antes de que arranque el grabador (evita el arranque en negro)
      applyCinematic(0);
      render3D(canvas, [1600, 900]);
      drawCineOverlay(canvas.getContext('2d'), 0, '');
      const mime = pickVideoMime();
      // Más bitrate a mayor resolución (1600×900): nítido y fluido
      const bitrate = (mime || '').includes('mp4') ? 12000000 : 9000000;
      let rec;
      try {
        const stream = canvas.captureStream(30);
        rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bitrate } : undefined);
      } catch (err) {
        showToast('No se pudo iniciar la grabación', false);
        return;
      }

      CINE.recorder = rec;
      CINE.chunks = [];
      CINE.mime = mime || 'video/webm';
      CINE.cancelled = false;
      CINE.lastUI = 0;
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) CINE.chunks.push(ev.data); };
      rec.onstop = finishCinematic;

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      const st = document.getElementById('cine-status');
      if (st) st.textContent = 'Grabando · escenas, recorrido interior y ciclo solar';
      const prog = document.getElementById('cine-progress');
      if (prog) prog.style.width = '0%';

      CINE.active = true;
      CINE.done = false;
      CINE.t0 = performance.now();
      try {
        rec.start(250);
      } catch (err) {
        CINE.active = false;
        CINE.recorder = null;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        showToast('No se pudo iniciar la grabación', false);
        return;
      }
      CINE.raf = requestAnimationFrame(cineTick);
      showToast('Grabando cinemática…', true);
    }

    function stopCinematic(discard) {
      if (!CINE.active) return;
      CINE.cancelled = !!discard;
      if (CINE.raf) { cancelAnimationFrame(CINE.raf); CINE.raf = 0; }
      if (CINE.recorder && CINE.recorder.state !== 'inactive') {
        CINE.recorder.stop();
      } else {
        finishCinematic();
      }
    }

    function cancelCinematic() {
      if (!CINE.active) return;
      const st = document.getElementById('cine-status');
      if (st) st.textContent = 'Cancelando grabación…';
      stopCinematic(true);
    }

    function finishCinematic() {
      if (CINE.done) return;
      CINE.done = true;
      const blob = new Blob(CINE.chunks, { type: CINE.mime || 'video/webm' });
      CINE.chunks = [];
      CINE.active = false;
      CINE.recorder = null;

      const modal = document.getElementById('cine-modal');
      if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }

      CINE_SHADOW = true;
      if (CINE.prev) {
        Object.assign(LAYERS, CINE.prev.layers);
        SUN.hour = CINE.prev.sun;
        CAM.yaw = CINE.prev.cam.yaw;
        CAM.pitch = CINE.prev.cam.pitch;
        CAM.dist = CINE.prev.cam.dist;
        CAM.center = CINE.prev.cam.center;
      }
      syncSunUI();
      render3D();

      if (!CINE.cancelled && blob.size > 1000) {
        const ext = (CINE.mime || '').includes('mp4') ? 'mp4' : 'webm';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Cinematica_Galpon_${currentWidth.toFixed(1)}x${currentLength.toFixed(1)}m.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast(`Video descargado (${(blob.size / 1048576).toFixed(1)} MB)`, true);
      } else if (CINE.cancelled) {
        showToast('Grabación cancelada', false);
      } else {
        showToast('La grabación no produjo datos; intenta de nuevo', false);
      }
    }

    // Inicialización
    const savedProject = loadProject();
    if (savedProject) {
      const wEl = document.getElementById('input-ancho');
      const lEl = document.getElementById('input-largo');
      const dEl = document.getElementById('input-densidad');
      if (wEl && lEl && dEl) {
        wEl.value = clamp(savedProject.w, 4.0, 14.0).toFixed(1);
        lEl.value = clamp(savedProject.l, 6.0, 40.0).toFixed(1);
        dEl.value = clamp(savedProject.d, 3.0, 8.0).toFixed(1);
      }
    }
    updateDimensions();
    initViewer();
    init3D();
    fitView();
    applyView();
    // PWA: registra el service worker para uso offline (solo en contextos seguros)
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.error('No se pudo registrar el modo offline.', error);
      });
    }
