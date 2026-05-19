/**
 * SICA-INMU — firebase-docentes.js
 * Fase 2-A | 2026
 * CON TIMEOUT DE 4 SEG + FALLBACK AUTOMÁTICO AL GAS SI FIREBASE FALLA/OFFLINE
 */
(function () {
  'use strict';

  const FB_CFG = {
    apiKey:            "AIzaSyCXILuuU2UZUZxG8iGkFpGN_mljN_e1ESc",
    authDomain:        "sica-inmu-2026.firebaseapp.com",
    projectId:         "sica-inmu-2026",
    storageBucket:     "sica-inmu-2026.firebasestorage.app",
    messagingSenderId: "264940304462",
    appId:             "1:264940304462:web:643c263f1ad46139102b1f"
  };

  const CACHE_DOCENTES = 'fb_cache_docentes_v2';
  const CACHE_CATALOGO = 'fb_cache_catalogo_v2';
  const CACHE_ALUMNOS  = 'fb_cache_alumnos_v2';
  const TTL_MS         = 10 * 60 * 1000; // 10 min
  const TIMEOUT_MS     = 4000;           // 4 seg máximo esperando Firebase

  let _db    = null;
  let _listo = false;

  (function _init() {
    if (!window.firebase) { setTimeout(_init, 500); return; }
    try {
      if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(FB_CFG);
      _db    = firebase.firestore();
      // Configurar caché offline de Firestore con timeout corto
      _db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
      _listo = true;
      _interceptarInicializarBaseDatos();
      _interceptarGuardarDocente();
      console.log('[FB-Docentes] Módulo listo ✓');
    } catch (e) {
      console.warn('[FB-Docentes] Error al inicializar:', e);
    }
  })();

  /* ── Promesa con timeout ────────────────────────────────────────────────── */
  function _conTimeout(promesa, ms, nombre) {
    const timer = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout ' + nombre + ' (' + ms + 'ms)')), ms)
    );
    return Promise.race([promesa, timer]);
  }

  /* ── Leer docentes ──────────────────────────────────────────────────────── */
  async function _getDocentes(forzar) {
    if (!forzar) {
      const cached = _leerCache(CACHE_DOCENTES);
      if (cached && cached.length) { console.log('[FB-Docentes] Docentes caché ✓', cached.length); return cached; }
    }
    if (!_listo || !_db) throw new Error('Firebase no disponible');
    const snap = await _conTimeout(
      _db.collection('docentes_inmu').get(), TIMEOUT_MS, 'docentes'
    );
    const lista = [];
    snap.forEach(doc => lista.push(doc.data()));
    lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    if (lista.length) _guardarCache(CACHE_DOCENTES, lista);
    console.log('[FB-Docentes] Docentes Firestore:', lista.length);
    return lista;
  }

  /* ── Leer catálogo ──────────────────────────────────────────────────────── */
  async function _getCatalogo(forzar) {
    if (!forzar) {
      const cached = _leerCache(CACHE_CATALOGO);
      if (cached && cached.length) { console.log('[FB-Docentes] Catálogo caché ✓'); return cached; }
    }
    if (!_listo || !_db) throw new Error('Firebase no disponible');
    const snap = await _conTimeout(
      _db.collection('config_inmu').doc('catalogo_materias').get(), TIMEOUT_MS, 'catalogo'
    );
    if (snap.exists) {
      const items = snap.data().items || [];
      if (items.length) _guardarCache(CACHE_CATALOGO, items);
      console.log('[FB-Docentes] Catálogo Firestore:', items.length);
      return items;
    }
    return null;
  }

  /* ── Leer alumnos ───────────────────────────────────────────────────────── */
  async function _getAlumnos(forzar) {
    if (!forzar) {
      const cached = _leerCache(CACHE_ALUMNOS);
      if (cached && cached.length) { console.log('[FB-Docentes] Alumnos caché ✓', cached.length); return cached; }
    }
    if (!_listo || !_db) throw new Error('Firebase no disponible');
    const snap = await _conTimeout(
      _db.collection('alumnos_inmu').get(), TIMEOUT_MS, 'alumnos'
    );
    const lista = [];
    snap.forEach(doc => { const d = doc.data(); if (d.nie && d.nombre) lista.push(d); });
    lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    if (lista.length) _guardarCache(CACHE_ALUMNOS, lista);
    console.log('[FB-Docentes] Alumnos Firestore:', lista.length);
    return lista;
  }

  /* ── Interceptar inicializarBaseDatos ───────────────────────────────────── */
  function _interceptarInicializarBaseDatos() {
    const MAX = 30; let t = 0;
    function intentar() {
      if (typeof window.inicializarBaseDatos === 'function') {
        const _orig = window.inicializarBaseDatos;
        window.inicializarBaseDatos = async function () {
          if (window.sistemaEnMantenimiento) return;

          const selDoc = document.getElementById('select-docente-inicio');
          const cont   = document.getElementById('tabla-alumnos');
          if (selDoc) selDoc.innerHTML = '<option value="">⚡ Cargando...</option>';
          if (cont)   cont.innerHTML   = '<div style="padding:20px;text-align:center;color:#185FA5;font-weight:bold;">⚡ Cargando datos...</div>';

          // ── Intentar Firebase con timeout ────────────────────────────────
          try {
            const [docentes, catalogo, alumnos] = await Promise.all([
              _getDocentes(),
              _getCatalogo(),
              _getAlumnos()
            ]);

            // Si docentes vino vacío de Firestore → fallback GAS
            if (!docentes || docentes.length === 0) {
              console.warn('[FB-Docentes] Firestore sin docentes → usando GAS');
              return _orig.call(this);
            }

            window.baseDatosAlumnos  = alumnos  || [];
            window.baseDatosDocentes = docentes || [];
            window.catalogoMaterias  = (catalogo && catalogo.length)
              ? catalogo
              : (typeof getCatalogoMateriasFallback === 'function' ? getCatalogoMateriasFallback() : []);

            // Poblar select de docentes
            let html = '<option value="">-- Seleccionar --</option>';
            docentes.forEach(d => { html += `<option value="${_esc(d.nombre)}">${_esc(d.nombre)}</option>`; });
            if (selDoc) selDoc.innerHTML = html;

            if (typeof cargarAlumnos        === 'function') cargarAlumnos();
            if (typeof inicializarMateriasUI === 'function') inicializarMateriasUI();
            if (typeof cargarReportesSub     === 'function') setTimeout(() => cargarReportesSub(false), 800);

            console.log('[FB-Docentes] inicializarBaseDatos() ✓ Firebase');

          } catch (err) {
            // ── FALLBACK: Firebase offline o timeout → usar GAS ───────────
            console.warn('[FB-Docentes] Firebase falló/timeout (' + err.message + ') → GAS fallback');
            if (selDoc) selDoc.innerHTML = '<option value="">Cargando del servidor...</option>';
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

  /* ── Interceptar guardar/eliminar docente (POST al GAS) ─────────────────── */
  function _interceptarGuardarDocente() {
    if (window._fbDocentesFetchPatched) return;
    window._fbDocentesFetchPatched = true;
    const _origFetch = window.fetch;
    window.fetch = function (url, opts) {
      if (opts && opts.body && _listo && _db) {
        try {
          const body = JSON.parse(opts.body);
          if (body.tipo_post === 'guardar_docente' && body.nombre) {
            const key = _normalizar(body.nombre);
            _db.collection('docentes_inmu').doc(key).set({
              nombre:            body.nombre            || '',
              grado:             body.grado             || '',
              seccion:           body.seccion           || '',
              grado_orientado:   body.grado_orientado   || body.grado   || '',
              seccion_orientada: body.seccion_orientada || body.seccion || '',
              materia:           body.materia           || '',
              tipo_materia:      body.tipo_materia      || '0-10',
              escala:            body.tipo_materia      || '0-10',
              admin:             body.admin === true    || body.admin === 'true',
              materias_asignadas:body.materias_asignadas|| []
            }, { merge: true })
            .then(() => { _borrarCache(CACHE_DOCENTES); console.log('[FB-Docentes] Docente guardado:', body.nombre); })
            .catch(e => console.warn('[FB-Docentes] Error guardar docente:', e));
          }
          if (body.tipo_post === 'eliminar_docente' && body.nombre) {
            _db.collection('docentes_inmu').doc(_normalizar(body.nombre)).delete()
            .then(() => { _borrarCache(CACHE_DOCENTES); })
            .catch(e => console.warn('[FB-Docentes] Error eliminar docente:', e));
          }
          if (body.tipo_post === 'guardar_catalogo_materias' && Array.isArray(body.catalogo)) {
            _db.collection('config_inmu').doc('catalogo_materias')
              .set({ items: body.catalogo, actualizado: new Date().toISOString() }, { merge: true })
              .then(() => _borrarCache(CACHE_CATALOGO))
              .catch(e => console.warn('[FB-Docentes] Error guardar catálogo:', e));
          }
        } catch (_) {}
      }
      return _origFetch.apply(this, arguments);
    };
    console.log('[FB-Docentes] fetch interceptado ✓');
  }

  /* ── Caché ──────────────────────────────────────────────────────────────── */
  function _guardarCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
  }
  function _leerCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > TTL_MS) return null;
      return obj.data;
    } catch (_) { return null; }
  }
  function _borrarCache(key) { try { localStorage.removeItem(key); } catch (_) {} }

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function _normalizar(s) {
    return (s||'').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  }
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Funciones públicas ─────────────────────────────────────────────────── */
  window.FB_subirDocentes = async function () {
    if (!_listo || !_db) { console.error('[FB-Docentes] Firebase no disponible'); return; }
    const lista = window.baseDatosDocentes || [];
    if (!lista.length) { console.error('[FB-Docentes] baseDatosDocentes vacío'); return; }
    let subidos = 0;
    for (let i = 0; i < lista.length; i += 100) {
      const batch = _db.batch();
      lista.slice(i, i + 100).forEach(d => {
        if (!d.nombre) return;
        batch.set(_db.collection('docentes_inmu').doc(_normalizar(d.nombre)), {
          nombre:d.nombre||'', grado:d.grado||'', seccion:d.seccion||'',
          grado_orientado:d.grado_orientado||d.grado||'',
          seccion_orientada:d.seccion_orientada||d.seccion||'',
          materia:d.materia||'', tipo_materia:d.tipo_materia||'0-10',
          escala:d.escala||d.tipo_materia||'0-10',
          admin:d.admin===true||d.admin==='true',
          materias_asignadas:Array.isArray(d.materias_asignadas)?d.materias_asignadas:[]
        }, { merge: true });
        subidos++;
      });
      await batch.commit();
      console.log('[FB-Docentes] Subidos:', subidos);
    }
    _borrarCache(CACHE_DOCENTES);
    console.log('[FB-Docentes] ✅ COMPLETADO:', subidos, 'docentes.');
  };

  window.FB_subirCatalogo = async function () {
    if (!_listo || !_db) { console.error('[FB-Docentes] Firebase no disponible'); return; }
    const catalogo = window.catalogoMaterias || [];
    if (!catalogo.length) { console.error('[FB-Docentes] catalogoMaterias vacío'); return; }
    await _db.collection('config_inmu').doc('catalogo_materias')
      .set({ items: catalogo, actualizado: new Date().toISOString() }, { merge: true });
    _borrarCache(CACHE_CATALOGO);
    console.log('[FB-Docentes] ✅ Catálogo subido:', catalogo.length, 'materias.');
  };

  window.FB_refrescarTodo = async function () {
    const [d, c, a] = await Promise.all([_getDocentes(true), _getCatalogo(true), _getAlumnos(true)]);
    window.baseDatosDocentes = d;
    window.catalogoMaterias  = c || (typeof getCatalogoMateriasFallback === 'function' ? getCatalogoMateriasFallback() : []);
    window.baseDatosAlumnos  = a;
    if (typeof inicializarMateriasUI === 'function') inicializarMateriasUI();
    if (typeof cargarAlumnos        === 'function') cargarAlumnos();
    const sel = document.getElementById('select-docente-inicio');
    if (sel && d.length) {
      let html = '<option value="">-- Seleccionar --</option>';
      d.forEach(doc => { html += `<option value="${_esc(doc.nombre)}">${_esc(doc.nombre)}</option>`; });
      sel.innerHTML = html;
    }
    console.log('[FB-Docentes] ✅ Refrescado — docentes:', d.length, '| alumnos:', a.length);
  };

  window.FB_limpiarCache = function () {
    [CACHE_DOCENTES, CACHE_CATALOGO, CACHE_ALUMNOS].forEach(k => { try { localStorage.removeItem(k); } catch(_){} });
    console.log('[FB-Docentes] ✅ Caché limpiada.');
  };

  console.log('[FB-Docentes] Script cargado ✓');
})();
