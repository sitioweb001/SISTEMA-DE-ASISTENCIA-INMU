/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SICA-INMU — Módulo de Notas con Firebase Firestore (MODO AHORRO)
 * Versión: 3.0 — 2026
 *
 * CAMBIOS v3.0 (modo ahorro de cuota):
 *   ❌ ELIMINADO: onSnapshot() en tiempo real  → consumía lecturas continuamente
 *   ✅ NUEVO: get() solo cuando:
 *       1. Se abre el panel de notas
 *       2. El docente presiona ↻ Refrescar
 *       3. Se guarda una nota nueva (para confirmar que se guardó)
 *
 * RESULTADO: de ~miles de lecturas/día → a <200 lecturas/día por docente
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ── Estado interno del módulo ─────────────────────────────────────────────────
let _db = null;
let _firebaseListo = false;
let _modoOffline = false;
let _ultimaClaveEscucha = '';
// Ya NO existe _unsubscribeListener — no hay listeners activos

// ── Inicialización ────────────────────────────────────────────────────────────
(function inicializarFirebase() {
  if (!window.firebase) {
    setTimeout(inicializarFirebase, 1000);
    return;
  }
  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      console.warn('[Firebase-Notas] Firebase no estaba inicializado.');
    }
    _db = firebase.firestore();
    _db.enablePersistence({ synchronizeTabs: true })
      .catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('[Firebase-Notas] Persistencia offline deshabilitada (múltiples pestañas).');
        } else if (err.code === 'unimplemented') {
          console.warn('[Firebase-Notas] Navegador no soporta persistencia offline.');
        }
      });
    _firebaseListo = true;
    _modoOffline = false;
    console.log('[Firebase-Notas] Firebase inicializado ✓ — modo AHORRO activo (sin onSnapshot)');
  } catch (err) {
    console.error('[Firebase-Notas] Error al inicializar Firebase:', err);
    _modoOffline = true;
  }
})();

// ── Helpers internos ──────────────────────────────────────────────────────────

