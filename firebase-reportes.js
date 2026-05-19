/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SICA-INMU — firebase-reportes.js
 * Módulo: Reportes de Asistencia + Informes Administrativos en Firestore
 * Fase 3 | 2026
 *
 * REEMPLAZA:
 *   cargarReportesSub()           → Firestore + caché local  (era GAS ?tipo=reportes)
 *   guardarInformeEnNube()        → Firestore (era GAS POST guardar_informe)
 *   cargarHistorialInformes()     → Firestore (era GAS ?tipo=historial_informes)
 *   delete_reportes POST          → Firestore + GAS
 *
 * MANTIENE (sigue usando el GAS):
 *   El POST tipo_post="asistencia"  → GAS sigue escribiendo en Sheets (fuente maestra)
 *   Generación de PDFs              → html2pdf (sin cambios)
 *
 * COLECCIONES FIRESTORE:
 *   reportes_inmu/{id}            ← este módulo escribe al interceptar el POST asistencia
 *   informes_inmu/{id}            ← este módulo escribe al interceptar guardarInformeEnNube
 *
 * CÓMO INCLUIR:
 *   <script src="firebase-config.js"></script>
 *   <script src="firebase-docentes.js"></script>
 *   <script src="firebase-asistencia.js"></script>
 *   <script src="firebase-reportes.js"></script>   ← este archivo (Fase 3)
 * ══════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Firebase config ─────────────────────────────────────────────────────── */
  const FB_CFG = {
    apiKey:            "AIzaSyCXILuuU2UZUZxG8iGkFpGN_mljN_e1ESc",
    authDomain:        "sica-inmu-2026.firebaseapp.com",
    projectId:         "sica-inmu-2026",
    storageBucket:     "sica-inmu-2026.firebasestorage.app",
    messagingSenderId: "264940304462",
    appId:             "1:264940304462:web:643c263f1ad46139102b1f"
  };

  const CACHE_REPORTES  = 'fb_cache_reportes_v1';
  const CACHE_INFORMES  = 'fb_cache_informes_v1';
  const MAX_REPORTES_UI = 200; // cuántos mostrar en la tabla

  /* ── Estado ───────────────────────────────────────────────────────────────── */
  let _db             = null;
  let _listo          = false;
  let _unsubReportes  = null;   // listener tiempo real para subdirección

  /* ── Inicialización ──────────────────────────────────────────────────────── */
  (function _init() {
    if (!window.firebase) { setTimeout(_init, 500); return; }
    try {
      if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(FB_CFG);
      _db    = firebase.firestore();
      _listo = true;
      _interceptarCargarReportesSub();
      _interceptarGuardarInforme();
      _interceptarCargarHistorialInformes();
      _interceptarPostAsistenciaParaReporte();
      _interceptarDeleteReportes();
      console.log('[FB-Reportes] Módulo listo ✓');
    } catch (e) {
      console.warn('[FB-Reportes] Error al inicializar:', e);
    }
  })();

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 1 — CARGAR REPORTES DE SUBDIRECCIÓN
   * Reemplaza cargarReportesSub() — tabla de reportes diarios por grado/docente
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarCargarReportesSub() {
    const MAX = 30; let t = 0;
    function intentar() {
      if (typeof window.cargarReportesSub === 'function') {
        const _orig = window.cargarReportesSub;
        window.cargarReportesSub = async function (fuerzarRefresco) {
          if (window.sistemaEnMantenimiento) return;

          // Si ya hay datos en memoria y no se fuerza refresco → filtrar y salir
          if ((window.todosLosReportes || []).length > 0 && !fuerzarRefresco) {
            if (typeof filtrarReportesSub === 'function') filtrarReportesSub();
            return;
          }

          const container = document.getElementById('sub-lista-reportes');
          const stats     = document.getElementById('resumen-estadisticas');
          if (container) container.innerHTML = '⚡ Cargando reportes...';
          if (stats)     stats.innerHTML     = '';

          // 1. Mostrar caché local inmediatamente
          const cached = _leerCache(CACHE_REPORTES);
          if (cached && cached.length) {
            window.todosLosReportes = cached;
            if (typeof filtrarReportesSub === 'function') filtrarReportesSub();
            _setFiltroFechaHoy();
          }

          // 2. Traer de Firestore
          if (!_listo || !_db) { return _orig.call(this, fuerzarRefresco); }
          try {
            const snap = await _db.collection('reportes_inmu')
              .orderBy('fecha_ts', 'desc')
              .limit(MAX_REPORTES_UI)
              .get();

            const lista = [];
            snap.forEach(doc => lista.push({ _id: doc.id, ...doc.data() }));

            if (lista.length === 0 && !cached) {
              // Firestore vacío → fallback al GAS para migración inicial
              console.warn('[FB-Reportes] Firestore vacío, usando GAS como fallback');
              return _orig.call(this, fuerzarRefresco);
            }

            window.todosLosReportes = lista;
            _guardarCache(CACHE_REPORTES, lista);
            if (typeof filtrarReportesSub === 'function') filtrarReportesSub();
            _setFiltroFechaHoy();
            console.log('[FB-Reportes] Reportes cargados desde Firestore:', lista.length);

          } catch (err) {
            console.warn('[FB-Reportes] Firestore falló, usando GAS:', err);
            return _orig.call(this, fuerzarRefresco);
          }
        };
        console.log('[FB-Reportes] cargarReportesSub() interceptada ✓');

        // Activar listener tiempo real para que subdirección vea nuevos reportes sin recargar
        _activarListenerReportes();

      } else if (t++ < MAX) {
        setTimeout(intentar, 400);
      }
    }
    intentar();
  }

  /**
   * Listener onSnapshot — cuando un docente guarda su reporte,
   * la subdirección lo ve en tiempo real sin necesidad de recargar.
   */
  function _activarListenerReportes() {
    if (!_listo || !_db) return;
    if (_unsubReportes) { _unsubReportes(); _unsubReportes = null; }

    _unsubReportes = _db.collection('reportes_inmu')
      .orderBy('fecha_ts', 'desc')
      .limit(MAX_REPORTES_UI)
      .onSnapshot(snap => {
        const lista = [];
        snap.forEach(doc => lista.push({ _id: doc.id, ...doc.data() }));
        window.todosLosReportes = lista;
        _guardarCache(CACHE_REPORTES, lista);
        if (typeof filtrarReportesSub === 'function') filtrarReportesSub();
        console.log('[FB-Reportes] Reportes actualizados en tiempo real:', lista.length);
      }, e => console.warn('[FB-Reportes] Error listener reportes:', e));

    console.log('[FB-Reportes] Listener reportes activado ✓');
  }

  /**
   * Cuando el docente hace POST tipo_post="asistencia" (genera reporte)
   * también guarda el resumen en reportes_inmu de Firestore.
   */
  function _interceptarPostAsistenciaParaReporte() {
    const _prev = window.fetch;
    window.fetch = function (url, opts) {
      if (opts && opts.body && _listo && _db) {
        try {
          const body = JSON.parse(opts.body);
          if (body.tipo_post === 'asistencia') {
            const ahora = new Date();
            const id = `${_normalizar(body.grado)}_${_normalizar(body.seccion)}_${ahora.getTime()}`;
            _db.collection('reportes_inmu').doc(id).set({
              fecha:      body.fecha || ahora.toISOString(),
              fecha_ts:   firebase.firestore.Timestamp.fromDate(ahora),
              grado:      body.grado    || '',
              seccion:    body.seccion  || '',
              docente:    body.docente  || '',
              presentes:  Number(body.presentes) || 0,
              ausentes:   Number(body.ausentes)  || 0,
              permisos:   Number(body.permisos)  || 0,
              m:          Number(body.m)          || 0,
              f:          Number(body.f)          || 0,
              asistentes:      Array.isArray(body.asistentes)      ? body.asistentes      : [],
              ausentes_lista:  Array.isArray(body.ausentes_lista)  ? body.ausentes_lista  : [],
              permisos_lista:  Array.isArray(body.permisos_lista)  ? body.permisos_lista  : [],
              observacion: body.observacion_general || ''
            }).then(() => {
              console.log('[FB-Reportes] Reporte guardado en Firestore ✓');
              _borrarCache(CACHE_REPORTES);
            }).catch(e => console.warn('[FB-Reportes] Error guardar reporte:', e));
          }
        } catch (_) {}
      }
      return _prev.apply(this, arguments);
    };
    console.log('[FB-Reportes] fetch interceptado para guardar reportes ✓');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 2 — INFORMES ADMINISTRATIVOS
   * Reemplaza guardarInformeEnNube() y cargarHistorialInformes()
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarGuardarInforme() {
    const MAX = 30; let t = 0;
    function intentar() {
      if (typeof window.guardarInformeEnNube === 'function') {
        window.guardarInformeEnNube = async function (data) {
          if (!data) return;
          const ahora = new Date();
          const entry = {
            ...data,
            alumnos: data.alumnos || [],
            _ts:     ahora.toISOString(),
            fecha_ts: firebase.firestore.Timestamp.fromDate(ahora)
          };

          // 1. Guardar en localStorage como respaldo inmediato
          try {
            let local = JSON.parse(localStorage.getItem('informes_historial') || '[]');
            local.unshift(entry);
            if (local.length > 100) local = local.slice(0, 100);
            localStorage.setItem('informes_historial', JSON.stringify(local));
            _borrarCache(CACHE_INFORMES);
            window.informeHistorial = local;
            if (typeof renderHistorialInformes === 'function') renderHistorialInformes();
          } catch (_) {}

          // 2. Guardar en Firestore
          if (_listo && _db) {
            try {
              const id = `${_normalizar(data.tipo || 'informe')}_${ahora.getTime()}`;
              await _db.collection('informes_inmu').doc(id).set(entry, { merge: true });
              console.log('[FB-Reportes] Informe guardado en Firestore ✓');
            } catch (e) {
              console.warn('[FB-Reportes] Error guardar informe en Firestore, enviando a GAS:', e);
              // Fallback: GAS original
              try {
                fetch(window.SCRIPT_URL, {
                  method: 'POST', mode: 'no-cors',
                  body: JSON.stringify({ tipo_post: 'guardar_informe', ...data })
                });
              } catch (_) {}
            }
          } else {
            // Sin Firebase → GAS
            try {
              fetch(window.SCRIPT_URL, {
                method: 'POST', mode: 'no-cors',
                body: JSON.stringify({ tipo_post: 'guardar_informe', ...data })
              });
            } catch (_) {}
          }
        };
        console.log('[FB-Reportes] guardarInformeEnNube() reemplazada ✓');
      } else if (t++ < MAX) {
        setTimeout(intentar, 500);
      }
    }
    intentar();
  }

  function _interceptarCargarHistorialInformes() {
    const MAX = 30; let t = 0;
    function intentar() {
      if (typeof window.cargarHistorialInformes === 'function') {
        window.cargarHistorialInformes = async function () {
          const cont = document.getElementById('historial-informes-list');
          if (!cont) return;

          // 1. Mostrar localStorage inmediatamente
          let local = [];
          try { local = JSON.parse(localStorage.getItem('informes_historial') || '[]'); } catch (_) {}
          if (local.length) {
            window.informeHistorial = local;
            if (typeof renderHistorialInformes === 'function') renderHistorialInformes();
          }

          // 2. Traer de Firestore y fusionar
          if (!_listo || !_db) return;
          try {
            const cached = _leerCache(CACHE_INFORMES);
            if (cached && cached.length) {
              window.informeHistorial = cached;
              if (typeof renderHistorialInformes === 'function') renderHistorialInformes();
            }

            const snap = await _db.collection('informes_inmu')
              .orderBy('fecha_ts', 'desc')
              .limit(100)
              .get();

            const nube = [];
            snap.forEach(doc => nube.push({ _id: doc.id, ...doc.data() }));

            if (nube.length > 0) {
              // Fusionar: nube + local deduplicando por tipo+fecha+docente
              const combined = [...nube];
              local.forEach(loc => {
                const existe = combined.some(n =>
                  n.tipo === loc.tipo && n.fecha === loc.fecha && n.docente === loc.docente);
                if (!existe) combined.push(loc);
              });
              combined.sort((a, b) => (b._ts || b.fecha || '').localeCompare(a._ts || a.fecha || ''));
              window.informeHistorial = combined;
              _guardarCache(CACHE_INFORMES, combined);
              localStorage.setItem('informes_historial', JSON.stringify(combined.slice(0, 100)));
              if (typeof renderHistorialInformes === 'function') renderHistorialInformes();
              console.log('[FB-Reportes] Historial informes cargado desde Firestore:', nube.length);
            }
          } catch (e) {
            console.warn('[FB-Reportes] Error cargar historial informes:', e);
          }
        };
        console.log('[FB-Reportes] cargarHistorialInformes() interceptada ✓');
      } else if (t++ < MAX) {
        setTimeout(intentar, 500);
      }
    }
    intentar();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 3 — BORRAR REPORTES
   * Intercepta el POST delete_reportes para también limpiar Firestore
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarDeleteReportes() {
    const _prev = window.fetch;
    window.fetch = function (url, opts) {
      if (opts && opts.body && _listo && _db) {
        try {
          const body = JSON.parse(opts.body);
          if (body.tipo_post === 'delete_reportes') {
            _borrarReportesFirestore(body.rango || 'today').catch(e =>
              console.warn('[FB-Reportes] Error borrar reportes:', e)
            );
          }
        } catch (_) {}
      }
      return _prev.apply(this, arguments);
    };
  }

  async function _borrarReportesFirestore(rango) {
    // Determinar fechas a borrar según el rango
    const ahora = new Date();
    let desde = new Date(ahora);
    switch (rango) {
      case 'today':    desde.setHours(0, 0, 0, 0);                   break;
      case 'week':     desde.setDate(ahora.getDate() - 7);            break;
      case 'month':    desde.setMonth(ahora.getMonth() - 1);          break;
      case 'trimestre':desde.setMonth(ahora.getMonth() - 3);          break;
      case 'year':     desde.setFullYear(ahora.getFullYear() - 1);    break;
      case 'all':      desde = new Date(2020, 0, 1);                  break;
      default:         desde.setHours(0, 0, 0, 0);
    }

    const snap = await _db.collection('reportes_inmu')
      .where('fecha_ts', '>=', firebase.firestore.Timestamp.fromDate(desde))
      .get();

    // Borrar en lotes de 100
    for (let i = 0; i < snap.docs.length; i += 100) {
      const batch = _db.batch();
      snap.docs.slice(i, i + 100).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    _borrarCache(CACHE_REPORTES);
    window.todosLosReportes = [];
    console.log('[FB-Reportes] Borrados', snap.docs.length, 'reportes de Firestore (rango:', rango, ')');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 4 — MIGRACIÓN DESDE GAS (ejecutar 1 vez en consola)
   * ═════════════════════════════════════════════════════════════════════════ */

  /**
   * Migra el historial de reportes del GAS a Firestore.
   * 1. Carga desde GAS
   * 2. Sube a Firestore en lotes
   *
   * USO (en consola, con el sistema abierto y GAS accesible):
   *   await FB_migrarReportesDesdeGAS()
   */
  window.FB_migrarReportesDesdeGAS = async function () {
    if (!_listo || !_db) { console.error('[FB-Reportes] Firebase no disponible'); return; }
    const url = window.SCRIPT_URL + '?tipo=reportes';
    console.log('[FB-Reportes] Descargando reportes del GAS...');
    let lista = [];
    try {
      const res = await fetch(url);
      lista = await res.json();
    } catch (e) { console.error('[FB-Reportes] Error descargando reportes del GAS:', e); return; }

    console.log('[FB-Reportes] Reportes descargados del GAS:', lista.length);
    let subidos = 0;
    for (let i = 0; i < lista.length; i += 100) {
      const batch = _db.batch();
      lista.slice(i, i + 100).forEach(r => {
        let fecha = null;
        try { fecha = new Date(r.fecha); } catch (_) { fecha = new Date(); }
        const id  = `${_normalizar(r.grado || '')}_${_normalizar(r.seccion || '')}_${fecha.getTime() + subidos}`;
        batch.set(_db.collection('reportes_inmu').doc(id), {
          fecha:          r.fecha || fecha.toISOString(),
          fecha_ts:       firebase.firestore.Timestamp.fromDate(fecha),
          grado:          r.grado    || '',
          seccion:        r.seccion  || '',
          docente:        r.docente  || '',
          presentes:      Number(r.presentes) || 0,
          ausentes:       Number(r.ausentes)  || 0,
          permisos:       Number(r.permisos)  || 0,
          m:              Number(r.m)          || 0,
          f:              Number(r.f)          || 0,
          observacion:    r.observacion || ''
        }, { merge: true });
        subidos++;
      });
      await batch.commit();
      console.log('[FB-Reportes] Migrados:', subidos);
    }
    _borrarCache(CACHE_REPORTES);
    console.log('[FB-Reportes] ✅ COMPLETADO:', subidos, 'reportes migrados a Firestore.');
  };

  /**
   * Migra el historial de informes del GAS a Firestore.
   * USO: await FB_migrarInformesDesdeGAS()
   */
  window.FB_migrarInformesDesdeGAS = async function () {
    if (!_listo || !_db) { console.error('[FB-Reportes] Firebase no disponible'); return; }
    const url = window.SCRIPT_URL + '?tipo=historial_informes';
    console.log('[FB-Reportes] Descargando informes del GAS...');
    let lista = [];
    try {
      const res = await fetch(url);
      lista = await res.json();
    } catch (e) { console.error('[FB-Reportes] Error descargando informes del GAS:', e); return; }

    console.log('[FB-Reportes] Informes descargados del GAS:', lista.length);
    let subidos = 0;
    for (let i = 0; i < lista.length; i += 100) {
      const batch = _db.batch();
      lista.slice(i, i + 100).forEach((inf, j) => {
        let fecha = null;
        try { fecha = new Date(inf._ts || inf.fecha); } catch (_) { fecha = new Date(); }
        const id = `${_normalizar(inf.tipo || 'informe')}_${fecha.getTime() + j}`;
        batch.set(_db.collection('informes_inmu').doc(id), {
          ...inf,
          fecha_ts: firebase.firestore.Timestamp.fromDate(fecha)
        }, { merge: true });
        subidos++;
      });
      await batch.commit();
      console.log('[FB-Reportes] Informes migrados:', subidos);
    }
    _borrarCache(CACHE_INFORMES);
    console.log('[FB-Reportes] ✅ COMPLETADO:', subidos, 'informes migrados a Firestore.');
  };

  /* ── Helpers ──────────────────────────────────────────────────────────────── */
  function _setFiltroFechaHoy() {
    const el = document.getElementById('filtro-fecha-sub');
    if (!el || el.value) return;
    const hoy = new Date();
    el.value = hoy.getFullYear() + '-' +
      String(hoy.getMonth() + 1).padStart(2, '0') + '-' +
      String(hoy.getDate()).padStart(2, '0');
  }

  function _normalizar(s) {
    return (s || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  function _guardarCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
  }

  function _leerCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > 5 * 60 * 1000) return null; // 5 min TTL
      return obj.data;
    } catch (_) { return null; }
  }

  function _borrarCache(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  console.log('[FB-Reportes] Script cargado ✓');
})();
