/* ============================================================
   src/js/novedades.js  —  Lógica de la app principal de novedades
   Collective Mining · Sistema de Nómina
   ============================================================ */

'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  maestroOriginal: [],
  ocasionales: [],
  fijas: [],
  ausentismos: [],
  cambiosMaestro: [],
  cambiosIngresos: [],
};

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');

  // CORRECCIÓN #3: Activar solo el elemento nav-item que corresponde exactamente a la página solicitada
  // Usar data-page o buscar por ID en lugar de substring para evitar selecciones no intencionales
  const items = document.querySelectorAll('.nav-item');
  items.forEach(i => {
    const pageAttr = i.getAttribute('data-page');
    if (pageAttr === page) {
      i.classList.add('active');
    }
  });

  if (page === 'dashboard')    { _initDashboardCC(); }
  if (page === 'ocasionales')  { cargarOcasionalesDelPeriodo(); }
  if (page === 'fijas')        { cargarFijasDelPeriodo(); }
  if (page === 'ausentismos')  { cargarAusentismosDelPeriodo(); }
  if (page === 'cambios')      { cargarCambiosDelPeriodo(); }
  if (page === 'changelog')    { clCargar(); }
  if (page === 'formularios')  { initFormulariosPage(); }
  if (page === 'graficos')     { graficosInit(); }
}

// ─── AUTOSERVICIO — FORMULARIOS ───────────────────────────────────────────────
let _formulariosIniciado = false;

function initFormulariosPage() {
  if (_formulariosIniciado) return;
  _formulariosIniciado = true;

  const base      = window.location.origin;
  const urlP      = base + '/solicitud/permiso';
  const urlV      = base + '/solicitud/vacaciones';
  const urlCP     = base + '/permiso';
  const urlCV     = base + '/vacaciones';

  // Rellenar textos y hrefs
  document.getElementById('urlPermiso').textContent     = urlP;
  document.getElementById('urlVacaciones').textContent  = urlV;
  document.getElementById('btnAbrirPermiso').href       = urlP;
  document.getElementById('btnAbrirVacaciones').href    = urlV;
  document.getElementById('urlCorta1').textContent      = urlCP;
  document.getElementById('urlCorta2').textContent      = urlCV;

  // Generar QR con la API pública de qrserver.com (sin dependencias npm)
  function qrImg(url) {
    const img = document.createElement('img');
    img.src   = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent(url);
    img.alt   = url;
    img.style.cssText = 'width:140px;height:140px;display:block';
    return img;
  }
  document.getElementById('qrPermiso').appendChild(qrImg(urlP));
  document.getElementById('qrVacaciones').appendChild(qrImg(urlV));
}

function copiarLink(elementId, btn) {
  const url = document.getElementById(elementId).textContent;
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copiado';
    btn.style.background = 'rgba(76,175,130,0.2)';
    btn.style.color = 'var(--success)';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.background = '';
      btn.style.color = '';
    }, 2000);
  }).catch(() => {
    prompt('Copia este link:', url);
  });
}

// ─── CHANGELOG ───────────────────────────────────────────────────────────────
let _clDatos    = null; // cache de versiones ya cargadas
let _clTabActiva = 'resumen';

function clSwitchTab(tab) {
  _clTabActiva = tab;
  document.querySelectorAll('#page-changelog .tab').forEach(t => t.classList.remove('active'));
  document.getElementById('clTab-' + tab).classList.add('active');
  document.getElementById('cl-resumen').style.display = tab === 'resumen' ? '' : 'none';
  document.getElementById('cl-detalle').style.display = tab === 'detalle' ? '' : 'none';
}

async function clCargar(forzar = false) {
  if (_clDatos && !forzar) { clRenderizar(_clDatos); return; }

  document.getElementById('cl-loading').style.display = '';
  document.getElementById('cl-resumen').style.display = 'none';
  document.getElementById('cl-detalle').style.display = 'none';

  try {
    const headers = { 'Authorization': `Bearer ${_getAuthToken()}` };
    const res  = await fetch('/api/changelog', { headers });
    if (res.status === 401) throw new Error('No autorizado — sesión expirada');
    const data = await res.json();
    if (!data.ok) throw new Error('Respuesta inválida del servidor');
    _clDatos = data.versiones;
    clRenderizar(_clDatos);
  } catch (e) {
    document.getElementById('cl-loading').innerHTML =
      `<span style="color:var(--danger)">⚠ ${e.message || 'No se pudo cargar el historial de versiones.'}</span>`;
  }
}

function clRenderizar(versiones) {
  document.getElementById('cl-loading').style.display = 'none';

  // ── Resumen ──
  const resEl = document.getElementById('cl-resumen-content');
  resEl.innerHTML = versiones.map(v => {
    const badgeCls = v.version === 'dev' ? 'dev' : v.pending ? 'pending' : '';
    const commitLabel = v.pending
      ? `<div style="font-family:monospace;color:#9B7FD4">en desarrollo</div>`
      : v.commit ? `<div style="font-family:monospace;color:var(--cm-blue)">${v.commit}</div>` : '';
    return `
    <div class="cl-version-card">
      <div class="cl-version-header">
        <span class="cl-version-badge ${badgeCls}">${v.version}</span>
        <span class="cl-version-title">${escH(v.titulo)}</span>
        <div class="cl-version-meta">
          ${v.fecha ? `<div>📅 ${v.fecha}</div>` : ''}
          ${commitLabel}
        </div>
      </div>
      <div class="cl-version-body">
        ${v.resumen.length > 0
          ? `<ul class="cl-bullet-list">${v.resumen.map(r => `<li>${escH(r)}</li>`).join('')}</ul>`
          : `<p class="cl-empty">Sin descripción registrada para esta versión.</p>`
        }
      </div>
    </div>`;
  }).join('');

  // ── Detalle técnico ──
  const detEl = document.getElementById('cl-detalle-content');
  detEl.innerHTML = versiones.map(v => {
    const badgeCls = v.version === 'dev' ? 'dev' : v.pending ? 'pending' : '';
    const commitLabel = v.pending
      ? `<div style="font-family:monospace;color:#9B7FD4">en desarrollo</div>`
      : v.commit ? `<div style="font-family:monospace;color:var(--cm-blue)">${v.commit}</div>` : '';
    return `
    <div class="cl-version-card">
      <div class="cl-version-header">
        <span class="cl-version-badge ${badgeCls}">${v.version}</span>
        <span class="cl-version-title">${escH(v.titulo)}</span>
        <div class="cl-version-meta">
          ${v.fecha ? `<div>📅 ${v.fecha}</div>` : ''}
          ${commitLabel}
        </div>
      </div>
      <div class="cl-version-body">
        ${v.detalle.length > 0
          ? v.detalle.map(cat => `
              <div class="cl-category">
                <div class="cl-category-title">${escH(cat.categoria)}</div>
                <ul class="cl-detail-list">
                  ${cat.items.map(it => `<li>${escH(it)}</li>`).join('')}
                </ul>
              </div>
            `).join('')
          : `<p class="cl-empty" style="margin-bottom:12px">Sin documentación técnica detallada para esta versión.</p>`
        }
        ${v.commits && v.commits.length > 0 ? `
          <div class="cl-commits-wrap">
            <div class="cl-commits-title">Commits incluidos</div>
            ${v.commits.map(c => `
              <div class="cl-commit-row">
                <span class="cl-commit-hash">${c.hash.substring(0,7)}</span>
                <span class="cl-commit-date">${c.date}</span>
                <span class="cl-commit-msg">${escH(c.subject)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>`;
  }).join('');

  // Mostrar pestaña activa
  clSwitchTab(_clTabActiva);
}

function escH(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function actualizarBadge() {
  // El período ahora es automático, no se actualiza por input del usuario
  // Se calcula al inicializar la interfaz
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function showAlert(id) {
  const el = document.getElementById(id);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function limpiarForm(prefix) {
  document.querySelectorAll(`[id^="${prefix}_"]`).forEach(el => { el.value = ''; });
}

function updateBadges() {
  document.getElementById('badgeMaestro').textContent = state.maestroOriginal.length;
  document.getElementById('badgeOcas').textContent = state.ocasionales.length;
  document.getElementById('badgeFijas').textContent = state.fijas.length;
  document.getElementById('badgeAus').textContent = state.ausentismos.length;
  document.getElementById('badgeCMaestro').textContent = state.cambiosMaestro.length;
  document.getElementById('badgeCIngresos').textContent = state.cambiosIngresos.length;
  document.getElementById('statOcas').textContent = state.ocasionales.length;
  document.getElementById('statFijas').textContent = state.fijas.length;
  document.getElementById('statAus').textContent = state.ausentismos.length;
  document.getElementById('statCam').textContent = state.cambiosMaestro.length + state.cambiosIngresos.length;
}

function addActivity(modulo, empleado, tipo) {
  const tb = document.getElementById('tbActivity');
  if (tb.querySelector('td[colspan]')) tb.innerHTML = '';
  const row = document.createElement('tr');
  const now = new Date().toLocaleString('es-CO');
  const colors = { Ocasional:'badge-dev', Fija:'badge-ded', Ausentismo:'badge-aus', Cambio:'badge-cam' };
  row.innerHTML = `<td><span class="badge ${colors[tipo]||'badge-cam'}">${modulo}</span></td><td>${empleado}</td><td>${tipo}</td><td>${now}</td><td><span style="color:var(--success)">✓</span></td>`;
  tb.insertBefore(row, tb.firstChild);
}

// ─── MODALES ─────────────────────────────────────────────────────────────────
function abrirModal(id) {
  const m = document.getElementById(id);
  if (m) { m.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}
function cerrarModal(id) {
  const m = document.getElementById(id);
  if (m) { m.style.display = 'none'; document.body.style.overflow = ''; }
}
// Cerrar modal al hacer click fuera del contenido
document.addEventListener('click', function(e) {
  ['modalEditarFija','modalEditarAus','modalEditarCambio','modalEditarEmpleado'].forEach(id => {
    const m = document.getElementById(id);
    if (m && e.target === m) cerrarModal(id);
  });
});

function filtrarTabla(tbId, query) {
  const rows = document.querySelectorAll(`#${tbId} tr`);
  rows.forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(query.toLowerCase()) ? '' : 'none';
  });
}

function calcDias() {
  const fi = document.getElementById('aus_finicial').value;
  const ff = document.getElementById('aus_ffinal').value;
  if (fi && ff) {
    const diff = Math.round((new Date(ff) - new Date(fi)) / 86400000) + 1;
    document.getElementById('aus_dias').value = diff > 0 ? diff : '';
  }
}

function sq(v) { return v ? `N'${String(v).replace(/'/g, "''")}'` : 'NULL'; }
function sdate(v) { return v ? `'${v}'` : 'NULL'; }
function snum(v) { return v !== '' && v !== undefined && v !== null ? v : 'NULL'; }

const usuario = () => document.getElementById('cfgUsuario').value || 'SISTEMA';
const periodo = () => document.getElementById('cfgPeriodo').value || '';

// ─── FUNCIÓN PARA CALCULAR QUINCENA ACTUAL ─────────────────────────────────
function calcularQuincenaActual() {
  const hoy = new Date();
  const dia = hoy.getDate();
  const mes = hoy.toLocaleString('es-CO', { month: 'long' });
  const año = hoy.getFullYear();
  const mesNum = String(hoy.getMonth() + 1).padStart(2, '0');

  let quincena, rango, formatoBadge;
  if (dia <= 15) {
    quincena = '1era quincena de ' + mes;
    rango = `${año}-${mesNum}-01 / ${año}-${mesNum}-15`;
    formatoBadge = `${año}-${mesNum}-1Q`;
  } else {
    quincena = '2da quincena de ' + mes;
    const ultimoDia = new Date(año, hoy.getMonth() + 1, 0).getDate();
    rango = `${año}-${mesNum}-16 / ${año}-${mesNum}-${ultimoDia}`;
    formatoBadge = `${año}-${mesNum}-2Q`;
  }

  return { quincena, rango, formatoBadge };
}

// ─── AUTOCOMPLETE DEL BUSCADOR HISTÓRICO ─────────────────────────────────────

let _histAcTimer = null;
let _histAcIdx   = -1;

function histAcBuscar(val) {
  clearTimeout(_histAcTimer);
  const drop = document.getElementById('hist_ac_drop');
  _histAcIdx = -1;

  if (!val || val.trim().length < 2) {
    drop.classList.remove('show');
    return;
  }

  drop.innerHTML = '<div class="hist-ac-loader">Buscando...</div>';
  drop.classList.add('show');

  _histAcTimer = setTimeout(async () => {
    try {
      const r = await fetch(`/api/maestros/buscar-cedulas?q=${encodeURIComponent(val.trim())}`);
      if (!r.ok) { drop.classList.remove('show'); return; }
      const empleados = await r.json();

      if (!empleados.length) {
        drop.innerHTML = '<div class="hist-ac-loader" style="color:var(--muted)">Sin coincidencias de empleados</div>';
        return;
      }

      drop.innerHTML = empleados.map((emp, i) => `
        <div class="hist-ac-item" data-idx="${i}"
             onmousedown="histAcSeleccionar('${escH(emp.cedula)}', '${escH(emp.nombre)}')"
             onmouseover="histAcHover(${i})">
          <span class="hist-ac-cedula">${escH(emp.cedula)}</span>
          <span class="hist-ac-nombre">${escH(emp.nombre)}</span>
        </div>
      `).join('');

      drop.classList.add('show');
    } catch (_) { drop.classList.remove('show'); }
  }, 280);
}

function histAcHover(idx) {
  _histAcIdx = idx;
  document.querySelectorAll('#hist_ac_drop .hist-ac-item').forEach((el, i) => {
    el.style.background = i === idx ? 'rgba(32,167,201,0.18)' : '';
  });
}

function histAcKeyNav(e) {
  const drop  = document.getElementById('hist_ac_drop');
  const items = drop.querySelectorAll('.hist-ac-item');
  if (!drop.classList.contains('show') || !items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _histAcIdx = Math.min(_histAcIdx + 1, items.length - 1);
    histAcHover(_histAcIdx);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _histAcIdx = Math.max(_histAcIdx - 1, 0);
    histAcHover(_histAcIdx);
  } else if (e.key === 'Enter' && _histAcIdx >= 0) {
    e.preventDefault();
    items[_histAcIdx].dispatchEvent(new MouseEvent('mousedown'));
  } else if (e.key === 'Escape') {
    drop.classList.remove('show');
  }
}

function histAcSeleccionar(cedula, nombre) {
  // Poner solo la cédula en el campo para que el LIKE funcione con precisión
  document.getElementById('hist_q').value = cedula;
  document.getElementById('hist_ac_drop').classList.remove('show');
  _histAcIdx = -1;
  // Disparar búsqueda automáticamente al seleccionar del autocomplete
  histBuscar();
}

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', e => {
  if (!e.target.closest('.hist-autocomplete-wrap')) {
    const drop = document.getElementById('hist_ac_drop');
    if (drop) drop.classList.remove('show');
  }
});

// ─── ACTIVIDAD RECIENTE DESDE BD ─────────────────────────────────────────────

async function cargarActividadReciente() {
  const limite = document.getElementById('activityLimit')?.value || 10;
  const tb = document.getElementById('tbActivity');

  try {
    const r    = await fetch(`/api/novedades/recientes?limite=${limite}`);
    const rows = await r.json();

    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:32px">Sin registros en la base de datos</td></tr>`;
      return;
    }

    const badgeClass = { OCASIONAL:'badge-dev', FIJA:'badge-ded', AUSENTISMO:'badge-aus', CAMBIO:'badge-cam' };

    tb.innerHTML = rows.map(r => {
      const inact = r.ACT_ESTA === 'I';
      const periodo = r.PER_ANO
        ? `${r.PER_ANO}-${String(r.PER_MES).padStart(2,'0')}-Q${r.PER_QNA}`
        : `#${r.COD_PERIOD}`;
      const valor = r.VALOR != null
        ? Number(r.VALOR).toLocaleString('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 })
        : '—';
      const fechaReg = r.FEC_REGI ? new Date(r.FEC_REGI).toLocaleDateString('es-CO') : '—';

      return `<tr style="${inact ? 'opacity:.55' : ''}">
        <td><span class="badge ${badgeClass[r.TIPO_NOVED]||'badge-cam'}">${escH(r.TIPO_NOVED||'')}</span></td>
        <td style="font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:600;color:var(--cm-blue)">${escH(r.CEDULA||'')}</td>
        <td>${escH(r.NOMBRE||'')}</td>
        <td style="font-size:12px;color:var(--muted)">${escH(r.CONCEPTO||'')}</td>
        <td style="font-size:11.5px">${periodo}</td>
        <td style="text-align:right;font-family:'Barlow Condensed',sans-serif">${valor}</td>
        <td style="font-size:11.5px;white-space:nowrap">${fechaReg}</td>
        <td style="font-size:11.5px;color:var(--muted)">${escH(r.ACT_USUA||'')}</td>
        <td><span class="badge ${inact ? 'badge-inact' : 'badge-act'}">${inact ? 'Inactivo' : 'Activo'}</span></td>
      </tr>`;
    }).join('');
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--danger);padding:32px">Error cargando actividad: ${e.message}</td></tr>`;
  }
}

// ─── BUSCADOR HISTÓRICO DE NOVEDADES ─────────────────────────────────────────

async function histCargarPeriodos() {
  try {
    const r = await fetch('/api/novedades/periodos');
    if (!r.ok) return;
    const periodos = await r.json();
    const sel = document.getElementById('hist_period');
    periodos.forEach(p => {
      const label = `${p.PER_ANO}-${String(p.PER_MES).padStart(2,'0')}-Q${p.PER_QNA} · ${fmtFecha(p.PER_FINI)} → ${fmtFecha(p.PER_FFIN)}${p.PER_EST==='I' ? ' [Cerrado]' : ''}`;
      sel.insertAdjacentHTML('beforeend', `<option value="${p.COD_PERIOD}">${label}</option>`);
    });
    // Sincronizar el selector del panel de trazabilidad CC (resetea a "Todos")
    _sincronizarPeriodosCC();
  } catch (_) {}
}

function fmtFecha(v) {
  if (!v) return '';
  const d = new Date(v);
  return d.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function fmtMoneda(v) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 });
}

function histClearAuto() { /* permite búsqueda al escribir si se desea */ }

// ============================================================================
// ─── TRAZABILIDAD POR CENTRO DE COSTO ────────────────────────────────────────
// ============================================================================
let _ccData        = [];    // último resultado cargado (para re-ordenar sin re-consultar)
let _ccIniciado    = false; // evita doble carga inicial
let _ccCatalogo    = [];    // catálogo de centros de costo [{cod, nom}]
let _ccSeleccionados = new Set(); // CCs seleccionados (solo aplica cuando _ccTodosMode=false)
let _ccTodosMode   = true;  // true = sin filtro CC (todos); false = filtrar por _ccSeleccionados

// ── Inicialización única del panel CC ────────────────────────────────────────
async function _initDashboardCC() {
  if (_ccIniciado) return;
  _ccIniciado = true;
  await Promise.all([_cargarPeriodosCC(), _cargarCentrosCosto()]);
  cargarTrazabilidadCC();
}

// ── Cargar períodos directamente (sin depender de hist_period) ───────────────
async function _cargarPeriodosCC() {
  try {
    const r = await fetch('/api/novedades/periodos');
    if (!r.ok) return;
    const periodos = await r.json();
    const sel = document.getElementById('cc_period');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todos los períodos</option>';
    periodos.forEach(p => {
      const label = `${p.PER_ANO}-${String(p.PER_MES).padStart(2,'0')}-Q${p.PER_QNA} · ${fmtFecha(p.PER_FINI)} → ${fmtFecha(p.PER_FFIN)}${p.PER_EST==='I' ? ' [Cerrado]' : ''}`;
      sel.insertAdjacentHTML('beforeend', `<option value="${p.COD_PERIOD}">${label}</option>`);
    });
  } catch (_) {}
}

// ── Poblar los selectores de Centros de Costo ────────────────────────────────
async function _cargarCentrosCosto() {
  try {
    const r = await fetch('/api/maestros/catalogos-edicion');
    if (!r.ok) return;
    const cat = await r.json();
    if (!cat.ccost || !cat.ccost.length) return;

    _ccCatalogo = cat.ccost;

    // Selector histórico (select normal)
    const selHist = document.getElementById('hist_ccost');
    if (selHist) {
      selHist.innerHTML = '<option value="">Todos los centros de costo</option>' +
        cat.ccost.map(c => `<option value="${c.cod}">${c.nom}${c.cod ? ' · ' + c.cod : ''}</option>`).join('');
    }

    // Multi-select CC del panel de trazabilidad
    _renderCCOpciones();
  } catch (_) {}
}

// ── Poblar el select de períodos del panel CC (llamado desde histCargarPeriodos) ─
function _sincronizarPeriodosCC() {
  // No-op: ahora cc_period se carga de forma independiente en _cargarPeriodosCC()
  // Se mantiene por compatibilidad con la llamada en histCargarPeriodos()
}

// ── Multi-select: renderizar opciones ────────────────────────────────────────
function _renderCCOpciones() {
  const container = document.getElementById('cc_ms_options');
  if (!container || !_ccCatalogo.length) return;
  container.innerHTML = _ccCatalogo.map(c => `
    <label class="cc-ms-option">
      <input type="checkbox" value="${c.cod}" onchange="_onCCCheck(this)"
             ${_ccSeleccionados.has(String(c.cod)) ? 'checked' : ''}>
      <span style="flex:1">${c.nom}</span>
      <span class="cc-ms-opt-code">${c.cod}</span>
    </label>
  `).join('');
  _actualizarCCLabel();
}

// ── Multi-select: toggle dropdown ────────────────────────────────────────────
function _toggleCCDrop(e) {
  e.stopPropagation();
  const drop = document.getElementById('cc_ms_drop');
  const btn  = document.getElementById('cc_ms_btn');
  const open = drop.classList.toggle('open');
  btn.classList.toggle('open', open);
  if (open) {
    // Cerrar al hacer clic fuera
    setTimeout(() => document.addEventListener('click', _closeCCDrop, { once: true }), 0);
  }
}
function _closeCCDrop() {
  document.getElementById('cc_ms_drop')?.classList.remove('open');
  document.getElementById('cc_ms_btn')?.classList.remove('open');
}

// ── Multi-select: checkbox onChange ──────────────────────────────────────────
function _onCCCheck(cb) {
  _ccTodosMode = false; // al tocar un checkbox, salir del modo "todos"
  if (cb.checked) _ccSeleccionados.add(String(cb.value));
  else            _ccSeleccionados.delete(String(cb.value));
  _actualizarCCLabel();
}

// ── Multi-select: Seleccionar todos / Ninguno ─────────────────────────────────
function _ccSelectAll() {
  _ccTodosMode = true;           // sin filtro → mostrar todos los CC
  _ccSeleccionados.clear();
  document.querySelectorAll('#cc_ms_options input[type=checkbox]').forEach(cb => cb.checked = false);
  _actualizarCCLabel();
}
function _ccClearAll() {
  _ccTodosMode = false;          // filtro activo pero vacío → cero resultados
  _ccSeleccionados.clear();
  document.querySelectorAll('#cc_ms_options input[type=checkbox]').forEach(cb => cb.checked = false);
  _actualizarCCLabel();
}

// ── Actualizar etiqueta del botón ─────────────────────────────────────────────
function _actualizarCCLabel() {
  const label = document.getElementById('cc_ms_label');
  const btn   = document.getElementById('cc_ms_btn');
  if (!label) return;

  if (_ccTodosMode) {
    label.textContent = 'Todos los centros de costo';
    label.style.color = '';
    btn.querySelector('.cc-ms-count')?.remove();
    return;
  }

  const n = _ccSeleccionados.size;
  if (n === 0) {
    label.textContent = 'Sin centros seleccionados';
    label.style.color = 'var(--muted)';
    btn.querySelector('.cc-ms-count')?.remove();
  } else if (n === 1) {
    const cod  = [..._ccSeleccionados][0];
    const item = _ccCatalogo.find(c => String(c.cod) === cod);
    label.textContent = item ? item.nom : cod;
    label.style.color = '';
    _setOrCreateCount(btn, null);
  } else {
    label.textContent = `${n} centros seleccionados`;
    label.style.color = '';
    _setOrCreateCount(btn, n);
  }
}
function _setOrCreateCount(btn, n) {
  let badge = btn.querySelector('.cc-ms-count');
  if (n == null) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'cc-ms-count';
    btn.insertBefore(badge, btn.querySelector('.cc-ms-arrow'));
  }
  badge.textContent = n;
}