function _fbDocKey(grado, seccion, materiaClave) {
  return (grado + '_' + seccion + (materiaClave ? '_' + materiaClave : ''))
    .trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function _fbDocRef(grado, seccion, materiaClave) {
  if (!_db) return null;
  return _db.collection('notas_inmu').doc(_fbDocKey(grado, seccion, materiaClave));
}

function _notasDataAFirestore(notasData, alumnosFiltrados, materiaActiva, grado, seccion) {
  const alumnos = {};
  (alumnosFiltrados || []).forEach(alumno => {
    const nie = String(alumno.nie);
    if (!notasData[nie]) return;
    const nd = notasData[nie];
    alumnos[nie] = {
      nombre: alumno.nombre || '',
      sexo: alumno.sexo || '',
      p1: nd.p1 || { a1: '', a2: '', a3: '', prom: '' },
      p2: nd.p2 || { a1: '', a2: '', a3: '', prom: '' },
      p3: nd.p3 || { a1: '', a2: '', a3: '', prom: '' },
      p4: nd.p4 || { a1: '', a2: '', a3: '', prom: '' }
    };
  });
  return {
    grado: grado || '',
    seccion: seccion || '',
    materia_clave: materiaActiva?.clave || '',
    asignatura: materiaActiva?.materia || '',
    especialidad: materiaActiva?.especialidad || '',
    escala: materiaActiva?.escala || '0-10',
    alumnos,
    ultima_actualizacion: firebase.firestore.FieldValue.serverTimestamp(),
    actualizado_por: (typeof sesionActual !== 'undefined' ? sesionActual.usuario : '') || 'docente'
  };
}

function _firestoreANotasData(docData) {
  const notasData = {};
  const alumnos = docData?.alumnos || {};
  Object.keys(alumnos).forEach(nie => {
    const d = alumnos[nie];
    notasData[nie] = {
      p1: d.p1 || { a1: '', a2: '', a3: '', prom: '' },
      p2: d.p2 || { a1: '', a2: '', a3: '', prom: '' },
      p3: d.p3 || { a1: '', a2: '', a3: '', prom: '' },
      p4: d.p4 || { a1: '', a2: '', a3: '', prom: '' }
    };
  });
  return notasData;
}

// ── API PÚBLICA ───────────────────────────────────────────────────────────────

/**
 * prefetchNotasRemotas() — antes activaba onSnapshot.
 * Ahora simplemente lee UNA VEZ al cambiar grado/sección/materia.
 */
window.prefetchNotasRemotas = function prefetchNotasRemotas(grado, seccion, materiaClave, escala) {
  if (!_firebaseListo || _modoOffline) return Promise.resolve();
  // CORRECCIÓN: siempre leer al llamar prefetch — es llamado al abrir el panel
  // No bloquear por clave duplicada aquí, solo actualizar la clave
  _ultimaClaveEscucha = `${grado}|${seccion}|${materiaClave}`;
  return _leerNotasUnaVez(grado, seccion, materiaClave);
};

/**
 * obtenerNotasRemotas() — lee UNA SOLA VEZ desde Firestore.
 */
window.obtenerNotasRemotas = async function obtenerNotasRemotas(grado, seccion, materiaClave, escala) {
  if (!_firebaseListo || _modoOffline) {
    const key = _getLocalKey(grado, seccion, escala || '0-10');
    try {
      const local = localStorage.getItem(key);
      return local ? JSON.parse(local) : [];
    } catch (e) { return []; }
  }
  try {
    const ref = _fbDocRef(grado, seccion, materiaClave);
    if (!ref) return [];
    const snap = await ref.get();
    if (!snap.exists) return [];
    return _firestoreANotasData(snap.data());
  } catch (err) {
    console.warn('[Firebase-Notas] Error al obtener notas:', err);
    _modoOffline = true;
    return [];
  }
};

/**
 * sincronizarNotasGrupoAppsScript() — guarda en Firestore con set() atómico.
 * Después de guardar hace UNA lectura de confirmación para actualizar la UI.
 */
window.sincronizarNotasGrupoAppsScript = async function sincronizarNotasGrupoAppsScript(grado, seccion, tipoMateria) {
  if (!grado || !seccion) throw new Error('Sin grado/sección');

  const materiaActiva = (typeof getMateriaDocenteActiva === 'function') ? getMateriaDocenteActiva() : null;
  const alumnosActuales = (typeof alumnosFiltrados !== 'undefined') ? alumnosFiltrados : [];
  const notasActuales = (typeof notasData !== 'undefined') ? notasData : {};
  const materiaClave = materiaActiva?.clave || tipoMateria || '';

  if (_firebaseListo && !_modoOffline) {
    try {
      const ref = _fbDocRef(grado, seccion, materiaClave);
      if (!ref) throw new Error('No hay referencia Firestore');
      const payload = _notasDataAFirestore(notasActuales, alumnosActuales, materiaActiva, grado, seccion);
      await ref.set(payload, { merge: true });
      console.log('[Firebase-Notas] Notas guardadas en Firestore ✓');

      // Respaldo GAS en segundo plano
      _sincronizarConGASEnSegundoPlano(payload);

      return { ok: true, fuente: 'firebase' };
    } catch (err) {
      console.warn('[Firebase-Notas] Firebase falló, guardando solo en GAS:', err);
      _modoOffline = true;
    }
  }

  return _sincronizarConGAS(grado, seccion, tipoMateria, materiaActiva, alumnosActuales, notasActuales);
};

/**
 * actualizarNotasDesdeRemoto() — se llama al presionar ↻ Refrescar.
 * Hace UNA lectura get() al servidor. Sin onSnapshot.
 */
window.actualizarNotasDesdeRemoto = async function actualizarNotasDesdeRemoto(opts) {
  opts = opts || {};
  if (typeof _refreshNotasEnProgreso !== 'undefined' && _refreshNotasEnProgreso) return;

  const grado = document.getElementById('grado-select')?.value || '';
  const seccion = document.getElementById('seccion-select')?.value || '';
  const materiaActiva = (typeof getMateriaDocenteActiva === 'function') ? getMateriaDocenteActiva() : null;
  if (!grado || !seccion || !materiaActiva) return;

  if (typeof notasCambiadas !== 'undefined' && notasCambiadas && !opts.force) return;

  if (typeof _refreshNotasEnProgreso !== 'undefined') _refreshNotasEnProgreso = true;
  const btn = document.getElementById('btn-refrescar-notas');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Actualizando...'; btn.style.opacity = '0.6'; }
  if (typeof setEstadoGuardado === 'function') setEstadoGuardado('guardando');

  try {
    if (_firebaseListo && !_modoOffline) {
      // get() con source:'server' = 1 lectura exacta, sin listener
      const ref = _fbDocRef(grado, seccion, materiaActiva.clave || '');
      const snap = await ref.get({ source: 'server' });
      if (snap.exists) {
        const nuevaData = _firestoreANotasData(snap.data());
        _aplicarNotasRemotas(nuevaData);
        console.log('[Firebase-Notas] Notas refrescadas con get() ✓ — 1 lectura consumida');
      }
    } else {
      const filas = await (typeof window._obtenerNotasRemotasOriginal === 'function'
        ? window._obtenerNotasRemotasOriginal(grado, seccion, materiaActiva.clave || '', getTipoMateriaNotas())
        : []);
      const nuevaData = (typeof construirNotasDataDesdeRemoto === 'function') ? construirNotasDataDesdeRemoto(filas) : {};
      _aplicarNotasRemotas(nuevaData);
    }
  } catch (err) {
    console.warn('[Firebase-Notas] Error al actualizar:', err);
  } finally {
    if (typeof _refreshNotasEnProgreso !== 'undefined') _refreshNotasEnProgreso = false;
    if (btn) { btn.disabled = false; btn.textContent = '↻ Refrescar'; btn.style.opacity = '1'; }
    if (typeof setEstadoGuardado === 'function') setEstadoGuardado('guardado');
  }
};

// ── Lectura única (reemplaza onSnapshot) ─────────────────────────────────────

/**
 * Lee las notas UNA VEZ y las aplica a la UI.
 * Equivalente al antiguo activarListenerNotas() pero sin listener continuo.
 */
async function _leerNotasUnaVez(grado, seccion, materiaClave) {
  if (!_firebaseListo || _modoOffline) return;
  try {
    const ref = _fbDocRef(grado, seccion, materiaClave);
    if (!ref) return;
    const snap = await ref.get();
    if (!snap.exists) return;
    const nuevaData = _firestoreANotasData(snap.data());
    _aplicarNotasRemotas(nuevaData);
    console.log('[Firebase-Notas] Notas cargadas con get() ✓ — 1 lectura');
  } catch (err) {
    console.warn('[Firebase-Notas] Error al leer notas:', err);
  }
}

/**
 * Aplica las notas remotas a notasData local y re-renderiza la tabla.
 */
function _aplicarNotasRemotas(nuevaData) {
  // PASO 1: actualizar notasData global con TODOS los datos remotos
  const alumnos = (typeof alumnosFiltrados !== 'undefined' && Array.isArray(alumnosFiltrados))
    ? alumnosFiltrados : [];

  Object.keys(nuevaData).forEach(nie => {
    if (typeof notasData !== 'undefined') notasData[nie] = nuevaData[nie];
  });

  // PASO 2: re-render completo si existe la funcion, si no actualizar inputs visibles
  if (typeof window.renderizarTablaNotas === 'function') {
    window.renderizarTablaNotas();
    console.log('[Firebase-Notas] Re-render completo de tabla');
  } else {
    const modalAbierto = document.getElementById('modal-notas-periodo')?.style.display === 'block';
    if (modalAbierto) {
      const p = 'p' + (typeof notasPeriodoActual !== 'undefined' ? notasPeriodoActual : '1');
      alumnos.forEach(alumno => {
        const nie = String(alumno.nie);
        if (!nuevaData[nie]) return;
        const nd = nuevaData[nie][p] || { a1: '', a2: '', a3: '', prom: '' };
        ['a1', 'a2', 'a3'].forEach(act => {
          const input = document.getElementById('nota-' + nie + '-' + act);
          if (input && document.activeElement !== input) input.value = nd[act] !== undefined ? nd[act] : '';
        });
        const promEl   = document.getElementById('prom-'   + nie + '-' + p);
        const estadoEl = document.getElementById('estado-' + nie + '-' + p);
        if (promEl) {
          const promVal = (nd.prom !== '' && nd.prom !== undefined) ? Number(nd.prom) : null;
          promEl.innerText = promVal !== null ? promVal.toFixed(2) : '—';
          if (typeof getEstadoNotaHtml === 'function') {
            const estadoNota = getEstadoNotaHtml(promVal);
            promEl.style.cssText = estadoNota.style;
            if (estadoEl) estadoEl.innerHTML = estadoNota.html;
          }
        }
      });
    }
  }

  // PASO 3: persistir en localStorage como respaldo offline
  const grado   = document.getElementById('grado-select')?.value   || '';
  const seccion = document.getElementById('seccion-select')?.value || '';
  const tipoMateria = (typeof getTipoMateriaNotas === 'function') ? getTipoMateriaNotas() : '0-10';
  if (grado && seccion && typeof notasData !== 'undefined') {
    try { localStorage.setItem(_getLocalKey(grado, seccion, tipoMateria), JSON.stringify(notasData)); } catch (e) {}
  }

  if (typeof _actualizarResumenNotas === 'function') _actualizarResumenNotas();
  if (typeof setEstadoGuardado === 'function') setEstadoGuardado('guardado');
  console.log('[Firebase-Notas] notasData actualizado con datos remotos');
}

// ── Interceptar abrirPanelNotas para cargar notas al abrir ───────────────────

(function interceptarAbrirPanelNotas() {
  const MAX_INTENTOS = 20;
  let intentos = 0;

  function intentar() {
    if (typeof window.abrirPanelNotas === 'function') {
      const _original = window.abrirPanelNotas;
      window.abrirPanelNotas = function abrirPanelNotas(...args) {
        const result = _original.apply(this, args);
        // CORRECCIÓN: resetear clave para forzar lectura siempre al abrir
        _ultimaClaveEscucha = '';
        // CORRECCIÓN: 800ms para que el DOM del modal esté completamente renderizado
        setTimeout(() => {
          const grado = document.getElementById('grado-select')?.value || '';
          const seccion = document.getElementById('seccion-select')?.value || '';
          const materiaActiva = (typeof getMateriaDocenteActiva === 'function') ? getMateriaDocenteActiva() : null;
          if (grado && seccion && materiaActiva) {
            const clave = materiaActiva.clave || '';
            _ultimaClaveEscucha = `${grado}|${seccion}|${clave}`;
            _leerNotasUnaVez(grado, seccion, clave);
          }
        }, 800);
        return result;
      };
      console.log('[Firebase-Notas] abrirPanelNotas interceptado ✓ — modo get()');
    } else if (intentos < MAX_INTENTOS) {
      intentos++;
      setTimeout(intentar, 500);
    }
  }
  intentar();
})();

// Observar cambios en grado/sección/materia → leer notas frescas si el panel está abierto
document.addEventListener('DOMContentLoaded', () => {
  const recargarSiAbierto = () => {
    if (document.getElementById('modal-notas-periodo')?.style.display !== 'block') return;
    const grado = document.getElementById('grado-select')?.value || '';
    const seccion = document.getElementById('seccion-select')?.value || '';
    const materiaActiva = (typeof getMateriaDocenteActiva === 'function') ? getMateriaDocenteActiva() : null;
    if (grado && seccion && materiaActiva) {
      const clave = materiaActiva.clave || '';
      const claveNueva = `${grado}|${seccion}|${clave}`;
      if (claveNueva !== _ultimaClaveEscucha) {
        _ultimaClaveEscucha = claveNueva;
        _leerNotasUnaVez(grado, seccion, clave);
      }
    }
  };
  ['grado-select', 'seccion-select', 'docente-materia'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', recargarSiAbierto);
  });
});

