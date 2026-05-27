/**
 * SICA-INMU — firebase-docentes.js
 * Carga docentes, alumnos y catálogo desde Firebase con fallback al GAS.
 * CORRECCIÓN: limpia comillas en sección al leer datos.
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

  const GAS_URL     = "https://script.google.com/macros/s/AKfycbxKnxasl94QOwaLx2QZMDNnfNG8NTtnWg1agE9shf9cyeYeP1PsgtUjbu4X94lXRSIM/exec";
  const TIMEOUT_FB  = 6000;
  const TIMEOUT_GAS = 15000;

  let _db    = null;
  let _listo = false;

  // ── Init Firebase ──────────────────────────────────────────────────────────
  (function _init() {
    if (!window.firebase) { setTimeout(_init, 300); return; }
    try {
      if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(FB_CFG);
      _db    = firebase.firestore();
      _listo = true;
      console.log('[FB-Docentes] Firebase listo ✓');
    } catch (e) {
      console.warn('[FB-Docentes] Error init:', e.message);
    }
    _esperarEInicializar();
  })();

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _timeout(ms) {
    return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + ms + 'ms')), ms));
  }
  function _race(p, ms) { return Promise.race([p, _timeout(ms)]); }

  // Limpiar comillas extras en sección: '"A"' → 'A'
  function _limpiarSeccion(s) {
    return String(s || '').replace(/^"+|"+$/g, '').trim();
  }

  // Normalizar clave Firestore
  function _normKey(s) {
    return (s || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  // Escapar HTML
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Caché localStorage para docentes (sobrevive CORS/GAS vacío) ──────────
  const CACHE_KEY_DOC = 'fb_cache_docentes_v3';
  const CACHE_KEY_CAT = 'fb_cache_catalogo_v3';

  function _guardarCacheDocentes(docentes, catalogo) {
    try {
      localStorage.setItem(CACHE_KEY_DOC, JSON.stringify(docentes));
      if (catalogo && catalogo.length) localStorage.setItem(CACHE_KEY_CAT, JSON.stringify(catalogo));
    } catch(e) {}
  }

  function _leerCacheDocentes() {
    try {
      const d = JSON.parse(localStorage.getItem(CACHE_KEY_DOC) || 'null');
      const c = JSON.parse(localStorage.getItem(CACHE_KEY_CAT) || 'null');
      return { docentes: Array.isArray(d) ? d : null, catalogo: Array.isArray(c) ? c : null };
    } catch(e) { return { docentes: null, catalogo: null }; }
  }

  // ── Fetch GAS con timeout ──────────────────────────────────────────────────
  async function _fetchGAS(tipo) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_GAS);
    try {
      const r = await fetch(GAS_URL + '?tipo=' + tipo, { signal: ctrl.signal });
      clearTimeout(t);
      return await r.json();
    } catch (e) { clearTimeout(t); throw e; }
  }

  // ── Leer colección Firestore ───────────────────────────────────────────────
  async function _leerCol(nombre) {
    if (!_listo || !_db) throw new Error('Firebase no disponible');
    const snap = await _race(_db.collection(nombre).get(), TIMEOUT_FB);
    const lista = [];
    snap.forEach(doc => lista.push(Object.assign({ _docId: doc.id }, doc.data())));
    return lista;
  }

  // ── Limpiar alumnos (quitar comillas en sección) ───────────────────────────
  function _limpiarAlumnos(lista) {
    return (lista || []).map(a => ({
      ...a,
      seccion: _limpiarSeccion(a.seccion)
    }));
  }

  // ── Subir alumnos a Firebase ───────────────────────────────────────────────
  async function _subirAlumnos(lista) {
    if (!_listo || !_db || !lista || !lista.length) return 0;
    let n = 0;
    for (let i = 0; i < lista.length; i += 400) {
      const batch = _db.batch();
      lista.slice(i, i + 400).forEach(a => {
        const nie = String(a.nie || '').trim();
        if (!nie || nie === 'N/A' || nie === '0') return;
        batch.set(_db.collection('alumnos_inmu').doc(nie), {
          nie,
          nombre:   a.nombre            || '',
          grado:    a.grado             || '',
          seccion:  _limpiarSeccion(a.seccion),
          sexo:     a.sexo              || '',
          telefono: a.telefono          || ''
        }, { merge: true });
        n++;
      });
      await batch.commit();
    }
    console.log('[FB-Docentes] ✅ Alumnos subidos a Firebase:', n);
    return n;
  }

  // ── Subir docentes a Firebase ──────────────────────────────────────────────
  async function _subirDocentes(lista) {
    if (!_listo || !_db || !lista || !lista.length) return 0;
    let n = 0;
    for (let i = 0; i < lista.length; i += 100) {
      const batch = _db.batch();
      lista.slice(i, i + 100).forEach(d => {
        if (!d.nombre) return;
        batch.set(_db.collection('docentes_inmu').doc(_normKey(d.nombre)), {
          nombre:            d.nombre            || '',
          grado:             d.grado             || '',
          seccion:           _limpiarSeccion(d.seccion),
          grado_orientado:   d.grado_orientado   || d.grado   || '',
          seccion_orientada: _limpiarSeccion(d.seccion_orientada || d.seccion),
          materia:           d.materia           || '',
          tipo_materia:      d.tipo_materia      || '0-10',
          escala:            d.escala            || d.tipo_materia || '0-10',
          admin:             d.admin === true    || d.admin === 'true',
          materias_asignadas: Array.isArray(d.materias_asignadas) ? d.materias_asignadas : []
        }, { merge: true });
        n++;
      });
      await batch.commit();
    }
    console.log('[FB-Docentes] ✅ Docentes subidos a Firebase:', n);
    return n;
  }

  // ── Poblar selector de docentes ────────────────────────────────────────────
  function _poblarSelect(lista) {
    const sel = document.getElementById('select-docente-inicio');
    if (!sel) return;
    let html = '<option value="">-- Seleccionar --</option>';
    lista.forEach(d => { html += `<option value="${_esc(d.nombre)}">${_esc(d.nombre)}</option>`; });
    sel.innerHTML = html;
  }

  // ── Aplicar datos al sistema ───────────────────────────────────────────────
  // IMPORTANTE: asignar con splice/push para modificar el array original
  // que la variable local del INDEX referencia, no crear uno nuevo.
  function _aplicar(docentes, alumnos, catalogo) {
    if (Array.isArray(docentes) && docentes.length) {
      // Modificar el array existente que baseDatosDocentes referencia
      const arrDoc = window.baseDatosDocentes;
      arrDoc.splice(0, arrDoc.length, ...docentes);
      _poblarSelect(docentes);
      if (typeof window.inicializarMateriasUI === 'function') window.inicializarMateriasUI();
    }
    if (Array.isArray(alumnos) && alumnos.length) {
      const limpios = _limpiarAlumnos(alumnos);
      limpios.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      // Modificar el array existente que baseDatosAlumnos referencia
      const arrAlu = window.baseDatosAlumnos;
      arrAlu.splice(0, arrAlu.length, ...limpios);
      if (typeof window.cargarAlumnos === 'function') window.cargarAlumnos();
    }
    if (Array.isArray(catalogo) && catalogo.length) {
      const arrCat = window.catalogoMaterias;
      arrCat.splice(0, arrCat.length, ...catalogo);
    } else if (typeof window.getCatalogoMateriasFallback === 'function') {
      const fb = window.getCatalogoMateriasFallback();
      const arrCat = window.catalogoMaterias;
      arrCat.splice(0, arrCat.length, ...fb);
    }
  }

  // ── Carga principal ────────────────────────────────────────────────────────
  async function _inicializar() {
    if (window.sistemaEnMantenimiento) return;

    const sel  = document.getElementById('select-docente-inicio');
    const cont = document.getElementById('tabla-alumnos');
    if (sel)  sel.innerHTML  = '<option value="">⚡ Cargando...</option>';
    if (cont) cont.innerHTML = '<div style="padding:20px;text-align:center;color:#185FA5;font-weight:bold;">⚡ Cargando datos...</div>';

    // ── Intentar Firebase ────────────────────────────────────────────────────
    if (_listo && _db) {
      try {
        const [docentes, alumnos, cfgSnap] = await Promise.all([
          _leerCol('docentes_inmu'),
          _leerCol('alumnos_inmu'),
          _race(_db.collection('config_inmu').doc('catalogo_materias').get(), TIMEOUT_FB).catch(() => null)
        ]);
        const catalogo = cfgSnap && cfgSnap.exists ? (cfgSnap.data().items || []) : [];

        console.log('[FB-Docentes] Firebase → docentes:', docentes.length, '| alumnos:', alumnos.length);

        if (docentes.length > 0 && alumnos.length > 0) {
          _aplicar(docentes, alumnos, catalogo);
          _guardarCacheDocentes(docentes, catalogo);   // guardar en caché local
          console.log('[FB-Docentes] ✅ Cargado desde Firebase');

          // Corregir secciones en Firebase en segundo plano si hay datos sucios
          const sucios = alumnos.filter(a => (a.seccion||'').includes('"'));
          if (sucios.length > 0) {
            console.log('[FB-Docentes] Corrigiendo', sucios.length, 'secciones sucias en Firebase...');
            setTimeout(async () => {
              try {
                for (let i = 0; i < sucios.length; i += 400) {
                  const batch = _db.batch();
                  sucios.slice(i, i + 400).forEach(a => {
                    batch.update(_db.collection('alumnos_inmu').doc(String(a.nie)), {
                      seccion: _limpiarSeccion(a.seccion)
                    });
                  });
                  await batch.commit();
                }
                console.log('[FB-Docentes] ✅ Secciones corregidas en Firebase');
              } catch(e) { console.warn('[FB-Docentes] Error corrigiendo secciones:', e.message); }
            }, 3000);
          }
          return;
        }

        // Firebase tiene docentes pero no alumnos
        if (docentes.length > 0 && alumnos.length === 0) {
          console.warn('[FB-Docentes] Sin alumnos en Firebase → GAS');
          window.baseDatosDocentes = docentes;
          _poblarSelect(docentes);
          if (typeof window.inicializarMateriasUI === 'function') window.inicializarMateriasUI();
          const aluGAS = await _fetchGAS('alumnos').catch(() => []);
          if (aluGAS.length) {
            _aplicar(null, aluGAS, catalogo);
            setTimeout(() => _subirAlumnos(aluGAS).catch(() => {}), 2000);
          }
          return;
        }

        console.warn('[FB-Docentes] Firebase vacío → GAS completo');
      } catch (e) {
        console.warn('[FB-Docentes] Firebase falló (' + e.message + ') → GAS');
      }
    }

    // ── Fallback GAS ─────────────────────────────────────────────────────────
    try {
      console.log('[FB-Docentes] Cargando desde GAS...');
      if (sel)  sel.innerHTML  = '<option value="">⏳ Cargando docentes...</option>';
      if (cont) cont.innerHTML = '<div style="padding:20px;text-align:center;color:#185FA5;font-weight:bold;">⏳ Cargando datos...</div>';

      const [docentes, alumnos, catalogo] = await Promise.all([
        _fetchGAS('docentes'),
        _fetchGAS('alumnos'),
        _fetchGAS('catalogo_materias').catch(() => [])
      ]);

      console.log('[FB-Docentes] GAS → docentes:', docentes.length, '| alumnos:', alumnos.length);

      // Si GAS devuelve 0 docentes, usar caché localStorage como respaldo
      let docentesFinales = docentes;
      let catalogoFinal   = catalogo;
      if (!docentes.length) {
        const cache = _leerCacheDocentes();
        if (cache.docentes && cache.docentes.length) {
          console.warn('[FB-Docentes] GAS devolvió 0 docentes → usando caché local (' + cache.docentes.length + ')');
          docentesFinales = cache.docentes;
          if (!catalogoFinal.length && cache.catalogo) catalogoFinal = cache.catalogo;
        } else {
          // Último recurso: usar baseDatosDocentes que ya tenga el INDEX en memoria
          const memDoc = (window.baseDatosDocentes || []).filter(d => d.nombre);
          if (memDoc.length) {
            console.warn('[FB-Docentes] GAS sin docentes → usando memoria (' + memDoc.length + ')');
            docentesFinales = memDoc;
          }
        }
      }
      _aplicar(docentesFinales, alumnos, catalogoFinal);
      if (docentesFinales.length) _guardarCacheDocentes(docentesFinales, catalogoFinal);

      // Subir a Firebase en segundo plano
      setTimeout(async () => {
        try {
          await _subirDocentes(docentesFinales);
          await _subirAlumnos(alumnos);
          if (_listo && _db && catalogo.length) {
            await _db.collection('config_inmu').doc('catalogo_materias')
              .set({ items: catalogo, actualizado: new Date().toISOString() }, { merge: true });
          }
          console.log('[FB-Docentes] ✅ Datos del GAS sincronizados a Firebase.');
        } catch (e) { console.warn('[FB-Docentes] Error sincronizando a Firebase:', e.message); }
      }, 3000);

    } catch (e) {
      console.error('[FB-Docentes] GAS también falló:', e.message);
      if (sel)  sel.innerHTML  = '<option value="">❌ Sin conexión — reintentando...</option>';
      if (cont) cont.innerHTML = '<div style="padding:20px;text-align:center;color:red;">Sin conexión. Reintentando...</div>';
      setTimeout(() => _inicializar(), 8000);
    }
  }

  // ── Esperar funciones del INDEX e interceptar ──────────────────────────────
  function _esperarEInicializar() {
    const MAX = 40; let t = 0;
    function intentar() {
      if (typeof window.inicializarBaseDatos === 'function' &&
          typeof window.cargarAlumnos        === 'function') {

        // Reemplazar inicializarBaseDatos
        window.inicializarBaseDatos = _inicializar;
        console.log('[FB-Docentes] inicializarBaseDatos reemplazada ✓');

        // Reemplazar entrarComoDocenteDropdown
        if (typeof window.entrarComoDocenteDropdown === 'function') {
          window.entrarComoDocenteDropdown = async function (sel) {
            if (sel === null || sel === undefined) {
              sel = document.getElementById('select-docente-inicio')?.value;
            }
            if (!sel) return alert('Por favor, seleccione una opción.');

            if (sel !== 'Invitado') {
              // Buscar en memoria
              let doc = (window.baseDatosDocentes || []).find(d => d.nombre === sel);

              // SIEMPRE verificar bloqueado_reparacion en Firebase en vivo (no confiar en caché)
              let bloqueado = false;
              if (_listo && _db) {
                try {
                  const snapVivo = await _db.collection('docentes_inmu').doc(_normKey(sel)).get();
                  if (snapVivo.exists) {
                    const dataVivo = snapVivo.data();
                    bloqueado = !!dataVivo.bloqueado_reparacion;
                    // Actualizar doc local con datos frescos
                    doc = dataVivo;
                    const idx = (window.baseDatosDocentes || []).findIndex(d => d.nombre === sel);
                    if (idx !== -1) window.baseDatosDocentes[idx] = dataVivo;
                    else if (window.baseDatosDocentes) window.baseDatosDocentes.push(dataVivo);
                  } else if (doc) {
                    bloqueado = !!doc.bloqueado_reparacion;
                  }
                } catch(e) {
                  console.warn('[FB-Docentes] Error verificando bloqueo:', e.message);
                  if (doc) bloqueado = !!doc.bloqueado_reparacion;
                }
              } else if (doc) {
                bloqueado = !!doc.bloqueado_reparacion;
              }

              if (doc) {
                window.usuarioAdmin = doc.admin === true || doc.admin === 'true';
                if (typeof window.aplicarDatosDocenteSeleccionado === 'function') {
                  window.aplicarDatosDocenteSeleccionado(doc);
                }
              } else {
                window.usuarioAdmin = false;
                if (typeof window.aplicarDatosDocenteSeleccionado === 'function') {
                  window.aplicarDatosDocenteSeleccionado({ nombre: sel, admin: false });
                }
              }

              document.getElementById('modal-inicio-dropdown')?.classList.remove('open');
              if (typeof window.desbloquearInterfazMain === 'function') {
                window.desbloquearInterfazMain(sel, bloqueado);
              }
            } else {
              window.usuarioAdmin = false;
              const mi = document.getElementById('docente-materia');
              if (mi) mi.innerHTML = '<option value="">-- Seleccione la materia --</option>';
              document.getElementById('modal-inicio-dropdown')?.classList.remove('open');
              if (typeof window.desbloquearInterfazMain === 'function') {
                window.desbloquearInterfazMain('invitado', false);
              }
            }
          };
          console.log('[FB-Docentes] entrarComoDocenteDropdown reemplazada ✓');
        }

        // Interceptar guardar/eliminar docente vía fetch POST
        if (!window._fbDocFetchPatched) {
          window._fbDocFetchPatched = true;
          const _origFetch = window.fetch;
          window.fetch = function (url, opts) {
            if (opts && opts.body && _listo && _db) {
              try {
                const body = JSON.parse(opts.body);
                if (body.tipo_post === 'guardar_docente' && body.nombre) {
                  _db.collection('docentes_inmu').doc(_normKey(body.nombre)).set({
                    nombre: body.nombre || '', grado: body.grado || '',
                    seccion: _limpiarSeccion(body.seccion),
                    grado_orientado: body.grado_orientado || body.grado || '',
                    seccion_orientada: _limpiarSeccion(body.seccion_orientada || body.seccion),
                    materia: body.materia || '', tipo_materia: body.tipo_materia || '0-10',
                    escala: body.tipo_materia || '0-10',
                    admin: body.admin === true || body.admin === 'true',
                    materias_asignadas: body.materias_asignadas || []
                  }, { merge: true }).catch(e => console.warn('[FB-Docentes] Error guardar:', e));
                }
                if (body.tipo_post === 'eliminar_docente' && body.nombre) {
                  _db.collection('docentes_inmu').doc(_normKey(body.nombre)).delete()
                    .catch(e => console.warn('[FB-Docentes] Error eliminar:', e));
                }
                if (body.tipo_post === 'guardar_catalogo_materias' && Array.isArray(body.catalogo)) {
                  _db.collection('config_inmu').doc('catalogo_materias')
                    .set({ items: body.catalogo, actualizado: new Date().toISOString() }, { merge: true })
                    .catch(e => console.warn('[FB-Docentes] Error catálogo:', e));
                }
              } catch (_) {}
            }
            return _origFetch.apply(this, arguments);
          };
          console.log('[FB-Docentes] fetch interceptado ✓');
        }

      } else if (t++ < MAX) {
        setTimeout(intentar, 300);
      } else {
        console.warn('[FB-Docentes] Timeout esperando funciones del INDEX');
      }
    }
    intentar();
  }

  // ── API pública ────────────────────────────────────────────────────────────
  window.FB_subirDocentes = async function () {
    const lista = window.baseDatosDocentes || [];
    if (!lista.length) { console.error('[FB-Docentes] baseDatosDocentes vacío'); return; }
    await _subirDocentes(lista);
  };

  window.FB_subirAlumnos = async function () {
    const lista = window.baseDatosAlumnos || [];
    if (!lista.length) { console.error('[FB-Docentes] baseDatosAlumnos vacío'); return; }
    await _subirAlumnos(lista);
  };

  window.FB_subirCatalogo = async function () {
    if (!_listo || !_db) { console.error('[FB-Docentes] Firebase no disponible'); return; }
    const catalogo = window.catalogoMaterias || [];
    if (!catalogo.length) { console.error('[FB-Docentes] catalogoMaterias vacío'); return; }
    await _db.collection('config_inmu').doc('catalogo_materias')
      .set({ items: catalogo, actualizado: new Date().toISOString() }, { merge: true });
    console.log('[FB-Docentes] ✅ Catálogo subido:', catalogo.length, 'materias.');
  };

  window.FB_refrescarTodo = async function () {
    FB_limpiarCache();
    await _inicializar();
  };

  window.FB_limpiarCache = function () {
    ['fb_cache_docentes_v2','fb_cache_catalogo_v2','fb_cache_alumnos_v2',
     'fb_cache_docentes','fb_cache_alumnos','fb_cache_catalogo'].forEach(k => {
      try { localStorage.removeItem(k); } catch(_) {}
    });
    console.log('[FB-Docentes] ✅ Caché limpiada.');
  };

  window.FB_SetAdmin = async function (nombre, esAdmin) {
    if (!_listo || !_db) { console.error('Firebase no disponible'); return; }
    await _db.collection('docentes_inmu').doc(_normKey(nombre))
      .set({ admin: esAdmin !== false }, { merge: true });
    console.log('[FB-Docentes] ✅ Admin=' + (esAdmin !== false) + ' para:', nombre);
  };

  // Corregir secciones sucias en Firebase (ejecutar una vez)
  window.FB_CorregirSecciones = async function () {
    if (!_listo || !_db) { console.error('Firebase no disponible'); return; }
    const snap = await _db.collection('alumnos_inmu').get();
    let n = 0;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = _db.batch();
      snap.docs.slice(i, i + 400).forEach(doc => {
        const d = doc.data();
        const limpia = _limpiarSeccion(d.seccion);
        if (limpia !== d.seccion) { batch.update(doc.ref, { seccion: limpia }); n++; }
      });
      await batch.commit();
    }
    console.log('[FB-Docentes] ✅ Secciones corregidas:', n);
    return n;
  };

  console.log('[FB-Docentes] Script cargado ✓');
  console.log('[FB-Docentes] Comandos: FB_refrescarTodo() | FB_limpiarCache() | FB_SetAdmin("NOMBRE") | FB_CorregirSecciones() | FB_subirDocentes() | FB_subirAlumnos()');
})();
