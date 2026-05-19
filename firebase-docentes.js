/**
 * SICA-INMU — firebase-docentes.js
 * Fase 2-A | 2026
 * MODO RESILIENTE: Firebase es mejora opcional — GAS es la base siempre
 * Si Firebase falla, tarda o está vacío → GAS inmediatamente sin bloquear
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
  const TIMEOUT_MS     = 3000;           // 3 seg máximo — si no responde, GAS

  let _db    = null;
  let _listo = false;

  // ── Init — no bloquear si Firebase falla ──────────────────────────────────
  (function _init() {
    if (!window.firebase) { setTimeout(_init, 500); return; }
    try {
      if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(FB_CFG);
      _db    = firebase.firestore();
      _listo = true;
      console.log('[FB-Docentes] Módulo listo ✓');
    } catch (e) {
      console.warn('[FB-Docentes] Firebase no disponible — usando GAS como base:', e.message);
      _listo = false;
    }
    // Siempre interceptar — con o sin Firebase
    _interceptarInicializarBaseDatos();
    _interceptarGuardarDocente();
  })();

  // ── Timeout helper ────────────────────────────────────────────────────────
  function _conTimeout(promesa, ms) {
    return Promise.race([
      promesa,
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))
    ]);
  }

  // ── Caché ─────────────────────────────────────────────────────────────────
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

  // ── Intentar leer de Firestore (nunca bloquea) ────────────────────────────
  async function _tryFirestore(coleccion, docId) {
    if (!_listo || !_db) return null;
    try {
      if (docId) {
        const snap = await _conTimeout(_db.collection(coleccion).doc(docId).get(), TIMEOUT_MS);
        return snap.exists ? snap.data() : null;
      } else {
        const snap = await _conTimeout(_db.collection(coleccion).get(), TIMEOUT_MS);
        const lista = [];
        snap.forEach(doc => lista.push(doc.data()));
        return lista;
      }
    } catch (e) {
      console.warn('[FB-Docentes] Firestore no respondió (' + coleccion + '):', e.message);
      return null;
    }
  }

  // ── INTERCEPTAR inicializarBaseDatos ──────────────────────────────────────
  function _interceptarInicializarBaseDatos() {
    const MAX = 30; let t = 0;
    function intentar() {
      if (typeof window.inicializarBaseDatos === 'function') {
        const _orig = window.inicializarBaseDatos;

        window.inicializarBaseDatos = async function () {
          if (window.sistemaEnMantenimiento) return;

          const selDoc = document.getElementById('select-docente-inicio');
          const cont   = document.getElementById('tabla-alumnos');

          // ── 1. Mostrar caché local INMEDIATAMENTE si existe ───────────────
          const cachedDoc  = _leerCache(CACHE_DOCENTES);
          const cachedAlum = _leerCache(CACHE_ALUMNOS);
          const cachedCat  = _leerCache(CACHE_CATALOGO);

          if (cachedDoc && cachedDoc.length > 0) {
            // Tenemos caché → mostrar YA, sin esperar nada
            console.log('[FB-Docentes] ⚡ Cargando desde caché local...');
            _poblarUI(cachedDoc, cachedAlum || [], cachedCat);

            // Intentar refrescar desde Firestore en segundo plano (no bloquea)
            _refrescarEnSegundoPlano();
            return;
          }

          // ── 2. Sin caché → intentar Firestore con timeout corto ───────────
          if (selDoc) selDoc.innerHTML = '<option value="">⚡ Cargando...</option>';
          if (cont)   cont.innerHTML   = '<div style="padding:20px;text-align:center;color:#185FA5;font-weight:bold;">⚡ Cargando datos...</div>';

          // Intentar Firebase y GAS en paralelo — el que gane primero se usa
          let fbResult = null;
          let gasLlamado = false;

          const fbPromesa = (async () => {
            const [docs, alum, catSnap] = await Promise.all([
              _tryFirestore('docentes_inmu'),
              _tryFirestore('alumnos_inmu'),
              _tryFirestore('config_inmu', 'catalogo_materias')
            ]);
            return { docs, alum, cat: catSnap ? catSnap.items : null };
          })();

          // Timer: si Firebase no responde en TIMEOUT_MS → GAS inmediatamente
          const gasTimer = new Promise(resolve => setTimeout(resolve, TIMEOUT_MS));

          const ganador = await Promise.race([fbPromesa, gasTimer]);

          if (ganador && ganador.docs && ganador.docs.length > 0) {
            // Firebase ganó y tiene datos
            fbResult = ganador;
            const { docs, alum, cat } = fbResult;
            _guardarCache(CACHE_DOCENTES, docs);
            if (alum && alum.length) _guardarCache(CACHE_ALUMNOS, alum);
            if (cat  && cat.length)  _guardarCache(CACHE_CATALOGO, cat);
            _poblarUI(docs, alum || [], cat);
            console.log('[FB-Docentes] ✅ Datos desde Firebase ✓');
          } else {
            // Firebase tardó, falló o está vacío → GAS
            gasLlamado = true;
            console.warn('[FB-Docentes] Firebase no disponible/vacío → GAS');
            if (selDoc) selDoc.innerHTML = '<option value="">Cargando del servidor...</option>';
            await _orig.call(this);

            // Cuando el GAS termine, guardar en Firestore en segundo plano
            setTimeout(() => _subirDatosAFirestore(), 2000);
          }
        };

        console.log('[FB-Docentes] inicializarBaseDatos() interceptada ✓');
      } else if (t++ < MAX) {
        setTimeout(intentar, 400);
      }
    }
    intentar();
  }

  // ── Poblar la UI con los datos ────────────────────────────────────────────
  function _poblarUI(docentes, alumnos, catalogo) {
    window.baseDatosDocentes = docentes || [];
    window.baseDatosAlumnos  = alumnos  || [];
    window.catalogoMaterias  = (catalogo && catalogo.length)
      ? catalogo
      : (typeof getCatalogoMateriasFallback === 'function' ? getCatalogoMateriasFallback() : []);

    const selDoc = document.getElementById('select-docente-inicio');
    if (selDoc && docentes && docentes.length) {
      let html = '<option value="">-- Seleccionar --</option>';
      docentes.forEach(d => { html += `<option value="${_esc(d.nombre)}">${_esc(d.nombre)}</option>`; });
      selDoc.innerHTML = html;
    }

    if (typeof cargarAlumnos        === 'function') cargarAlumnos();
    if (typeof inicializarMateriasUI === 'function') inicializarMateriasUI();
    if (typeof cargarReportesSub     === 'function') setTimeout(() => cargarReportesSub(false), 1000);
  }

  // ── Refrescar desde Firestore en segundo plano (no bloquea la UI) ─────────
  async function _refrescarEnSegundoPlano() {
    const [docs, alum, catSnap] = await Promise.all([
      _tryFirestore('docentes_inmu'),
      _tryFirestore('alumnos_inmu'),
      _tryFirestore('config_inmu', 'catalogo_materias')
    ]);
    if (docs && docs.length > 0) {
      _guardarCache(CACHE_DOCENTES, docs);
      _guardarCache(CACHE_ALUMNOS,  alum || []);
      if (catSnap && catSnap.items) _guardarCache(CACHE_CATALOGO, catSnap.items);
      console.log('[FB-Docentes] Caché refrescada en segundo plano ✓');
    }
  }

  // ── Subir datos del GAS a Firestore cuando Firebase vuelva ───────────────
  async function _subirDatosAFirestore() {
    if (!_listo || !_db) return;
    const docs = window.baseDatosDocentes || [];
    const alum = window.baseDatosAlumnos  || [];
    if (!docs.length && !alum.length) return;

    try {
      // Subir docentes
      if (docs.length) {
        for (let i = 0; i < docs.length; i += 100) {
          const batch = _db.batch();
          docs.slice(i, i + 100).forEach(d => {
            if (!d.nombre) return;
            batch.set(_db.collection('docentes_inmu').doc(_normalizar(d.nombre)), {
              nombre: d.nombre||'', grado: d.grado||'', seccion: d.seccion||'',
              grado_orientado: d.grado_orientado||d.grado||'',
              seccion_orientada: d.seccion_orientada||d.seccion||'',
              materia: d.materia||'', tipo_materia: d.tipo_materia||'0-10',
              escala: d.escala||d.tipo_materia||'0-10',
              admin: d.admin===true||d.admin==='true',
              materias_asignadas: Array.isArray(d.materias_asignadas)?d.materias_asignadas:[]
            }, { merge: true });
          });
          await batch.commit();
        }
        _guardarCache(CACHE_DOCENTES, docs);
        console.log('[FB-Docentes] ✅ Docentes subidos a Firestore automáticamente:', docs.length);
      }

      // Subir alumnos
      if (alum.length) {
        let count = 0;
        for (let i = 0; i < alum.length; i += 400) {
          const batch = _db.batch();
          alum.slice(i, i + 400).forEach(a => {
            const nie = String(a.nie||'').trim();
            if (!nie || nie==='N/A' || nie==='0') return;
            batch.set(_db.collection('alumnos_inmu').doc(nie), {
              nie, nombre:a.nombre||'', grado:a.grado||'',
              seccion:a.seccion||'', sexo:a.sexo||'', telefono:a.telefono||''
            }, { merge: true });
            count++;
          });
          await batch.commit();
        }
        _guardarCache(CACHE_ALUMNOS, alum);
        console.log('[FB-Docentes] ✅ Alumnos subidos a Firestore automáticamente:', count);
      }
    } catch (e) {
      console.warn('[FB-Docentes] No se pudo subir a Firestore (offline):', e.message);
    }
  }

  // ── Interceptar POST guardar/eliminar docente ─────────────────────────────
  function _interceptarGuardarDocente() {
    if (window._fbDocentesFetchPatched) return;
    window._fbDocentesFetchPatched = true;
    const _origFetch = window.fetch;
    window.fetch = function (url, opts) {
      if (opts && opts.body && _listo && _db) {
        try {
          const body = JSON.parse(opts.body);
          if (body.tipo_post === 'guardar_docente' && body.nombre) {
            _db.collection('docentes_inmu').doc(_normalizar(body.nombre)).set({
              nombre:body.nombre||'', grado:body.grado||'', seccion:body.seccion||'',
              grado_orientado:body.grado_orientado||body.grado||'',
              seccion_orientada:body.seccion_orientada||body.seccion||'',
              materia:body.materia||'', tipo_materia:body.tipo_materia||'0-10',
              escala:body.tipo_materia||'0-10',
              admin:body.admin===true||body.admin==='true',
              materias_asignadas:body.materias_asignadas||[]
            }, { merge:true })
            .then(() => _borrarCache(CACHE_DOCENTES))
            .catch(() => {});
          }
          if (body.tipo_post === 'eliminar_docente' && body.nombre) {
            _db.collection('docentes_inmu').doc(_normalizar(body.nombre)).delete()
            .then(() => _borrarCache(CACHE_DOCENTES)).catch(() => {});
          }
          if (body.tipo_post === 'guardar_catalogo_materias' && Array.isArray(body.catalogo)) {
            _db.collection('config_inmu').doc('catalogo_materias')
              .set({ items:body.catalogo, actualizado:new Date().toISOString() }, { merge:true })
              .then(() => _borrarCache(CACHE_CATALOGO)).catch(() => {});
          }
        } catch (_) {}
      }
      return _origFetch.apply(this, arguments);
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _normalizar(s) {
    return (s||'').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  }
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── API pública ───────────────────────────────────────────────────────────
  window.FB_subirDocentes  = () => _subirDatosAFirestore();
  window.FB_limpiarCache   = function() {
    [CACHE_DOCENTES, CACHE_CATALOGO, CACHE_ALUMNOS].forEach(k => { try { localStorage.removeItem(k); } catch(_){} });
    console.log('[FB-Docentes] ✅ Caché limpiada.');
  };
  window.FB_refrescarTodo  = async function() {
    await _refrescarEnSegundoPlano();
    _poblarUI(
      _leerCache(CACHE_DOCENTES) || window.baseDatosDocentes || [],
      _leerCache(CACHE_ALUMNOS)  || window.baseDatosAlumnos  || [],
      _leerCache(CACHE_CATALOGO)
    );
  };
  window.FB_subirCatalogo = async function() {
    if (!_listo || !_db) { console.error('Firebase no disponible'); return; }
    const cat = window.catalogoMaterias || [];
    if (!cat.length) { console.error('catalogoMaterias vacío'); return; }
    await _db.collection('config_inmu').doc('catalogo_materias')
      .set({ items:cat, actualizado:new Date().toISOString() }, { merge:true });
    _borrarCache(CACHE_CATALOGO);
    console.log('[FB-Docentes] ✅ Catálogo subido:', cat.length);
  };

  console.log('[FB-Docentes] Script cargado ✓');
})();