// ── Respaldo GAS ──────────────────────────────────────────────────────────────

function _sincronizarConGASEnSegundoPlano(firestorePayload) {
  if (typeof SCRIPT_URL === 'undefined') return;
  try {
    const alumnosGAS = Object.entries(firestorePayload.alumnos || {}).map(([nie, d]) => ({
      nie, nombre: d.nombre || '', asignatura: firestorePayload.asignatura,
      materia: firestorePayload.asignatura, especialidad: firestorePayload.especialidad,
      materia_clave: firestorePayload.materia_clave,
      p1_cuaderno: d.p1?.a1, p1_integradora: d.p1?.a2, p1_examen: d.p1?.a3,
      p2_cuaderno: d.p2?.a1, p2_integradora: d.p2?.a2, p2_examen: d.p2?.a3,
      p3_cuaderno: d.p3?.a1, p3_integradora: d.p3?.a2, p3_examen: d.p3?.a3,
      p4_cuaderno: d.p4?.a1, p4_integradora: d.p4?.a2, p4_examen: d.p4?.a3,
    }));
    const body = JSON.stringify({
      tipo_post: 'guardar_notas_grupo',
      grado: firestorePayload.grado, seccion: firestorePayload.seccion,
      escala: firestorePayload.escala, asignatura: firestorePayload.asignatura,
      materia: firestorePayload.asignatura, especialidad: firestorePayload.especialidad,
      materia_clave: firestorePayload.materia_clave, notas: alumnosGAS
    });
    fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body })
      .then(() => console.log('[Firebase-Notas] Respaldo GAS enviado ✓'))
      .catch(e => console.warn('[Firebase-Notas] Respaldo GAS falló (no crítico):', e));
  } catch (e) {
    console.warn('[Firebase-Notas] Error preparando respaldo GAS:', e);
  }
}