// ── Consulta principal ────────────────────────────────────────────────────────
async function cargarTrazabilidadCC() {
  const period = document.getElementById('cc_period').value;
  const estado = document.getElementById('cc_estado').value;
  const btn    = document.getElementById('cc_btnBuscar');
  const grid   = document.getElementById('cc_grid');
  const ui     = document.getElementById('cc_estado_ui');
  const kpis   = document.getElementById('cc_kpis');

  // Cerrar dropdown si está abierto
  _closeCCDrop();

  btn.disabled = true; btn.textContent = '⏳ Cargando...';
  ui.innerHTML = '<span style="font-size:22px;display:block;margin-bottom:8px;opacity:.35">⟳</span>Consultando base de datos…';
  ui.style.display = 'block';
  grid.innerHTML = '';
  kpis.style.display = 'none';

  try {
    const params = new URLSearchParams({ estado });
    if (period) params.set('codPeriod', period);

    // Sin centros seleccionados (modo "Ninguno") → resultado vacío sin consultar
    if (!_ccTodosMode && _ccSeleccionados.size === 0) {
      ui.innerHTML = `<span style="font-size:28px;display:block;margin-bottom:10px;opacity:.25">🏢</span>
        <strong>Sin centros de costo seleccionados.</strong><br>
        <span style="font-size:11px;margin-top:6px;display:block">
          Selecciona al menos un centro en el filtro superior o haz clic en "✓ Todos" para ver todos.
        </span>`;
      return;
    }

    // Multi-CC: enviar como lista separada por comas (solo si no es modo "todos")
    const ccList = _ccTodosMode ? [] : [..._ccSeleccionados];
    if (ccList.length > 0) params.set('codCcost', ccList.join(','));

    const r = await fetch(`/api/novedades/trazabilidad-ccost?${params}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const { centros } = await r.json();
    _ccData = centros || [];

    if (!_ccData.length) {
      const hint = ccList.length > 0 ? `los ${ccList.length} centros seleccionados`
                 : period            ? 'el período seleccionado'
                 : 'los filtros aplicados';
      ui.innerHTML = `<span style="font-size:28px;display:block;margin-bottom:10px;opacity:.25">🏢</span>
        No hay novedades registradas para <strong>${hint}</strong>.<br>
        <span style="font-size:11px;margin-top:6px;display:block">Prueba cambiando el estado a "Activos e inactivos" o ampliando el rango de períodos.</span>`;
      return;
    }
    ui.style.display = 'none';
    _renderCC();
  } catch (err) {
    ui.innerHTML = `<span style="color:var(--danger)">✕ Error al cargar: ${err.message}</span>`;
  } finally {
    btn.disabled = false; btn.textContent = '↺ Consultar';
  }
}

// ── Render de tarjetas ────────────────────────────────────────────────────────
function _renderCC() {
  const grid  = document.getElementById('cc_grid');
  const orden = document.getElementById('cc_orden').value;

  const sorted = [..._ccData].sort((a, b) => {
    if (orden === 'devengos')  return (b.total_devengos  || 0) - (a.total_devengos  || 0);
    if (orden === 'empleados') return (b.total_empleados || 0) - (a.total_empleados || 0);
    if (orden === 'nombre')    return (a.nom_ccost || '').localeCompare(b.nom_ccost || '');
    if (orden === 'neto') {
      const nA = (Number(a.total_devengos) || 0) - (Number(a.total_deducciones) || 0);
      const nB = (Number(b.total_devengos) || 0) - (Number(b.total_deducciones) || 0);
      return nB - nA;
    }
    return (b.total_novedades || 0) - (a.total_novedades || 0); // default: novedades
  });

  // KPIs globales
  const totNov  = sorted.reduce((s,c) => s + (c.total_novedades || 0), 0);
  const totDev  = sorted.reduce((s,c) => s + (Number(c.total_devengos)    || 0), 0);
  const totDed  = sorted.reduce((s,c) => s + (Number(c.total_deducciones) || 0), 0);
  const totNeto = totDev - totDed;
  document.getElementById('cc_kpi_centros').textContent     = sorted.length;
  document.getElementById('cc_kpi_novedades').textContent   = totNov.toLocaleString('es-CO');
  document.getElementById('cc_kpi_devengos').textContent    = _fmtCOP(totDev);
  document.getElementById('cc_kpi_deducciones').textContent = _fmtCOP(totDed);
  document.getElementById('cc_kpi_neto').textContent        = _fmtCOP(totNeto);
  document.getElementById('cc_kpis').style.display = 'grid';

  // Escalas para barras comparativas entre tarjetas
  const maxDev  = Math.max(...sorted.map(c => Number(c.total_devengos)    || 0), 1);
  const maxDed  = Math.max(...sorted.map(c => Number(c.total_deducciones) || 0), 1);
  const maxCant = Math.max(...sorted.map(c => Number(c.total_cantidad)    || 0), 1);

  grid.innerHTML = sorted.map((cc, idx) => {
    const pDev  = Math.round(((Number(cc.total_devengos)    || 0) / maxDev)  * 100);
    const pDed  = Math.round(((Number(cc.total_deducciones) || 0) / maxDed)  * 100);
    const pCant = Math.round(((Number(cc.total_cantidad)    || 0) / maxCant) * 100);
    const neto  = (Number(cc.total_devengos) || 0) - (Number(cc.total_deducciones) || 0);
    const netoColor = neto >= 0 ? 'var(--success)' : 'var(--danger)';

    const typePills = [
      cc.cnt_ocasionales ? `<span class="ccost-type-pill pill-ocas" title="Novedades ocasionales (pagos únicos, horas extra, etc.)">⊕ ${cc.cnt_ocasionales} Ocasionales</span>` : '',
      cc.cnt_fijas       ? `<span class="ccost-type-pill pill-fija" title="Novedades fijas (descuentos o devengos recurrentes)">⊞ ${cc.cnt_fijas} Fijas</span>` : '',
      cc.cnt_ausentismos ? `<span class="ccost-type-pill pill-aus"  title="Incapacidades, permisos y ausencias">⊖ ${cc.cnt_ausentismos} Ausentismos</span>` : '',
      cc.cnt_cambios     ? `<span class="ccost-type-pill pill-camb" title="Cambios en datos maestros o de ingreso">✎ ${cc.cnt_cambios} Cambios</span>` : '',
    ].filter(Boolean).join('');

    // Tabla de empleados del CC
    const empRows = (cc.empleados || []).map(e => {
      const empNeto = (Number(e.devengos) || 0) - (Number(e.deducciones) || 0);
      const minis = [
        e.ocasionales ? `<span class="ccost-emp-mini pill-ocas" title="Ocasionales">${e.ocasionales}</span>` : '',
        e.fijas       ? `<span class="ccost-emp-mini pill-fija" title="Fijas">${e.fijas}</span>` : '',
        e.ausentismos ? `<span class="ccost-emp-mini pill-aus"  title="Ausentismos">${e.ausentismos}</span>` : '',
        e.cambios     ? `<span class="ccost-emp-mini pill-camb" title="Cambios">${e.cambios}</span>` : '',
      ].filter(Boolean).join(' ');
      return `<tr>
        <td style="color:var(--cm-blue-light);font-weight:600;white-space:nowrap">${e.cedula || '—'}</td>
        <td style="font-weight:500">${e.nombre || '—'}</td>
        <td style="text-align:center"><span class="badge" style="background:rgba(201,168,76,0.12);color:var(--gold-light);font-size:10px">${e.novedades}</span></td>
        <td style="color:var(--success);font-weight:600;white-space:nowrap">${_fmtCOP(e.devengos)}</td>
        <td style="color:var(--danger);font-weight:600;white-space:nowrap">${_fmtCOP(e.deducciones)}</td>
        <td style="color:${(Number(e.devengos)||0)-(Number(e.deducciones)||0)>=0?'var(--success)':'var(--danger)'};font-weight:700;white-space:nowrap">${_fmtCOP(empNeto)}</td>
        <td style="text-align:right;color:var(--muted)">${e.cantidad > 0 ? Number(e.cantidad).toLocaleString('es-CO',{maximumFractionDigits:2}) : '—'}</td>
        <td style="text-align:center;color:#C48BFF">${e.dias_aus > 0 ? e.dias_aus + 'd' : '—'}</td>
        <td style="white-space:nowrap">${minis}</td>
      </tr>`;
    }).join('');

    return `
    <div class="ccost-card">
      <div class="ccost-card-head">
        <div class="ccost-card-icon">🏢</div>
        <div style="flex:1;min-width:0">
          <div class="ccost-card-title">${cc.nom_ccost || '—'}</div>
          <span class="ccost-card-code">${cc.COD_CCOST || ''}</span>
          <div class="ccost-badges">
            <span class="ccost-badge ccost-badge-emp" title="Empleados distintos con novedades">👥 ${cc.total_empleados} empleado${cc.total_empleados !== 1 ? 's' : ''}</span>
            <span class="ccost-badge ccost-badge-rec" title="Total de registros de novedades">📋 ${cc.total_novedades} registros</span>
            ${(cc.total_dias_aus > 0) ? `<span class="ccost-badge ccost-badge-aus" title="Días de ausentismo acumulados">🏥 ${cc.total_dias_aus}d aus.</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:10px;color:var(--muted);margin-bottom:2px">Última actividad</div>
          <div style="font-size:11px;color:var(--muted)">${cc.ultima_actividad ? new Date(cc.ultima_actividad).toLocaleDateString('es-CO') : '—'}</div>
          <div style="margin-top:6px;font-size:10px;color:var(--muted)">Neto</div>
          <div style="font-size:13px;font-weight:700;color:${netoColor}">${_fmtCOP(neto)}</div>
        </div>
      </div>

      <div class="ccost-metrics">
        <div class="ccost-metric-row">
          <div class="ccost-metric-label" title="Suma de todos los conceptos de tipo DEVENGO (pagos a favor del empleado)">Devengos</div>
          <div class="ccost-metric-bar-wrap">
            <div class="ccost-metric-bar" style="width:${pDev}%;background:var(--success)"></div>
          </div>
          <div class="ccost-metric-val" style="color:var(--success)">${_fmtCOP(cc.total_devengos)}</div>
        </div>
        <div class="ccost-metric-row">
          <div class="ccost-metric-label" title="Suma de todos los conceptos de tipo DEDUCCION (descuentos al empleado)">Deducciones</div>
          <div class="ccost-metric-bar-wrap">
            <div class="ccost-metric-bar" style="width:${pDed}%;background:var(--danger)"></div>
          </div>
          <div class="ccost-metric-val" style="color:var(--danger)">${_fmtCOP(cc.total_deducciones)}</div>
        </div>
        <div class="ccost-metric-row">
          <div class="ccost-metric-label" title="Suma de cantidades (horas, unidades) en novedades ocasionales y fijas">Cant. / Horas</div>
          <div class="ccost-metric-bar-wrap">
            <div class="ccost-metric-bar" style="width:${pCant}%;background:var(--cm-blue)"></div>
          </div>
          <div class="ccost-metric-val" style="color:var(--cm-blue-light)">${Number(cc.total_cantidad||0).toLocaleString('es-CO',{maximumFractionDigits:2})}</div>
        </div>
      </div>

      <div class="ccost-type-strip">${typePills || '<span style="font-size:11px;color:var(--muted)">Sin tipos registrados</span>'}</div>

      <div style="display:flex;gap:8px;padding:0 14px 10px;flex-wrap:wrap">
        <button class="ccost-toggle" style="flex:1" onclick="_toggleCCEmp(this)" data-idx="${idx}">
          <span class="arrw">▾</span> Ver ${cc.empleados?.length || 0} empleado${(cc.empleados?.length||0) !== 1 ? 's' : ''} del área
        </button>
        <button onclick="_ccVerEnHistorial('${cc.COD_CCOST}')"
          style="padding:7px 12px;background:rgba(32,167,201,0.1);border:1px solid rgba(32,167,201,0.3);
                 color:var(--cm-blue-light);border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap"
          title="Ir al buscador de trazabilidad y filtrar por este centro de costo">
          🔍 Ver en historial
        </button>
      </div>
      <div class="ccost-emp-wrap">
        <table class="ccost-emp-table">
          <thead><tr>
            <th>Cédula</th><th>Empleado</th>
            <th style="text-align:center" title="Total de registros de novedades">Registros</th>
            <th title="Suma de devengos del empleado">Devengos</th>
            <th title="Suma de deducciones del empleado">Deducciones</th>
            <th title="Devengos menos deducciones (neto)">Neto</th>
            <th style="text-align:right" title="Suma de cantidades/horas">Cant.</th>
            <th style="text-align:center" title="Días de ausentismo">Aus.</th>
            <th title="Tipos de novedades del empleado">Tipos</th>
          </tr></thead>
          <tbody>${empRows || '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:14px">Sin detalle de empleados</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

function _toggleCCEmp(btn) {
  btn.classList.toggle('open');
  const wrap = btn.closest('.ccost-card').querySelector('.ccost-emp-wrap');
  if (wrap) wrap.classList.toggle('open');
}

function _fmtCOP(val) {
  const n = Number(val) || 0;
  if (n === 0) return '—';
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

// ── "Ver en historial" — pre-llena el buscador histórico con el CC seleccionado ─
function _ccVerEnHistorial(codCcost) {
  // Seleccionar el CC en el filtro del buscador histórico
  const selHist = document.getElementById('hist_ccost');
  if (selHist) {
    selHist.value = codCcost;
    // Si la opción no existe (raro), no hacer nada raro
  }

  // Limpiar otros filtros para que el CC sea el único criterio activo
  document.getElementById('hist_q').value = '';
  document.getElementById('hist_period').selectedIndex = 0;
  document.getElementById('hist_estado').value = 'todos';

  // Lanzar búsqueda
  histBuscar();

  // Scroll al buscador histórico
  setTimeout(() => {
    const histCard = document.querySelector('#page-dashboard .hist-card:not(.ccost-section)');
    if (histCard) histCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}

// ── Auto-carga cuando el usuario navega al Dashboard ─────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // _initDashboardCC carga sus propios datos (períodos + CC) de forma independiente
  _initDashboardCC();
});

// ============================================================================
async function histBuscar() {
  const q       = document.getElementById('hist_q').value.trim();
  const tipo    = document.getElementById('hist_tipo').value;
  const period  = document.getElementById('hist_period').value;
  const estado  = document.getElementById('hist_estado').value;
  const desde   = document.getElementById('hist_desde').value;
  const hasta   = document.getElementById('hist_hasta').value;
  const limite  = document.getElementById('hist_limite').value;
  const ccost   = document.getElementById('hist_ccost')?.value || '';

  const params = new URLSearchParams({ tipo, estado, limite });
  if (q)      params.set('q', q);
  if (period) params.set('codPeriod', period);
  if (desde)  params.set('desde', desde);
  if (hasta)  params.set('hasta', hasta);
  if (ccost)  params.set('codCcost', ccost);

  const btn = document.querySelector('.hist-btn-search');
  btn.textContent = 'Buscando...'; btn.disabled = true;

  try {
    const r   = await fetch(`/api/novedades/historial?${params}`);
    const data = await r.json();
    histRenderizar(data.registros || [], data.total || 0);
  } catch (e) {
    document.getElementById('tbHistorial').innerHTML =
      `<tr><td colspan="10" class="hist-empty" style="color:var(--danger)">Error al buscar: ${e.message}</td></tr>`;
    document.getElementById('histResultsWrap').style.display = '';
  } finally {
    btn.textContent = 'Buscar'; btn.disabled = false;
  }
}

function histLimpiar() {
  ['hist_q','hist_desde','hist_hasta'].forEach(id => document.getElementById(id).value = '');
  ['hist_tipo','hist_period','hist_estado','hist_limite','hist_ccost'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  document.getElementById('histResultsWrap').style.display = 'none';
}

function histRenderizar(registros, total) {
  const wrap = document.getElementById('histResultsWrap');
  const tb   = document.getElementById('tbHistorial');
  const cnt  = document.getElementById('histCount');

  wrap.style.display = '';
  // Si el total real es mayor que los registros mostrados, indicar ambos
  if (total > registros.length) {
    cnt.textContent = `Mostrando ${registros.length} de ${total} registro${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''} (aumenta el límite para ver más)`;
  } else {
    cnt.textContent = `${total} registro${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`;
  }

  if (!registros.length) {
    tb.innerHTML = `<tr><td colspan="10" class="hist-empty">Sin resultados para los filtros aplicados</td></tr>`;
    return;
  }

  tb.innerHTML = registros.map(r => {
    const tipo     = r.TIPO_NOVED || '';
    const inactivo = r.ACT_ESTA === 'I';

    const badgeClass = {
      OCASIONAL:  'badge-hist-ocasi',
      FIJA:       'badge-hist-fija',
      AUSENTISMO: 'badge-hist-ausen',
      CAMBIO:     'badge-hist-cambi'
    }[tipo] || '';

    const periodo = r.PER_ANO
      ? `${r.PER_ANO}-${String(r.PER_MES).padStart(2,'0')}-Q${r.PER_QNA}<div class="hist-extra">${fmtFecha(r.PER_FINI)} → ${fmtFecha(r.PER_FFIN)}</div>`
      : `#${r.COD_PERIOD}`;

    // Detalle específico por tipo
    let detalle = '—';
    if (tipo === 'OCASIONAL') {
      detalle = r.CANTIDAD != null ? `Cant: ${Number(r.CANTIDAD).toLocaleString('es-CO')}` : '—';
    } else if (tipo === 'FIJA') {
      const fi = r.FEC_INI_ESP ? fmtFecha(r.FEC_INI_ESP) : '';
      const ff = r.FEC_FIN_ESP ? fmtFecha(r.FEC_FIN_ESP) : '';
      const ap = r.APLICACION  ? `<div class="hist-extra">${escH(r.APLICACION)}</div>` : '';
      detalle  = fi ? `${fi} → ${ff}${ap}` : '—';
    } else if (tipo === 'AUSENTISMO') {
      const fi    = r.FEC_INI_ESP ? fmtFecha(r.FEC_INI_ESP) : '';
      const ff    = r.FEC_FIN_ESP ? fmtFecha(r.FEC_FIN_ESP) : '';
      const dias  = r.DIAS_TOTAL  != null ? `<div class="hist-extra">${r.DIAS_TOTAL} días${r.DIAGNOSTICO ? ' · '+escH(r.DIAGNOSTICO) : ''}</div>` : '';
      detalle     = fi ? `${fi} → ${ff}${dias}` : '—';
    } else if (tipo === 'CAMBIO') {
      const ant = r.VALOR_ANTE  ? `<div class="hist-extra">Anterior: ${escH(r.VALOR_ANTE)}</div>` : '';
      detalle   = r.VALOR_NUEVO ? `${escH(r.VALOR_NUEVO)}${ant}` : '—';
    }

    // Valor/Cantidad
    let valorCol = '—';
    if (tipo === 'OCASIONAL' || tipo === 'FIJA') {
      valorCol = r.VALOR != null ? fmtMoneda(r.VALOR) : '—';
    }

    const obs = r.OBS_NOVED ? `<div class="hist-extra" title="${escH(r.OBS_NOVED)}">${escH(r.OBS_NOVED).substring(0,40)}${r.OBS_NOVED.length>40?'…':''}</div>` : '';

    return `<tr class="${inactivo ? 'inactivo' : ''}">
      <td><span class="badge ${badgeClass}">${tipo}</span></td>
      <td style="font-size:11.5px">${periodo}</td>
      <td style="font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:600;color:var(--cm-blue)">${escH(r.CEDULA||'')}</td>
      <td>${escH(r.NOMBRE||'')}${obs}</td>
      <td style="font-size:12px">${escH(r.CONCEPTO||'')}</td>
      <td style="font-size:12px">${detalle}</td>
      <td style="text-align:right;font-family:'Barlow Condensed',sans-serif;font-size:13px">${valorCol}</td>
      <td style="font-size:11.5px;white-space:nowrap">${fmtFecha(r.FEC_REGI)}</td>
      <td style="font-size:11.5px;color:var(--muted)">${escH(r.ACT_USUA||'')}</td>
      <td><span class="badge ${inactivo ? 'badge-inact' : 'badge-act'}">${inactivo ? 'Inactivo' : 'Activo'}</span></td>
    </tr>`;
  }).join('');
}

// ─── FUNCIÓN PARA MOSTRAR BIENVENIDA Y PERÍODO ──────────────────────────────
// CORRECCIÓN #1 y #2: Período automático desde BD + Nombre de usuario correcto
async function inicializarInterfaz() {
  try {
    // ──────────────────────────────────────────────────────────────────────────
    // CORRECCIÓN #2: DOS PROCESOS INDEPENDIENTES
    // Proceso 1: Obtener nombre COMPLETO para "Usuario Registrador" y subtítulo
    // Proceso 2: Obtener NOM_TERC + SEG_NOMB para "¡Bienvenido, [nombres]!"
    // ──────────────────────────────────────────────────────────────────────────
    let nombreCompleto = null;
    let usuarioDisplay = 'Usuario';
    let nombreBienvenida = 'Usuario';

    // Obtener identificador del usuario desde AuthUtil o localStorage
    if (typeof AuthUtil !== 'undefined' && AuthUtil.getNombre) {
      nombreCompleto = AuthUtil.getNombre();
      console.log('Identificador obtenido de AuthUtil (RAW):', nombreCompleto);
    } else {
      console.warn('AuthUtil no disponible, intentando localStorage');
      const usuarioJson = localStorage.getItem('usuario');
      if (usuarioJson) {
        const usuario = JSON.parse(usuarioJson);
        nombreCompleto = usuario.nombre;
        console.log('Identificador obtenido de localStorage:', nombreCompleto);
      }
    }

    // Si tenemos el identificador del usuario, ejecutar dos procesos independientes
    if (nombreCompleto) {
      // ────────────────────────────────────────────────────────────────────────
      // PROCESO 1: Obtener nombre COMPLETO desde BD (para Usuario Registrador)
      // ────────────────────────────────────────────────────────────────────────
      try {
        const _tkn = (typeof _getAuthToken === 'function') ? _getAuthToken() : (localStorage.getItem('authToken') || sessionStorage.getItem('authToken'));
        const resp = await fetch('/api/auth/datos', { headers: { 'Authorization': `Bearer ${_tkn}` } });
        if (resp.ok) {
          const userData = await resp.json();
          let nombreCompletoConstructed = '';
          if (userData.APE_TERC) nombreCompletoConstructed += userData.APE_TERC.trim();
          if (userData.SEG_APEL) nombreCompletoConstructed += ' ' + userData.SEG_APEL.trim();
          if (userData.NOM_TERC) nombreCompletoConstructed += ' ' + userData.NOM_TERC.trim();
          if (userData.SEG_NOMB) nombreCompletoConstructed += ' ' + userData.SEG_NOMB.trim();
          usuarioDisplay = nombreCompletoConstructed.trim() || 'Usuario';
          console.log('PROCESO 1 ✓ Nombre desde BD:', usuarioDisplay);
        } else {
          console.log('PROCESO 1: API no disponible, usando fallback');
          usuarioDisplay = nombreCompleto;
        }
      } catch (e) {
        console.log('PROCESO 1 Error:', e);
        usuarioDisplay = nombreCompleto;
      }

      // ────────────────────────────────────────────────────────────────────────
      // PROCESO 2: Obtener NOM_TERC + SEG_NOMB para "¡Bienvenido!"
      // ────────────────────────────────────────────────────────────────────────
      // Estrategia:
      // 1. Primero intentar desde API
      // 2. Si falla, usar lógica inteligente de parsing del identificador
      // ────────────────────────────────────────────────────────────────────────
      let proceso2Exitoso = false;

      try {
        const _tkn2 = (typeof _getAuthToken === 'function') ? _getAuthToken() : (localStorage.getItem('authToken') || sessionStorage.getItem('authToken'));
        const resp2 = await fetch('/api/auth/datos', { headers: { 'Authorization': `Bearer ${_tkn2}` } });
        if (resp2.ok) {
          const userData = await resp2.json();
          if (userData.NOM_TERC) {
            let nb = userData.NOM_TERC.trim();
            if (userData.SEG_NOMB) nb += ' ' + userData.SEG_NOMB.trim();
            nombreBienvenida = nb;
            proceso2Exitoso = true;
            console.log('PROCESO 2 ✓ Bienvenida desde BD:', nombreBienvenida);
          }
        }
      } catch (e) {
        console.log('PROCESO 2: Error en llamada API:', e);
      }

      // Si la API falló o no retornó datos, usar lógica de parsing inteligente
      if (!proceso2Exitoso) {
        console.log('PROCESO 2: Usando parsing inteligente del identificador');
        const tokensIdentificador = nombreCompleto.trim().toUpperCase().split(/\s+/);
        console.log('PROCESO 2: Tokens del identificador:', tokensIdentificador);

        // Estrategia: Si hay 4+ tokens, los últimos 2 son NOM_TERC + SEG_NOMB
        // Si hay 3, tokens[1] es NOM_TERC y tokens[2] es SEG_NOMB
        // Si hay 2, token[1] es el nombre
        // Si hay 1, usarlo como es

        if (tokensIdentificador.length >= 4) {
          // Formato: APE_TERC SEG_APEL NOM_TERC SEG_NOMB
          nombreBienvenida = tokensIdentificador.slice(-2).join(' ');
          console.log('PROCESO 2 ✓ 4+ tokens - Extrayendo últimos 2:', nombreBienvenida);
        } else if (tokensIdentificador.length === 3) {
          // Formato: APE_TERC NOM_TERC SEG_NOMB
          nombreBienvenida = tokensIdentificador.slice(1).join(' ');
          console.log('PROCESO 2 ✓ 3 tokens - Extrayendo desde índice 1:', nombreBienvenida);
        } else if (tokensIdentificador.length === 2) {
          // Formato: APE_TERC NOM_TERC
          nombreBienvenida = tokensIdentificador[1];
          console.log('PROCESO 2 ✓ 2 tokens - Usando segundo token:', nombreBienvenida);
        } else {
          // Fallback: solo un token
          nombreBienvenida = tokensIdentificador[0];
          console.log('PROCESO 2 ✓ 1 token - Usando único token:', nombreBienvenida);
        }
      }

      // Actualizar elementos del DOM con valores obtenidos de ambos procesos
      document.getElementById('welcomeMessage').textContent = `¡Bienvenido, ${nombreBienvenida}!`;
      document.getElementById('userNameDisplay').textContent = usuarioDisplay;
      document.getElementById('cfgUsuario').value = usuarioDisplay;

      console.log('✓ Interfaz actualizada:', {
        bienvenida: `¡Bienvenido, ${nombreBienvenida}!`,
        subtitulo: usuarioDisplay,
        usuarioRegistrador: usuarioDisplay
      });
    } else {
      document.getElementById('welcomeMessage').textContent = '¡Bienvenido!';
      document.getElementById('userNameDisplay').textContent = 'Usuario';
      console.warn('No se pudo obtener el identificador del usuario');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CORRECCIÓN #1: Período automático desde NO_PERIOD basado en fecha actual
    // Badge muestra: "AÑO-MES-QNA" (ej: 2026-04-2Q)
    // Campo período muestra: "AÑO-MES FECHA_INICIO / FECHA_FIN"
    // NO es editable, se obtiene de la BD
    // ──────────────────────────────────────────────────────────────────────────
    try {
      const respPeriodo = await fetch('/api/ausentismos/periodo-actual');
      if (respPeriodo.ok) {
        const periodoData = respPeriodo.json();
        periodoData.then(data => {
          // La API devuelve camelCase: data.anio, data.mes, data.quincena,
          // data.fechaInicio, data.fechaFin, data.etiqueta (ej: "2026-05-Q1").
          // Usamos data.etiqueta directamente para el badge y construimos el
          // texto del dashboard con las fechas formateadas.
          const fi = data.fechaInicio
            ? new Date(data.fechaInicio).toLocaleDateString('es-CO') : '';
          const ff = data.fechaFin
            ? new Date(data.fechaFin).toLocaleDateString('es-CO')    : '';
          const periodText = fi && ff
            ? `${data.etiqueta}  (${fi} → ${ff})`
            : (data.etiqueta || '');
          document.getElementById('periodoBadge').textContent = `Período: ${data.etiqueta || '—'}`;
          document.getElementById('cfgPeriodo').value = periodText;

          // IMPORTANTE: Hacer el campo readonly para que no sea editable
          document.getElementById('cfgPeriodo').setAttribute('readonly', 'readonly');
          document.getElementById('cfgPeriodo').style.background = 'rgba(255,255,255,0.03)';

          console.log('Período cargado desde BD - Badge:', data.etiqueta, '| Dashboard:', periodText);
        }).catch(e => {
          console.warn('Error parseando respuesta período:', e);
          usarPeriodoLocal();
        });
      } else {
        console.warn('No se pudo obtener período de la BD, usando cálculo local');
        usarPeriodoLocal();
      }
    } catch (e) {
      console.warn('Error al obtener período desde API:', e);
      usarPeriodoLocal();
    }
  } catch (error) {
    console.error('Error inicializando interfaz:', error);
  }
}

// Función auxiliar para usar el período calculado localmente si la API falla
function usarPeriodoLocal() {
  const { quincena, rango, formatoBadge } = calcularQuincenaActual();
  document.getElementById('cfgPeriodo').value = rango;
  document.getElementById('cfgPeriodo').setAttribute('readonly', 'readonly');
  document.getElementById('cfgPeriodo').style.background = 'rgba(255,255,255,0.03)';
  // Mostrar solo formato AÑO-MES-QUINCENA en el badge
  document.getElementById('periodoBadge').textContent = `Período: ${formatoBadge}`;
}

// ─── MAESTRO ORIGINAL ────────────────────────────────────────────────────────

function mo_actualizarNomComp() {
  const ape1 = (document.getElementById('mo_ape1').value || '').trim().toUpperCase();
  const ape2 = (document.getElementById('mo_ape2').value || '').trim().toUpperCase();
  const nom1 = (document.getElementById('mo_nom1').value || '').trim().toUpperCase();
  const nom2 = (document.getElementById('mo_nom2').value || '').trim().toUpperCase();
  document.getElementById('mo_nomcomp').value = [ape1, ape2, nom1, nom2].filter(Boolean).join(' ');
}

function limpiarFormMaestro() {
  ['mo_numiden','mo_codalt','mo_ape1','mo_ape2','mo_nom1','mo_nom2','mo_nomcomp',
   'mo_hijos','mo_fnac','mo_ciudadexp','mo_ciudad','mo_tel1','mo_tel2','mo_correo','mo_dir',
   'mo_valorh','mo_dvac','mo_numcta','mo_sucursal','mo_cuegasto',
   'mo_riesgo','mo_promsalud','mo_numcontra','mo_fingreso','mo_fretiro','mo_causaret',
   'mo_rete','mo_dedviv','mo_dedsalud','mo_deddep'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('mo_hijos').value = '0';
  document.getElementById('mo_dvac').value  = '15';
  document.getElementById('mo_cuegasto').value = '0';
}

async function cargarCatalogos() {
  try {
    const r = await fetch('/api/maestros/catalogos');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const cat = await r.json();

    const fill = (selId, items, valKey, nomKey, emptyLabel) => {
      const sel = document.getElementById(selId);
      if (!sel) return;
      sel.innerHTML = `<option value="">${emptyLabel || '— Sin asignar —'}</option>` +
        items.map(i => `<option value="${i[valKey]}">${i[nomKey]}</option>`).join('');
    };

    fill('mo_tipdoc', cat.tpdoc, 'cod', 'nom', '— Tipo Documento —');
    fill('mo_grsan',  cat.grsan,  'cod', 'nom', '— Sin asignar —');
    fill('mo_estciv', cat.estciv, 'cod', 'nom', '— Sin asignar —');
    fill('mo_banco',  cat.banco,  'cod', 'nom', '— Sin asignar —');
    fill('mo_tipcta', cat.tpcta,  'cod', 'nom', '— Sin asignar —');
    fill('mo_ccost',  cat.ccost,  'cod', 'nom', '— Sin asignar —');
    fill('mo_cargo',  cat.cargo,  'cod', 'nom', '— Seleccionar cargo —');
    fill('mo_eps',    cat.eps,    'cod', 'nom', '— Seleccionar EPS —');
    fill('mo_afp',    cat.afp,    'cod', 'nom', '— Seleccionar AFP —');
    fill('mo_caja',   cat.caja,   'cod', 'nom', '— Seleccionar Caja —');
    fill('mo_cesan',  cat.cesan,  'cod', 'nom', '— Seleccionar Cesantías —');

    console.log('✓ Catálogos del Maestro Original cargados');
  } catch (err) {
    console.error('❌ cargarCatalogos:', err.message);
  }
}

async function guardarMaestro() {
  const btn = document.getElementById('btnGuardarMaestro');
  const numiden  = document.getElementById('mo_numiden').value.trim();
  const ape1     = document.getElementById('mo_ape1').value.trim();
  const nom1     = document.getElementById('mo_nom1').value.trim();
  const codCargo = document.getElementById('mo_cargo').value;
  const fingreso = document.getElementById('mo_fingreso').value;

  if (!numiden)  { alert('El número de identificación es obligatorio.');  return; }
  if (!ape1)     { alert('El primer apellido es obligatorio.');            return; }
  if (!nom1)     { alert('El primer nombre es obligatorio.');              return; }
  if (!codCargo) { alert('Debe seleccionar un cargo.');                   return; }
  if (!fingreso) { alert('La fecha de ingreso es obligatoria.');           return; }

  const body = {
    NUM_IDEN:    numiden,
    COD_ALT:     document.getElementById('mo_codalt').value.trim()     || null,
    COD_TPDOC:   document.getElementById('mo_tipdoc').value,
    APE_TERC:    ape1,
    SEG_APEL:    document.getElementById('mo_ape2').value.trim()       || null,
    NOM_TERC:    nom1,
    SEG_NOMB:    document.getElementById('mo_nom2').value.trim()       || null,
    SEX_FUNC:    document.getElementById('mo_sexo').value,
    COD_GRSAN:   document.getElementById('mo_grsan').value             || null,
    COD_ESTCIV:  document.getElementById('mo_estciv').value            || null,
    CNT_HIJO:    document.getElementById('mo_hijos').value             || 0,
    FEC_NAC:     document.getElementById('mo_fnac').value              || null,
    CIU_EXPED:   document.getElementById('mo_ciudadexp').value         || null,
    COD_MPIO:    document.getElementById('mo_ciudad').value            || null,
    TEL_TERC:    document.getElementById('mo_tel1').value              || '0',
    TEL_TERC2:   document.getElementById('mo_tel2').value              || '',
    DIR_MAIL:    document.getElementById('mo_correo').value            || '',
    DIR_TERC:    document.getElementById('mo_dir').value               || '',
    COD_CARGO:   codCargo,
    VAL_HORA:    document.getElementById('mo_valorh').value            || 0,
    TIP_SALAR:   document.getElementById('mo_classal').value,
    MOD_LIQUID:  document.getElementById('mo_modoliq').value,
    JOR_SABAD:   document.getElementById('mo_sabado').value,
    DIA_VACAC:   document.getElementById('mo_dvac').value              || 15,
    CUE_PENSIO:  document.getElementById('mo_pension').value           || null,
    EMP_FORAN:   document.getElementById('mo_extran').value,
    DIR_FORAN:   document.getElementById('mo_dirforan').value,
    COD_TPCTA:   document.getElementById('mo_tipcta').value            || 0,
    COD_BANCO:   document.getElementById('mo_banco').value             || 0,
    NUM_CTA:     document.getElementById('mo_numcta').value            || null,
    NOM_SUCUR:   document.getElementById('mo_sucursal').value          || 'NO APLICA',
    COD_CCOST:   document.getElementById('mo_ccost').value             || 0,
    CUE_GASTO:   document.getElementById('mo_cuegasto').value          || 0,
    COD_EPS:     document.getElementById('mo_eps').value               || null,
    COD_AFP:     document.getElementById('mo_afp').value               || null,
    COD_CAJA:    document.getElementById('mo_caja').value              || null,
    COD_CESAN:   document.getElementById('mo_cesan').value             || null,
    GRA_RIESGO:  document.getElementById('mo_riesgo').value            || '0',
    PRO_SALUD:   document.getElementById('mo_promsalud').value         || '0',
    TIP_CONTRA:  document.getElementById('mo_tipcontrato').value,
    NUM_CONTRA:  document.getElementById('mo_numcontra').value         || null,
    FEC_INGRES:  fingreso,
    FEC_RETIRO:  document.getElementById('mo_fretiro').value           || null,
    CAU_RETIRO:  document.getElementById('mo_causaret').value          || 'NO APLICA',
    POR_RETEN:   document.getElementById('mo_rete').value              || 0,
    DED_VIVIEN:  document.getElementById('mo_dedviv').value            || 0,
    DED_SALUD:   document.getElementById('mo_dedsalud').value          || 0,
    DED_DEPEN:   document.getElementById('mo_deddep').value            || 0,
  };

  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    const resp = await fetch('/api/maestros/empleado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      const errEl = document.getElementById('alertMaestroErr');
      errEl.textContent = '✗ ' + (data.error || 'Error desconocido');
      errEl.style.display = 'flex';
      errEl.classList.add('show');
      setTimeout(() => { errEl.classList.remove('show'); errEl.style.display = 'none'; }, 5000);
      return;
    }

    showAlert('alertMaestro');
    limpiarFormMaestro();
    cargarEmpleadosBD();
    addActivity('Maestro', data.nombre || numiden, 'Alta');
    updateBadges();
  } catch (err) {
    alert('Error de red: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '⊕ Guardar en Base de Datos';
  }
}

async function cargarEmpleadosBD() {
  const tb = document.getElementById('tbMaestro');
  tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:24px">Cargando...</td></tr>';
  try {
    const r = await fetch('/api/maestros/empleados');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = await r.json();
    state.maestroOriginal = rows;
    renderMaestro();
    updateBadges();
  } catch (err) {
    tb.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--danger);padding:24px">Error al cargar: ${err.message}</td></tr>`;
  }
}

function renderMaestro() {
  const tb = document.getElementById('tbMaestro');
  if (!state.maestroOriginal.length) {
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:32px">Sin registros en BD</td></tr>';
    return;
  }
  tb.innerHTML = state.maestroOriginal.map(r => {
    const eps   = (r.eps     || '').trim() || '—';
    const afp   = (r.afp     || '').trim() || '—';
    const cc    = (r.ccosto  || '').trim() || '—';
    const cargo = (r.cargo   || '').trim() || '—';
    const fi    = (r.fingreso|| '').trim() || '—';
    const vh    = r.valorh != null ? Number(r.valorh).toLocaleString('es-CO') : '—';
    const est   = r.estado === 'A'
      ? '<span class="badge badge-dev">Activo</span>'
      : '<span class="badge" style="background:rgba(112,111,111,.2);color:var(--muted)">Inactivo</span>';
    const ced   = r.cedula ?? '';
    return `<tr class="maestro-main" id="mrow-${ced}">
      <td style="width:36px;text-align:center">
        <button class="btn-expand" id="btnExp-${ced}" onclick="toggleDetalleEmpleado('${ced}',this)" title="Ver ficha completa">▾</button>
      </td>
      <td><strong style="color:var(--cm-blue-light)">${ced || '—'}</strong></td>
      <td>${r.nombre || '—'}</td>
      <td style="font-size:12px;color:var(--muted)">${cargo}</td>
      <td style="font-size:12px">${eps}</td>
      <td style="font-size:12px">${afp}</td>
      <td style="font-size:12px">${fi}</td>
      <td style="font-size:12px">${cc}</td>
      <td>${vh}</td>
      <td>${est}</td>
    </tr>`;
  }).join('');
}

// ─── DETALLE EXPANDIBLE DEL EMPLEADO ─────────────────────────────────────────
const _detalleCache = {};

async function toggleDetalleEmpleado(cedula, btn) {
  const existingRow = document.getElementById('detexp-' + cedula);
  if (existingRow) {
    existingRow.remove();
    btn.classList.remove('open');
    return;
  }

  btn.classList.add('open');

  // Insertar fila de detalle inmediatamente con loader
  const mainRow = document.getElementById('mrow-' + cedula);
  const colCount = 10;
  const detRow = document.createElement('tr');
  detRow.id = 'detexp-' + cedula;
  detRow.className = 'detalle-expand-row';
  detRow.innerHTML = `<td colspan="${colCount}"><div class="detalle-inner"><div class="detalle-loading">⟳ Cargando ficha del empleado...</div></div></td>`;
  mainRow.insertAdjacentElement('afterend', detRow);

  try {
    // Usar caché para no re-consultar si ya se cargó antes
    let d = _detalleCache[cedula];
    if (!d) {
      const res = await fetch(`/api/maestros/detalle-empleado?cedula=${encodeURIComponent(cedula)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      d = await res.json();
      _detalleCache[cedula] = d;
    }
    detRow.querySelector('.detalle-inner').innerHTML = _buildDetalleHTML(d);
  } catch (err) {
    btn.classList.remove('open');
    detRow.querySelector('.detalle-inner').innerHTML = `<div class="detalle-loading" style="color:var(--danger)">✕ Error al cargar: ${err.message}</div>`;
  }
}

function _df(label, val, hi = false, fallback = '—', allowZero = false) {
  const s = val !== null && val !== undefined ? String(val).trim() : '';
  const valid = s !== '' && s !== 'NO APLICA' && (allowZero || s !== '0');
  const v = valid ? s : fallback;
  const cls = hi && v !== fallback ? 'hi' : (v === fallback ? 'mu' : '');
  return `<div class="detalle-field"><div class="detalle-label">${label}</div><div class="detalle-val ${cls}">${v}</div></div>`;
}

function _buildDetalleHTML(d) {
  const initials = (d.NOM_COMP || '?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('');
  const fmtDate = v => {
    if (!v) return '—';
    const s = String(v);
    if (s.includes('T')) { const dt = new Date(v); return isNaN(dt) ? s : dt.toLocaleDateString('es-CO'); }
    return s.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$1/$2/$3') || '—';
  };
  const fmtMoney = v => {
    const n = parseFloat(String(v || '').replace(/[^0-9.-]/g,''));
    return (!isNaN(n) && n !== 0) ? n.toLocaleString('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:0}) : '';
  };
  const sexo = d.SEX_FUNC === 'M' ? 'Masculino' : d.SEX_FUNC === 'F' ? 'Femenino' : d.SEX_FUNC || '—';
  const estado = d.FEC_RETIRO && d.FEC_RETIRO.trim() && d.FEC_RETIRO.trim() !== 'NO APLICA'
    ? `<span class="badge badge-inact">Retirado · ${fmtDate(d.FEC_RETIRO)}</span>`
    : `<span class="badge badge-dev">Activo</span>`;

  return `
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border)">
    <div style="width:44px;height:44px;border-radius:50%;background:rgba(32,167,201,0.15);border:2px solid var(--border);
                display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;
                color:var(--cm-blue);flex-shrink:0">${initials}</div>
    <div>
      <div style="font-size:15px;font-weight:700;color:var(--text)">${d.NOM_COMP || '—'}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">${d.NOM_CARGO || 'Sin cargo'}</div>
    </div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--cm-blue-light);font-weight:600">CC ${d.NUM_IDEN || '—'}</span>
      ${estado}
      <button onclick="abrirEditarEmpleado('${d.NUM_IDEN}')"
        style="background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.4);color:var(--gold-light);
               font-size:12px;font-weight:600;padding:5px 13px;border-radius:7px;cursor:pointer;
               letter-spacing:0.04em;transition:background .15s;"
        onmouseover="this.style.background='rgba(201,168,76,0.28)'"
        onmouseout="this.style.background='rgba(201,168,76,0.15)'"
        title="Editar ficha del empleado">✎ Editar</button>
    </div>
  </div>

  <div class="detalle-grid">

    <div class="detalle-section" style="--accent:var(--cm-blue)">
      <div class="detalle-section-title">Identificación</div>
      ${_df('Tipo Documento', d.NOM_TPDOC)}
      ${_df('Número de Identificación', d.NUM_IDEN, true)}
      ${_df('Código Alterno', d.COD_ALT)}
      ${_df('Primer Nombre', d.NOM_TERC)}
      ${_df('Segundo Nombre', d.SEG_NOMB)}
      ${_df('Primer Apellido', d.APE_TERC)}
      ${_df('Segundo Apellido', d.SEG_APEL)}
    </div>

    <div class="detalle-section" style="--accent:#4DC4E0">
      <div class="detalle-section-title">Contacto</div>
      ${_df('Municipio de Residencia', d.NOM_MUNI)}
      ${_df('Dirección', d.DIR_TERC)}
      ${_df('Teléfono 1', d.TEL_TERC)}
      ${_df('Teléfono 2', d.TEL_TERC2)}
      ${_df('Correo Electrónico', d.DIR_MAIL)}
      ${_df('Última Actualización', fmtDate(d.t_act_hora))}
    </div>

    <div class="detalle-section" style="--accent:#9B5BD5">
      <div class="detalle-section-title">Datos Personales</div>
      ${_df('Sexo', sexo)}
      ${_df('Grupo Sanguíneo', d.NOM_GRSAN)}
      ${_df('Estado Civil', d.NOM_ESTCIV)}
      ${_df('Cantidad de Hijos', d.CNT_HIJO, false, '—', true)}
      ${_df('Fecha de Nacimiento', fmtDate(d.FEC_NAC))}
    </div>

    <div class="detalle-section" style="--accent:#4CAF82">
      <div class="detalle-section-title">Cargo y Salario</div>
      ${_df('Cargo', d.NOM_CARGO, true)}
      ${_df('% del Cargo', d.POR_CARGO ? d.POR_CARGO + '%' : '')}
      ${_df('Valor Hora', d.VAL_HORA ? Number(d.VAL_HORA).toLocaleString('es-CO') : '')}
      ${_df('Tipo Salario', d.TIP_SALAR)}
      ${_df('Modo Liquidación', d.MOD_LIQUID)}
      ${_df('Trabaja Sábado', d.JOR_SABAD)}
      ${_df('Días Vacaciones', d.DIA_VACAC)}
      ${_df('Grado de Riesgo', d.GRA_RIESGO)}
    </div>

    <div class="detalle-section" style="--accent:#E8A84C">
      <div class="detalle-section-title">Seguridad Social</div>
      ${_df('EPS', d.nom_eps, true)}
      ${_df('AFP (Pensiones)', d.nom_afp, true)}
      ${_df('Caja Compensación', d.nom_caja)}
      ${_df('Fondo Cesantías', d.nom_cesan)}
      ${_df('Cuenta Pensión', d.CUE_PENSIO)}
      ${_df('% Retención', d.POR_RETEN)}
      ${_df('Ded. Vivienda', fmtMoney(d.DED_VIVIEN))}
      ${_df('Ded. Salud', fmtMoney(d.DED_SALUD))}
      ${_df('Ded. Dependientes', fmtMoney(d.DED_DEPEN))}
      ${_df('Promedio Salud', fmtMoney(d.PRO_SALUD))}
    </div>

    <div class="detalle-section" style="--accent:#5B9BD5">
      <div class="detalle-section-title">Cuenta Bancaria</div>
      ${_df('Banco', d.NOM_BANCO, true)}
      ${_df('Tipo de Cuenta', d.NOM_TPCTA)}
      ${_df('Número de Cuenta', d.NUM_CTA)}
      ${_df('Sucursal', d.NOM_SUCUR)}
    </div>

    <div class="detalle-section" style="--accent:#E05555">
      <div class="detalle-section-title">Fechas Laborales</div>
      ${_df('Centro de Costo', d.NOM_CCOST, true)}
      ${_df('Cuenta de Gasto', d.CUE_GASTO)}
      ${_df('Fecha de Ingreso', fmtDate(d.FEC_INGRES), true)}
      ${_df('Tipo de Contrato', d.TIP_CONTRA)}
      ${_df('Número de Contrato', d.NUM_CONTRA)}
      ${_df('Empleado Foráneo', d.EMP_FORAN)}
      ${_df('Fecha de Retiro', fmtDate(d.FEC_RETIRO))}
      ${_df('Fecha Final', fmtDate(d.FEC_FINAL))}
      ${_df('Causa de Retiro', d.CAU_RETIRO)}
      ${_df('Última Actualización BD', fmtDate(d.f_act_hora))}
    </div>

  </div>`;
}

// ─── EDITAR EMPLEADO (Maestro Original) ──────────────────────────────────────
let _catEdit = null;   // catálogos de edición (cacheados tras primera carga)
let _editCedula = null; // cédula del empleado siendo editado (para invalidar caché)

async function _cargarCatalogosEdit() {
  if (_catEdit) return _catEdit;
  const r = await fetch('/api/maestros/catalogos-edicion');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  _catEdit = await r.json();
  return _catEdit;
}

// DD/MM/YYYY  →  YYYY-MM-DD  (para input[type=date])
function _slashToISO(s) {
  if (!s) return '';
  const t = String(s).trim();
  // ya en ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0,10);
  // DD/MM/YYYY
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // ISO con T (datetime del server)
  if (t.includes('T')) { const d=new Date(t); if(!isNaN(d)) return d.toISOString().slice(0,10); }
  return '';
}

function _fillSelect(id, items, current) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin asignar —</option>' +
    (items||[]).map(i => `<option value="${i.cod}"${String(i.cod)===String(current)?' selected':''}>${i.nom}</option>`).join('');
}

async function abrirEditarEmpleado(cedula) {
  // Obtener los datos del empleado desde la caché (siempre disponibles si la ficha ya se expandió)
  const d = _detalleCache[String(cedula)];
  if (!d) { alert('No se encontraron los datos del empleado. Intenta expandir la ficha de nuevo.'); return; }

  // Guardar cédula para invalidar caché al guardar
  _editCedula = String(cedula);

  // Mostrar modal y spinear mientras carga catálogos
  abrirModal('modalEditarEmpleado');
  document.getElementById('eem_loadingOverlay').style.display = 'flex';
  document.getElementById('eem_form').style.display = 'none';
  // Mostrar nombre en encabezado del modal mientras cargan catálogos
  const hdr = document.getElementById('eem_nombreHeader');
  if (hdr) hdr.textContent = d.NOM_COMP || '';

  try {
    const cat = await _cargarCatalogosEdit();

    // ── Identificación ─────────────────────────────────────────────────────
    _fillSelect('eem_tpdoc',  cat.tpdoc,  d.COD_TPDOC);
    document.getElementById('eem_nom1').value    = d.NOM_TERC  || '';
    document.getElementById('eem_nom2').value    = d.SEG_NOMB  || '';
    document.getElementById('eem_ape1').value    = d.APE_TERC  || '';
    document.getElementById('eem_ape2').value    = d.SEG_APEL  || '';
    document.getElementById('eem_codalt').value  = d.COD_ALT   || '';
    document.getElementById('eem_cedula_ro').value = d.NUM_IDEN || '';

    // ── Contacto ───────────────────────────────────────────────────────────
    document.getElementById('eem_dir').value     = d.DIR_TERC  || '';
    document.getElementById('eem_tel1').value    = d.TEL_TERC  || '';
    document.getElementById('eem_tel2').value    = d.TEL_TERC2 || '';
    document.getElementById('eem_mail').value    = d.DIR_MAIL  || '';

    // ── Datos personales ───────────────────────────────────────────────────
    document.getElementById('eem_sexo').value   = d.SEX_FUNC  || 'M';
    _fillSelect('eem_grsan',  cat.grsan,  d.COD_GRSAN);
    _fillSelect('eem_estciv', cat.estciv, d.COD_ESTCIV);
    document.getElementById('eem_hijos').value  = d.CNT_HIJO != null ? d.CNT_HIJO : '0';
    document.getElementById('eem_fnac').value   = _slashToISO(d.FEC_NAC);

    // ── Cargo y salario ────────────────────────────────────────────────────
    _fillSelect('eem_cargo',    cat.cargo,  d.COD_CARGO);
    document.getElementById('eem_valorh').value    = d.VAL_HORA  || '';
    document.getElementById('eem_tipsalar').value  = d.TIP_SALAR || 'Normal';
    document.getElementById('eem_sabado').value    = d.JOR_SABAD || 'No';
    document.getElementById('eem_dvac').value      = d.DIA_VACAC || '15';
    document.getElementById('eem_riesgo').value    = d.GRA_RIESGO|| '0';
    document.getElementById('eem_tipcontra').value = d.TIP_CONTRA|| '01';
    document.getElementById('eem_numcontra').value = d.NUM_CONTRA|| '';

    // ── Seguridad social ───────────────────────────────────────────────────
    _fillSelect('eem_eps',   cat.eps,   d.COD_EPS);
    _fillSelect('eem_afp',   cat.afp,   d.COD_AFP);
    _fillSelect('eem_caja',  cat.caja,  d.COD_CAJA);
    _fillSelect('eem_cesan', cat.cesan, d.COD_CESAN);
    document.getElementById('eem_pension').value   = d.CUE_PENSIO || '';
    document.getElementById('eem_reten').value     = d.POR_RETEN  || '0';
    document.getElementById('eem_dedviv').value    = d.DED_VIVIEN || '0';
    document.getElementById('eem_dedsalud').value  = d.DED_SALUD  || '0';
    document.getElementById('eem_deddep').value    = d.DED_DEPEN  || '0';
    document.getElementById('eem_promsalud').value = d.PRO_SALUD  || '0';

    // ── Cuenta bancaria ────────────────────────────────────────────────────
    _fillSelect('eem_banco',  cat.banco, d.COD_BANCO);
    _fillSelect('eem_tipcta', cat.tpcta, d.COD_TPCTA);
    document.getElementById('eem_numcta').value  = d.NUM_CTA   || '';
    document.getElementById('eem_sucursal').value= d.NOM_SUCUR || '';

    // ── Fechas laborales ───────────────────────────────────────────────────
    _fillSelect('eem_ccost', cat.ccost, d.COD_CCOST);
    document.getElementById('eem_fingreso').value  = _slashToISO(d.FEC_INGRES);
    document.getElementById('eem_fretiro').value   = _slashToISO(d.FEC_RETIRO);
    document.getElementById('eem_causaret').value  = (d.CAU_RETIRO || '').trim() === 'NO APLICA' ? '' : (d.CAU_RETIRO || '');

    // Guardar codFunci en campo oculto
    document.getElementById('eem_codFunci').value = d.COD_FUNCI || '';

    document.getElementById('eem_loadingOverlay').style.display = 'none';
    document.getElementById('eem_form').style.display = '';
  } catch (err) {
    cerrarModal('modalEditarEmpleado');
    alert('No se pudieron cargar los catálogos de edición: ' + err.message);
  }
}

async function guardarEditarEmpleado() {
  const codFunci = document.getElementById('eem_codFunci').value;
  if (!codFunci) { alert('Error: COD_FUNCI no encontrado.'); return; }

  const nom1 = document.getElementById('eem_nom1').value.trim();
  const ape1 = document.getElementById('eem_ape1').value.trim();
  if (!nom1) { alert('El primer nombre es obligatorio.'); return; }
  if (!ape1) { alert('El primer apellido es obligatorio.'); return; }
  if (!document.getElementById('eem_cargo').value) { alert('El cargo es obligatorio.'); return; }
  if (!document.getElementById('eem_fingreso').value) { alert('La fecha de ingreso es obligatoria.'); return; }

  const body = {
    NOM_TERC:   nom1,
    SEG_NOMB:   document.getElementById('eem_nom2').value.trim()     || null,
    APE_TERC:   ape1,
    SEG_APEL:   document.getElementById('eem_ape2').value.trim()     || null,
    COD_ALT:    document.getElementById('eem_codalt').value.trim()   || null,
    COD_TPDOC:  document.getElementById('eem_tpdoc').value           || null,
    DIR_TERC:   document.getElementById('eem_dir').value             || '',
    TEL_TERC:   document.getElementById('eem_tel1').value            || '0',
    TEL_TERC2:  document.getElementById('eem_tel2').value            || '',
    DIR_MAIL:   document.getElementById('eem_mail').value            || '',
    SEX_FUNC:   document.getElementById('eem_sexo').value            || 'M',
    COD_GRSAN:  document.getElementById('eem_grsan').value           || null,
    COD_ESTCIV: document.getElementById('eem_estciv').value          || null,
    CNT_HIJO:   document.getElementById('eem_hijos').value           || 0,
    FEC_NAC:    document.getElementById('eem_fnac').value            || null,
    COD_CARGO:  document.getElementById('eem_cargo').value           || null,
    VAL_HORA:   document.getElementById('eem_valorh').value          || 0,
    TIP_SALAR:  document.getElementById('eem_tipsalar').value        || 'Normal',
    JOR_SABAD:  document.getElementById('eem_sabado').value          || 'No',
    DIA_VACAC:  document.getElementById('eem_dvac').value            || '15',
    GRA_RIESGO: document.getElementById('eem_riesgo').value          || '0',
    TIP_CONTRA: document.getElementById('eem_tipcontra').value       || '01',
    NUM_CONTRA: document.getElementById('eem_numcontra').value       || null,
    COD_EPS:    document.getElementById('eem_eps').value             || null,
    COD_AFP:    document.getElementById('eem_afp').value             || null,
    COD_CAJA:   document.getElementById('eem_caja').value            || null,
    COD_CESAN:  document.getElementById('eem_cesan').value           || null,
    CUE_PENSIO: document.getElementById('eem_pension').value         || null,
    POR_RETEN:  document.getElementById('eem_reten').value           || '0',
    DED_VIVIEN: document.getElementById('eem_dedviv').value          || '0',
    DED_SALUD:  document.getElementById('eem_dedsalud').value        || '0',
    DED_DEPEN:  document.getElementById('eem_deddep').value          || '0',
    PRO_SALUD:  document.getElementById('eem_promsalud').value       || '0',
    COD_BANCO:  document.getElementById('eem_banco').value           || null,
    COD_TPCTA:  document.getElementById('eem_tipcta').value          || null,
    NUM_CTA:    document.getElementById('eem_numcta').value          || null,
    NOM_SUCUR:  document.getElementById('eem_sucursal').value        || 'NO APLICA',
    COD_CCOST:  document.getElementById('eem_ccost').value           || null,
    FEC_INGRES: document.getElementById('eem_fingreso').value        || null,
    FEC_RETIRO: document.getElementById('eem_fretiro').value         || null,
    CAU_RETIRO: document.getElementById('eem_causaret').value        || 'NO APLICA',
  };

  const btn = document.getElementById('eem_btnGuardar');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    const resp = await fetch(`/api/maestros/empleado/${codFunci}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      alert('Error al guardar: ' + (data.error || resp.status) + (data.details ? '\n' + data.details : ''));
      return;
    }

    // Invalidar caché del detalle para que al re-abrir muestre los nuevos datos
    if (_editCedula) delete _detalleCache[_editCedula];

    cerrarModal('modalEditarEmpleado');

    // Si la fila detalle está abierta, refrescarla
    const detRow = document.getElementById('detexp-' + _editCedula);
    if (detRow) {
      const btn2 = document.getElementById('btnExp-' + _editCedula);
      // Cerrar y reabrir para recargar datos
      detRow.remove();
      if (btn2) {
        btn2.classList.remove('open');
        toggleDetalleEmpleado(_editCedula, btn2);
      }
    }

    // Recargar lista principal para reflejar cambios de nombre/cargo
    cargarEmpleadosBD();
    addActivity('Maestro', data.nombre || _editCedula, 'Edición');

    // Feedback visual breve
    const snack = document.createElement('div');
    snack.textContent = '✓ Empleado actualizado correctamente';
    Object.assign(snack.style, {
      position:'fixed', bottom:'28px', left:'50%', transform:'translateX(-50%)',
      background:'rgba(76,175,130,0.95)', color:'#fff', padding:'10px 22px',
      borderRadius:'8px', fontWeight:'600', fontSize:'13px', zIndex:'99999',
      boxShadow:'0 4px 16px rgba(0,0,0,0.3)', transition:'opacity .4s'
    });
    document.body.appendChild(snack);
    setTimeout(() => { snack.style.opacity = '0'; setTimeout(() => snack.remove(), 450); }, 2500);

  } catch (err) {
    alert('Error de red: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar Cambios';
  }
}

// ─── OCASIONALES (persistencia vs NO_NOVED + NO_OCASI) ──────────────────────
// Estado local del período activo y la última lista cargada del backend.
let _periodoActualOcas = null;   // { codPeriod, etiqueta, ... }

async function cargarPeriodoActualOcas() {
  try {
    const r = await fetch('/api/ocasionales/periodo-actual');
    if (!r.ok) { _periodoActualOcas = null; return null; }
    _periodoActualOcas = await r.json();
    // Actualiza el badge superior si existe
    const badge = document.getElementById('periodoBadge');
    if (badge && _periodoActualOcas.etiqueta) badge.textContent = 'Período: ' + _periodoActualOcas.etiqueta;
    return _periodoActualOcas;
  } catch (e) { console.error('periodo-actual:', e); _periodoActualOcas = null; return null; }
}

async function cargarOcasionalesDelPeriodo() {
  try {
    if (!_periodoActualOcas) await cargarPeriodoActualOcas();
    // Sin filtro de período: muestra todos los registros activos de todos los períodos.
    // El período vigente se sigue mostrando en el badge superior.
    const r = await fetch('/api/ocasionales');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    // Adapta filas BD -> modelo interno
    state.ocasionales = (data.registros || []).map(row => ({
      codNoved: row.COD_NOVED,
      codEmpr:  row.COD_EMPR,
      id:       row.CEDULA != null ? String(row.CEDULA) : '',
      nombre:   row.NOMBRE || '',
      novedad:  String(row.COD_CONC),
      nomConc:  row.NOM_CONC || '',
      tipo:     row.TIP_CONC || '',
      cantidad: row.CANTIDAD,
      valor:    row.VALOR,
      obs:      row.OBS_NOVED || '',
      ts:       row.ACT_HORA
    }));
    renderOcasionales();
    updateBadges();
  } catch (e) {
    console.error('cargarOcasionalesDelPeriodo:', e);
  }
}

async function guardarOcasional() {
  const idInput = document.getElementById('oc_id');
  const cedula = idInput.value.trim();
  const nombre = document.getElementById('oc_nombre').value.trim();
  const codConc = document.getElementById('oc_novedad').value;
  const cantidad = document.getElementById('oc_cantidad').value;
  const valor = document.getElementById('oc_valor').value;
  const obs = document.getElementById('oc_obs').value;

  if (!cedula || !nombre) { alert('Identificación y Nombre son obligatorios.'); return; }
  if (!codConc)           { alert('Debes seleccionar una Novedad (código).'); return; }

  // Reglas según el concepto:
  //   - Conceptos horarios (OPC_VALU = 'No Aplica'): solo CANTIDAD, VALOR opcional.
  //   - Conceptos monetarios (OPC_VALU = 'Obligatorio'): VALOR obligatorio.
  // Para no depender de un flag por fila, aceptamos cualquier combinación siempre
  // que al menos uno (cantidad o valor) venga con dato.
  const cantNum  = (cantidad !== '' && cantidad != null) ? Number(cantidad) : null;
  const valorNum = (valor    !== '' && valor    != null) ? Number(valor)    : null;
  if (cantNum == null && valorNum == null) {
    alert('Debes indicar Cantidad o Valor (al menos uno).');
    return;
  }

  try {
    const resp = await fetch('/api/ocasionales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cedula,
        codConc: Number(codConc),
        cantidad: cantNum,
        valor: valorNum,
        observaciones: obs || null
      })
    });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo guardar: ' + (data.error || resp.status) + (data.details ? '\n'+data.details : '')); return; }

    showAlert('alertOcas');
    addActivity('Ocasional', nombre, 'Ocasional');
    limpiarForm('oc');
    await cargarOcasionalesDelPeriodo();
  } catch (err) {
    console.error('guardarOcasional:', err);
    alert('Error de red al guardar: ' + err.message);
  }
}

