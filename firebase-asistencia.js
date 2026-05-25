/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SICA-INMU — firebase-asistencia.js
 * Módulo: Asistencia Portal Tiempo Real + Status Docentes + Ausencias Peligro
 * Fase 2-B | 2026
 *
 * REEMPLAZA:
 *   sincronizarAsistenciaAlumnos()  → onSnapshot tiempo real (era 3-5 seg)
 *   actualizarStatusDocente()       → Firestore (era GAS no-cors opaco)
 *   obtenerStatusDocentes()         → onSnapshot tiempo real (era polling 10 seg)
 *   ?tipo=estudiantes_peligro       → Firestore (era GAS 3-5 seg)
 *   ?tipo=asistencia_diaria_grado   → Firestore (era GAS 3-5 seg)
 *
 * MANTIENE (sigue usando el GAS):
 *   POST tipo_post="asistencia"     → GAS sigue guardando en Sheets (reportes PDF)
 *   POST tipo_post="actualizar_asistencia" → GAS sigue guardando en Sheets
 *   POST tipo_post="observacion_general"   → GAS sigue guardando en Sheets
 *
 * COLECCIONES FIRESTORE REQUERIDAS:
 *   asistencia_alumnos_inmu/{nie}_{fecha_key}  ← escribe INDEX_ALUMNO (ya existe)
 *   presencia_docentes_inmu/{nombre_key}       ← este módulo crea y lee
 *   ausencias_inmu/{nie}                       ← este módulo actualiza al generar PDF
 * ══════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Configuración Firebase ──────────────────────────────────────────────── */
  const FB_CFG = {
    apiKey:            "AIzaSyCXILuuU2UZUZxG8iGkFpGN_mljN_e1ESc",
    authDomain:        "sica-inmu-2026.firebaseapp.com",
    projectId:         "sica-inmu-2026",
    storageBucket:     "sica-inmu-2026.firebasestorage.app",
    messagingSenderId: "264940304462",
    appId:             "1:264940304462:web:643c263f1ad46139102b1f"
  };

  /* ── Estado interno ───────────────────────────────────────────────────────── */
  let _db             = null;
  let _listo          = false;
  let _unsubPortal    = null;   // listener asistencia portal (por grado/sección)
  let _unsubStatus    = null;   // listener status docentes
  let _gradoActual    = '';
  let _seccionActual  = '';

  /* ── Inicialización ──────────────────────────────────────────────────────── */
  (function _init() {
    if (!window.firebase) { setTimeout(_init, 500); return; }
    try {
      if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(FB_CFG);
      _db    = firebase.firestore();
      _listo = true;
      _interceptarSincronizar();
      _interceptarStatusDocentes();
      _interceptarEstudiantesPeligro();
      _interceptarActualizarAsistencia();
      _iniciarListenerStatusDocentes();
      console.log('[FB-Asistencia] Módulo listo ✓');
    } catch (e) {
      console.warn('[FB-Asistencia] Error al inicializar:', e);
    }
  })();

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 1 — PORTAL EN TIEMPO REAL (onSnapshot)
   * Reemplaza sincronizarAsistenciaAlumnos() — el botón "📡 Sincronizar"
   * y también escucha en tiempo real sin tocar ningún botón
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarSincronizar() {
    const MAX = 30; let t = 0;
    function intentar() {
      if (typeof window.sincronizarAsistenciaAlumnos === 'function') {
        const _orig = window.sincronizarAsistenciaAlumnos;
        window.sincronizarAsistenciaAlumnos = async function () {
          const btn     = document.getElementById('btn-sync-asist');
          const grado   = (document.getElementById('grado-select')?.value   || '').trim();
          const seccion = (document.getElementById('seccion-select')?.value || '').trim();

          if (!grado || !seccion) {
            if (typeof mostrarNotificacion === 'function')
              mostrarNotificacion('Selecciona un grado y sección primero.', 'warning');
            return;
          }
          if (!window.alumnosFiltrados || window.alumnosFiltrados.length === 0) {
            if (typeof mostrarNotificacion === 'function')
              mostrarNotificacion('No hay alumnos cargados.', 'warning');
            return;
          }
          if (!_listo || !_db) return _orig.call(this);

          if (btn) { btn.textContent = '⏳ Sincronizando...'; btn.style.opacity = '0.6'; btn.disabled = true; }

          try {
            const mapa = await _getAsistenciaPortalHoy(grado, seccion);
            _pintarPortalEnUI(mapa);
            const marcados = Object.keys(mapa).length;
            const total    = (window.alumnosFiltrados || []).length;
            if (typeof mostrarNotificacion === 'function')
              mostrarNotificacion(`📡 Sincronizado — ${marcados} de ${total} marcaron en portal hoy.`, 'success', 4000);
          } catch (err) {
            console.warn('[FB-Asistencia] Sync falló, usando GAS:', err);
            return _orig.call(this);
          } finally {
            if (btn) { btn.textContent = '📡 Sincronizar Asistencia'; btn.style.opacity = '1'; btn.disabled = false; }
          }
        };
        console.log('[FB-Asistencia] sincronizarAsistenciaAlumnos() interceptada ✓');

        // También activar listener automático cuando cambie grado/sección
        _escucharCambioGradoSeccion();

      } else if (t++ < MAX) {
        setTimeout(intentar, 400);
      }
    }
    intentar();
  }

  /**
   * Lee la asistencia del portal de hoy para un grado/sección específicos.
   * Consulta la colección asistencia_alumnos_inmu filtrada por fecha y grado.
   * @returns {Object} mapa { [nie]: { estado, hora } }
   */
  async function _getAsistenciaPortalHoy(grado, seccion) {
    const hoy  = _fechaKey();
    const snap = await _db.collection('asistencia_alumnos_inmu')
      .where('fecha_key', '==', hoy)
      .where('grado', '==', grado)
      .where('seccion', '==', seccion)
      .get();

    const mapa = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (d.nie) mapa[String(d.nie).trim()] = { estado: d.estado || 'presente', hora: d.hora || '' };
    });
    return mapa;
  }

  /**
   * Pinta los indicadores de portal en la UI para cada alumno.
   */
  function _pintarPortalEnUI(mapa) {
    (window.alumnosFiltrados || []).forEach(alumno => {
      const nieStr = String(alumno.nie || '').trim();
      const el     = document.getElementById('asist-portal-' + nieStr);
      if (!el) return;
      const reg = mapa[nieStr];
      if (reg) {
        const hora = reg.hora || '';
        const esP  = reg.estado === 'permiso';
        el.style.cssText = `text-align:center;font-size:11px;font-weight:700;padding:2px 5px;border-radius:6px;` +
          (esP ? 'color:#92400e;background:#fef3c7;' : 'color:#166534;background:#dcfce7;');
        el.innerHTML = esP
          ? `⚠️ Permiso${hora ? '<br><small style="font-weight:400">' + hora + '</small>' : ''}`
          : `✅ Marcó${hora ? '<br><small style="font-weight:400">' + hora + '</small>' : ''}`;
        el.title = `Estado: ${reg.estado}${hora ? ' · ' + hora : ''}`;
      } else {
        el.style.cssText = 'text-align:center;font-size:11px;font-weight:700;padding:2px 5px;border-radius:6px;color:#991b1b;background:#fee2e2;';
        el.textContent = '🔴 No marcó';
        el.title       = 'No ha marcado asistencia hoy en el portal';
      }
    });
  }

  /**
   * Activa un listener en tiempo real para el grado/sección actuales.
   * Cuando un alumno marca desde el portal, el docente lo ve SIN tocar botón.
   */
  function _activarListenerPortal(grado, seccion) {
    if (_unsubPortal) { _unsubPortal(); _unsubPortal = null; }
    if (!_listo || !_db || !grado || !seccion) return;

    _gradoActual   = grado;
    _seccionActual = seccion;
    const hoy = _fechaKey();

    _unsubPortal = _db.collection('asistencia_alumnos_inmu')
      .where('fecha_key', '==', hoy)
      .where('grado', '==', grado)
      .where('seccion', '==', seccion)
      .onSnapshot(snap => {
        const mapa = {};
        snap.forEach(doc => {
          const d = doc.data();
          if (d.nie) mapa[String(d.nie).trim()] = { estado: d.estado || 'presente', hora: d.hora || '' };
        });
        _pintarPortalEnUI(mapa);
        // Guardar en window para que el botón de sync también pueda usarlo
        window._mapaPortalActual = mapa;
        console.log('[FB-Asistencia] Portal actualizado en tiempo real — marcados:', Object.keys(mapa).length);
      }, e => console.warn('[FB-Asistencia] Error listener portal:', e));

    console.log('[FB-Asistencia] Listener portal activado para:', grado, seccion);
  }

  /**
   * Observa los selects de grado/sección para reactivar el listener
   * cada vez que cambian.
   */
  function _escucharCambioGradoSeccion() {
    const MAX = 20; let t = 0;
    function buscar() {
      const selGrado   = document.getElementById('grado-select');
      const selSeccion = document.getElementById('seccion-select');
      if (selGrado && selSeccion) {
        function onChange() {
          const g = (selGrado.value   || '').trim();
          const s = (selSeccion.value || '').trim();
          if (g && s && (g !== _gradoActual || s !== _seccionActual)) {
            setTimeout(() => _activarListenerPortal(g, s), 300); // pequeño delay para que cargarAlumnos() termine
          }
        }
        selGrado.addEventListener('change', onChange);
        selSeccion.addEventListener('change', onChange);
        console.log('[FB-Asistencia] Observando cambios de grado/sección ✓');
      } else if (t++ < MAX) {
        setTimeout(buscar, 500);
      }
    }
    buscar();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 2 — STATUS DOCENTES EN TIEMPO REAL
   * Reemplaza actualizarStatusDocente() y obtenerStatusDocentes()
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarStatusDocentes() {
    const MAX = 25; let t = 0;
    function intentar() {
      if (typeof window.actualizarStatusDocente === 'function' &&
          typeof window.obtenerStatusDocentes   === 'function') {

        // Reemplazar actualizarStatusDocente → escribe en Firestore
        window.actualizarStatusDocente = async function (docente, status) {
          if (!docente || !_listo || !_db) return;
          const key = _normalizar(docente);
          try {
            await _db.collection('presencia_docentes_inmu').doc(key).set({
              docente,
              status,
              ultima_actividad: Date.now(),
              actualizado:      new Date().toISOString()
            }, { merge: true });
          } catch (e) {
            console.warn('[FB-Asistencia] Error actualizar status:', e);
          }
        };

        // Reemplazar obtenerStatusDocentes → ya no hace nada (lo hace el listener)
        window.obtenerStatusDocentes = async function () {
          // El listener onSnapshot ya actualiza docentesStatus en tiempo real.
          // Esta función queda vacía para no duplicar.
          if (typeof actualizarListaStatus === 'function') actualizarListaStatus();
        };

        console.log('[FB-Asistencia] actualizarStatusDocente y obtenerStatusDocentes reemplazados ✓');
      } else if (t++ < MAX) {
        setTimeout(intentar, 500);
      }
    }
    intentar();
  }

  /**
   * Listener onSnapshot para status de docentes.
   * Detecta inactividad > 5 min y marca offline automáticamente.
   */
  function _iniciarListenerStatusDocentes() {
    if (!_listo || !_db) { setTimeout(_iniciarListenerStatusDocentes, 800); return; }

    const INACTIVIDAD_MS = 5 * 60 * 1000;

    if (_unsubStatus) { _unsubStatus(); _unsubStatus = null; }

    _unsubStatus = _db.collection('presencia_docentes_inmu')
      .onSnapshot(snap => {
        const ahora = Date.now();
        if (typeof window.docentesStatus !== 'object') window.docentesStatus = {};

        snap.forEach(doc => {
          const d = doc.data();
          const nombre = d.docente || doc.id;
          let status = d.status || 'offline';
          // Si lleva más de 5 min sin actividad → marcar offline
          if (status === 'online' && (ahora - (d.ultima_actividad || 0)) > INACTIVIDAD_MS) {
            status = 'offline';
            // Actualizar en Firestore silenciosamente
            _db.collection('presencia_docentes_inmu').doc(doc.id)
              .set({ status: 'offline' }, { merge: true })
              .catch(() => {});
          }
          window.docentesStatus[nombre] = status;
          if (!window.docentesIds) window.docentesIds = {};
          window.docentesIds[nombre] = doc.id;
        });

        if (typeof actualizarListaStatus === 'function') actualizarListaStatus();
        console.log('[FB-Asistencia] Status docentes actualizado (tiempo real) ✓');
      }, e => console.warn('[FB-Asistencia] Error listener status:', e));

    console.log('[FB-Asistencia] Listener status docentes activado ✓');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 3 — ESTUDIANTES EN PELIGRO (conteo de ausencias)
   * Reemplaza ?tipo=estudiantes_peligro
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarEstudiantesPeligro() {
    // Parchamos el fetch global para interceptar las llamadas a ?tipo=estudiantes_peligro
    const _origFetch = window.fetch;
    window.fetch = function (url, opts) {
      if (typeof url === 'string' && url.includes('tipo=estudiantes_peligro') && _listo && _db) {
        const urlObj = new URL(url, location.href);
        const grado   = urlObj.searchParams.get('grado')   || '';
        const seccion = urlObj.searchParams.get('seccion') || '';

        // Devolver Promise que lee de Firestore
        return _getEstudiantesPeligroFirestore(grado, seccion)
          .then(data => new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }))
          .catch(err => {
            console.warn('[FB-Asistencia] Peligro falló, usando GAS:', err);
            return _origFetch.apply(this, arguments);
          });
      }
      return _origFetch.apply(this, arguments);
    };
    console.log('[FB-Asistencia] fetch interceptado para estudiantes_peligro ✓');
  }

  async function _getEstudiantesPeligroFirestore(grado, seccion) {
    if (!grado) return [];
    let query = _db.collection('ausencias_inmu').where('grado', '==', grado);
    if (seccion) query = query.where('seccion', '==', seccion);
    const snap = await query.get();
    const result = [];
    snap.forEach(doc => {
      const d = doc.data();
      if ((d.conteo || 0) >= 28) {
        result.push({ nombre: d.nombre || '', nie: d.nie || '', conteo: d.conteo || 0 });
      }
    });
    result.sort((a, b) => b.conteo - a.conteo);
    return result;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 4 — ACTUALIZAR ASISTENCIA (POST actualizar_asistencia)
   * Al actualizar asistencia docente también actualiza conteo en ausencias_inmu
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarActualizarAsistencia() {
    // Este interceptor solo lee el body y actualiza ausencias_inmu en Firestore.
    // El GAS sigue recibiendo el POST para su propia lógica de Sheets.
    const _prev = window.fetch;
    window.fetch = function (url, opts) {
      if (opts && opts.body && _listo && _db) {
        try {
          const body = JSON.parse(opts.body);
          // Cuando se genera el reporte de asistencia se manda tipo_post="asistencia"
          if (body.tipo_post === 'asistencia') {
            const ausentes = body.ausentes_lista || [];
            const grado    = body.grado   || '';
            const seccion  = body.seccion || '';
            // Incrementar conteo en ausencias_inmu para cada ausente
            ausentes.forEach(nombre => {
              _incrementarAusenciaFirestore(nombre, grado, seccion);
            });
          }
        } catch (_) {}
      }
      return _prev.apply(this, arguments);
    };
    console.log('[FB-Asistencia] fetch interceptado para conteo de ausencias ✓');
  }

  /**
   * Incrementa o crea el conteo de ausencias de un estudiante en ausencias_inmu.
   */
  async function _incrementarAusenciaFirestore(nombre, grado, seccion) {
    if (!nombre || !grado) return;
    try {
      // Buscar NIE en alumnos_inmu por nombre
      let nie = '';
      const alumnoSnap = await _db.collection('alumnos_inmu')
        .where('grado', '==', grado)
        .where('seccion', '==', seccion)
        .get();
      alumnoSnap.forEach(doc => {
        if (_normNombre(doc.data().nombre) === _normNombre(nombre)) nie = doc.data().nie || '';
      });

      const key = nie || _normalizar(nombre + '_' + grado + '_' + seccion);
      const ref = _db.collection('ausencias_inmu').doc(key);
      await _db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const actual = snap.exists ? (snap.data().conteo || 0) : 0;
        tx.set(ref, {
          nombre, nie, grado, seccion,
          conteo: actual + 1,
          ultima_ausencia: new Date().toISOString()
        }, { merge: true });
      });
    } catch (e) {
      console.warn('[FB-Asistencia] Error incrementar ausencia:', e);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 5 — EXPOSICIÓN PÚBLICA
   * ═════════════════════════════════════════════════════════════════════════ */

  /**
   * Activa el listener de portal para el grado/sección indicados.
   * Llamar si el listener no se activa automáticamente.
   * USO: FB_activarPortal('1° General', 'A')
   */
  window.FB_activarPortal = function (grado, seccion) {
    _activarListenerPortal(grado, seccion);
  };

  /**
   * Reinicia todos los listeners.
   * USO: FB_reiniciarListeners()
   */
  window.FB_reiniciarListeners = function () {
    if (_unsubPortal)  { _unsubPortal();  _unsubPortal  = null; }
    if (_unsubStatus)  { _unsubStatus();  _unsubStatus  = null; }
    _iniciarListenerStatusDocentes();
    const g = (document.getElementById('grado-select')?.value   || '').trim();
    const s = (document.getElementById('seccion-select')?.value || '').trim();
    if (g && s) _activarListenerPortal(g, s);
    console.log('[FB-Asistencia] Listeners reiniciados ✓');
  };

  /**
   * Sube el conteo de ausencias desde el GAS a Firestore (ejecutar 1 sola vez en consola).
   * Requiere que baseDatosAlumnos esté cargado.
   * USO: await FB_subirAusencias([{ nombre, nie, grado, seccion, conteo }])
   */
  window.FB_subirAusencias = async function (lista) {
    if (!_listo || !_db) { console.error('[FB-Asistencia] Firebase no disponible'); return; }
    if (!Array.isArray(lista) || !lista.length) { console.error('[FB-Asistencia] Lista vacía'); return; }
    let subidos = 0;
    for (let i = 0; i < lista.length; i += 100) {
      const batch = _db.batch();
      lista.slice(i, i + 100).forEach(a => {
        const key = a.nie || _normalizar((a.nombre||'') + '_' + (a.grado||'') + '_' + (a.seccion||''));
        batch.set(_db.collection('ausencias_inmu').doc(key), {
          nombre:  a.nombre  || '',
          nie:     a.nie     || '',
          grado:   a.grado   || '',
          seccion: a.seccion || '',
          conteo:  Number(a.conteo) || 0,
          ultima_ausencia: new Date().toISOString()
        }, { merge: true });
        subidos++;
      });
      await batch.commit();
      console.log('[FB-Asistencia] Ausencias subidas:', subidos);
    }
    console.log('[FB-Asistencia] ✅ COMPLETADO:', subidos, 'registros de ausencias subidos.');
  };

  /* ── Helpers ──────────────────────────────────────────────────────────────── */
  function _fechaKey() {
    const ahora = new Date();
    const dd = String(ahora.getDate()).padStart(2, '0');
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    const yyyy = ahora.getFullYear();
    return `${dd}_${mm}_${yyyy}`;
  }

  function _normalizar(s) {
    return (s || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  function _normNombre(s) {
    return (s || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  console.log('[FB-Asistencia] Script cargado ✓');
})();