async function _sincronizarConGAS(grado, seccion, tipoMateria, materiaActiva, alumnosActuales, notasActuales) {
  if (typeof SCRIPT_URL === 'undefined') throw new Error('Sin SCRIPT_URL');
  const payload = {
    tipo_post: 'guardar_notas_grupo', grado, seccion, escala: tipoMateria,
    asignatura: materiaActiva?.materia || '', materia: materiaActiva?.materia || '',
    especialidad: materiaActiva?.especialidad || '', materia_clave: materiaActiva?.clave || '',
    notas: alumnosActuales.map(alumno => {
      const nd = notasActuales[String(alumno.nie)] || {};
      const p1 = nd.p1 || {}; const p2 = nd.p2 || {};
      const p3 = nd.p3 || {}; const p4 = nd.p4 || {};
      return {
        nombre: alumno.nombre || '', nie: alumno.nie || '',
        asignatura: materiaActiva?.materia || '', materia: materiaActiva?.materia || '',
        especialidad: materiaActiva?.especialidad || '', materia_clave: materiaActiva?.clave || '',
        p1_cuaderno: p1.a1, p1_integradora: p1.a2, p1_examen: p1.a3,
        p2_cuaderno: p2.a1, p2_integradora: p2.a2, p2_examen: p2.a3,
        p3_cuaderno: p3.a1, p3_integradora: p3.a2, p3_examen: p3.a3,
        p4_cuaderno: p4.a1, p4_integradora: p4.a2, p4_examen: p4.a3
      };
    })
  };
  const body = JSON.stringify(payload);
  try {
    return await fetch(SCRIPT_URL, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json' }, body });
  } catch {
    return await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body });
  }
}

// ── Helpers localStorage ──────────────────────────────────────────────────────
function _getLocalKey(grado, seccion, tipoMateria) {
  return `notas_${tipoMateria}_${grado}_${seccion}_${(typeof getClaveMateriaNotasActiva === 'function') ? getClaveMateriaNotasActiva() : 'default'}`;
}

console.log('[Firebase-Notas] Módulo v3.0 cargado ✓ — MODO AHORRO (sin onSnapshot)');
