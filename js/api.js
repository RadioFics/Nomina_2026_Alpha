// API Base URL - Dinámico para funcionar desde cualquier máquina
// Usa window.location.origin para apuntar automáticamente al servidor desde donde se cargó la página
const API_BASE = `${window.location.origin}/api`;

// ===== OCASIONALES =====

async function crearOcasional() {
  try {
    const periodo = document.getElementById('cfgPeriodo').value;
    const data = {
      cedula: document.getElementById('oc_id').value,
      nombre: document.getElementById('oc_nombre').value,
      novedad: document.getElementById('oc_novedad').value,
      tipo: document.getElementById('oc_tipo').value,
      cantidad: document.getElementById('oc_cantidad').value,
      valor: document.getElementById('oc_valor').value,
      observaciones: document.getElementById('oc_obs').value,
      periodo: periodo || 'Sin período'
    };

    if (!data.cedula || !data.nombre) {
      alert('Cédula y nombre son requeridos');
      return;
    }

    const response = await fetch(`${API_BASE}/nomina/ocasionales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.success) {
      mostrarAlerta('alertOcas');
      limpiarFormularioOcasionales();
      cargarOcasionales();
    } else {
      alert('Error: ' + result.error);
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Error al registrar ocasional: ' + err.message);
  }
}

async function cargarOcasionales() {
  try {
    const periodo = document.getElementById('cfgPeriodo').value;
    const url = periodo
      ? `${API_BASE}/nomina/ocasionales?periodo=${encodeURIComponent(periodo)}`
      : `${API_BASE}/nomina/ocasionales`;

    const response = await fetch(url);
    const ocasionales = await response.json();

    const tbody = document.getElementById('tbOcas');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (ocasionales.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">Sin registros</td></tr>';
      return;
    }

    ocasionales.forEach(oc => {
      const row = tbody.insertRow();
      row.innerHTML = `
        <td>${oc.cedula}</td>
        <td>${oc.nombre}</td>
        <td>${oc.novedad || ''}</td>
        <td>${oc.tipo || ''}</td>
        <td>${parseFloat(oc.cantidad || 0).toFixed(2)}</td>
        <td>$${parseFloat(oc.valor || 0).toLocaleString('es-CO', {minimumFractionDigits: 2})}</td>
        <td>
          <button onclick="editarOcasional('${oc.id}')" class="btn-mini">✎</button>
          <button onclick="eliminarOcasional('${oc.id}')" class="btn-mini danger">✕</button>
        </td>
      `;
    });

    actualizarContador('badgeOcas', ocasionales.length);
  } catch (err) {
    console.error('Error cargando ocasionales:', err);
  }
}

async function eliminarOcasional(id) {
  if (!confirm('¿Eliminar este registro?')) return;

  try {
    const response = await fetch(`${API_BASE}/nomina/ocasionales/${id}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (result.success) {
      cargarOcasionales();
    } else {
      alert('Error: ' + result.error);
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Error al eliminar: ' + err.message);
  }
}

function limpiarFormularioOcasionales() {
  document.getElementById('oc_id').value = '';
  document.getElementById('oc_nombre').value = '';
  document.getElementById('oc_novedad').value = '';
  document.getElementById('oc_tipo').value = '';
  document.getElementById('oc_cantidad').value = '0';
  document.getElementById('oc_valor').value = '0.00';
  document.getElementById('oc_obs').value = '';
}

// ===== FIJAS =====

async function crearFija() {
  try {
    const periodo = document.getElementById('cfgPeriodo').value;
    const data = {
      cedula: document.getElementById('fj_id').value,
      nombre: document.getElementById('fj_nombre').value,
      novedad: document.getElementById('fj_novedad').value,
      tipo: document.getElementById('fj_tipo').value,
      aplicacion: document.getElementById('fj_aplicacion').value,
      valor: document.getElementById('fj_valor').value,
      finicial: document.getElementById('fj_finicial').value,
      ffinal: document.getElementById('fj_ffinal').value,
      cuotas: document.getElementById('fj_cuotas').value,
      cuenta: document.getElementById('fj_cuenta').value,
      observaciones: document.getElementById('fj_obs').value,
      periodo: periodo || 'Sin período'
    };

    if (!data.cedula || !data.nombre) {
      alert('Cédula y nombre son requeridos');
      return;
    }

    const response = await fetch(`${API_BASE}/nomina/fijas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.success) {
      mostrarAlerta('alertFijas');
      limpiarFormularioFijas();
      cargarFijas();
    } else {
      alert('Error: ' + result.error);
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Error al registrar fija: ' + err.message);
  }
}

async function cargarFijas() {
  try {
    const periodo = document.getElementById('cfgPeriodo').value;
    const url = periodo
      ? `${API_BASE}/nomina/fijas?periodo=${encodeURIComponent(periodo)}`
      : `${API_BASE}/nomina/fijas`;

    const response = await fetch(url);
    const fijas = await response.json();

    const tbody = document.getElementById('tbFijas');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (fijas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px">Sin registros</td></tr>';
      return;
    }

    fijas.forEach(fj => {
      const row = tbody.insertRow();
      row.innerHTML = `
        <td>${fj.cedula}</td>
        <td>${fj.nombre}</td>
        <td>${fj.novedad || ''}</td>
        <td>${fj.tipo || ''}</td>
        <td>$${parseFloat(fj.valor || 0).toLocaleString('es-CO', {minimumFractionDigits: 2})}</td>
        <td>${fj.finicial ? new Date(fj.finicial).toLocaleDateString('es-CO') : ''}</td>
        <td>${fj.cuotas || 0}</td>
        <td>
          <button onclick="editarFija('${fj.id}')" class="btn-mini">✎</button>
          <button onclick="eliminarFija('${fj.id}')" class="btn-mini danger">✕</button>
        </td>
      `;
    });

    actualizarContador('badgeFijas', fijas.length);
  } catch (err) {
    console.error('Error cargando fijas:', err);
  }
}

function limpiarFormularioFijas() {
  document.getElementById('fj_id').value = '';
  document.getElementById('fj_nombre').value = '';
  document.getElementById('fj_novedad').value = '';
  document.getElementById('fj_tipo').value = '';
  document.getElementById('fj_aplicacion').value = '';
  document.getElementById('fj_valor').value = '0.00';
  document.getElementById('fj_finicial').value = '';
  document.getElementById('fj_ffinal').value = '';
  document.getElementById('fj_cuotas').value = '0';
  document.getElementById('fj_cuenta').value = '';
  document.getElementById('fj_obs').value = '';
}

// ===== AUSENCIAS =====

async function crearAusencia() {
  try {
    const periodo = document.getElementById('cfgPeriodo').value;
    const data = {
      cedula: document.getElementById('aus_id').value,
      nombre: document.getElementById('aus_nombre').value,
      tipo: document.getElementById('aus_tipo').value,
      diagnostico: document.getElementById('aus_diag').value,
      finicial: document.getElementById('aus_finicial').value,
      ffinal: document.getElementById('aus_ffinal').value,
      dias: document.getElementById('aus_dias').value,
      prorroga: document.getElementById('aus_prorroga').value,
      observaciones: document.getElementById('aus_obs').value,
      periodo: periodo || 'Sin período'
    };

    if (!data.cedula || !data.nombre) {
      alert('Cédula y nombre son requeridos');
      return;
    }

    const response = await fetch(`${API_BASE}/nomina/ausencias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.success) {
      mostrarAlerta('alertAus');
      limpiarFormularioAusencias();
      cargarAusencias();
    } else {
      alert('Error: ' + result.error);
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Error al registrar ausencia: ' + err.message);
  }
}

async function cargarAusencias() {
  try {
    const periodo = document.getElementById('cfgPeriodo').value;
    const url = periodo
      ? `${API_BASE}/nomina/ausencias?periodo=${encodeURIComponent(periodo)}`
      : `${API_BASE}/nomina/ausencias`;

    const response = await fetch(url);
    const ausencias = await response.json();

    const tbody = document.getElementById('tbAus');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (ausencias.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">Sin registros</td></tr>';
      return;
    }

    ausencias.forEach(aus => {
      const row = tbody.insertRow();
      row.innerHTML = `
        <td>${aus.cedula}</td>
        <td>${aus.nombre}</td>
        <td>${aus.tipo || ''}</td>
        <td>${aus.diagnostico || ''}</td>
        <td>${new Date(aus.finicial).toLocaleDateString('es-CO')}</td>
        <td>${new Date(aus.ffinal).toLocaleDateString('es-CO')}</td>
        <td>${aus.dias || 0}</td>
        <td>
          <button onclick="editarAusencia('${aus.id}')" class="btn-mini">✎</button>
          <button onclick="eliminarAusencia('${aus.id}')" class="btn-mini danger">✕</button>
        </td>
      `;
    });

    actualizarContador('badgeAus', ausencias.length);
  } catch (err) {
    console.error('Error cargando ausencias:', err);
  }
}

function limpiarFormularioAusencias() {
  document.getElementById('aus_id').value = '';
  document.getElementById('aus_nombre').value = '';
  document.getElementById('aus_tipo').value = '';
  document.getElementById('aus_diag').value = '';
  document.getElementById('aus_finicial').value = '';
  document.getElementById('aus_ffinal').value = '';
  document.getElementById('aus_dias').value = '';
  document.getElementById('aus_prorroga').value = '';
  document.getElementById('aus_obs').value = '';
}

// ===== UTILIDADES =====

function mostrarAlerta(elementId) {
  const alert = document.getElementById(elementId);
  if (alert) {
    alert.style.display = 'block';
    setTimeout(() => {
      alert.style.display = 'none';
    }, 3000);
  }
}

function actualizarContador(elementId, cantidad) {
  const badge = document.getElementById(elementId);
  if (badge) {
    badge.textContent = cantidad;
  }
}

async function cargarActividad() {
  try {
    const response = await fetch(`${API_BASE}/nomina/actividad`);
    const actividades = await response.json();

    const tbody = document.getElementById('tbActivity');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (actividades.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:32px">Sin registros aún</td></tr>';
      return;
    }

    actividades.forEach(act => {
      const row = tbody.insertRow();
      row.innerHTML = `
        <td>${act.modulo}</td>
        <td>${act.nombre}</td>
        <td>${act.tipo}</td>
        <td>${new Date(act.fechaRegistro).toLocaleDateString('es-CO')} ${new Date(act.fechaRegistro).toLocaleTimeString('es-CO')}</td>
        <td><span style="color: var(--success);">${act.estado}</span></td>
      `;
    });
  } catch (err) {
    console.error('Error cargando actividad:', err);
  }
}

// ===== FUNCIONES WRAPPER (nombres esperados por HTML) =====
// NOTA: guardarOcasional() se define ahora en index_novedades.html y apunta
// a /api/ocasionales (NO_NOVED + NO_OCASI). NO redefinir aquí — hacerlo
// sobrescribe la versión nueva porque este script se carga al final del <body>.
// Si se reactiva la ruta vieja /api/nomina/ocasionales (tabla legacy),
// habrá que renombrar este wrapper para evitar colisión.
// function guardarOcasional() { return crearOcasional(); }

// NOTA: guardarFija() se define en index_novedades.html y apunta a
// /api/fijas (NO_NOVED + NO_FIJAS). NO redefinir aquí — hacerlo sobrescribe
// la versión nueva porque este script se carga al final del <body>.
// function guardarFija() { return crearFija(); }

// NOTA: guardarAusentismo() se define en index_novedades.html y apunta a
// /api/ausentismos (NO_NOVED + NO_AUSEN). NO redefinir aquí — misma razón.
// function guardarAusentismo() { return crearAusencia(); }

function eliminarFija(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  return fetch(`${API_BASE}/nomina/fijas/${id}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(result => {
      if (result.success) {
        cargarFijas();
      } else {
        alert('Error: ' + result.error);
      }
    })
    .catch(err => alert('Error al eliminar: ' + err.message));
}

function eliminarAusencia(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  return fetch(`${API_BASE}/nomina/ausencias/${id}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(result => {
      if (result.success) {
        cargarAusencias();
      } else {
        alert('Error: ' + result.error);
      }
    })
    .catch(err => alert('Error al eliminar: ' + err.message));
}

// function editarOcasional(id) {
//   // [DEPRECADO] Stub legacy. La función real está en el <script> inline de
//   // index_novedades.html y abre el modal de edición contra /api/ocasionales.
//   // Se deja comentado para no pisar la implementación nueva (api.js se
//   // carga DESPUÉS del inline y lo sobreescribía).
//   console.log('Editar ocasional:', id);
//   alert('Función de edición próximamente');
// }

function editarFija(id) {
  // Función para futura implementación de edición
  console.log('Editar fija:', id);
  alert('Función de edición próximamente');
}

function editarAusencia(id) {
  // Función para futura implementación de edición
  console.log('Editar ausencia:', id);
  alert('Función de edición próximamente');
}

// Cargar datos al iniciar
document.addEventListener('DOMContentLoaded', () => {
  // Esperar a que el DOM esté completamente listo
  setTimeout(() => {
    cargarOcasionales();
    cargarFijas();
    cargarAusencias();
    cargarActividad();

    // Recargar actividad cada 30 segundos
    setInterval(cargarActividad, 30000);
  }, 500);
});