function renderOcasionales() {
  const tb = document.getElementById('tbOcasionales');

  // Limpiar selección al re-renderizar (recarga de datos)
  _selOcas.clear();
  _actualizarBarraSeleccion();
  const cbAll = document.getElementById('cbSelAll');
  if (cbAll) { cbAll.checked = false; cbAll.indeterminate = false; }

  if (!state.ocasionales.length) {
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:32px">Sin registros</td></tr>';
    return;
  }
  tb.innerHTML = state.ocasionales.map(r => `
    <tr data-cod-noved="${r.codNoved}">
      <td class="td-cb"><input type="checkbox" class="cb-row" data-cod-noved="${r.codNoved}"
        onchange="_toggleSelOcas(${r.codNoved}, this)"></td>
      <td>${r.id}</td><td>${r.nombre}</td>
      <td><span class="badge badge-dev">${r.novedad}${r.nomConc ? ' · ' + r.nomConc.replace(/"/g,'&quot;') : ''}</span></td>
      <td><span class="badge ${r.tipo==='DEVENGO'?'badge-dev':'badge-ded'}">${r.tipo||'—'}</span></td>
      <td>${r.cantidad != null ? r.cantidad : '—'}</td>
      <td style="color:var(--gold-light)">${r.valor != null ? Number(r.valor).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}) : '—'}</td>
      <td style="color:var(--muted);font-size:12px">${r.obs || '—'}</td>
      <td><div class="td-actions">
        <button class="btn-sm btn-sm-edit" title="Editar" onclick="editarOcasional(${r.codNoved})">✎</button>
        <button class="btn-sm btn-sm-del" title="Anular" onclick="anularOcasional(${r.codNoved})">✕</button>
      </div></td>
    </tr>`).join('');
}

