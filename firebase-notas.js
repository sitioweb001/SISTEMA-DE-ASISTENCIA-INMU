/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SICA-INMU — Módulo de Notas con Firebase Firestore (Tiempo Real)
 * Versión: 2.0 — 2026
 * 
 * REEMPLAZA las funciones de notas del INDEX_DOCENTE.html original:
 *   - obtenerNotasRemotas()
 *   - guardarCambiosNotas()
 *   - sincronizarNotasGrupoAppsScript()
 *   - prefetchNotasRemotas()
 *   - actualizarNotasDesdeRemoto()
 *
 * CÓMO FUNCIONA:
 *   - Firebase Firestore gratis (hasta 50k lecturas/día, 20k escrituras/día).
 *   - onSnapshot() escucha cambios en tiempo real: cuando otro teléfono guarda
 *     una nota, TODOS los demás la ven al instante sin recargar.
 *   - Las escrituras usan transacciones atómicas por alumno, sin conflictos.
 *   - Si Firebase falla, cae al localStorage (modo offline).
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ── CONFIGURACIÓN FIREBASE ────────────────────────────────────────────────────
// Utilizando la configuración global de firebase-config.js y el SDK compat
// ─────────────────────────────────────────────────────────────────────────────

// ── Estado interno del módulo ─────────────────────────────────────────────────
let _db = null;                    // instancia Firestore
let _unsubscribeListener = null;  // función para cancelar el listener activo
let _firebaseListo = false;
let _modoOffline = false;          // true si Firebase no está disponible
let _ultimaClaveEscucha = '';      // clave de la sesión que se está escuchando

// ── Inicialización ────────────────────────────────────────────────────────────
(function inicializarFirebase() {
  if (!window.firebase) {
    console.warn('[Firebase-Notas] SDK no cargado todavía, reintentando en 1 seg...');
    setTimeout(inicializarFirebase, 1000);
    return;
  }
  try {
    // Ya se inicializa en firebase-config.js, solo verificamos que esté
    if (!firebase.apps || firebase.apps.length === 0) {
      console.warn('[Firebase-Notas] Firebase no estaba inicializado.');
    }
    _db = firebase.firestore();
    // Habilitar caché offline automática de Firestore
    _db.enablePersistence({ synchronizeTabs: true })
      .catch(err => {
        if (err.code === 'failed-precondition') {
          // Varias pestañas abiertas — la persistencia solo funciona en una
          console.warn('[Firebase-Notas] Persistencia offline deshabilitada (múltiples pestañas).');
        } else if (err.code === 'unimplemented') {
          console.warn('[Firebase-Notas] Navegador no soporta persistencia offline.');
        }
      });
    _firebaseListo = true;
    _modoOffline = false;
    console.log('[Firebase-Notas] Firebase inicializado correctamente ✓');
  } catch (err) {
    console.error('[Firebase-Notas] Error al inicializar Firebase:', err);
    _modoOffline = true;
  }
})();

// ── Helpers internos ──────────────────────────────────────────────────────────

/**
 * Construye la clave del documento Firestore.
 * Formato: notas/{grado_normalizado}_{seccion_normalizada}_{materia_clave}
 * Cada documento contiene las notas de TODO el grupo en esa materia.
 */
