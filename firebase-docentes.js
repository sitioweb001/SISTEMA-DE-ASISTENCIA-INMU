/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SICA-INMU — firebase-docentes.js
 * Módulo: Docentes, Alumnos y Catálogo de Materias en Firestore
 * Fase 2-A | 2026
 *
 * REEMPLAZA (en inicializarBaseDatos):
 *   fetch(SCRIPT_URL + "?tipo=docentes")          → < 0.3 seg  (era 4-8 seg)
 *   fetch(SCRIPT_URL + "?tipo=catalogo_materias") → < 0.3 seg  (era 4-8 seg)
 *   fetch(SCRIPT_URL + "?tipo=alumnos")           → < 0.1 seg  (ya en Firestore)
 *
 * TAMBIÉN INTERCEPTA:
 *   guardar_docente POST    → escribe en Firestore + GAS
 *   eliminar_docente POST   → elimina en Firestore + GAS
 *   guardar_catalogo POST   → escribe en Firestore + GAS
 *
 * CÓMO INCLUIR EN INDEX_DOCENTE.html:
 *   Después de los scripts Firebase (compat), antes del cierre </body>:
 *   <script src="firebase-config.js"></script>
 *   <script src="firebase-docentes.js"></script>
 *   <script src="firebase-asistencia.js"></script>
 *
 * COLECCIONES REQUERIDAS EN FIRESTORE:
 *   docentes_inmu/{nombre_key}  → ver FB_subirDocentes() abajo
 *   alumnos_inmu/{nie}          → ya existe desde Fase 1
 *   config_inmu/catalogo_materias → ver FB_subirCatalogo() abajo
 * ══════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Constantes ──────────────────────────────────────────────────────────── */
  const FB_CFG = {
    apiKey:            "AIzaSyCXILuuU2UZUZxG8iGkFpGN_mljN_e1ESc",
    authDomain:        "sica-inmu-2026.firebaseapp.com",
    projectId:         "sica-inmu-2026",
    storageBucket:     "sica-inmu-2026.firebasestorage.app",
    messagingSenderId: "264940304462",
    appId:             "1:264940304462:web:643c263f1ad46139102b1f"
  };

  const CACHE_DOCENTES  = 'fb_cache_docentes_v2';
  const CACHE_CATALOGO  = 'fb_cache_catalogo_v2';
  const CACHE_ALUMNOS   = 'fb_cache_alumnos_v2';
  const TTL_MS          = 10 * 60 * 1000; // 10 min para refrescar forzado

  /* ── Estado interno ───────────────────────────────────────────────────────── */
  let _db      = null;
  let _listo   = false;

  /* ── Inicialización ──────────────────────────────────────────────────────── */
  (function _init() {
    if (!window.firebase) { setTimeout(_init, 500); return; }
    try {
      if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(FB_CFG);
      _db    = firebase.firestore();
      _listo = true;
      _interceptarInicializarBaseDatos();
      _interceptarGuardarDocente();
      _interceptarGuardarCatalogo();
      console.log('[FB-Docentes] Módulo listo ✓');
    } catch (e) {
      console.warn('[FB-Docentes] Error al inicializar:', e);
    }
  })();

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 1 — LEER DATOS DESDE FIRESTORE
   * ═════════════════════════════════════════════════════════════════════════ */

  /**
   * Devuelve lista de docentes desde caché local (instantáneo) o Firestore (< 0.5 seg).
   * Formato idéntico al que devuelve el GAS para no romper el código existente.
   */
  async function _getDocentes(forzar) {
    // 1. Caché local
    if (!forzar) {
      const cached = _leerCache(CACHE_DOCENTES);
      if (cached) { console.log('[FB-Docentes] Docentes desde caché local ✓'); return cached; }
    }
    // 2. Firestore
    if (!_listo || !_db) throw new Error('Firebase no disponible');
    const snap = await _db.collection('docentes_inmu').get();
    const lista = [];
    snap.forEach(doc => lista.push(doc.data()));
    lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    _guardarCache(CACHE_DOCENTES, lista);
    console.log('[FB-Docentes] Docentes desde Firestore:', lista.length);
    return lista;
  }

  /**
   * Devuelve catálogo de materias desde caché o Firestore.
   */
  async function _getCatalogo(forzar) {
    if (!forzar) {
      const cached = _leerCache(CACHE_CATALOGO);
      if (cached) { console.log('[FB-Docentes] Catálogo desde caché local ✓'); return cached; }
    }
    if (!_listo || !_db) throw new Error('Firebase no disponible');
    const snap = await _db.collection('config_inmu').doc('catalogo_materias').get();
    if (snap.exists) {
      const items = snap.data().items || [];
      _guardarCache(CACHE_CATALOGO, items);
      console.log('[FB-Docentes] Catálogo desde Firestore:', items.length, 'materias');
      return items;
    }
    return null; // Señal para usar fallback
  }

  /**
   * Devuelve alumnos desde Firestore (ya existen, Fase 1).
   * Se usa como reemplazo de fetch(SCRIPT_URL + "?tipo=alumnos").
   */
  async function _getAlumnos(forzar) {
    if (!forzar) {
      const cached = _leerCache(CACHE_ALUMNOS);
      if (cached) { console.log('[FB-Docentes] Alumnos desde caché local:', cached.length, '✓'); return cached; }
    }
    if (!_listo || !_db) throw new Error('Firebase no disponible');
    const snap = await _db.collection('alumnos_inmu').get();
    const lista = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (d.nie && d.nombre) lista.push(d);
    });
    lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    _guardarCache(CACHE_ALUMNOS, lista);
    console.log('[FB-Docentes] Alumnos desde Firestore:', lista.length);
    return lista;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 2 — INTERCEPTAR inicializarBaseDatos()
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarInicializarBaseDatos() {
    const MAX = 30; let t = 0;
    function intentar() {
      if (typeof window.inicializarBaseDatos === 'function') {
        const _orig = window.inicializarBaseDatos;
        window.inicializarBaseDatos = async function () {
          if (window.sistemaEnMantenimiento) return;

          const cont    = document.getElementById('tabla-alumnos');
          const selDoc  = document.getElementById('select-docente-inicio');

          // Mostrar mensaje de carga rápido
          if (cont)   cont.innerHTML   = '<div style="padding:20px;text-align:center;color:#185FA5;font-weight:bold;">⚡ Cargando datos...</div>';
          if (selDoc) selDoc.innerHTML = '<option value="">Cargando...</option>';

          try {
            // Obtener los 3 datasets en paralelo desde Firebase
            const [docentes, catalogo, alumnos] = await Promise.all([
              _getDocentes(),
              _getCatalogo(),
              _getAlumnos()
            ]);

            // -- Alumnos --
            window.baseDatosAlumnos = alumnos;
            if (typeof cargarAlumnos === 'function') cargarAlumnos();

            // -- Docentes --
            window.baseDatosDocentes = docentes;
            let htmlDoc = '<option value="">-- Seleccionar --</option>';
            docentes.forEach(d => {
              htmlDoc += `<option value="${_esc(d.nombre)}">${_esc(d.nombre)}</option>`;
            });
            if (selDoc) selDoc.innerHTML = htmlDoc;

            // -- Catálogo --
            window.catalogoMaterias = (catalogo && catalogo.length)
              ? catalogo
              : (typeof getCatalogoMateriasFallback === 'function' ? getCatalogoMateriasFallback() : []);

            if (typeof inicializarMateriasUI === 'function') inicializarMateriasUI();

            // -- Reportes en segundo plano (no bloquea) --
            if (typeof cargarReportesSub === 'function') {
              setTimeout(() => cargarReportesSub(false), 800);
            }

            console.log('[FB-Docentes] inicializarBaseDatos() completado desde Firebase ✓');

          } catch (err) {
            console.warn('[FB-Docentes] Firebase falló, usando GAS como fallback:', err);
            return _orig.call(this);
          }
        };
        console.log('[FB-Docentes] inicializarBaseDatos() interceptada ✓');
      } else if (t++ < MAX) {
        setTimeout(intentar, 400);
      }
    }
    intentar();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 3 — INTERCEPTAR guardar/eliminar DOCENTE (POST al GAS)
   * También escribe en Firestore para mantener sincronía
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarGuardarDocente() {
    const _origFetch = window.fetch;
    window.fetch = function (url, opts) {
      if (opts && opts.body && _listo && _db) {
        try {
          const body = JSON.parse(opts.body);

          // guardar_docente
          if (body.tipo_post === 'guardar_docente' && body.nombre) {
            const key = _normalizar(body.nombre);
            const doc = {
              nombre:             body.nombre,
              grado:              body.grado              || '',
              seccion:            body.seccion            || '',
              grado_orientado:    body.grado_orientado    || body.grado    || '',
              seccion_orientada:  body.seccion_orientada  || body.seccion  || '',
              materia:            body.materia            || '',
              tipo_materia:       body.tipo_materia       || '0-10',
              escala:             body.tipo_materia       || '0-10',
              admin:              body.admin === true || body.admin === 'true',
              materias_asignadas: body.materias_asignadas || []
            };
            _db.collection('docentes_inmu').doc(key).set(doc, { merge: true })
              .then(() => {
                _borrarCache(CACHE_DOCENTES);
                console.log('[FB-Docentes] Docente guardado en Firestore:', body.nombre);
              })
              .catch(e => console.warn('[FB-Docentes] Error guardar docente:', e));
          }

          // eliminar_docente
          if (body.tipo_post === 'eliminar_docente' && body.nombre) {
            const key = _normalizar(body.nombre);
            _db.collection('docentes_inmu').doc(key).delete()
              .then(() => {
                _borrarCache(CACHE_DOCENTES);
                console.log('[FB-Docentes] Docente eliminado de Firestore:', body.nombre);
              })
              .catch(e => console.warn('[FB-Docentes] Error eliminar docente:', e));
          }

        } catch (_) {}
      }
      return _origFetch.apply(this, arguments);
    };
    console.log('[FB-Docentes] fetch interceptado para guardar/eliminar docentes ✓');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 4 — INTERCEPTAR guardar_catalogo_materias
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarGuardarCatalogo() {
    // El fetch ya está interceptado en _interceptarGuardarDocente.
    // Solo agregamos el handler aquí de forma modular si se carga después.
    const _origFetch = window.fetch;

    // Reemplazar fetch solo si no fue ya reemplazado por este módulo
    if (window._fbDocentesFetchPatched) return;
    window._fbDocentesFetchPatched = true;

    window.fetch = function (url, opts) {
      if (opts && opts.body && _listo && _db) {
        try {
          const body = JSON.parse(opts.body);

          if (body.tipo_post === 'guardar_catalogo_materias' && Array.isArray(body.catalogo)) {
            _db.collection('config_inmu').doc('catalogo_materias')
              .set({ items: body.catalogo, actualizado: new Date().toISOString() }, { merge: true })
              .then(() => {
                _borrarCache(CACHE_CATALOGO);
                console.log('[FB-Docentes] Catálogo guardado en Firestore ✓');
              })
              .catch(e => console.warn('[FB-Docentes] Error guardar catálogo:', e));
          }

        } catch (_) {}
      }
      return _origFetch.apply(this, arguments);
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 5 — UTILIDADES DE CACHÉ LOCAL
   * ═════════════════════════════════════════════════════════════════════════ */

  function _guardarCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch (_) {}
  }

  function _leerCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > TTL_MS) return null; // expirado
      return obj.data;
    } catch (_) { return null; }
  }

  function _borrarCache(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  /* ── Helpers ──────────────────────────────────────────────────────────────── */
  function _normalizar(s) {
    return (s || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 6 — FUNCIONES PÚBLICAS DE ADMINISTRACIÓN
   * Ejecutar UNA SOLA VEZ en la consola del navegador para subir datos
   * ═════════════════════════════════════════════════════════════════════════ */

  /**
   * Sube la lista de docentes desde baseDatosDocentes (ya cargados en memoria)
   * a la colección docentes_inmu de Firestore.
   *
   * USO: Abrir el sistema con datos cargados del GAS, luego en consola:
   *   await FB_subirDocentes()
   */
  window.FB_subirDocentes = async function () {
    if (!_listo || !_db) { console.error('[FB-Docentes] Firebase no disponible'); return; }
    const lista = window.baseDatosDocentes || [];
    if (!lista.length) { console.error('[FB-Docentes] baseDatosDocentes está vacío. Carga el sistema primero.'); return; }

    let subidos = 0;
    for (let i = 0; i < lista.length; i += 100) {
      const batch = _db.batch();
      lista.slice(i, i + 100).forEach(d => {
        if (!d.nombre) return;
        const key = _normalizar(d.nombre);
        batch.set(_db.collection('docentes_inmu').doc(key), {
          nombre:             d.nombre             || '',
          grado:              d.grado              || '',
          seccion:            d.seccion            || '',
          grado_orientado:    d.grado_orientado    || d.grado    || '',
          seccion_orientada:  d.seccion_orientada  || d.seccion  || '',
          materia:            d.materia            || '',
          tipo_materia:       d.tipo_materia       || '0-10',
          escala:             d.escala             || d.tipo_materia || '0-10',
          admin:              d.admin === true     || d.admin === 'true',
          materias_asignadas: Array.isArray(d.materias_asignadas) ? d.materias_asignadas : []
        }, { merge: true });
        subidos++;
      });
      await batch.commit();
      console.log('[FB-Docentes] Subidos:', subidos);
    }
    _borrarCache(CACHE_DOCENTES);
    console.log('[FB-Docentes] ✅ COMPLETADO:', subidos, 'docentes subidos a Firestore.');
  };

  /**
   * Sube el catálogo de materias a Firestore.
   * USO: await FB_subirCatalogo()
   */
  window.FB_subirCatalogo = async function () {
    if (!_listo || !_db) { console.error('[FB-Docentes] Firebase no disponible'); return; }
    const catalogo = window.catalogoMaterias || [];
    if (!catalogo.length) { console.error('[FB-Docentes] catalogoMaterias está vacío.'); return; }

    await _db.collection('config_inmu').doc('catalogo_materias').set({
      items: catalogo,
      actualizado: new Date().toISOString()
    }, { merge: true });

    _borrarCache(CACHE_CATALOGO);
    console.log('[FB-Docentes] ✅ Catálogo subido:', catalogo.length, 'materias.');
  };

  /**
   * Fuerza recarga de docentes, alumnos y catálogo desde Firestore
   * (ignora caché). Útil cuando un admin hace cambios y quiere refrescar.
   * USO: await FB_refrescarTodo()
   */
  window.FB_refrescarTodo = async function () {
    console.log('[FB-Docentes] Refrescando todo desde Firestore...');
    const [d, c, a] = await Promise.all([
      _getDocentes(true),
      _getCatalogo(true),
      _getAlumnos(true)
    ]);
    window.baseDatosDocentes = d;
    window.catalogoMaterias  = c || (typeof getCatalogoMateriasFallback === 'function' ? getCatalogoMateriasFallback() : []);
    window.baseDatosAlumnos  = a;
    if (typeof inicializarMateriasUI === 'function') inicializarMateriasUI();
    if (typeof cargarAlumnos        === 'function') cargarAlumnos();
    // Repoblar select de docentes
    const selDoc = document.getElementById('select-docente-inicio');
    if (selDoc && d.length) {
      let html = '<option value="">-- Seleccionar --</option>';
      d.forEach(doc => { html += `<option value="${_esc(doc.nombre)}">${_esc(doc.nombre)}</option>`; });
      selDoc.innerHTML = html;
    }
    console.log('[FB-Docentes] ✅ Refrescado — docentes:', d.length, '| alumnos:', a.length, '| materias:', (c||[]).length);
  };

  /**
   * Limpia todos los cachés de Firebase Docentes.
   * USO: FB_limpiarCache()
   */
  window.FB_limpiarCache = function () {
    [CACHE_DOCENTES, CACHE_CATALOGO, CACHE_ALUMNOS].forEach(k => {
      try { localStorage.removeItem(k); } catch (_) {}
    });
    console.log('[FB-Docentes] ✅ Caché limpiada.');
  };

  console.log('[FB-Docentes] Script cargado ✓');
})();