// ─── EDICIÓN COMPLETA vía modal ───────────────────────────────────────────────
// Abre el modal de edición con TODOS los campos precargados (cédula, concepto,
// cantidad, valor, observaciones). COD_PERIOD NO se edita aquí por política.
async function editarOcasional(codNoved) {
  const rec = state.ocasionales.find(x => x.codNoved === codNoved);
  if (!rec) return;

  // Clonar opciones del select principal de conceptos al select del modal
  const srcSel = document.getElementById('oc_novedad');
  const dstSel = document.getElementById('ed_cod_conc');
  if (srcSel && dstSel) {
    dstSel.innerHTML = srcSel.innerHTML;
    // Seleccionar el concepto actual
    dstSel.value = String(rec.novedad || '');
  }

  document.getElementById('ed_cod_noved').value = codNoved;
  const edCedula = document.getElementById('ed_cedula');
  edCedula.value = rec.id || '';
  edCedula.style.borderColor = '';                 // limpia estado rojo de validación previa
  document.getElementById('ed_nombre').value   = rec.nombre || '';
  document.getElementById('ed_cantidad').value = rec.cantidad != null ? rec.cantidad : '';
  document.getElementById('ed_valor').value    = rec.valor    != null ? rec.valor    : '';
  document.getElementById('ed_obs').value      = rec.obs || '';

  // Asegurar dropdown cerrado al abrir
  const drp = document.getElementById('ed_dropdown');
  if (drp) drp.classList.remove('show');

  document.getElementById('modalEditOcas').style.display = 'flex';
}

function cerrarModalEditOcas() {
  document.getElementById('modalEditOcas').style.display = 'none';
}

async function guardarEdicionOcasional() {
  const codNoved  = Number(document.getElementById('ed_cod_noved').value);
  const cedula    = document.getElementById('ed_cedula').value.trim();
  const codConc   = document.getElementById('ed_cod_conc').value;
  const cantidad  = document.getElementById('ed_cantidad').value;
  const valor     = document.getElementById('ed_valor').value;
  const obs       = document.getElementById('ed_obs').value;

  if (!codNoved) { alert('codNoved inválido.'); return; }
  if (!cedula)   { alert('La cédula no puede quedar vacía.'); return; }
  if (!codConc)  { alert('Debes seleccionar un concepto.'); return; }

  // Validar al menos uno de cantidad/valor con dato (coherente con creación)
  const cantNum  = (cantidad !== '' && cantidad != null) ? Number(cantidad) : null;
  const valorNum = (valor    !== '' && valor    != null) ? Number(valor)    : null;
  if (cantNum == null && valorNum == null) {
    alert('Debes indicar Cantidad o Valor (al menos uno).');
    return;
  }

  // Enviamos SIEMPRE los campos editables; el backend hace COALESCE para
  // no pisar con null si vino algo distinto.
  const body = {
    cedula: cedula,
    codConc: Number(codConc),
    cantidad: cantNum,           // puede ser null si no aplica
    valor:    valorNum,          // puede ser null si no aplica
    observaciones: obs           // '' = limpia obs; backend usa COALESCE → si quieres vaciar, OK
  };

  try {
    const resp = await fetch(`/api/ocasionales/${codNoved}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) {
      alert('No se pudo actualizar: ' + (data.error || resp.status) + (data.details ? '\n' + data.details : ''));
      return;
    }
    cerrarModalEditOcas();
    await cargarOcasionalesDelPeriodo();
  } catch (err) {
    alert('Error de red: ' + err.message);
  }
}

// Cerrar modal haciendo click fuera del diálogo
document.addEventListener('click', (e) => {
  const modal = document.getElementById('modalEditOcas');
  if (modal && e.target === modal) cerrarModalEditOcas();
});
// Cerrar con Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('modalEditOcas');
    if (modal && modal.style.display !== 'none') cerrarModalEditOcas();
  }
});

async function anularOcasional(codNoved) {
  if (!confirm('¿Anular este registro? (queda inactivo pero se conserva para trazabilidad)')) return;
  try {
    const resp = await fetch(`/api/ocasionales/${codNoved}`, { method: 'DELETE' });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo anular: ' + (data.error || resp.status)); return; }
    await cargarOcasionalesDelPeriodo();
  } catch (err) { alert('Error de red: ' + err.message); }
}

// ─── CARGAR CONCEPTOS OCASIONALES ─────────────────────────────────────────────
async function cargarConceptosOcasionales() {
  try {
    console.log('🔄 Iniciando carga de conceptos ocasionales...');
    const response = await fetch('/api/maestros/conceptos-ocasionales');

    console.log('📡 Respuesta del servidor - Status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Error del servidor:', errorData);
      throw new Error(`HTTP ${response.status}: ${errorData.error}`);
    }

    const conceptos = await response.json();
    console.log('✓ Datos recibidos del servidor:', conceptos);

    const select = document.getElementById('oc_novedad');

    // Limpiar opciones excepto la primera (— Seleccionar —)
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Agregar opciones dinámicamente
    conceptos.forEach(c => {
      const option = document.createElement('option');
      option.value = c.codigo;
      option.textContent = `${c.codigo} · ${c.nombre}`;
      option.dataset.tipo = c.tipo;
      select.appendChild(option);
    });

    console.log('✓ Conceptos ocasionales cargados exitosamente:', conceptos.length, 'registros');
  } catch (err) {
    console.error('❌ Error cargando conceptos:', err.message);
    console.error('   Stack:', err.stack);
  }
}

function actualizarTipoNovedad() {
  const select = document.getElementById('oc_novedad');
  const selectedOption = select.options[select.selectedIndex];
  const tipoSelect = document.getElementById('oc_tipo');

  if (selectedOption && selectedOption.dataset.tipo) {
    const tipoConcepto = selectedOption.dataset.tipo.toUpperCase();
    tipoSelect.value = tipoConcepto === 'DEVENGO' ? 'DEVENGO' : 'DEDUCCION';
  }
}

// ─── DEBOUNCE TIMER PARA AUTOCOMPLETE ────────────────────────────────────────
let autocompleteTimeouts = {};

// ─── BUSCAR CÉDULAS CON AUTOCOMPLETE ────────────────────────────────────────
// nombreInputId es opcional: por defecto llena 'oc_nombre' (formulario
// principal). Se pasa explícitamente cuando el autocomplete se usa en el
// modal de edición, p. ej. 'ed_nombre'.
async function buscarCedulasAutocomplete(cedulaInputId, dropdownId, nombreInputId = 'oc_nombre') {
  const cedulaInput = document.getElementById(cedulaInputId);
  const dropdown = document.getElementById(dropdownId);

  // Logging detallado del valor capturado
  console.log('=== CAPTURA DE VALOR ===');
  console.log('Input ID:', cedulaInputId);
  console.log('Input element:', cedulaInput);
  console.log('Input.value (sin trim):', cedulaInput.value);
  console.log('Input.value.length:', cedulaInput.value.length);

  const cedula = cedulaInput.value.trim();
  console.log('Cedula (después de trim):', cedula);
  console.log('Cedula.length:', cedula.length);
  console.log('========================');

  // Cancelar búsqueda anterior si existe
  if (autocompleteTimeouts[cedulaInputId]) {
    clearTimeout(autocompleteTimeouts[cedulaInputId]);
  }

  if (!cedula || cedula.length < 1) {
    dropdown.classList.remove('show');
    cedulaInput.style.borderColor = '';
    return;
  }

  // Debounce: esperar 300ms antes de hacer la búsqueda
  autocompleteTimeouts[cedulaInputId] = setTimeout(async () => {
    try {
      const url = `/api/maestros/buscar-cedulas?q=${encodeURIComponent(cedula)}`;
      console.log('🔍 Enviando búsqueda a:', url);
      console.log('📝 Cédula escrita:', cedula);
      console.log('📝 Caracteres:', cedula.split('').map((c, i) => `[${i}]=${c}`).join(', '));

      const response = await fetch(url);

      console.log('📡 Respuesta del servidor - Status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Error en respuesta:', errorData);
        dropdown.classList.remove('show');
        cedulaInput.style.borderColor = '#E05555';
        return;
      }

      const empleados = await response.json();
      console.log(`✓ Se encontraron ${empleados.length} coincidencias`);
      console.log('📊 Primeros empleados:', empleados.slice(0, 2));

      if (empleados.length === 0) {
        dropdown.classList.remove('show');
        cedulaInput.style.borderColor = '#E05555';
        return;
      }

      // Limpiar estilo de error
      cedulaInput.style.borderColor = '';

      // Renderizar opciones en el dropdown
      dropdown.innerHTML = empleados.map(emp => `
        <div class="autocomplete-item" onclick="seleccionarEmpleado('${emp.cedula}', '${emp.nombre}', '${emp.codigo}', '${cedulaInputId}', '${nombreInputId}', '${dropdownId}')">
          <div class="autocomplete-item-cedula">${emp.cedula}</div>
          <div class="autocomplete-item-nombre">${emp.nombre}</div>
        </div>
      `).join('');

      dropdown.classList.add('show');
    } catch (err) {
      console.error('❌ Error en autocomplete:', err.message);
      dropdown.classList.remove('show');
      cedulaInput.style.borderColor = '#E05555';
    }
  }, 300); // Esperar 300ms después de que el usuario deja de escribir
}

// ─── SELECCIONAR EMPLEADO DEL DROPDOWN ──────────────────────────────────────
function seleccionarEmpleado(cedula, nombre, codigo, cedulaInputId, nombreInputId, dropdownId) {
  const cedulaInput = document.getElementById(cedulaInputId);
  const nombreInput = document.getElementById(nombreInputId);
  const dropdown = document.getElementById(dropdownId);

  // Llenar campos
  cedulaInput.value = cedula;
  nombreInput.value = nombre;
  cedulaInput.dataset.codigoFunc = codigo;

  // Esconder dropdown
  dropdown.classList.remove('show');

  // Limpiar estilos
  cedulaInput.style.borderColor = '';

  console.log('✓ Empleado seleccionado - Cédula:', cedula, 'Nombre:', nombre, 'Código:', codigo);
}

// ============================================================================
// ─── FIJAS (BD: NO_NOVED + NO_FIJAS) ─────────────────────────────────────────
// ============================================================================
let _periodoActualFijas = null;

async function cargarPeriodoActualFijas() {
  try {
    const r = await fetch('/api/fijas/periodo-actual');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _periodoActualFijas = await r.json();
    return _periodoActualFijas;
  } catch (e) { console.error('periodo-actual fijas:', e); _periodoActualFijas = null; return null; }
}

async function cargarConceptosFijas() {
  try {
    const resp = await fetch('/api/fijas/conceptos');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const conceptos = await resp.json();
    const select = document.getElementById('fj_novedad');
    select.innerHTML = '<option value="">— Seleccionar —</option>';
    conceptos.forEach(c => {
      const option = document.createElement('option');
      option.value = c.codigo;
      option.textContent = `${c.codigo} · ${c.nombre}`;
      option.dataset.tipo = c.tipo;
      select.appendChild(option);
    });
    console.log('✓ Conceptos FIJAS cargados:', conceptos.length);
  } catch (err) { console.error('cargarConceptosFijas:', err); }
}

function actualizarTipoNovedadFija() {
  const select = document.getElementById('fj_novedad');
  const selectedOption = select.options[select.selectedIndex];
  const tipoSelect = document.getElementById('fj_tipo');
  if (selectedOption && selectedOption.dataset.tipo) {
    const tipoConcepto = selectedOption.dataset.tipo.toUpperCase();
    tipoSelect.value = tipoConcepto === 'DEVENGO' ? 'DEVENGO' : 'DEDUCCION';
  }
}

async function cargarFijasDelPeriodo() {
  try {
    if (!_periodoActualFijas) await cargarPeriodoActualFijas();
    const r = await fetch('/api/fijas');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    state.fijas = (data.registros || []).map(row => ({
      codNoved: row.COD_NOVED,
      codEmpr:  row.COD_EMPR,
      id:       row.CEDULA != null ? String(row.CEDULA) : '',
      nombre:   row.NOMBRE || '',
      novedad:  String(row.COD_CONC),
      nomConc:  row.NOM_CONC || '',
      tipo:     row.TIP_CONC || '',
      cantidad: row.CANTIDAD,
      valor:    row.VALOR,
      finicial: row.FEC_INI_FIJA || row.FEC_INI || null,
      ffinal:   row.FEC_FIN_FIJA || row.FEC_FIN || null,
      aplicacion: row.APLICACION || '',
      cuotas:   row.NUM_CUOTAS,
      cuenta:   row.NUM_CUENTA || '',
      obs:      row.OBS_NOVED || '',
    }));
    renderFijas();
    updateBadges();
  } catch (e) { console.error('cargarFijasDelPeriodo:', e); }
}

async function guardarFija() {
  const cedula = document.getElementById('fj_id').value.trim();
  const nombre = document.getElementById('fj_nombre').value.trim();
  const codConc = document.getElementById('fj_novedad').value;
  const aplicacion = document.getElementById('fj_aplicacion').value;
  const cantidad = document.getElementById('fj_cantidad').value;
  const valor    = document.getElementById('fj_valor').value;
  const fecIni   = document.getElementById('fj_finicial').value;
  const fecFin   = document.getElementById('fj_ffinal').value;
  const cuotas   = document.getElementById('fj_cuotas').value;
  const cuenta   = document.getElementById('fj_cuenta').value;
  const obs      = document.getElementById('fj_obs').value;

  if (!cedula || !nombre) { alert('Identificación y Nombre son obligatorios.'); return; }
  if (!codConc)           { alert('Debes seleccionar una Novedad (concepto).'); return; }

  const cantNum  = (cantidad !== '' && cantidad != null) ? Number(cantidad) : null;
  const valorNum = (valor    !== '' && valor    != null) ? Number(valor)    : null;
  const cuotasNum = (cuotas  !== '' && cuotas   != null) ? Number(cuotas)   : null;

  try {
    const resp = await fetch('/api/fijas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cedula,
        codConc: Number(codConc),
        cantidad: cantNum,
        valor: valorNum,
        fecIni: fecIni || null,
        fecFin: fecFin || null,
        aplicacion: aplicacion || null,
        numCuotas: cuotasNum,
        numCuenta: cuenta || null,
        observaciones: obs || null
      })
    });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo guardar: ' + (data.error || resp.status) + (data.details ? '\n'+data.details : '')); return; }

    showAlert('alertFijas');
    addActivity('Fija', nombre, 'Fija');
    limpiarForm('fj');
    await cargarFijasDelPeriodo();
  } catch (err) {
    console.error('guardarFija:', err);
    alert('Error de red al guardar: ' + err.message);
  }
}

function renderFijas() {
  const tb = document.getElementById('tbFijas');

  // Limpiar selección al re-renderizar
  _selFijas.clear();
  _actualizarBarraBatch();
  const cbAll = document.getElementById('cbSelAllFijas');
  if (cbAll) { cbAll.checked = false; cbAll.indeterminate = false; }

  if (!state.fijas.length) {
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:32px">Sin registros</td></tr>';
    return;
  }
  tb.innerHTML = state.fijas.map(r => `
    <tr data-cod-noved="${r.codNoved}">
      <td class="td-cb"><input type="checkbox" class="cb-row-fijas" data-cod-noved="${r.codNoved}"
        onchange="_toggleSelFijas(${r.codNoved}, this)"></td>
      <td>${r.id}</td><td>${r.nombre}</td>
      <td><span class="badge badge-ded">${r.novedad}${r.nomConc ? ' · ' + r.nomConc.replace(/"/g,'&quot;') : ''}</span></td>
      <td><span class="badge ${r.tipo==='DEVENGO'?'badge-dev':'badge-ded'}">${r.tipo||'—'}</span></td>
      <td style="color:var(--gold-light)">${r.valor != null ? Number(r.valor).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}) : '—'}</td>
      <td>${r.finicial ? new Date(r.finicial).toISOString().slice(0,10) : '—'}</td>
      <td>${r.ffinal   ? new Date(r.ffinal).toISOString().slice(0,10)   : '—'}</td>
      <td>${r.cuotas != null ? r.cuotas : '—'}</td>
      <td><div class="td-actions">
        <button class="btn-sm" title="Editar" onclick="editarFija(${r.codNoved})">✎</button>
        <button class="btn-sm btn-sm-del" title="Anular" onclick="anularFija(${r.codNoved})">✕</button>
      </div></td>
    </tr>`).join('');
}

function editarFija(codNoved) {
  const rec = state.fijas.find(x => x.codNoved === codNoved);
  if (!rec) return;

  // Poblar select de conceptos FIJA en el modal
  const selOrigen = document.getElementById('fj_novedad');
  const selModal  = document.getElementById('ef_novedad');
  selModal.innerHTML = selOrigen.innerHTML;

  // Precargar datos
  document.getElementById('ef_codNoved').value  = codNoved;
  document.getElementById('ef_id').value         = rec.id || '';
  document.getElementById('ef_nombre').value     = rec.nombre || '';
  document.getElementById('ef_novedad').value    = rec.novedad || '';
  document.getElementById('ef_aplicacion').value = rec.aplicacion || 'Normal';
  document.getElementById('ef_cantidad').value   = rec.cantidad != null ? rec.cantidad : '';
  document.getElementById('ef_valor').value      = rec.valor    != null ? rec.valor    : '';
  document.getElementById('ef_finicial').value   = rec.finicial ? new Date(rec.finicial).toISOString().slice(0,10) : '';
  document.getElementById('ef_ffinal').value     = rec.ffinal   ? new Date(rec.ffinal).toISOString().slice(0,10)   : '';
  document.getElementById('ef_cuotas').value     = rec.cuotas  != null ? rec.cuotas  : '';
  document.getElementById('ef_cuenta').value     = rec.cuenta  || '';
  document.getElementById('ef_obs').value        = rec.obs     || '';

  abrirModal('modalEditarFija');
}

async function guardarEdicionFija() {
  const codNoved  = Number(document.getElementById('ef_codNoved').value);
  const cedula    = document.getElementById('ef_id').value.trim();
  const codConc   = document.getElementById('ef_novedad').value;
  const aplicacion = document.getElementById('ef_aplicacion').value;
  const cantidad  = document.getElementById('ef_cantidad').value;
  const valor     = document.getElementById('ef_valor').value;
  const fecIni    = document.getElementById('ef_finicial').value;
  const fecFin    = document.getElementById('ef_ffinal').value;
  const cuotas    = document.getElementById('ef_cuotas').value;
  const cuenta    = document.getElementById('ef_cuenta').value;
  const obs       = document.getElementById('ef_obs').value;

  if (!cedula) { alert('La identificación es obligatoria.'); return; }
  if (!codConc) { alert('Debes seleccionar una Novedad.'); return; }

  try {
    const resp = await fetch(`/api/fijas/${codNoved}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cedula,
        codConc: Number(codConc),
        cantidad:  cantidad  !== '' ? Number(cantidad)  : null,
        valor:     valor     !== '' ? Number(valor)     : null,
        fecIni:    fecIni    || null,
        fecFin:    fecFin    || null,
        aplicacion: aplicacion || null,
        numCuotas: cuotas !== '' ? Number(cuotas) : null,
        numCuenta: cuenta || null,
        observaciones: obs || null
      })
    });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo actualizar: ' + (data.error || resp.status) + (data.details ? '\n' + data.details : '')); return; }
    cerrarModal('modalEditarFija');
    await cargarFijasDelPeriodo();
  } catch (err) { alert('Error de red: ' + err.message); }
}