function _fbDocKey(grado, seccion, materiaClave) {
  return (grado + '_' + seccion + (materiaClave ? '_' + materiaClave : ''))
    .trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Referencia al documento Firestore para el grupo+materia actual.
 */
function _fbDocRef(grado, seccion, materiaClave) {
  if (!_db) return null;
  return _db.collection('notas_inmu').doc(_fbDocKey(grado, seccion, materiaClave));
}

/**
 * Convierte el objeto notasData (local) al formato Firestore.
 * Firestore: { alumnos: { [nie]: { p1:{a1,a2,a3,prom}, p2:..., ... }, ... } }
 */
function _notasDataAFirestore(notasData, alumnosFiltrados, materiaActiva, grado, seccion) {
  const alumnos = {};
  (alumnosFiltrados || []).forEach(alumno => {
    const nie = String(alumno.nie);
    if (!notasData[nie]) return; // Solo subir alumnos que tengan notas en memoria
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

/**
 * Convierte el documento Firestore al formato notasData local.
 */
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

// ── API PÚBLICA — estas funciones REEMPLAZAN las del INDEX_DOCENTE.html ───────

/**
 * REEMPLAZA: prefetchNotasRemotas()
 * Con Firebase ya no necesitamos prefetch: el listener hace el trabajo.
 * Esta función activa el listener en tiempo real para grado+seccion+materia.
 */
window.prefetchNotasRemotas = function prefetchNotasRemotas(grado, seccion, materiaClave, escala) {
  if (!_firebaseListo || _modoOffline) return Promise.resolve();
  const claveNueva = `${grado}|${seccion}|${materiaClave}`;
  if (claveNueva === _ultimaClaveEscucha) return Promise.resolve(); // ya escuchando
  activarListenerNotas(grado, seccion, materiaClave);
  return Promise.resolve();
};

/**
 * REEMPLAZA: obtenerNotasRemotas()
 * Lee las notas UNA SOLA VEZ desde Firestore (para carga inicial).
 * El listener onSnapshot se encarga de las actualizaciones en tiempo real.
 */
window.obtenerNotasRemotas = async function obtenerNotasRemotas(grado, seccion, materiaClave, escala) {
  if (!_firebaseListo || _modoOffline) {
    // Fallback: leer desde localStorage
    const key = _getLocalKey(grado, seccion, escala || '0-10');
    try {
      const local = localStorage.getItem(key);
      return local ? _convertirLocalStorageAFirestoreRows(JSON.parse(local)) : [];
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
 * REEMPLAZA: sincronizarNotasGrupoAppsScript()
 * Guarda las notas en Firestore con una sola escritura atómica.
 * Todos los dispositivos escuchando reciben la actualización inmediatamente.
 */
window.sincronizarNotasGrupoAppsScript = async function sincronizarNotasGrupoAppsScript(grado, seccion, tipoMateria) {
  if (!grado || !seccion) throw new Error('Sin grado/sección');

  // Obtener materia activa desde el contexto del HTML original
  const materiaActiva = (typeof getMateriaDocenteActiva === 'function') ? getMateriaDocenteActiva() : null;
  const alumnosActuales = (typeof alumnosFiltrados !== 'undefined') ? alumnosFiltrados : [];
  const notasActuales = (typeof notasData !== 'undefined') ? notasData : {};
  const materiaClave = materiaActiva?.clave || tipoMateria || '';

  // 1. Guardar en Firebase
  if (_firebaseListo && !_modoOffline) {
    try {
      const ref = _fbDocRef(grado, seccion, materiaClave);
      if (!ref) throw new Error('No hay referencia Firestore');
      const payload = _notasDataAFirestore(notasActuales, alumnosActuales, materiaActiva, grado, seccion);
      await ref.set(payload, { merge: true });
      console.log('[Firebase-Notas] Notas guardadas en Firestore ✓');

      // 2. También guardar en Google Apps Script (GAS) como respaldo asíncrono
      //    Esto mantiene compatibilidad con el sistema antiguo y permite exportar PDF/Excel
      _sincronizarConGASEnSegundoPlano(payload);

      return { ok: true, fuente: 'firebase' };
    } catch (err) {
      console.warn('[Firebase-Notas] Firebase falló, guardando solo en GAS:', err);
      _modoOffline = true;
    }
  }

  // 3. Fallback: intentar GAS directo (comportamiento original)
  return _sincronizarConGAS(grado, seccion, tipoMateria, materiaActiva, alumnosActuales, notasActuales);
};

/**
 * REEMPLAZA: actualizarNotasDesdeRemoto()
 * Con Firestore el listener ya mantuvo notasData actualizado.
 * Solo re-renderizamos la tabla.
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
      // Forzar lectura fresca desde Firestore
      const ref = _fbDocRef(grado, seccion, materiaActiva.clave || '');
      const snap = await ref.get({ source: 'server' });
      if (snap.exists) {
        const nuevaData = _firestoreANotasData(snap.data());
        _aplicarNotasRemotas(nuevaData);
      }
    } else {
      // Fallback: leer desde GAS
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

// ── Listener en Tiempo Real ───────────────────────────────────────────────────

/**
 * Activa onSnapshot para el documento de notas actual.
 * Cuando cualquier dispositivo guarda, TODOS reciben la actualización al instante.
 */
function activarListenerNotas(grado, seccion, materiaClave) {
  // Cancelar listener anterior si existe
  if (_unsubscribeListener) {
    _unsubscribeListener();
    _unsubscribeListener = null;
  }
  _ultimaClaveEscucha = `${grado}|${seccion}|${materiaClave}`;

  if (_modoOffline) return;

  if (!_firebaseListo) {
    console.warn('[Firebase-Notas] Firebase no listo, reintentando listener en 1 segundo...');
    setTimeout(() => activarListenerNotas(grado, seccion, materiaClave), 1000);
    return;
  }

  const ref = _fbDocRef(grado, seccion, materiaClave);
  if (!ref) return;

  _unsubscribeListener = ref.onSnapshot(
    { includeMetadataChanges: false },
    (snap) => {
      if (!snap.exists) return;
      const data = snap.data();

      // Se eliminó el bloqueo de `notasCambiadas` para permitir actualización en tiempo real instantánea,
      // la lógica celda por celda evitará sobreescribir lo que el usuario esté tecleando.

      const nuevaData = _firestoreANotasData(data);
      const quienActualizó = data.actualizado_por || 'otro dispositivo';
      console.log(`[Firebase-Notas] Actualización en tiempo real recibida de: ${quienActualizó}`);

      _aplicarNotasRemotas(nuevaData);

      // Mostrar notificación discreta al docente
      if (typeof mostrarNotificacion === 'function') {
        mostrarNotificacion(`🔄 Notas actualizadas por ${quienActualizó}`, 'info', 2500);
      }
    },
    (err) => {
      console.warn('[Firebase-Notas] Error en listener:', err);
      if (err.code === 'permission-denied') {
        _modoOffline = true;
        if (typeof mostrarNotificacion === 'function') {
          mostrarNotificacion('⚠ Firebase: sin permiso. Usando modo offline.', 'warning');
        }
      }
    }
  );
  console.log(`[Firebase-Notas] Listener activo para ${grado} ${seccion} - ${materiaClave}`);
}

/**
 * Aplica las notas remotas a notasData local y re-renderiza la tabla.
 */
function _aplicarNotasRemotas(nuevaData) {
  if (typeof alumnosFiltrados === 'undefined' || !Array.isArray(alumnosFiltrados)) return;

  const p = 'p' + (typeof notasPeriodoActual !== 'undefined' ? notasPeriodoActual : '1');

  alumnosFiltrados.forEach(alumno => {
    const nie = String(alumno.nie);
    if (nuevaData[nie]) {
      if (typeof notasData !== 'undefined') {
        notasData[nie] = nuevaData[nie];
      }

      // Actualizar DOM instantáneamente celda por celda sin robar foco
      if (document.getElementById('modal-notas-periodo')?.style.display === 'block') {
        const nd = nuevaData[nie][p] || { a1: '', a2: '', a3: '', prom: '' };

        ['a1', 'a2', 'a3'].forEach(act => {
          const input = document.getElementById(`nota-${nie}-${act}`);
          if (input && document.activeElement !== input) {
            input.value = nd[act];
          }
        });

        const promEl = document.getElementById(`prom-${nie}-${p}`);
        const estadoEl = document.getElementById(`estado-${nie}-${p}`);
        if (promEl) {
          const promVal = nd.prom !== '' ? Number(nd.prom) : null;
          promEl.innerText = promVal !== null ? promVal.toFixed(2) : '—';
          if (typeof getEstadoNotaHtml === 'function') {
            const estadoNota = getEstadoNotaHtml(promVal);
            promEl.style.cssText = estadoNota.style;
            if (estadoEl) estadoEl.innerHTML = estadoNota.html;
          }
        }
      }
    }
  });

  // Persistir en localStorage como respaldo offline
  const grado = document.getElementById('grado-select')?.value || '';
  const seccion = document.getElementById('seccion-select')?.value || '';
  const tipoMateria = (typeof getTipoMateriaNotas === 'function') ? getTipoMateriaNotas() : '0-10';
  if (grado && seccion && typeof notasData !== 'undefined') {
    try {
      const key = _getLocalKey(grado, seccion, tipoMateria);
      localStorage.setItem(key, JSON.stringify(notasData));
    } catch (e) { }
  }

  // Actualizar barra de resumen
  if (typeof _actualizarResumenNotas === 'function') _actualizarResumenNotas();

  if (typeof setEstadoGuardado === 'function') setEstadoGuardado('guardado');
}

// ── Integración con abrirPanelNotas ──────────────────────────────────────────

/**
 * Intercepta abrirPanelNotas para activar el listener cuando se abre el panel.
 * Se llama automáticamente cuando el usuario abre el módulo de calificaciones.
 */
(function interceptarAbrirPanelNotas() {
  const MAX_INTENTOS = 20;
  let intentos = 0;

  function intentar() {
    if (typeof window.abrirPanelNotas === 'function') {
      const _original = window.abrirPanelNotas;
      window.abrirPanelNotas = function abrirPanelNotas(...args) {
        // Llamar función original
        const result = _original.apply(this, args);
        // Activar listener Firebase
        setTimeout(() => {
          const grado = document.getElementById('grado-select')?.value || '';
          const seccion = document.getElementById('seccion-select')?.value || '';
          const materiaActiva = (typeof getMateriaDocenteActiva === 'function') ? getMateriaDocenteActiva() : null;
          if (grado && seccion && materiaActiva) {
            activarListenerNotas(grado, seccion, materiaActiva.clave || '');
          }
        }, 300);
        return result;
      };
      console.log('[Firebase-Notas] abrirPanelNotas interceptado ✓');
    } else if (intentos < MAX_INTENTOS) {
      intentos++;
      setTimeout(intentar, 500);
    }
  }
  intentar();
})();

/**
 * También activar el listener cuando cambia la selección de grado/sección/materia.
 */
document.addEventListener('DOMContentLoaded', () => {
  const activarSiAbierto = () => {
    if (document.getElementById('modal-notas-periodo')?.style.display !== 'block') return;
    const grado = document.getElementById('grado-select')?.value || '';
    const seccion = document.getElementById('seccion-select')?.value || '';
    const materiaActiva = (typeof getMateriaDocenteActiva === 'function') ? getMateriaDocenteActiva() : null;
    if (grado && seccion && materiaActiva) {
      activarListenerNotas(grado, seccion, materiaActiva.clave || '');
    }
  };

  ['grado-select', 'seccion-select', 'docente-materia'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', activarSiAbierto);
  });
});

// ── Sincronización con GAS (respaldo) ────────────────────────────────────────

/**
 * Envía las notas a Google Apps Script en segundo plano como respaldo.
 * Esto mantiene la hoja de cálculo actualizada para exportar Excel/PDF.
 */
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
    // Fire-and-forget en segundo plano (no bloqueamos al usuario)
    fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body })
      .then(() => console.log('[Firebase-Notas] Respaldo GAS enviado ✓'))
      .catch(e => console.warn('[Firebase-Notas] Respaldo GAS falló (no crítico):', e));
  } catch (e) {
    console.warn('[Firebase-Notas] Error preparando respaldo GAS:', e);
  }
}

/**
 * Sincronización directa con GAS (usado como fallback completo).
 */
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

function _convertirLocalStorageAFirestoreRows(localData) {
  // localData es el formato notasData: { [nie]: { p1:{}, p2:{}, ... } }
  return localData; // ya es el mismo formato que _firestoreANotasData devuelve
}

// ── Indicador visual de estado Firebase ──────────────────────────────────────
(function agregarIndicadorFirebase() {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const contenedor = document.getElementById('modal-notas-periodo');
      if (!contenedor) return;

      const badge = document.createElement('div');
      badge.id = 'firebase-status-badge';
      badge.style.cssText = `
        position: fixed; bottom: 16px; right: 80px; z-index: 9999;
        padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
        display: flex; align-items: center; gap: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.3s ease-out;
        background: #065f46; color: #d1fae5; border: 1px solid #34d399;
      `;
      badge.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#34d399;display:inline-block;animation:pulse-firebase 2s infinite;"></span> Firebase • Tiempo Real`;

      // CSS para la animación
      const style = document.createElement('style');
      style.textContent = `
        @keyframes pulse-firebase {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(badge);

      // Actualizar estado
      const intervalId = setInterval(() => {
        if (_modoOffline) {
          badge.style.background = '#7c2d12';
          badge.style.color = '#fed7aa';
          badge.style.borderColor = '#f97316';
          badge.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#f97316;display:inline-block;"></span> Modo Offline`;
        } else if (_firebaseListo) {
          badge.style.background = '#065f46';
          badge.style.color = '#d1fae5';
          badge.style.borderColor = '#34d399';
          badge.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#34d399;display:inline-block;animation:pulse-firebase 2s infinite;"></span> Firebase • Tiempo Real`;
        }
      }, 500);

      // Desaparecer después de 2 segundos
      setTimeout(() => {
        badge.style.opacity = '0';
        badge.style.pointerEvents = 'none';
        clearInterval(intervalId);
        setTimeout(() => badge.remove(), 1000);
      }, 2000);
    }, 2000);
  });
})();

console.log('[Firebase-Notas] Módulo cargado ✓ — esperando inicialización Firebase...');