async function anularFija(codNoved) {
  if (!confirm('¿Anular esta novedad fija? (queda inactiva pero se conserva)')) return;
  try {
    const resp = await fetch(`/api/fijas/${codNoved}`, { method: 'DELETE' });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo anular: ' + (data.error || resp.status)); return; }
    await cargarFijasDelPeriodo();
  } catch (err) { alert('Error de red: ' + err.message); }
}

// ============================================================================
// ─── AUSENTISMOS (BD: NO_NOVED + NO_AUSEN) ───────────────────────────────────
// ============================================================================
let _periodoActualAus = null;

async function cargarPeriodoActualAus() {
  try {
    const r = await fetch('/api/ausentismos/periodo-actual');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _periodoActualAus = await r.json();
    return _periodoActualAus;
  } catch (e) { console.error('periodo-actual aus:', e); _periodoActualAus = null; return null; }
}

async function cargarConceptosAusentismos() {
  try {
    const resp = await fetch('/api/ausentismos/conceptos');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const conceptos = await resp.json();
    const select = document.getElementById('aus_tipo');
    select.innerHTML = '<option value="">— Seleccionar —</option>';
    conceptos.forEach(c => {
      const option = document.createElement('option');
      option.value = c.codigo;
      option.textContent = `${c.codigo} · ${c.nombre}`;
      option.dataset.tipo = c.tipo;
      select.appendChild(option);
    });
    console.log('✓ Conceptos AUSENTISMOS cargados:', conceptos.length);
  } catch (err) { console.error('cargarConceptosAusentismos:', err); }
}

async function cargarAusentismosDelPeriodo() {
  try {
    if (!_periodoActualAus) await cargarPeriodoActualAus();
    const r = await fetch('/api/ausentismos');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    state.ausentismos = (data.registros || []).map(row => ({
      codNoved: row.COD_NOVED,
      codEmpr:  row.COD_EMPR,
      id:       row.CEDULA != null ? String(row.CEDULA) : '',
      nombre:   row.NOMBRE || '',
      tipo:     String(row.COD_CONC),
      nomConc:  row.NOM_CONC || '',
      finicial: row.FEC_INI_AUS || row.FEC_INI || null,
      ffinal:   row.FEC_FIN_AUS || row.FEC_FIN || null,
      dias:     row.DIAS_TOTAL,
      diag:     row.DIAGNOSTICO || '',
      prorroga: row.FEC_PRORRG || null,
      obs:      row.OBS_NOVED || '',
    }));
    renderAusentismos();
    updateBadges();
  } catch (e) { console.error('cargarAusentismosDelPeriodo:', e); }
}

async function guardarAusentismo() {
  const cedula = document.getElementById('aus_id').value.trim();
  const nombre = document.getElementById('aus_nombre').value.trim();
  const codConc = document.getElementById('aus_tipo').value;
  const fecIni = document.getElementById('aus_finicial').value;
  const fecFin = document.getElementById('aus_ffinal').value;
  const dias   = document.getElementById('aus_dias').value;
  const diag   = document.getElementById('aus_diag').value;
  const prorroga = document.getElementById('aus_prorroga').value;
  const obs    = document.getElementById('aus_obs').value;

  if (!cedula || !nombre) { alert('Identificación y Nombre son obligatorios.'); return; }
  if (!codConc)           { alert('Debes seleccionar el Tipo de Ausentismo.'); return; }
  if (!fecIni || !fecFin) { alert('Fecha Inicial y Fecha Final son obligatorias.'); return; }

  try {
    const resp = await fetch('/api/ausentismos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cedula,
        codConc: Number(codConc),
        fecIni, fecFin,
        diasTotal: dias !== '' ? Number(dias) : null,
        diagnostico: diag || null,
        fecProrroga: prorroga || null,
        observaciones: obs || null
      })
    });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo guardar: ' + (data.error || resp.status) + (data.details ? '\n'+data.details : '')); return; }

    showAlert('alertAus');
    addActivity('Ausentismo', nombre, 'Ausentismo');
    limpiarForm('aus');
    await cargarAusentismosDelPeriodo();
  } catch (err) {
    console.error('guardarAusentismo:', err);
    alert('Error de red al guardar: ' + err.message);
  }
}

function renderAusentismos() {
  const tb = document.getElementById('tbAusentismos');

  // Limpiar selección al re-renderizar
  _selAusen.clear();
  _actualizarBarraBatch();
  const cbAll = document.getElementById('cbSelAllAusen');
  if (cbAll) { cbAll.checked = false; cbAll.indeterminate = false; }

  if (!state.ausentismos.length) {
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:32px">Sin registros</td></tr>';
    return;
  }
  tb.innerHTML = state.ausentismos.map(r => `
    <tr data-cod-noved="${r.codNoved}">
      <td class="td-cb"><input type="checkbox" class="cb-row-ausen" data-cod-noved="${r.codNoved}"
        onchange="_toggleSelAusen(${r.codNoved}, this)"></td>
      <td>${r.id}</td><td>${r.nombre}</td>
      <td><span class="badge badge-aus">${r.tipo}${r.nomConc ? ' · ' + r.nomConc.replace(/"/g,'&quot;') : ''}</span></td>
      <td>${r.finicial ? new Date(r.finicial).toISOString().slice(0,10) : '—'}</td>
      <td>${r.ffinal   ? new Date(r.ffinal).toISOString().slice(0,10)   : '—'}</td>
      <td><strong>${r.dias != null ? r.dias : '—'}</strong></td>
      <td style="color:var(--muted);font-size:12px">${r.diag||'—'}</td>
      <td>${r.prorroga ? new Date(r.prorroga).toISOString().slice(0,10) : '—'}</td>
      <td><div class="td-actions">
        <button class="btn-sm" title="Editar" onclick="editarAusentismo(${r.codNoved})">✎</button>
        <button class="btn-sm btn-sm-del" title="Anular" onclick="anularAusentismo(${r.codNoved})">✕</button>
      </div></td>
    </tr>`).join('');
}

function editarAusentismo(codNoved) {
  const rec = state.ausentismos.find(x => x.codNoved === codNoved);
  if (!rec) return;

  // Poblar select de conceptos AUSENTISMO en el modal
  const selOrigen = document.getElementById('aus_tipo');
  const selModal  = document.getElementById('ea_tipo');
  selModal.innerHTML = selOrigen.innerHTML;

  document.getElementById('ea_codNoved').value  = codNoved;
  document.getElementById('ea_id').value         = rec.id || '';
  document.getElementById('ea_nombre').value     = rec.nombre || '';
  document.getElementById('ea_tipo').value       = rec.tipo || '';
  document.getElementById('ea_diag').value       = rec.diag || '';
  document.getElementById('ea_finicial').value   = rec.finicial ? new Date(rec.finicial).toISOString().slice(0,10) : '';
  document.getElementById('ea_ffinal').value     = rec.ffinal   ? new Date(rec.ffinal).toISOString().slice(0,10)   : '';
  document.getElementById('ea_dias').value       = rec.dias != null ? rec.dias : '';
  document.getElementById('ea_prorroga').value   = rec.prorroga ? new Date(rec.prorroga).toISOString().slice(0,10) : '';
  document.getElementById('ea_obs').value        = rec.obs || '';

  abrirModal('modalEditarAus');
}

function calcDiasEdit() {
  const fi = document.getElementById('ea_finicial').value;
  const ff = document.getElementById('ea_ffinal').value;
  if (fi && ff) {
    const d1 = new Date(fi), d2 = new Date(ff);
    if (d2 >= d1) document.getElementById('ea_dias').value = Math.round((d2 - d1) / 86400000) + 1;
  }
}

async function guardarEdicionAusentismo() {
  const codNoved  = Number(document.getElementById('ea_codNoved').value);
  const cedula    = document.getElementById('ea_id').value.trim();
  const codConc   = document.getElementById('ea_tipo').value;
  const fecIni    = document.getElementById('ea_finicial').value;
  const fecFin    = document.getElementById('ea_ffinal').value;
  const dias      = document.getElementById('ea_dias').value;
  const diag      = document.getElementById('ea_diag').value;
  const prorroga  = document.getElementById('ea_prorroga').value;
  const obs       = document.getElementById('ea_obs').value;

  if (!cedula) { alert('La identificación es obligatoria.'); return; }
  if (!codConc) { alert('Debes seleccionar el Tipo de Ausentismo.'); return; }
  if (!fecIni || !fecFin) { alert('Fecha Inicial y Fecha Final son obligatorias.'); return; }

  try {
    const resp = await fetch(`/api/ausentismos/${codNoved}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cedula,
        codConc: Number(codConc),
        fecIni, fecFin,
        diasTotal: dias !== '' ? Number(dias) : null,
        diagnostico: diag || null,
        fecProrroga: prorroga || null,
        observaciones: obs || null
      })
    });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo actualizar: ' + (data.error || resp.status) + (data.details ? '\n' + data.details : '')); return; }
    cerrarModal('modalEditarAus');
    await cargarAusentismosDelPeriodo();
  } catch (err) { alert('Error de red: ' + err.message); }
}

async function anularAusentismo(codNoved) {
  if (!confirm('¿Anular este ausentismo? (queda inactivo pero se conserva)')) return;
  try {
    const resp = await fetch(`/api/ausentismos/${codNoved}`, { method: 'DELETE' });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo anular: ' + (data.error || resp.status)); return; }
    await cargarAusentismosDelPeriodo();
  } catch (err) { alert('Error de red: ' + err.message); }
}

// ─── CAMBIOS MAESTRO ──────────────────────────────────────────────────────────
function guardarCambioMaestro() {
  const cedula = document.getElementById('cm_cedula').value.trim();
  const nombre = document.getElementById('cm_nombre').value.trim();
  if (!cedula || !nombre) { alert('Cédula y Nombre son obligatorios.'); return; }
  const rec = {
    cedula, nombre,
    tipdoc: document.getElementById('cm_tipdoc').value,
    ciudad_exp: document.getElementById('cm_ciudad_exp').value,
    estado: document.getElementById('cm_estado').value,
    fnac: document.getElementById('cm_fnac').value,
    ciudad_res: document.getElementById('cm_ciudad_res').value,
  };
  state.cambiosMaestro.push(rec);
  renderCMaestro();
  limpiarForm('cm');
  showAlert('alertCM');
  addActivity('Cambio Maestro', nombre, 'Cambio');
  updateBadges();
}

function renderCMaestro() {
  const tb = document.getElementById('tbCMaestro');
  if (!state.cambiosMaestro.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px">Sin registros</td></tr>'; return; }
  tb.innerHTML = state.cambiosMaestro.map((r, i) => `
    <tr>
      <td>${r.cedula}</td><td>${r.nombre}</td><td>${r.tipdoc}</td>
      <td>${r.ciudad_exp||'—'}</td><td>${r.estado||'—'}</td>
      <td>${r.fnac||'—'}</td><td>${r.ciudad_res||'—'}</td>
      <td><button class="btn-sm btn-sm-del" onclick="eliminar('cambiosMaestro',${i})">✕</button></td>
    </tr>`).join('');
}

// ============================================================================
// ─── CAMBIOS E INGRESOS (BD: NO_NOVED + NO_CAMBI) ────────────────────────────
// ============================================================================
let _periodoActualCam = null;

async function cargarPeriodoActualCam() {
  try {
    const r = await fetch('/api/cambios/periodo-actual');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _periodoActualCam = await r.json();
    return _periodoActualCam;
  } catch (e) { console.error('periodo-actual cambios:', e); _periodoActualCam = null; return null; }
}

async function cargarConceptosCambios() {
  try {
    const resp = await fetch('/api/cambios/conceptos');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const conceptos = await resp.json();
    const select = document.getElementById('ci_cambio');
    select.innerHTML = '<option value="">— Seleccionar —</option>';
    conceptos.forEach(c => {
      const option = document.createElement('option');
      option.value = c.codigo;
      option.textContent = `${c.codigo} · ${c.nombre}`;
      option.dataset.tipo = c.tipo;
      select.appendChild(option);
    });
    console.log('✓ Conceptos CAMBIOS cargados:', conceptos.length);
  } catch (err) { console.error('cargarConceptosCambios:', err); }
}

async function cargarCambiosDelPeriodo() {
  try {
    if (!_periodoActualCam) await cargarPeriodoActualCam();
    const r = await fetch('/api/cambios');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    state.cambiosIngresos = (data.registros || []).map(row => ({
      codNoved: row.COD_NOVED,
      codEmpr:  row.COD_EMPR,
      id:       row.CEDULA != null ? String(row.CEDULA) : '',
      nombre:   row.NOMBRE || '',
      cambio:   String(row.COD_CONC),
      nomConc:  row.NOM_CONC || '',
      finicial: row.FEC_INI_CAM || row.FEC_INI || null,
      cambioa:  row.VALOR_NUEVO || '',
      valorAnte: row.VALOR_ANTE || '',
      obs:      row.OBS_NOVED || '',
    }));
    renderCIngresos();
    updateBadges();
  } catch (e) { console.error('cargarCambiosDelPeriodo:', e); }
}

async function guardarCambioIngreso() {
  const cedula = document.getElementById('ci_id').value.trim();
  const nombre = document.getElementById('ci_nombre').value.trim();
  const codConc = document.getElementById('ci_cambio').value;
  const fecIni = document.getElementById('ci_finicial').value;
  const cambioa = document.getElementById('ci_cambioa').value;
  const obs = document.getElementById('ci_obs').value;

  if (!cedula || !nombre) { alert('Identificación y Nombre son obligatorios.'); return; }
  if (!codConc)           { alert('Debes seleccionar el Tipo de Cambio.'); return; }
  if (!fecIni)            { alert('La Fecha Inicial es obligatoria.'); return; }

  try {
    const resp = await fetch('/api/cambios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cedula,
        codConc: Number(codConc),
        fecIni,
        valorNuevo: cambioa || null,
        valorAnte: null,
        observaciones: obs || null
      })
    });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo guardar: ' + (data.error || resp.status) + (data.details ? '\n'+data.details : '')); return; }

    showAlert('alertCI');
    addActivity('Cambio/Ingreso', nombre, 'Cambio');
    limpiarForm('ci');
    await cargarCambiosDelPeriodo();
  } catch (err) {
    console.error('guardarCambioIngreso:', err);
    alert('Error de red al guardar: ' + err.message);
  }
}

function renderCIngresos() {
  const tb = document.getElementById('tbCIngresos');

  // Limpiar selección al re-renderizar
  _selCamb.clear();
  _actualizarBarraBatch();
  const cbAll = document.getElementById('cbSelAllCamb');
  if (cbAll) { cbAll.checked = false; cbAll.indeterminate = false; }

  if (!state.cambiosIngresos.length) {
    tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px">Sin registros</td></tr>';
    return;
  }
  tb.innerHTML = state.cambiosIngresos.map(r => `
    <tr data-cod-noved="${r.codNoved}">
      <td class="td-cb"><input type="checkbox" class="cb-row-camb" data-cod-noved="${r.codNoved}"
        onchange="_toggleSelCamb(${r.codNoved}, this)"></td>
      <td>${r.id}</td><td>${r.nombre}</td>
      <td><span class="badge badge-cam">${r.cambio}${r.nomConc ? ' · ' + r.nomConc.replace(/"/g,'&quot;') : ''}</span></td>
      <td>${r.finicial ? new Date(r.finicial).toISOString().slice(0,10) : '—'}</td>
      <td><strong>${r.cambioa||'—'}</strong></td>
      <td style="color:var(--muted);font-size:12px">${r.obs||'—'}</td>
      <td><div class="td-actions">
        <button class="btn-sm" title="Editar" onclick="editarCambio(${r.codNoved})">✎</button>
        <button class="btn-sm btn-sm-del" title="Anular" onclick="anularCambio(${r.codNoved})">✕</button>
      </div></td>
    </tr>`).join('');
}

function editarCambio(codNoved) {
  const rec = state.cambiosIngresos.find(x => x.codNoved === codNoved);
  if (!rec) return;

  // Poblar select de conceptos CAMBIO en el modal
  const selOrigen = document.getElementById('ci_cambio');
  const selModal  = document.getElementById('ec_cambio');
  selModal.innerHTML = selOrigen.innerHTML;

  document.getElementById('ec_codNoved').value  = codNoved;
  document.getElementById('ec_id').value         = rec.id || '';
  document.getElementById('ec_nombre').value     = rec.nombre || '';
  document.getElementById('ec_cambio').value     = rec.cambio || '';
  document.getElementById('ec_finicial').value   = rec.finicial ? new Date(rec.finicial).toISOString().slice(0,10) : '';
  document.getElementById('ec_cambioa').value    = rec.cambioa || '';
  document.getElementById('ec_obs').value        = rec.obs || '';

  abrirModal('modalEditarCambio');
}

async function guardarEdicionCambio() {
  const codNoved  = Number(document.getElementById('ec_codNoved').value);
  const cedula    = document.getElementById('ec_id').value.trim();
  const codConc   = document.getElementById('ec_cambio').value;
  const fecIni    = document.getElementById('ec_finicial').value;
  const cambioa   = document.getElementById('ec_cambioa').value;
  const obs       = document.getElementById('ec_obs').value;

  if (!cedula) { alert('La identificación es obligatoria.'); return; }
  if (!codConc) { alert('Debes seleccionar el Tipo de Cambio.'); return; }
  if (!fecIni) { alert('La Fecha Inicial es obligatoria.'); return; }

  try {
    const resp = await fetch(`/api/cambios/${codNoved}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cedula,
        codConc: Number(codConc),
        fecIni,
        valorNuevo: cambioa || null,
        observaciones: obs || null
      })
    });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo actualizar: ' + (data.error || resp.status) + (data.details ? '\n' + data.details : '')); return; }
    cerrarModal('modalEditarCambio');
    await cargarCambiosDelPeriodo();
  } catch (err) { alert('Error de red: ' + err.message); }
}

async function anularCambio(codNoved) {
  if (!confirm('¿Anular este cambio? (queda inactivo pero se conserva)')) return;
  try {
    const resp = await fetch(`/api/cambios/${codNoved}`, { method: 'DELETE' });
    const data = await resp.json();
    if (!resp.ok) { alert('No se pudo anular: ' + (data.error || resp.status)); return; }
    await cargarCambiosDelPeriodo();
  } catch (err) { alert('Error de red: ' + err.message); }
}

function eliminar(coleccion, idx) {
  // Colecciones persistidas en BD → usar los botones Anular (soft-delete) de la tabla.
  const coleccionesBD = ['ocasionales', 'fijas', 'ausentismos', 'cambiosIngresos'];
  if (coleccionesBD.includes(coleccion)) {
    alert('Usa el botón ✕ de la tabla para anular (soft-delete contra la base de datos).');
    return;
  }
  if (!confirm('¿Eliminar este registro?')) return;
  state[coleccion].splice(idx, 1);
  if (coleccion === 'cambiosMaestro') renderCMaestro();
  updateBadges();
}

// ─── SQL GENERATOR ───────────────────────────────────────────────────────────
function generarSQLCompleto() {
  const emp = document.getElementById('cfgEmpresa').value || 'Collective Mining';
  const per = periodo();
  const usr = usuario();
  let sql = `-- ================================================================\n-- NOVEDADES NÓMINA · ${emp}\n-- Período: ${per}\n-- Generado: ${new Date().toLocaleString('es-CO')}\n-- ================================================================\n\nUSE NovedadesNomina;\nGO\n\n`;

  let count = 0;

  if (state.maestroOriginal.length) {
    sql += `-- ── Maestro Original (Empleados) ────────────────────────────\n`;
    state.maestroOriginal.forEach(r => {
      sql += `MERGE dbo.Empleados AS tgt USING (SELECT ${sq(r.cedula)} AS Cedula) AS src ON tgt.Cedula=src.Cedula\n`;
      sql += `WHEN MATCHED THEN UPDATE SET Nombre=${sq(r.nombre)},Cargo=${sq(r.cargo)},EPS=${sq(r.eps)},AFP=${sq(r.afp)},FechaIngreso=${sdate(r.fingreso)},FechaModificacion=GETDATE()\n`;
      sql += `WHEN NOT MATCHED THEN INSERT (Cedula,Codigo,CodigoAlterno,TipoDocumento,Nombre,Sexo,GrupoSanguineo,FactorRH,EstadoCivil,CiudadExpedicion,Hijos,FechaNacimiento,Ciudad,Telefono1,Telefono2,Direccion,Correo,Cargo,Porcentaje,Salario,ValorHora,TipoCuenta,Banco,NumeroCuenta,Sucursal,CentroCosto,CentroCostos,CodigoCompania,Regimen,TrabajaSabado,ClaseSalario,Pensionado,AplicaLey1393,ModoLiquidacion,TipoLiquidacion,Extranjero,FechaIngreso,FechaRetiro,CausaRetiro,TipoContrato,PorcentajeRete,ValorDeduccionVivienda,ValorDeduccionSalud,ValorDeduccionDependientes,DeclaraRenta,PromedioSalud,EPS,AFP,Caja,ARP,Cesantias,Riesgo,HorasMes,DiasVacaciones,Clasificador1,Clasificador1Nom,SubArea,SubAreaNom,NivelCargo,DriverVariable,Clasificador7,Clasificador7Nom,PagoXDias,RelacionSindical)\n`;
      sql += `VALUES (${sq(r.cedula)},${sq(r.codigo)},${sq(r.codigoalt)},${sq(r.tipdoc)},${sq(r.nombre)},${sq(r.sexo)},${sq(r.gsang)},${sq(r.rh)},${sq(r.estcivil)},${sq(r.ciudadexp)},${snum(r.hijos)},${sdate(r.fnac)},${sq(r.ciudad)},${sq(r.tel1)},${sq(r.tel2)},${sq(r.dir)},${sq(r.correo)},${sq(r.cargo)},${snum(r.pct)},${snum(r.salario)},${snum(r.valorh)},${sq(r.tipcta)},${sq(r.banco)},${sq(r.numcta)},${sq(r.sucursal)},${sq(r.cc)},${sq(r.ccdesc)},${sq(r.codcia)},${sq(r.regimen)},${sq(r.sabado)},${sq(r.classal)},${sq(r.pension)},${sq(r.ley1393)},${sq(r.modoliq)},${sq(r.tipoliq)},${sq(r.extran)},${sdate(r.fingreso)},${sdate(r.fretiro)},${sq(r.causaret)},${sq(r.tipcontrato)},${snum(r.rete)},${snum(r.dedviv)},${snum(r.dedsalud)},${snum(r.deddep)},${sq(r.renta)},${snum(r.promsalud)},${sq(r.eps)},${sq(r.afp)},${sq(r.caja)},${sq(r.arp)},${sq(r.cesantias)},${snum(r.riesgo)},${snum(r.hmes)},${snum(r.dvac)},${sq(r.clas1)},${sq(r.clas1nom)},${sq(r.subarea)},${sq(r.subareanov)},${sq(r.nivcargo)},${sq(r.driver)},${sq(r.clas7)},${sq(r.clas7nom)},${sq(r.pagodias)},${sq(r.sindical)});\n`;
      count++;
    });
    sql += '\n';
  }

  if (state.ocasionales.length) {
    sql += `-- ── Novedades Ocasionales ──────────────────────────────────\n`;
    state.ocasionales.forEach(r => {
      sql += `INSERT INTO dbo.NovedadesOcasionales (Identificacion, Nombre, Novedad, TipoNovedad, Cantidad, Valor, Observaciones, PeriodoNomina, UsuarioRegistro)\nVALUES (${sq(r.id)}, ${sq(r.nombre)}, ${sq(r.novedad)}, ${sq(r.tipo)}, ${snum(r.cantidad)}, ${snum(r.valor)}, ${sq(r.obs)}, ${sq(per)}, ${sq(usr)});\n`;
      count++;
    });
    sql += '\n';
  }

  if (state.fijas.length) {
    sql += `-- ── Novedades Fijas ─────────────────────────────────────────\n`;
    state.fijas.forEach(r => {
      sql += `INSERT INTO dbo.NovedadesFijas (Identificacion, Nombre, Novedad, TipoNovedad, Valor, FechaInicial, FechaFinal, Aplicacion, Cuenta, Cuotas, Observaciones, PeriodoNomina, UsuarioRegistro)\nVALUES (${sq(r.id)}, ${sq(r.nombre)}, ${sq(r.novedad)}, ${sq(r.tipo)}, ${snum(r.valor)}, ${sdate(r.finicial)}, ${sdate(r.ffinal)}, ${sq(r.aplicacion)}, ${sq(r.cuenta)}, ${snum(r.cuotas)}, ${sq(r.obs)}, ${sq(per)}, ${sq(usr)});\n`;
      count++;
    });
    sql += '\n';
  }

  if (state.ausentismos.length) {
    sql += `-- ── Ausentismos y Vacaciones ─────────────────────────────────\n`;
    state.ausentismos.forEach(r => {
      sql += `INSERT INTO dbo.Ausentismos (Identificacion, Nombre, TipoAusentismo, FechaInicial, FechaFinal, DiasTotales, Diagnostico, Prorroga, Observaciones, PeriodoNomina, UsuarioRegistro)\nVALUES (${sq(r.id)}, ${sq(r.nombre)}, ${sq(r.tipo)}, ${sdate(r.finicial)}, ${sdate(r.ffinal)}, ${snum(r.dias)}, ${sq(r.diag)}, ${sdate(r.prorroga)}, ${sq(r.obs)}, ${sq(per)}, ${sq(usr)});\n`;
      count++;
    });
    sql += '\n';
  }

  if (state.cambiosMaestro.length) {
    sql += `-- ── Cambios Maestro ──────────────────────────────────────────\n`;
    state.cambiosMaestro.forEach(r => {
      sql += `INSERT INTO dbo.CambiosMaestro (Cedula, Nombre, TipoDocumento, CiudadExpedicion, EstadoCivil, FechaNacimiento, Ciudad, PeriodoNomina, UsuarioRegistro)\nVALUES (${sq(r.cedula)}, ${sq(r.nombre)}, ${sq(r.tipdoc)}, ${sq(r.ciudad_exp)}, ${sq(r.estado)}, ${sdate(r.fnac)}, ${sq(r.ciudad_res)}, ${sq(per)}, ${sq(usr)});\n`;
      count++;
    });
    sql += '\n';
  }

  if (state.cambiosIngresos.length) {
    sql += `-- ── Cambios e Ingresos ───────────────────────────────────────\n`;
    state.cambiosIngresos.forEach(r => {
      sql += `INSERT INTO dbo.CambiosIngresos (Identificacion, Nombre, TipoCambio, FechaInicial, CambioA, Observaciones, PeriodoNomina, UsuarioRegistro)\nVALUES (${sq(r.id)}, ${sq(r.nombre)}, ${sq(r.cambio)}, ${sdate(r.finicial)}, ${sq(r.cambioa)}, ${sq(r.obs)}, ${sq(per)}, ${sq(usr)});\n`;
      count++;
    });
    sql += '\n';
  }

  if (count === 0) sql += '-- Sin registros ingresados aún\n';
  sql += `\n-- Total: ${count} statements\nPRINT 'Novedades importadas: ${count}';\nGO\n`;

  document.getElementById('sqlOutput').textContent = sql;
  document.getElementById('sqlStats').textContent = `${count} statements`;
  navigate('sql');
}

function copiarSQL() {
  navigator.clipboard.writeText(document.getElementById('sqlOutput').textContent);
  alert('SQL copiado al portapapeles');
}

function descargarSQL() {
  const sql = document.getElementById('sqlOutput').textContent;
  const blob = new Blob([sql], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `novedades_${periodo().replace(/\//g,'_') || 'nomina'}.sql`;
  a.click();
}

// ─── CONEXIÓN ─────────────────────────────────────────────────────────────────
function toggleAuth() {
  document.getElementById('sqlAuthFields').style.display = document.getElementById('conn_auth').value === 'sql' ? 'block' : 'none';
}

function generarConnectionString() {
  const srv = document.getElementById('conn_server').value;
  const port = document.getElementById('conn_port').value;
  const db = document.getElementById('conn_db').value;
  const auth = document.getElementById('conn_auth').value;
  let cs = '';
  if (auth === 'windows') {
    cs = `Server=${srv},${port};Database=${db};Trusted_Connection=True;TrustServerCertificate=True;`;
  } else {
    const u = document.getElementById('conn_user').value;
    const p = document.getElementById('conn_pass').value;
    cs = `Server=${srv},${port};Database=${db};User Id=${u};Password=${p};TrustServerCertificate=True;`;
  }
  document.getElementById('connStringOutput').textContent = cs;
  navigator.clipboard.writeText(cs).catch(()=>{});
}

function guardarConexion() {
  generarConnectionString();
  document.getElementById('connDot').className = 'dot connected';
  document.getElementById('connText').textContent = 'Configuración guardada';
  document.getElementById('connText').style.color = 'var(--success)';
}

// ─── IMPORTACIÓN MASIVA DESDE EXCEL ──────────────────────────────────────────

let _importFiles      = []; // EXCEL: archivos del panel izquierdo
let _importFilesPDF   = []; // PDF: archivos del panel derecho

// Mapeo codConc → nombre legible (para la tabla de detalle)
const CONC_NOMBRES = {
  7:  'Hora Dominical / Festiva 175%',
  8:  'H. Extra Dom./Fest. Diurna 200%',
  9:  'H. Extra Dom./Fest. Noct. 250%',
  10: 'H. Extra Diurna 125%',
  11: 'H. Extra Nocturna 175%',
  14: 'Recargo Nocturno 35%',
  15: 'Recargo Noct. Dominical 210%',
  16: 'Recargo Dominical 0.75%',
};

// Detectar ícono/tipo por nombre de archivo (extensible)
function iconoPorArchivo(nombre) {
  const ext = (nombre || '').split('.').pop().toLowerCase();
  if (['xlsx', 'xls'].includes(ext)) return '📊';
  if (ext === 'pdf')                  return '📄';
  if (['csv', 'tsv'].includes(ext))   return '📋';
  return '📁';
}

function formatoLegible(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// Detecta si un nombre de archivo corresponde al formato ADECCO
function esArchivoAdecco(nombre) {
  const n = (nombre || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (n.includes('formato') && (n.includes('novedad') || n.includes('nov'))) ||
         n.includes('adecco');
}

function renderListaArchivos() {
  const container = document.getElementById('importFileList');
  if (!container) return;
  if (_importFiles.length === 0) {
    container.innerHTML = '';
    return;
  }
  const html = _importFiles.map((f, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="font-size:20px;">${iconoPorArchivo(f.name)}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.name}</div>
        <div style="font-size:11px;color:var(--muted);">${formatoLegible(f.size)} · ${f.type || 'desconocido'}${esArchivoAdecco(f.name) ? ' · <span style="color:var(--cm-blue-light)">ADECCO</span>' : ''}</div>
      </div>
      <button onclick="quitarArchivoImport(${i})" title="Quitar este archivo"
        style="background:transparent;border:none;color:var(--muted);font-size:16px;cursor:pointer;padding:2px 6px;border-radius:4px;"
        onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--muted)'">✕</button>
    </div>
  `).join('');
  container.innerHTML = `
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:8px;">
      ${_importFiles.length} archivo${_importFiles.length !== 1 ? 's' : ''} seleccionado${_importFiles.length !== 1 ? 's' : ''}
    </div>
    ${html}
  `;

  // Mostrar u ocultar el panel de modo ADECCO según si hay archivos Excel ADECCO
  const tieneAdecco = _importFiles.some(f => f.name.match(/\.xlsx?$/i) && esArchivoAdecco(f.name));
  const panel = document.getElementById('adeccoModoPanel');
  if (panel) panel.style.display = tieneAdecco ? 'block' : 'none';
}

function quitarArchivoImport(idx) {
  _importFiles.splice(idx, 1);
  if (_importFiles.length === 0) {
    cancelarImport();
  } else {
    renderListaArchivos();
  }
}

function seleccionarArchivoImport(e) {
  const nuevos = Array.from(e.target.files || []);
  if (nuevos.length === 0) return;

  // Acumular archivos (permite agregar más en sucesivas selecciones)
  // Evitar duplicados por nombre+tamaño
  for (const f of nuevos) {
    const yaExiste = _importFiles.some(x => x.name === f.name && x.size === f.size);
    if (!yaExiste) _importFiles.push(f);
  }

  // Actualizar zona de drop
  document.getElementById('uploadIcon').textContent = _importFiles.length > 1 ? '📦' : '✅';
  document.getElementById('uploadLabel').textContent =
    _importFiles.length > 1
      ? `${_importFiles.length} archivos listos`
      : 'Archivo listo';
  document.getElementById('uploadSub').textContent =
    'Haz clic en "Importar a la BD" para proceder, o arrastra más archivos';
  _actualizarBtnImportar();

  // Renderizar lista y mostrar panel (panel unificado legacy — solo si el elemento existe)
  renderListaArchivos();
  const _fi = document.getElementById('importFileInfo');
  if (_fi) _fi.style.display = 'block';
  const _ir = document.getElementById('importResult');
  if (_ir) _ir.style.display = 'none';
  const _ig = document.getElementById('importGuia');
  if (_ig) _ig.style.display = 'none';

  // Reset input para permitir reseleccionar los mismos archivos si quieren
  e.target.value = '';
}

function cancelarImport() {
  // Compatibilidad: limpia ambos paneles
  _importFiles    = [];
  _importFilesPDF = [];
  const fiE = document.getElementById('fileInputExcel');
  const fiP = document.getElementById('fileInputPDF');
  if (fiE) fiE.value = '';
  if (fiP) fiP.value = '';
  const res = document.getElementById('importResult');
  const gui = document.getElementById('importGuia');
  if (res) res.style.display = 'none';
  if (gui) gui.style.display = 'block';
  _resetPanelExcel();
  _resetPanelPDF();
}

function resetearImport() {
  cancelarImport();
}

// ── Helpers internos ─────────────────────────────────────────────────────────

function _getAuthToken() {
  return localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
}

function _escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _fmtFecha(iso) {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  } catch(_) { return iso; }
}

function _actualizarBtnImportar() {
  const btn = document.getElementById('btnImportar');
  if (btn) btn.innerHTML = '⬆ Importar a la BD'; // panel legacy — puede ser null en el nuevo layout
}

// ── Decisor: PDF → previsualizar primero; solo Excel → importar directo ───────
function manejarBtnImportar() {
  const hasPDFs = _importFiles.some(f => f.name.match(/\.pdf$/i));
  if (hasPDFs) {
    previzualizarPDFs();
  } else {
    ejecutarImportMasiva();
  }
}

// ── Token de revisión en memoria (no en disco) ────────────────────────────────
let _prevToken = null;

// ── Paso 1: Extracción OCR sin escritura en BD ────────────────────────────────
async function previzualizarPDFs() {
  const pdfFiles = _importFilesPDF.length ? _importFilesPDF
                  : _importFiles.filter(f => f.name.match(/\.pdf$/i));
  const btn = document.getElementById('btnImportarPDF') || document.getElementById('btnImportar');
  if (btn) btn.disabled = true;
  document.getElementById('importProgress').style.display  = 'block';
  document.getElementById('importProgressText').textContent = `Analizando ${pdfFiles.length} PDF${pdfFiles.length > 1 ? 's' : ''}… esto puede tardar hasta 1 minuto`;
  document.getElementById('importProgressBar').style.width  = '0%';

  let pct = 0;
  const bar   = document.getElementById('importProgressBar');
  const timer = setInterval(() => {
    pct = Math.min(pct + (pct < 60 ? 5 : pct < 85 ? 2 : 0.5), 90);
    bar.style.width = pct + '%';
  }, 500);

  try {
    const fd = new FormData();
    for (const f of pdfFiles) fd.append('archivos[]', f);

    const resp = await fetch('/api/pdf/previsualizar', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${_getAuthToken()}` },
      body: fd
    });

    clearInterval(timer);
    bar.style.width = '100%';
    await new Promise(r => setTimeout(r, 350));
    document.getElementById('importProgress').style.display = 'none';

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Error del servidor (${resp.status})`);
    }

    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Error al previsualizar');

    // Auto-importar: con el token en mano se confirma inmediatamente sin paso intermedio.
    // Si hay PDFs no reconocidos o con errores, quedarán reportados en el resultado final.
    _prevToken = data.token;
    await confirmarImportPDF();

  } catch (err) {
    clearInterval(timer);
    document.getElementById('importProgress').style.display = 'none';
    mostrarResultadoImport(null, `No se pudo analizar los PDFs: ${err.message}`);
    document.getElementById('importResult').style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬆ Importar PDFs'; }
  }
}

// ── Mostrar tabla de revisión ─────────────────────────────────────────────────
function _mostrarRevision(preview) {
  const tbody = document.getElementById('tbReview');
  tbody.innerHTML = '';
  let okCount = 0, errCount = 0;

  for (const r of preview) {
    const ok = r.success && r.empleado_encontrado;
    const rowCls = ok ? 'review-row-ok' : 'review-row-err';
    if (ok) okCount++; else errCount++;

    const tipo = r.tipo_novedad === 'PERMISO'
      ? '<span class="badge badge-aus">Permiso Remunerado</span>'
      : r.tipo_novedad === 'VACACIONES'
      ? '<span class="badge badge-dev">Vacaciones</span>'
      : '<span style="color:var(--muted)">—</span>';

    const periodo = r.fecha_inicio
      ? `${_fmtFecha(r.fecha_inicio)} → ${_fmtFecha(r.fecha_fin || r.fecha_inicio)}`
      : '—';

    const estadoBadge = ok
      ? `<span class="badge review-badge-ok">✓ Listo para importar</span>`
      : `<span class="badge review-badge-err" title="${_escHtml(r.error || '')}">✕ ${_escHtml((r.error || 'Error').split('.')[0])}</span>`;

    tbody.insertAdjacentHTML('beforeend', `
      <tr class="${rowCls}">
        <td style="font-size:11px;max-width:180px;word-break:break-word;line-height:1.4">${_escHtml(r.archivo)}</td>
        <td>${r.nombre ? _escHtml(r.nombre) : '<span style="color:var(--muted)">No detectado</span>'}</td>
        <td style="font-family:monospace;font-size:12px;white-space:nowrap">${r.cedula || '—'}</td>
        <td>${tipo}</td>
        <td style="font-size:12px;white-space:nowrap">${periodo}</td>
        <td style="max-width:260px">${estadoBadge}</td>
      </tr>`);
  }

  // Resumen
  const resEl = document.getElementById('reviewResumen');
  let resCls, resTxt;
  if (okCount === 0) {
    resCls = 'review-resumen-err';
    resTxt = `Ningún registro pudo leerse correctamente. Revisa la calidad de los documentos o regístralos manualmente.`;
  } else if (errCount === 0) {
    resCls = 'review-resumen-ok';
    resTxt = `Todos los registros (${okCount}) están listos para importar.`;
  } else {
    resCls = 'review-resumen-mix';
    resTxt = `${okCount} registro${okCount > 1 ? 's' : ''} listo${okCount > 1 ? 's' : ''} · ${errCount} con errores (serán omitidos automáticamente).`;
  }
  resEl.className = resCls;
  resEl.style.cssText = 'padding:11px 16px;border-radius:8px;font-size:13px;margin-bottom:16px';
  resEl.textContent = resTxt;

  const btnConf = document.getElementById('btnConfirmarReview');
  if (okCount === 0) {
    btnConf.disabled = true;
    btnConf.textContent = 'Sin registros válidos';
  } else {
    btnConf.disabled = false;
    btnConf.textContent = `✓ Confirmar e importar (${okCount} registro${okCount > 1 ? 's' : ''})`;
  }

  const _rev = document.getElementById('importReview');
  const _res = document.getElementById('importResult');
  const _fii = document.getElementById('importFileInfo');
  if (_rev) _rev.style.display = 'block';
  if (_res) _res.style.display = 'none';
  if (_fii) _fii.style.display = 'none';
}

// ── Cancelar revisión y volver a selección ────────────────────────────────────
function cancelarReview() {
  _prevToken = null;
  document.getElementById('importReview').style.display = 'none';
  cancelarImport();
}

// ── Paso 2: Confirmar e importar (usa datos cacheados en servidor) ─────────────
async function confirmarImportPDF() {
  if (!_prevToken) { cancelarReview(); return; }

  const btnConf = document.getElementById('btnConfirmarReview');
  btnConf.disabled = true;
  btnConf.textContent = '⏳ Guardando…';
  document.getElementById('importReview').style.display  = 'none';
  document.getElementById('importProgress').style.display = 'block';
  document.getElementById('importProgressText').textContent = 'Guardando novedades en la base de datos…';
  document.getElementById('importProgressBar').style.width = '20%';

  const bar   = document.getElementById('importProgressBar');
  const timer = setInterval(() => {
    const cur = parseFloat(bar.style.width) || 20;
    if (cur < 85) bar.style.width = (cur + 4) + '%';
  }, 400);

  try {
    // Si hay también archivos Excel en el lote, procesarlos al mismo tiempo
    const excelFiles = _importFiles.filter(f => f.name.match(/\.(xlsx?|csv)$/i));
    let resultadosFinales = {
      success: true, periodo: null, archivos: [],
      resumen: { totalArchivos: _importFiles.length, procesados: 0, totalFilas: 0, insertados: 0, acumulados: 0, reactivados: 0, conErrores: 0, errores: 0 }
    };

    if (excelFiles.length > 0) {
      const fdExcel = new FormData();
      for (const f of excelFiles) fdExcel.append('archivos[]', f);
      const modoRadio = document.querySelector('input[name="adeccoModo"]:checked');
      if (modoRadio && excelFiles.some(f => esArchivoAdecco(f.name))) fdExcel.append('modo', modoRadio.value);
      const rExcel = await fetch('/api/ocasionales/importar-excel', {
        method: 'POST', headers: { 'Authorization': `Bearer ${_getAuthToken()}` }, body: fdExcel
      });
      if (rExcel.ok || rExcel.status === 207) {
        const dExcel = await rExcel.json();
        if (dExcel.archivos) resultadosFinales.archivos.push(...dExcel.archivos);
        if (dExcel.periodo)  resultadosFinales.periodo = dExcel.periodo;
        const rs = dExcel.globalResumen || dExcel.resumen || {};
        resultadosFinales.resumen.insertados += rs.insertados || 0;
        resultadosFinales.resumen.errores    += rs.conErrores || rs.errores || 0;
      }
    }

    bar.style.width = '70%';
    document.getElementById('importProgressText').textContent = 'Confirmando permisos y vacaciones…';

    const respConf = await fetch('/api/pdf/confirmar', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${_getAuthToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: _prevToken })
    });

    clearInterval(timer);
    bar.style.width = '100%';
    await new Promise(r => setTimeout(r, 350));
    document.getElementById('importProgress').style.display = 'none';

    if (!respConf.ok) {
      const err = await respConf.json().catch(() => ({}));
      throw new Error(err.error || `Error del servidor (${respConf.status})`);
    }

    const dataPDF = await respConf.json();
    if (dataPDF.archivos) resultadosFinales.archivos.push(...dataPDF.archivos);
    if (dataPDF.periodo && !resultadosFinales.periodo) resultadosFinales.periodo = dataPDF.periodo;
    if (dataPDF.resumen) {
      const r = dataPDF.resumen;
      resultadosFinales.resumen.insertados  += r.insertados  || 0;
      resultadosFinales.resumen.acumulados  += r.acumulados  || 0;
      resultadosFinales.resumen.reactivados += r.reactivados || 0;
      resultadosFinales.resumen.conErrores  += r.conErrores  || 0;
      resultadosFinales.resumen.errores     += r.errores     || 0;
    }

    _prevToken = null;
    mostrarResultadoImport(resultadosFinales, null);
    // Recargar todas las tablas que pueden recibir registros desde PDFs
    cargarOcasionalesDelPeriodo();
    cargarAusentismosDelPeriodo();
    cargarActividadReciente();

  } catch (err) {
    clearInterval(timer);
    document.getElementById('importProgress').style.display = 'none';
    document.getElementById('importReview').style.display   = 'block';
    mostrarResultadoImport(null, `Error al importar: ${err.message}`);
  } finally {
    btnConf.disabled = false;
    btnConf.textContent = '✓ Confirmar e importar';
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function ejecutarImportMasiva() {
  if (_importFiles.length === 0) {
    alert('Selecciona al menos un archivo para importar.');
    return;
  }

  // Obtener usuario desde sesión
  let usuario = 'MineDax';
  try {
    const u = JSON.parse(localStorage.getItem('usuario'));
    if (u && u.nombre) usuario = u.nombre;
  } catch (_) {}

  // Detectar tipos de archivos
  const excelFiles = _importFiles.filter(f => f.name.match(/\.(xlsx?|csv)$/i));
  const pdfFiles = _importFiles.filter(f => f.name.match(/\.pdf$/i));

  // Deshabilitar botón y mostrar progreso (panel split: usa btnImportarExcel)
  const btn = document.getElementById('btnImportarExcel');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Procesando…'; }
  document.getElementById('importProgress').style.display = 'block';
  document.getElementById('importResult').style.display = 'none';

  // Animar barra de progreso
  let pct = 0;
  const barEl = document.getElementById('importProgressBar');
  const txtEl = document.getElementById('importProgressText');
  const totalArchivos = _importFiles.length;
  const progTimer = setInterval(() => {
    pct = Math.min(pct + (pct < 60 ? 8 : pct < 85 ? 3 : 0.5), 90);
    barEl.style.width = pct + '%';
    if (pct < 25)      txtEl.textContent = `Cargando ${totalArchivos} archivo${totalArchivos > 1 ? 's' : ''}…`;
    else if (pct < 50) txtEl.textContent = 'Parseando y validando datos…';
    else if (pct < 75) txtEl.textContent = 'Insertando novedades en la BD…';
    else               txtEl.textContent = 'Finalizando…';
  }, 300);

  try {
    const headers = { 'Authorization': `Bearer ${_getAuthToken()}` };

    let resultadosFinales = {
      success: true,
      periodo: null,
      archivos: [],
      resumen: { totalArchivos: totalArchivos, procesados: 0, totalFilas: 0, insertados: 0, acumulados: 0, reactivados: 0, conErrores: 0, errores: 0 }
    };

    // Leer modo seleccionado para archivos ADECCO
    const modoRadio = document.querySelector('input[name="adeccoModo"]:checked');
    const modoAdecco = modoRadio ? modoRadio.value : 'novedades';

    // Procesar archivos Excel
    if (excelFiles.length > 0) {
      const formDataExcel = new FormData();
      for (const f of excelFiles) {
        formDataExcel.append('archivos[]', f);
      }
      formDataExcel.append('usuario', usuario);
      // Enviar modo solo si hay al menos un archivo ADECCO en el lote
      const hayAdecco = excelFiles.some(f => esArchivoAdecco(f.name));
      if (hayAdecco) formDataExcel.append('modo', modoAdecco);

      const respExcel = await fetch('/api/ocasionales/importar-excel', {
        method: 'POST',
        headers,
        body: formDataExcel,
      });

      if (respExcel.ok || respExcel.status === 207) {
        const dataExcel = await respExcel.json();
        if (dataExcel.archivos) resultadosFinales.archivos.push(...dataExcel.archivos);
        if (dataExcel.globalResumen) {
          resultadosFinales.resumen.procesados  += dataExcel.globalResumen.procesados  || 0;
          resultadosFinales.resumen.insertados  += dataExcel.globalResumen.insertados  || 0;
          resultadosFinales.resumen.acumulados  += dataExcel.globalResumen.acumulados  || 0;
          resultadosFinales.resumen.conErrores  += dataExcel.globalResumen.conErrores  || 0;
          resultadosFinales.resumen.errores     += dataExcel.globalResumen.conErrores  || 0;
        } else if (dataExcel.resumen) {
          resultadosFinales.resumen.procesados += dataExcel.resumen.procesados || 0;
          resultadosFinales.resumen.insertados += dataExcel.resumen.insertados || 0;
          resultadosFinales.resumen.errores    += dataExcel.resumen.errores    || 0;
        }
        if (dataExcel.periodo) resultadosFinales.periodo = dataExcel.periodo;
        // Pasar resumen de empleados si viene en la respuesta
        if (dataExcel.archivos) {
          for (const a of dataExcel.archivos) {
            if (a.resumenEmpleados) {
              resultadosFinales._resumenEmpleados = a.resumenEmpleados;
            }
          }
        }
      }
    }

    // Procesar archivos PDF (nueva funcionalidad)
    if (pdfFiles.length > 0) {
      const formDataPDF = new FormData();
      for (const f of pdfFiles) {
        formDataPDF.append('archivos[]', f);
      }

      const respPDF = await fetch('/api/pdf/importar', {
        method: 'POST',
        headers,
        body: formDataPDF,
      });

      if (respPDF.ok) {
        const dataPDF = await respPDF.json();
        if (dataPDF.archivos) resultadosFinales.archivos.push(...dataPDF.archivos);
        if (dataPDF.periodo) resultadosFinales.periodo = dataPDF.periodo;
        if (dataPDF.resumen) {
          resultadosFinales.resumen.procesados  += dataPDF.resumen.procesados  || 0;
          resultadosFinales.resumen.insertados  += dataPDF.resumen.insertados  || 0;
          resultadosFinales.resumen.acumulados  += dataPDF.resumen.acumulados  || 0;
          resultadosFinales.resumen.reactivados += dataPDF.resumen.reactivados || 0;
          resultadosFinales.resumen.conErrores  += dataPDF.resumen.conErrores  || dataPDF.resumen.errores || 0;
          resultadosFinales.resumen.errores     += dataPDF.resumen.errores     || dataPDF.resumen.conErrores || 0;
        }
      }
    }

    clearInterval(progTimer);
    barEl.style.width = '100%';
    await new Promise(r => setTimeout(r, 400));

    document.getElementById('importProgress').style.display = 'none';

    if (resultadosFinales.archivos.length === 0) {
      mostrarResultadoImport(null, 'No se procesaron archivos');
    } else {
      mostrarResultadoImport(resultadosFinales, null);
      cargarOcasionalesDelPeriodo();
    }
  } catch (err) {
    clearInterval(progTimer);
    document.getElementById('importProgress').style.display = 'none';
    mostrarResultadoImport(null, `Error de red: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬆ Importar Excel'; }
  }
}

let _importDetalle = []; // para filtrar

function mostrarResultadoImport(data, errorMsg) {
  document.getElementById('importResult').style.display = 'block';
  document.getElementById('importGuia').style.display = 'none';

  if (errorMsg || !data) {
    const banner = document.getElementById('importResultBanner');
    banner.style.background = 'rgba(224,85,85,0.12)';
    banner.style.borderColor = 'rgba(224,85,85,0.35)';
    banner.style.color = 'var(--danger)';
    document.getElementById('importResultIcon').textContent = '✕';
    document.getElementById('importResultTitle').textContent = 'No se pudo procesar';
    document.getElementById('importResultSub').textContent = errorMsg || 'Error desconocido';
    document.getElementById('importStatsGrid').style.display = 'none';
    document.getElementById('importPeriodoCard').style.display = 'none';
    document.getElementById('tbImportDetalle').innerHTML =
      `<tr><td colspan="7" style="text-align:center;color:var(--danger);padding:24px">${errorMsg}</td></tr>`;
    return;
  }

  document.getElementById('importStatsGrid').style.display = 'grid';
  document.getElementById('importPeriodoCard').style.display = 'block';

  // Usar globalResumen si existe (formato multi-archivo), sino caer al resumen legacy
  const gr = data.globalResumen || data.resumen || {};
  const archivos = data.archivos || [];
  const totalArch = archivos.length || 1;
  // Detectar errores: formato Excel usa a.ok; formato PDF usa a.estado === 'ERROR'
  const archivosConError = archivos.filter(a =>
    (a.ok === false) ||
    (a.resumen && a.resumen.conErrores > 0) ||
    (a.estado === 'ERROR')
  ).length;
  const hayErr = archivosConError > 0 || (gr.conErrores || gr.errores || 0) > 0;

  // Banner
  const banner = document.getElementById('importResultBanner');
  if (!hayErr) {
    banner.style.background = 'rgba(76,175,130,0.12)';
    banner.style.borderColor = 'rgba(76,175,130,0.3)';
    banner.style.color = 'var(--success)';
    document.getElementById('importResultIcon').textContent = '✓';
    document.getElementById('importResultTitle').textContent =
      totalArch > 1 ? `${totalArch} archivos importados exitosamente` : 'Importación completada exitosamente';
  } else {
    banner.style.background = 'rgba(255,165,0,0.10)';
    banner.style.borderColor = 'rgba(255,165,0,0.3)';
    banner.style.color = '#f5a623';
    document.getElementById('importResultIcon').textContent = '⚠';
    document.getElementById('importResultTitle').textContent = 'Importación completada con advertencias';
  }
  document.getElementById('importResultSub').textContent =
    `${gr.insertados || 0} insertados · ${gr.acumulados || 0} acumulados · ` +
    `${gr.conErrores || 0} errores · Período: ${data.periodo?.etiqueta || '—'}`;

  // Stats
  document.getElementById('istat_archivos').textContent = totalArch;
  document.getElementById('istat_filas').textContent = gr.totalFilas || 0;
  document.getElementById('istat_procesados').textContent = gr.procesados || 0;
  document.getElementById('istat_insertados').textContent = gr.insertados || 0;
  document.getElementById('istat_acumulados').textContent = gr.acumulados || 0;
  document.getElementById('istat_errores').textContent = gr.conErrores || 0;

  // Período
  document.getElementById('importPeriodoLabel').textContent =
    data.periodo
      ? `${data.periodo.etiqueta}  (${new Date(data.periodo.inicio).toLocaleDateString('es-CO')} – ${new Date(data.periodo.fin).toLocaleDateString('es-CO')})`
      : '—';

  // ── Panel de resumen de empleados (modo empleados/ambos) ─────────────────────
  let panelEmp = document.getElementById('importResumenEmpleados');
  const re = data._resumenEmpleados;
  if (re) {
    if (!panelEmp) {
      panelEmp = document.createElement('div');
      panelEmp.id = 'importResumenEmpleados';
      panelEmp.className = 'form-card';
      panelEmp.style.cssText = 'padding:14px 20px; margin-bottom:16px;';
      document.getElementById('importPeriodoCard').after(panelEmp);
    }
    const pendHTML = (re.pendientes && re.pendientes.length > 0)
      ? `<div style="margin-top:10px;padding:10px 14px;background:rgba(224,85,85,0.08);border:1px solid rgba(224,85,85,0.25);border-radius:6px;">
           <div style="font-size:12px;font-weight:700;color:var(--danger);margin-bottom:6px;">⚠ ${re.pendientes} empleado(s) omitido(s) por FKs sin resolver</div>
           <div style="font-size:11px;color:var(--muted);">Estos registros no fueron importados. Verifica que Cargo, Centro Costo, EPS, AFP, Caja y Cesantías existan en las tablas maestras de la BD.</div>
         </div>` : '';
    panelEmp.innerHTML = `
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:10px;">Sincronización de Empleados (Maestro Original)</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div style="text-align:center;min-width:70px;">
          <div style="font-size:20px;font-weight:800;color:#4CAF82;">${re.insertados || 0}</div>
          <div style="font-size:11px;color:var(--muted);">Nuevos</div>
        </div>
        <div style="text-align:center;min-width:70px;">
          <div style="font-size:20px;font-weight:800;color:var(--cm-blue-light);">${re.actualizados || 0}</div>
          <div style="font-size:11px;color:var(--muted);">Actualizados</div>
        </div>
        <div style="text-align:center;min-width:70px;">
          <div style="font-size:20px;font-weight:800;color:#f5a623;">${re.inhabilitados || 0}</div>
          <div style="font-size:11px;color:var(--muted);">Inhabilitados</div>
        </div>
        <div style="text-align:center;min-width:70px;">
          <div style="font-size:20px;font-weight:800;color:var(--danger);">${re.omitidos || 0}</div>
          <div style="font-size:11px;color:var(--muted);">Omitidos</div>
        </div>
      </div>
      ${pendHTML}
    `;
  } else if (panelEmp) {
    panelEmp.remove();
  }

  // Construir detalle global unificado desde todos los archivos
  _importDetalle = [];
  if (archivos.length > 0) {
    for (const arch of archivos) {
      // Detectar si es PDF o Excel por la estructura
      const esPDF = arch.tipoNovedad !== undefined;

      if (esPDF) {
        // Formato PDF: usar tipoNovedad como "concepto"
        // Mapear estado correctamente: INSERTADO, ACUMULADO, REACTIVADO → sus estados;
        // cualquier otra cosa que no sea éxito → ERROR
        const estadoPDF = ['INSERTADO','ACUMULADO','REACTIVADO'].includes(arch.estado)
          ? arch.estado : 'ERROR';
        _importDetalle.push({
          _archivo: arch.archivo,
          estado: estadoPDF,
          cedula: arch.cedula || '—',
          nombre: arch.nombre || '—',
          codConc: null,
          tipoNovedad: arch.tipoNovedad || '—',
          cantidad: arch.cantidad || null,
          mensaje: estadoPDF !== 'ERROR' ? arch.detalle : arch.error,
        });
      } else if (!arch.ok && arch.error) {
        // Archivo que falló completamente (Excel)
        _importDetalle.push({
          _archivo: arch.archivo,
          estado: 'ERROR',
          cedula: '—',
          nombre: '—',
          codConc: null,
          cantidad: null,
          mensaje: `[${arch.archivo}] ${arch.error}`,
        });
      } else if (arch.detalle) {
        // Formato Excel: usar detalle
        for (const d of arch.detalle) {
          _importDetalle.push({ ...d, _archivo: arch.archivo });
        }
      }
    }
  } else if (data.detalle) {
    // compatibilidad formato antiguo
    _importDetalle = data.detalle;
  }

  renderDetalleImport(_importDetalle);
}

function renderDetalleImport(rows) {
  const tb = document.getElementById('tbImportDetalle');
  if (!rows || rows.length === 0) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Sin detalle</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(d => {
    let estadoHtml = '';
    if (d.estado === 'INSERTADO') {
      estadoHtml = `<span class="badge badge-dev">✓ Insertado</span>`;
    } else if (d.estado === 'ACUMULADO') {
      estadoHtml = `<span class="badge badge-cam">⊕ Acumulado</span>`;
    } else if (d.estado === 'ACTUALIZADO') {
      estadoHtml = `<span class="badge" style="background:rgba(32,167,201,0.15);color:#20A7C9;">↺ Actualizado</span>`;
    } else if (d.estado === 'REACTIVADO') {
      estadoHtml = `<span class="badge" style="background:rgba(91,155,213,0.15);color:#5B9BD5;">↺ Reactivado</span>`;
    } else if (d.estado === 'INHABILITADO') {
      estadoHtml = `<span class="badge" style="background:rgba(245,166,35,0.15);color:#f5a623;">⊘ Inhabilitado</span>`;
    } else if (d.estado === 'PENDIENTE') {
      estadoHtml = `<span class="badge" style="background:rgba(224,85,85,0.12);color:#E05555;">⚠ Pendiente</span>`;
    } else if (d.estado === 'AVISO') {
      estadoHtml = `<span class="badge" style="background:rgba(32,167,201,0.15);color:#20A7C9;">ℹ Aviso</span>`;
    } else {
      estadoHtml = `<span class="badge badge-ded">✕ Error</span>`;
    }
    // Soportar tanto codConc (Excel) como tipoNovedad (PDF)
    const concNom = d.codConc
      ? (CONC_NOMBRES[d.codConc] || `Concepto #${d.codConc}`)
      : (d.tipoNovedad || '—');
    const cant = d.cantidad != null ? Number(d.cantidad).toFixed(2) : '—';
    const archNom = d._archivo
      ? `<span title="${d._archivo}" style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;display:inline-block;">${d._archivo}</span>`
      : '—';
    return `<tr>
      <td style="max-width:90px;overflow:hidden;">${archNom}</td>
      <td style="font-family:monospace;font-size:12px;color:var(--cm-blue)">${d.cedula || '—'}</td>
      <td>${d.nombre || '—'}</td>
      <td style="font-size:12px">${concNom}</td>
      <td style="text-align:right">${cant}</td>
      <td>${estadoHtml}</td>
      <td style="font-size:11px;color:var(--muted);max-width:220px;">${d.mensaje || ''}</td>
    </tr>`;
  }).join('');
}

function filtrarDetalleImport() {
  const estado = document.getElementById('filtroEstadoImport').value;
  const txt = (document.querySelector('#page-importar .table-search') || {value:''}).value.toLowerCase();
  const filtered = _importDetalle.filter(d => {
    const matchEstado = !estado || d.estado === estado;
    const matchTxt = !txt ||
      (d.cedula && String(d.cedula).includes(txt)) ||
      (d.nombre && d.nombre.toLowerCase().includes(txt)) ||
      (d._archivo && d._archivo.toLowerCase().includes(txt));
    return matchEstado && matchTxt;
  });
  renderDetalleImport(filtered);
}

// Drag & drop — soporta múltiples archivos
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.style.borderColor = 'var(--cm-blue)';
  dropZone.style.background = 'rgba(32,167,201,0.08)';
});
dropZone.addEventListener('dragleave', () => {
  dropZone.style.borderColor = '';
  dropZone.style.background = '';
});
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.style.borderColor = '';
  dropZone.style.background = '';
  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length > 0) {
    seleccionarArchivoImport({ target: { files, value: '' } });
  }
});
// Función de diagnóstico para verificar sesión
function diagnosticarSesion() {
  console.log('=== DIAGNÓSTICO DE SESIÓN ===');
  console.log('Token en localStorage:', localStorage.getItem('authToken') ? 'SÍ' : 'NO');
  const usuarioJson = localStorage.getItem('usuario');
  console.log('Usuario en localStorage:', usuarioJson ? 'SÍ' : 'NO');
  if (usuarioJson) {
    const usuario = JSON.parse(usuarioJson);
    console.log('Datos del usuario:', usuario);
  }
  if (typeof AuthUtil !== 'undefined') {
    console.log('AuthUtil disponible: SÍ');
    console.log('AuthUtil.estaAutenticado():', AuthUtil.estaAutenticado());
    console.log('AuthUtil.getNombre():', AuthUtil.getNombre());
  } else {
    console.log('AuthUtil disponible: NO');
  }
}

// Cargar conceptos ocasionales cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
  // Diagnóstico de sesión (para debugging)
  diagnosticarSesion();

  // Inicializar interfaz con período automático y bienvenida personalizada
  inicializarInterfaz();

  // Cargar períodos disponibles para el buscador histórico
  histCargarPeriodos();

  // Cargar actividad reciente desde BD
  cargarActividadReciente();

  cargarConceptosOcasionales();
  cargarConceptosFijas();
  cargarConceptosAusentismos();
  cargarConceptosCambios();
  // Resolver y mostrar período activo (quincena vigente por fecha).
  cargarPeriodoActualOcas();
  cargarPeriodoActualFijas();
  cargarPeriodoActualAus();
  cargarPeriodoActualCam();
  // Pre-cargar registros del período para que las tablas estén pobladas aunque
  // el usuario aún no haya navegado a la pestaña.
  cargarOcasionalesDelPeriodo();
  cargarFijasDelPeriodo();
  cargarAusentismosDelPeriodo();
  cargarCambiosDelPeriodo();
  // Catálogos y empleados del Maestro Original (desde MineDax BD)
  cargarCatalogos();
  cargarEmpleadosBD();

  // Cerrar dropdowns de autocomplete al hacer click fuera
  document.addEventListener('click', (e) => {
    const dropdowns = document.querySelectorAll('.autocomplete-dropdown.show');
    dropdowns.forEach(dropdown => {
      const formGroup = dropdown.parentElement;
      if (!formGroup.contains(e.target)) {
        dropdown.classList.remove('show');
      }
    });
  });
});

// ── MODAL EXPORTAR ADECCO + ANULACIÓN MASIVA ─────────────────

// ─── MODAL EXPORTAR ADECCO ────────────────────────────────────────────────────

async function abrirModalExportarAdecco() {
  const modal = document.getElementById('modalExportarAdecco');
  modal.style.display = 'flex';
  document.getElementById('adeccoResumen').style.display = 'none';
  document.getElementById('adeccoProgreso').style.display = 'none';

  const sel = document.getElementById('adeccoSelectPeriodo');
  sel.innerHTML = '<option value="">— Cargando períodos… —</option>';

  try {
    const r = await fetch('/api/exportar-adecco/periodos');
    if (!r.ok) throw new Error('No se pudieron cargar los períodos');
    const periodos = await r.json();

    sel.innerHTML = '<option value="">— Seleccionar período —</option>';
    periodos.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.codPeriod;
      opt.textContent = p.etiqueta + (p.estado === 'A' ? '' : ' (cerrado)');
      // Pre-seleccionar el período activo de la app si existe
      if (_periodoActualOcas && p.codPeriod === _periodoActualOcas.codPeriod) {
        opt.selected = true;
        mostrarResumenAdecco(p);
      }
      sel.appendChild(opt);
    });

    sel.onchange = () => {
      const p = periodos.find(x => x.codPeriod == sel.value);
      if (p) mostrarResumenAdecco(p);
      else document.getElementById('adeccoResumen').style.display = 'none';
    };
  } catch (e) {
    sel.innerHTML = '<option value="">⚠ Error cargando períodos</option>';
    console.error('adecco modal error:', e);
  }
}

function mostrarResumenAdecco(p) {
  const res = document.getElementById('adeccoResumen');
  const fi = p.fechaIni ? new Date(p.fechaIni).toLocaleDateString('es-CO') : '—';
  const ff = p.fechaFin ? new Date(p.fechaFin).toLocaleDateString('es-CO') : '—';
  res.innerHTML = `
    <strong style="color:#e8c96a">📅 ${p.etiqueta}</strong><br>
    <span style="color:#a0aec0">Del ${fi} al ${ff}</span><br>
    <span style="color:#718096;font-size:11px;margin-top:4px;display:block;">
      Se incluirán todas las novedades activas (ocasionales, fijas, ausentismos y cambios).
    </span>`;
  res.style.display = 'block';
}

function cerrarModalExportarAdecco() {
  document.getElementById('modalExportarAdecco').style.display = 'none';
}

async function descargarAdecco() {
  const sel = document.getElementById('adeccoSelectPeriodo');
  const codPeriod = sel.value;
  if (!codPeriod) {
    alert('Por favor selecciona un período antes de descargar.');
    return;
  }

  const btn = document.getElementById('btnDescargarAdecco');
  const prog = document.getElementById('adeccoProgreso');
  btn.disabled = true;
  btn.style.opacity = '.6';
  prog.style.display = 'block';

  try {
    const url = `/api/exportar-adecco?codPeriod=${codPeriod}&codEmpr=1`;
    const r = await fetch(url);

    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(err.error || `HTTP ${r.status}`);
    }

    // Obtener nombre de archivo desde Content-Disposition
    const cd = r.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `Novedades_ADECCO_Periodo${codPeriod}.xlsx`;

    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);

    cerrarModalExportarAdecco();
  } catch (e) {
    alert('❌ Error generando el archivo:\n' + e.message);
    console.error('descargarAdecco error:', e);
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
    prog.style.display = 'none';
  }
}

// Cerrar modal al hacer clic fuera
document.getElementById('modalExportarAdecco').addEventListener('click', function(e) {
  if (e.target === this) cerrarModalExportarAdecco();
});

// ═══════════════════════════════════════════════════════════════════════════
//  SELECCIÓN MÚLTIPLE Y ANULACIÓN MASIVA — Todas las pestañas de novedad
// ═══════════════════════════════════════════════════════════════════════════

// Estado local de selección por tipo de novedad
const _selOcas  = new Set(); // Ocasionales
const _selFijas = new Set(); // Fijas
const _selAusen = new Set(); // Ausentismos
const _selCamb  = new Set(); // Cambios/Ingresos

// Contexto activo (cuál tab tiene selecciones en la barra)
let _batchTabActivo = null; // 'oc' | 'fj' | 'aus' | 'ci'

// ─── Obtener el set activo según tab ─────────────────────────────────────────
function _getSelActivo() {
  if (_batchTabActivo === 'fj')  return _selFijas;
  if (_batchTabActivo === 'aus') return _selAusen;
  if (_batchTabActivo === 'ci')  return _selCamb;
  return _selOcas;
}

// ─── Actualiza la barra flotante ─────────────────────────────────────────────
function _actualizarBarraBatch() {
  const bar   = document.getElementById('seleccionBar');
  const count = document.getElementById('seleccionCount');
  const total = _selOcas.size + _selFijas.size + _selAusen.size + _selCamb.size;
  if (total > 0) {
    count.textContent = total;
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
    _batchTabActivo = null;
  }
}

// Alias para compatibilidad con código existente
function _actualizarBarraSeleccion() { _actualizarBarraBatch(); }

// ─── OCASIONALES ─────────────────────────────────────────────────────────────
function _toggleSelOcas(codNoved, cb) {
  _batchTabActivo = 'oc';
  const tr = cb.closest('tr');
  if (cb.checked) { _selOcas.add(codNoved); tr.classList.add('selected-row'); }
  else            { _selOcas.delete(codNoved); tr.classList.remove('selected-row'); }
  const cbAll = document.getElementById('cbSelAll');
  if (cbAll) {
    const total = document.querySelectorAll('#tbOcasionales .cb-row').length;
    cbAll.checked       = _selOcas.size === total && total > 0;
    cbAll.indeterminate = _selOcas.size > 0 && _selOcas.size < total;
  }
  _actualizarBarraBatch();
}

function _toggleSelAll(cbAll) {
  _batchTabActivo = 'oc';
  document.querySelectorAll('#tbOcasionales .cb-row').forEach(cb => {
    const codNoved = Number(cb.dataset.codNoved);
    const tr = cb.closest('tr');
    if (cbAll.checked) { cb.checked = true; _selOcas.add(codNoved); tr.classList.add('selected-row'); }
    else               { cb.checked = false; _selOcas.delete(codNoved); tr.classList.remove('selected-row'); }
  });
  cbAll.indeterminate = false;
  _actualizarBarraBatch();
}

function _limpiarSeleccion() {
  _selOcas.clear();
  document.querySelectorAll('#tbOcasionales .cb-row').forEach(cb => {
    cb.checked = false; cb.closest('tr')?.classList.remove('selected-row');
  });
  const cbAll = document.getElementById('cbSelAll');
  if (cbAll) { cbAll.checked = false; cbAll.indeterminate = false; }
  _actualizarBarraBatch();
}

// ─── FIJAS ───────────────────────────────────────────────────────────────────
function _toggleSelFijas(codNoved, cb) {
  _batchTabActivo = 'fj';
  const tr = cb.closest('tr');
  if (cb.checked) { _selFijas.add(codNoved); tr.classList.add('selected-row'); }
  else            { _selFijas.delete(codNoved); tr.classList.remove('selected-row'); }
  const cbAll = document.getElementById('cbSelAllFijas');
  if (cbAll) {
    const total = document.querySelectorAll('#tbFijas .cb-row-fijas').length;
    cbAll.checked       = _selFijas.size === total && total > 0;
    cbAll.indeterminate = _selFijas.size > 0 && _selFijas.size < total;
  }
  _actualizarBarraBatch();
}

function _toggleSelAllFijas(cbAll) {
  _batchTabActivo = 'fj';
  document.querySelectorAll('#tbFijas .cb-row-fijas').forEach(cb => {
    const codNoved = Number(cb.dataset.codNoved);
    const tr = cb.closest('tr');
    if (cbAll.checked) { cb.checked = true; _selFijas.add(codNoved); tr.classList.add('selected-row'); }
    else               { cb.checked = false; _selFijas.delete(codNoved); tr.classList.remove('selected-row'); }
  });
  cbAll.indeterminate = false;
  _actualizarBarraBatch();
}

function _limpiarSelFijas() {
  _selFijas.clear();
  document.querySelectorAll('#tbFijas .cb-row-fijas').forEach(cb => {
    cb.checked = false; cb.closest('tr')?.classList.remove('selected-row');
  });
  const cbAll = document.getElementById('cbSelAllFijas');
  if (cbAll) { cbAll.checked = false; cbAll.indeterminate = false; }
  _actualizarBarraBatch();
}

// ─── AUSENTISMOS ─────────────────────────────────────────────────────────────
function _toggleSelAusen(codNoved, cb) {
  _batchTabActivo = 'aus';
  const tr = cb.closest('tr');
  if (cb.checked) { _selAusen.add(codNoved); tr.classList.add('selected-row'); }
  else            { _selAusen.delete(codNoved); tr.classList.remove('selected-row'); }
  const cbAll = document.getElementById('cbSelAllAusen');
  if (cbAll) {
    const total = document.querySelectorAll('#tbAusentismos .cb-row-ausen').length;
    cbAll.checked       = _selAusen.size === total && total > 0;
    cbAll.indeterminate = _selAusen.size > 0 && _selAusen.size < total;
  }
  _actualizarBarraBatch();
}

function _toggleSelAllAusen(cbAll) {
  _batchTabActivo = 'aus';
  document.querySelectorAll('#tbAusentismos .cb-row-ausen').forEach(cb => {
    const codNoved = Number(cb.dataset.codNoved);
    const tr = cb.closest('tr');
    if (cbAll.checked) { cb.checked = true; _selAusen.add(codNoved); tr.classList.add('selected-row'); }
    else               { cb.checked = false; _selAusen.delete(codNoved); tr.classList.remove('selected-row'); }
  });
  cbAll.indeterminate = false;
  _actualizarBarraBatch();
}

function _limpiarSelAusen() {
  _selAusen.clear();
  document.querySelectorAll('#tbAusentismos .cb-row-ausen').forEach(cb => {
    cb.checked = false; cb.closest('tr')?.classList.remove('selected-row');
  });
  const cbAll = document.getElementById('cbSelAllAusen');
  if (cbAll) { cbAll.checked = false; cbAll.indeterminate = false; }
  _actualizarBarraBatch();
}

// ─── CAMBIOS / INGRESOS ───────────────────────────────────────────────────────
function _toggleSelCamb(codNoved, cb) {
  _batchTabActivo = 'ci';
  const tr = cb.closest('tr');
  if (cb.checked) { _selCamb.add(codNoved); tr.classList.add('selected-row'); }
  else            { _selCamb.delete(codNoved); tr.classList.remove('selected-row'); }
  const cbAll = document.getElementById('cbSelAllCamb');
  if (cbAll) {
    const total = document.querySelectorAll('#tbCIngresos .cb-row-camb').length;
    cbAll.checked       = _selCamb.size === total && total > 0;
    cbAll.indeterminate = _selCamb.size > 0 && _selCamb.size < total;
  }
  _actualizarBarraBatch();
}

function _toggleSelAllCamb(cbAll) {
  _batchTabActivo = 'ci';
  document.querySelectorAll('#tbCIngresos .cb-row-camb').forEach(cb => {
    const codNoved = Number(cb.dataset.codNoved);
    const tr = cb.closest('tr');
    if (cbAll.checked) { cb.checked = true; _selCamb.add(codNoved); tr.classList.add('selected-row'); }
    else               { cb.checked = false; _selCamb.delete(codNoved); tr.classList.remove('selected-row'); }
  });
  cbAll.indeterminate = false;
  _actualizarBarraBatch();
}

function _limpiarSelCamb() {
  _selCamb.clear();
  document.querySelectorAll('#tbCIngresos .cb-row-camb').forEach(cb => {
    cb.checked = false; cb.closest('tr')?.classList.remove('selected-row');
  });
  const cbAll = document.getElementById('cbSelAllCamb');
  if (cbAll) { cbAll.checked = false; cbAll.indeterminate = false; }
  _actualizarBarraBatch();
}

// ─── Limpiar toda la selección (botón Deseleccionar en la barra) ──────────────
function _limpiarTodasSelecciones() {
  _limpiarSeleccion();  // ocasionales
  _limpiarSelFijas();
  _limpiarSelAusen();
  _limpiarSelCamb();
}

// ─── Abrir modal de confirmación de anulación masiva ────────────────────────
function abrirModalAnularBatch() {
  // Determinar cuál set tiene selecciones
  let selSet, stateArr, conceptoKey, tabLabel;
  if (_selOcas.size > 0) {
    selSet = _selOcas; stateArr = state.ocasionales; conceptoKey = 'nomConc'; tabLabel = 'Ocasional';
  } else if (_selFijas.size > 0) {
    selSet = _selFijas; stateArr = state.fijas; conceptoKey = 'nomConc'; tabLabel = 'Fija';
  } else if (_selAusen.size > 0) {
    selSet = _selAusen; stateArr = state.ausentismos; conceptoKey = 'tipo'; tabLabel = 'Ausentismo';
  } else if (_selCamb.size > 0) {
    selSet = _selCamb; stateArr = state.cambiosIngresos; conceptoKey = 'cambio'; tabLabel = 'Cambio/Ingreso';
  } else {
    return;
  }

  const filas = [...selSet].map(cod => {
    const rec = stateArr.find(r => r.codNoved === cod);
    return rec || { codNoved: cod, id: '—', nombre: '—' };
  }).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const tbody = filas.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.nombre}</td>
      <td>${r[conceptoKey] || r.nomConc || r.novedad || '—'}</td>
    </tr>`).join('');

  document.getElementById('batchListBody').innerHTML = tbody;
  document.getElementById('batchCountLabel').textContent =
    `${filas.length} novedad${filas.length !== 1 ? 'es' : ''} (${tabLabel})`;

  document.getElementById('modalAnularBatch').classList.add('open');
}

function cerrarModalAnularBatch() {
  document.getElementById('modalAnularBatch').classList.remove('open');
}

// ─── Ejecutar anulación masiva ───────────────────────────────────────────────
async function confirmarAnularBatch() {
  const btnConfirm = document.getElementById('btnBatchConfirm');

  // Determinar qué set y endpoint usar
  let selSet, endpoint, alertId, recargar, limpiar;
  if (_selOcas.size > 0) {
    selSet = _selOcas; endpoint = '/api/ocasionales/anular-batch';
    alertId = 'alertOcas'; recargar = cargarOcasionalesDelPeriodo; limpiar = _limpiarSeleccion;
  } else if (_selFijas.size > 0) {
    selSet = _selFijas; endpoint = '/api/fijas/anular-batch';
    alertId = 'alertFijas'; recargar = cargarFijasDelPeriodo; limpiar = _limpiarSelFijas;
  } else if (_selAusen.size > 0) {
    selSet = _selAusen; endpoint = '/api/ausentismos/anular-batch';
    alertId = 'alertAus'; recargar = cargarAusentismosDelPeriodo; limpiar = _limpiarSelAusen;
  } else if (_selCamb.size > 0) {
    selSet = _selCamb; endpoint = '/api/cambios/anular-batch';
    alertId = 'alertCI'; recargar = cargarCambiosDelPeriodo; limpiar = _limpiarSelCamb;
  } else {
    return;
  }

  const ids = [...selSet];
  if (ids.length === 0) return;

  btnConfirm.disabled = true;
  btnConfirm.textContent = 'Anulando…';

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codNoveds: ids })
    });
    const data = await resp.json();

    if (!resp.ok) {
      alert('Error al anular: ' + (data.error || resp.status) + (data.details ? '\n' + data.details : ''));
      return;
    }

    cerrarModalAnularBatch();
    limpiar();
    await recargar();

    const msg = `✓ ${data.anulados} novedad${data.anulados !== 1 ? 'es anuladas' : ' anulada'} correctamente.`;
    const alertEl = document.getElementById(alertId);
    if (alertEl) {
      alertEl.textContent = msg;
      alertEl.classList.remove('alert-error');
      alertEl.classList.add('alert-success', 'show');
      setTimeout(() => alertEl.classList.remove('show'), 3500);
    }
  } catch (err) {
    alert('Error de red: ' + err.message);
  } finally {
    btnConfirm.disabled = false;
    btnConfirm.textContent = 'Sí, anular todo';
  }
}

// Cerrar modal batch al hacer clic fuera
document.getElementById('modalAnularBatch').addEventListener('click', function(e) {
  if (e.target === this) cerrarModalAnularBatch();
});
// Cerrar con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const m = document.getElementById('modalAnularBatch');
    if (m && m.classList.contains('open')) cerrarModalAnularBatch();
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PANELES SPLIT IMPORT — Excel y PDF por separado
// ══════════════════════════════════════════════════════════════════════════════

function _resetPanelExcel() {
  _importFiles = [];
  const icon = document.getElementById('uploadIconExcel');
  const lbl  = document.getElementById('uploadLabelExcel');
  const sub  = document.getElementById('uploadSubExcel');
  const lst  = document.getElementById('importFileListExcel');
  const act  = document.getElementById('importExcelActions');
  if (icon) icon.textContent = '📂';
  if (lbl)  lbl.textContent  = 'Arrastra archivos .xlsx aquí, o haz clic';
  if (sub)  sub.textContent  = 'Máx 50 MB · múltiples archivos';
  if (lst)  { lst.innerHTML = ''; lst.style.display = 'none'; }
  if (act)  act.style.display = 'none';
  const adecco = document.getElementById('adeccoModoPanel');
  if (adecco) adecco.style.display = 'none';
}

function _resetPanelPDF() {
  _importFilesPDF = [];
  const icon = document.getElementById('uploadIconPDF');
  const lbl  = document.getElementById('uploadLabelPDF');
  const sub  = document.getElementById('uploadSubPDF');
  const lst  = document.getElementById('importFileListPDF');
  const act  = document.getElementById('importPDFActions');
  if (icon) icon.textContent = '📑';
  if (lbl)  lbl.textContent  = 'Arrastra archivos .pdf aquí, o haz clic';
  if (sub)  sub.textContent  = 'OCR automático · Máx 50 MB · múltiples PDFs';
  if (lst)  { lst.innerHTML = ''; lst.style.display = 'none'; }
  if (act)  act.style.display = 'none';
}

function _renderListaExcel() {
  const lst = document.getElementById('importFileListExcel');
  const act = document.getElementById('importExcelActions');
  if (!lst) return;
  if (_importFiles.length === 0) { _resetPanelExcel(); return; }
  lst.style.display = 'block';
  lst.innerHTML = _importFiles.map((f, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="font-size:18px;">${iconoPorArchivo(f.name)}</span>
      <div style="flex:1;min-width:0;font-size:12px;">
        <div style="font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.name}</div>
        <div style="color:var(--muted);font-size:11px;">${formatoLegible(f.size)}${esArchivoAdecco(f.name) ? ' · <span style="color:var(--cm-blue-light)">ADECCO</span>' : ''}</div>
      </div>
      <button onclick="_quitarExcel(${i})" style="background:transparent;border:none;color:var(--muted);font-size:14px;cursor:pointer;padding:2px 6px;"
              onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--muted)'">✕</button>
    </div>
  `).join('');
  // Mostrar panel ADECCO si hay archivos ADECCO
  const adecco = document.getElementById('adeccoModoPanel');
  if (adecco) adecco.style.display = _importFiles.some(f => esArchivoAdecco(f.name)) ? 'block' : 'none';
  if (act) act.style.display = 'flex';
}

function _renderListaPDF() {
  const lst = document.getElementById('importFileListPDF');
  const act = document.getElementById('importPDFActions');
  if (!lst) return;
  if (_importFilesPDF.length === 0) { _resetPanelPDF(); return; }
  lst.style.display = 'block';
  lst.innerHTML = _importFilesPDF.map((f, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="font-size:18px;">📄</span>
      <div style="flex:1;min-width:0;font-size:12px;">
        <div style="font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.name}</div>
        <div style="color:var(--muted);font-size:11px;">${formatoLegible(f.size)}</div>
      </div>
      <button onclick="_quitarPDF(${i})" style="background:transparent;border:none;color:var(--muted);font-size:14px;cursor:pointer;padding:2px 6px;"
              onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--muted)'">✕</button>
    </div>
  `).join('');
  if (act) act.style.display = 'flex';
}

function _quitarExcel(idx) { _importFiles.splice(idx, 1); _renderListaExcel(); }
function _quitarPDF(idx)   { _importFilesPDF.splice(idx, 1); _renderListaPDF(); }

function seleccionarArchivoExcel(e) {
  const nuevos = Array.from(e.target.files || []).filter(f => f.name.match(/\.(xlsx?|csv)$/i));
  if (!nuevos.length) return;
  for (const f of nuevos) {
    if (!_importFiles.some(x => x.name === f.name && x.size === f.size)) _importFiles.push(f);
  }
  document.getElementById('uploadIconExcel').textContent  = _importFiles.length > 1 ? '📦' : '✅';
  document.getElementById('uploadLabelExcel').textContent = `${_importFiles.length} archivo${_importFiles.length > 1 ? 's' : ''} listo${_importFiles.length > 1 ? 's' : ''}`;
  document.getElementById('uploadSubExcel').textContent   = 'Haz clic en "Importar Excel" para proceder';
  _renderListaExcel();
  const res = document.getElementById('importResult');
  if (res) res.style.display = 'none';
  e.target.value = '';
}

function seleccionarArchivoPDF(e) {
  const nuevos = Array.from(e.target.files || []).filter(f => f.name.match(/\.pdf$/i));
  if (!nuevos.length) return;
  for (const f of nuevos) {
    if (!_importFilesPDF.some(x => x.name === f.name && x.size === f.size)) _importFilesPDF.push(f);
  }
  document.getElementById('uploadIconPDF').textContent  = _importFilesPDF.length > 1 ? '📦' : '✅';
  document.getElementById('uploadLabelPDF').textContent = `${_importFilesPDF.length} PDF${_importFilesPDF.length > 1 ? 's' : ''} listo${_importFilesPDF.length > 1 ? 's' : ''}`;
  document.getElementById('uploadSubPDF').textContent   = 'Haz clic en "Importar PDFs" para proceder';
  _renderListaPDF();
  const res = document.getElementById('importResult');
  if (res) res.style.display = 'none';
  e.target.value = '';
}

function cancelarImportExcel() { _resetPanelExcel(); }
function cancelarImportPDF()   { _resetPanelPDF(); }

function onDropExcel(e) {
  e.preventDefault();
  const f = { target: { files: e.dataTransfer.files, value: '' } };
  seleccionarArchivoExcel(f);
}
function onDropPDF(e) {
  e.preventDefault();
  const f = { target: { files: e.dataTransfer.files, value: '' } };
  seleccionarArchivoPDF(f);
}

async function ejecutarImportExcel() {
  if (!_importFiles.length) { alert('Selecciona al menos un archivo Excel.'); return; }
  await ejecutarImportMasiva();
  _resetPanelExcel();
}

async function ejecutarImportPDF() {
  if (!_importFilesPDF.length) { alert('Selecciona al menos un PDF.'); return; }
  await previzualizarPDFs();
  _resetPanelPDF();
}

// ══════════════════════════════════════════════════════════════════════════════
// GRÁFICOS — Analytics dashboard (Chart.js)
// ══════════════════════════════════════════════════════════════════════════════

// Paletas de colores (dark-theme aware)
const _GRF_COLORS = {
  azul:    'rgba(32,167,201,',
  verde:   'rgba(76,175,130,',
  rojo:    'rgba(224,85,85,',
  morado:  'rgba(124,92,191,',
  amarillo:'rgba(240,165,0,',
  cyan:    'rgba(0,229,255,',
  naranja: 'rgba(255,145,0,',
  rosa:    'rgba(236,72,153,',
  lima:    'rgba(132,204,22,',
  gris:    'rgba(148,163,184,'
};
const _GRF_PAL = Object.values(_GRF_COLORS);

function _grfColor(i, alpha = 0.8) {
  const c = _GRF_PAL[i % _GRF_PAL.length];
  return c + alpha + ')';
}

// Registro de instancias de Chart para poder destruirlas al recargar
const _grfCharts = {};

function _grfDestroy(id) {
  if (_grfCharts[id]) { _grfCharts[id].destroy(); delete _grfCharts[id]; }
}

function _fmtMoney(v) {
  if (!v && v !== 0) return '—';
  const n = Number(v);
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'k';
  return '$' + n.toLocaleString('es-CO');
}

let _grfIniciado = false;

async function graficosInit() {
  if (!_grfIniciado) {
    // Cargar períodos para el selector
    try {
      const r = await fetch('/api/graficos/periodos');
      if (r.ok) {
        const periodos = await r.json();
        const sel = document.getElementById('grf_periodo');
        periodos.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.COD_PERIOD;
          opt.textContent = p.etiqueta + (p.PER_EST === 'A' ? ' ●' : '');
          sel.appendChild(opt);
        });
        // Pre-seleccionar el período activo
        const activo = periodos.find(p => p.PER_EST === 'A');
        if (activo) sel.value = activo.COD_PERIOD;
      }
    } catch(_) {}
    _grfIniciado = true;
  }
  graficosCargar();
}

async function graficosCargar() {
  const sel       = document.getElementById('grf_periodo');
  const codPeriod = sel ? sel.value : '';
  const loading   = document.getElementById('grf_loading');
  if (loading) loading.style.display = 'inline';

  const qp = codPeriod ? `?codPeriod=${codPeriod}` : '';

  try {
    const [resumen, historico, ausencias, centros] = await Promise.all([
      fetch('/api/graficos/resumen' + qp).then(r => r.json()),
      fetch('/api/graficos/historico').then(r => r.json()),
      fetch('/api/graficos/ausentismos').then(r => r.json()),
      fetch('/api/graficos/centros' + qp).then(r => r.json())
    ]);

    _grfRenderKPIs(resumen);
    _grfRenderDonutTipo(resumen.distribucion || []);
    _grfRenderTopPeriodo(resumen.topAusentes || []);
    _grfRenderFinanzas(historico.financiero || []);
    _grfRenderLineAusencias(historico.ausentismos || []);
    _grfRenderTiposAus(ausencias.tipos || []);
    _grfRenderTopHist(ausencias.topEmpleados || []);
    _grfRenderCentros(centros.centros || []);

    // Etiqueta del período seleccionado
    const lblEl = document.getElementById('grf_periodo_label');
    if (lblEl && sel && sel.selectedOptions[0]) {
      lblEl.textContent = sel.selectedOptions[0].textContent;
    }
  } catch (err) {
    console.error('[graficos] error cargando datos:', err);
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// ── KPI cards ──────────────────────────────────────────────────────────────
function _grfRenderKPIs(data) {
  const k = data.kpis || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('grf_kpi_empleados',   k.empleados_con_novedades ?? '—');
  set('grf_kpi_novedades',   k.total_novedades ?? '—');
  set('grf_kpi_devengos',    _fmtMoney(k.devengos));
  set('grf_kpi_deducciones', _fmtMoney(k.deducciones));
  set('grf_kpi_ausencias',   k.total_ausencias ?? '—');
  const diasEl = document.getElementById('grf_kpi_dias');
  if (diasEl) diasEl.textContent = (k.dias_ausencia ?? '—') + ' días de ausencia';
}

// ── Donut distribución por tipo ────────────────────────────────────────────
function _grfRenderDonutTipo(dist) {
  _grfDestroy('donutTipo');
  const ctx = document.getElementById('grf_donut_tipo');
  if (!ctx || !dist.length) return;
  const labels = dist.map(d => d.tipo);
  const vals   = dist.map(d => d.total);
  _grfCharts['donutTipo'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: vals, backgroundColor: labels.map((_,i) => _grfColor(i, 0.85)),
                   borderWidth: 2, borderColor: '#1a1f2e' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#a0aec0', font: { size: 11 }, padding: 10 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} novedades` } }
      }
    }
  });
}

// ── Bar horizontal: top ausentes del período ───────────────────────────────
function _grfRenderTopPeriodo(top) {
  _grfDestroy('topPeriodo');
  const ctx = document.getElementById('grf_bar_top_periodo');
  if (!ctx) return;
  if (!top.length) {
    ctx.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:13px;">Sin ausentismos en este período</div>';
    return;
  }
  const labels = top.map(t => t.nombre ? t.nombre.split(' ').slice(0,2).join(' ') : t.cedula);
  const dias   = top.map(t => t.dias || 0);
  _grfCharts['topPeriodo'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Días de ausencia', data: dias,
                   backgroundColor: _grfColor(0, 0.75), borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0' } },
        y: { grid: { display: false }, ticks: { color: '#a0aec0', font: { size: 11 } } }
      }
    }
  });
}

// ── Bar doble: Devengos vs Deducciones por período ────────────────────────
function _grfRenderFinanzas(fin) {
  _grfDestroy('barFinanzas');
  const ctx = document.getElementById('grf_bar_finanzas');
  if (!ctx || !fin.length) return;
  const labels = fin.map(f => f.label);
  _grfCharts['barFinanzas'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Devengos', data: fin.map(f => f.devengos || 0),
          backgroundColor: _grfColor(1, 0.75), borderRadius: 3 },
        { label: 'Deducciones', data: fin.map(f => f.deducciones || 0),
          backgroundColor: _grfColor(2, 0.75), borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#a0aec0', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: $${Number(ctx.parsed.y).toLocaleString('es-CO', {minimumFractionDigits: 0})}`
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0', callback: v => _fmtMoney(v) } }
      }
    }
  });
}

// ── Line: días de ausentismo por período ──────────────────────────────────
function _grfRenderLineAusencias(aus) {
  _grfDestroy('lineAusencias');
  const ctx = document.getElementById('grf_line_ausencias');
  if (!ctx || !aus.length) return;
  const labels = aus.map(a => a.label);
  _grfCharts['lineAusencias'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Días de ausencia', data: aus.map(a => a.dias_total || 0),
          borderColor: _grfColor(4, 1), backgroundColor: _grfColor(4, 0.15),
          tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: _grfColor(4, 1) },
        { label: 'Casos', data: aus.map(a => a.ausencias || 0),
          borderColor: _grfColor(0, 1), backgroundColor: 'transparent',
          tension: 0.4, pointRadius: 4, pointBackgroundColor: _grfColor(0, 1),
          yAxisID: 'y2' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#a0aec0', font: { size: 11 } } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0', font: { size: 11 } } },
        y:  { position: 'left',  grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0' } },
        y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#a0aec0' } }
      }
    }
  });
}

// ── Bar horizontal: tipos de ausentismo ──────────────────────────────────
function _grfRenderTiposAus(tipos) {
  _grfDestroy('tiposAus');
  const ctx = document.getElementById('grf_bar_tipos_aus');
  if (!ctx || !tipos.length) return;
  const labels = tipos.map(t => t.tipo);
  _grfCharts['tiposAus'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Días totales', data: tipos.map(t => t.dias_total || 0),
          backgroundColor: tipos.map((_,i) => _grfColor(i, 0.8)), borderRadius: 4 }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0' } },
        y: { grid: { display: false }, ticks: { color: '#a0aec0', font: { size: 11 } } }
      }
    }
  });
}

// ── Bar horizontal: top 10 histórico ────────────────────────────────────
function _grfRenderTopHist(top) {
  _grfDestroy('topHist');
  const ctx = document.getElementById('grf_bar_top_hist');
  if (!ctx || !top.length) return;
  const labels = top.map(t => t.nombre ? t.nombre.split(' ').slice(0,2).join(' ') : t.cedula);
  _grfCharts['topHist'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Días totales', data: top.map(t => t.dias_total || 0),
          backgroundColor: _grfColor(3, 0.78), borderRadius: 4 },
        { label: 'Casos', data: top.map(t => t.ausencias || 0),
          backgroundColor: _grfColor(2, 0.6), borderRadius: 4, yAxisID: 'y2' }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#a0aec0', font: { size: 11 } } } },
      scales: {
        x:  { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0' } },
        y:  { grid: { display: false }, ticks: { color: '#a0aec0', font: { size: 11 } } },
        y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#a0aec0' } }
      }
    }
  });
}

// ── Bar doble: centros de costo ───────────────────────────────────────────
function _grfRenderCentros(centros) {
  _grfDestroy('barCentros'); _grfDestroy('barAusCentros');
  const ctxN = document.getElementById('grf_bar_centros');
  const ctxA = document.getElementById('grf_bar_aus_centros');
  if (!ctxN || !centros.length) return;

  const labels = centros.map(c => c.codigo || c.nombre.substring(0, 12));

  // Novedades por CC
  _grfCharts['barCentros'] = new Chart(ctxN, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Novedades', data: centros.map(c => c.novedades || 0),
          backgroundColor: _grfColor(0, 0.75), borderRadius: 4 },
        { label: 'Empleados', data: centros.map(c => c.empleados || 0),
          backgroundColor: _grfColor(1, 0.65), borderRadius: 4, yAxisID: 'y2' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#a0aec0', font: { size: 11 } } } },
      scales: {
        x:  { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0', font: { size: 11 } } },
        y:  { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0' } },
        y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#a0aec0' } }
      }
    }
  });

  if (!ctxA) return;
  // Ausentismos por CC
  _grfCharts['barAusCentros'] = new Chart(ctxA, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Días ausencia', data: centros.map(c => c.dias_ausencia || 0),
          backgroundColor: _grfColor(2, 0.75), borderRadius: 4 },
        { label: 'Casos', data: centros.map(c => c.ausencias || 0),
          backgroundColor: _grfColor(4, 0.65), borderRadius: 4, yAxisID: 'y2' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#a0aec0', font: { size: 11 } } } },
      scales: {
        x:  { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0', font: { size: 11 } } },
        y:  { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a0aec0' } },
        y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#a0aec0' } }
      }
    }
  });
}
