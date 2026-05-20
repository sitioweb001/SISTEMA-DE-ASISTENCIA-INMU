/**
 * SICA-INMU — firebase-docentes.js
 * Carga docentes, alumnos y catálogo desde Firebase con fallback automático al GAS.
 * Si Firebase falla o tiene 0 alumnos → usa el GAS y sube los datos a Firebase en segundo plano.
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

  const GAS_URL      = "https://script.google.com/macros/s/AKfycbxKnxasl94QOwaLx2QZMDNnfNG8NTtnWg1agE9shf9cyeYeP1PsgtUjbu4X94lXRSIM/exec";
  const TIMEOUT_FB   = 5000;  // 5 seg max esperando Firebase
  const TIMEOUT_GAS  = 12000; // 12 seg max esperando GAS

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
      console.warn('[FB-Docentes] Error init Firebase:', e.message);
    }
    // Interceptar funciones del INDEX después de que carguen
    _esperarEInicializar();
  })();

  // ── Promesa con timeout ────────────────────────────────────────────────────
  function _timeout(ms) {
    return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + ms + 'ms')), ms));
  }
  function _conTimeout(promesa, ms) {
    return Promise.race([promesa, _timeout(ms)]);
  }

  // ── Fetch con timeout ──────────────────────────────────────────────────────
  async function _fetchGAS(tipo, ms) {
    ms = ms || TIMEOUT_GAS;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(GAS_URL + '?tipo=' + tipo, { signal: ctrl.signal });
      clearTimeout(t);
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  // ── Leer colección completa de Firestore con timeout ──────────────────────
  async function _leerColeccion(nombre) {
    if (!_listo || !_db) throw new Error('Firebase no disponible');
    const snap = await _conTimeout(_db.collection(nombre).get(), TIMEOUT_FB);
    const lista = [];
    snap.forEach(doc => lista.push(doc.data()));
    return lista;
  }

  // ── Subir alumnos a Firestore en lotes ────────────────────────────────────
  async function _subirAlumnosFirebase(lista) {
    if (!_listo || !_db || !lista || !lista.length) return 0;
    let n = 0;
    for (let i = 0; i < lista.length; i += 400) {
      const batch = _db.batch();
      lista.slice(i, i + 400).forEach(a => {
        const nie = String(a.nie || '').trim();
        if (!nie || nie === 'N/A' || nie === '0') return;
        batch.set(_db.collection('alumnos_inmu').doc(nie), {
          nie,
          nombre:   a.nombre   || '',
          grado:    a.grado    || '',
          seccion:  a.seccion  || '',
          sexo:     a.sexo     || '',
          telefono: a.telefono || ''
        }, { merge: true });
        n++;
      });
      await batch.commit();
    }
    console.log('[FB-Docentes] ✅ Alumnos subidos a Firebase:', n);
    return n;
  }

  // ── Subir docentes a Firestore en lotes ───────────────────────────────────
  async function _subirDocentesFirebase(lista) {
    if (!_listo || !_db || !lista || !lista.length) return 0;
    const norm = s => (s||'').trim().toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'_')
      .replace(/_+/g,'_').replace(/^_|_$/g,'');
    let n = 0;
    for (let i = 0; i < lista.length; i += 100) {
      const batch = _db.batch();
      lista.slice(i, i + 100).forEach(d => {
        if (!d.nombre) return;
        batch.set(_db.collection('docentes_inmu').doc(norm(d.nombre)), {
          nombre:            d.nombre            || '',
          grado:             d.grado             || '',
          seccion:           d.seccion           || '',
          grado_orientado:   d.grado_orientado   || d.grado   || '',
          seccion_orientada: d.seccion_orientada || d.seccion || '',
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

  // ── Poblar el selector de docentes en el HTML ──────────────────────────────
  function _poblarSelectDocentes(lista) {
    const sel = document.getElementById('select-docente-inicio');
    if (!sel) return;
    let html = '<option value="">-- Seleccionar --</option>';
    lista.forEach(d => {
      const n = String(d.nombre || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      html += `<option value="${n}">${n}</option>`;
    });
    sel.innerHTML = html;
  }

  // ── Aplicar datos al sistema y actualizar UI ───────────────────────────────
  function _aplicarDatos(docentes, alumnos, catalogo) {
    // Docentes
    if (Array.isArray(docentes) && docentes.length > 0) {
      window.baseDatosDocentes = docentes;
      if (typeof window.inicializarMateriasUI === 'function') window.inicializarMateriasUI();
      _poblarSelectDocentes(docentes);
    }
    // Alumnos
    if (Array.isArray(alumnos) && alumnos.length > 0) {
      alumnos.sort((a, b) => (a.nombre||'').localeCompare(b.nombre||''));
      window.baseDatosAlumnos = alumnos;
      if (typeof window.cargarAlumnos === 'function') window.cargarAlumnos();
    }
    // Catálogo
    if (Array.isArray(catalogo) && catalogo.length > 0) {
      window.catalogoMaterias = catalogo;
    } else if (typeof window.getCatalogoMateriasFallback === 'function') {
      window.catalogoMaterias = window.getCatalogoMateriasFallback();
    }
  }

  // ── Cargar desde GAS ───────────────────────────────────────────────────────
  async function _cargarDesdeGAS() {
    console.log('[FB-Docentes] Cargando desde GAS...');
    const sel  = document.getElementById('select-docente-inicio');
    const cont = document.getElementById('tabla-alumnos');
    if (sel)  sel.innerHTML  = '<option value="">⏳ Cargando docentes...</option>';
    if (cont) cont.innerHTML = '<div style="padding:20px;text-align:center;color:#185FA5;font-weight:bold;">⏳ Sincronizando alumnos...</div>';

    const [docentes, alumnos, catalogo] = await Promise.all([
      _fetchGAS('docentes'),
      _fetchGAS('alumnos'),
      _fetchGAS('catalogo_materias').catch(() => [])
    ]);

    console.log('[FB-Docentes] GAS → docentes:', docentes.length, '| alumnos:', alumnos.length);
    _aplicarDatos(docentes, alumnos, catalogo);

    // Subir a Firebase en segundo plano (sin bloquear)
    setTimeout(async () => {
      try {
        await _subirDocentesFirebase(docentes);
        await _subirAlumnosFirebase(alumnos);
        if (_listo && _db && Array.isArray(catalogo) && catalogo.length) {
          await _db.collection('config_inmu').doc('catalogo_materias')
            .set({ items: catalogo, actualizado: new Date().toISOString() }, { merge: true });
        }
        console.log('[FB-Docentes] ✅ Datos del GAS sincronizados a Firebase en segundo plano.');
      } catch (e) {
        console.warn('[FB-Docentes] Error subiendo a Firebase:', e.message);
      }
    }, 2000);

    return { docentes, alumnos, catalogo };
  }

  // ── Cargar desde Firebase ──────────────────────────────────────────────────
  async function _cargarDesdeFirebase() {
    const [docentes, alumnos, cfgSnap] = await Promise.all([
      _leerColeccion('docentes_inmu'),
      _leerColeccion('alumnos_inmu'),
      _conTimeout(_db.collection('config_inmu').doc('catalogo_materias').get(), TIMEOUT_FB).catch(() => null)
    ]);
    const catalogo = cfgSnap && cfgSnap.exists ? (cfgSnap.data().items || []) : [];
    console.log('[FB-Docentes] Firebase → docentes:', docentes.length, '| alumnos:', alumnos.length);
    return { docentes, alumnos, catalogo };
  }

  // ── Función principal de carga ─────────────────────────────────────────────
  async function _inicializar() {
    if (window.sistemaEnMantenimiento) return;

    const sel  = document.getElementById('select-docente-inicio');
    const cont = document.getElementById('tabla-alumnos');
    if (sel)  sel.innerHTML  = '<option value="">⚡ Cargando...</option>';
    if (cont) cont.innerHTML = '<div style="padding:20px;text-align:center;color:#185FA5;font-weight:bold;">⚡ Cargando datos...</div>';

    // Intentar Firebase primero
    if (_listo && _db) {
      try {
        const { docentes, alumnos, catalogo } = await _cargarDesdeFirebase();

        // Firebase tiene datos completos → usarlos
        if (docentes.length > 0 && alumnos.length > 0) {
          _aplicarDatos(docentes, alumnos, catalogo);
          console.log('[FB-Docentes] ✅ Datos cargados desde Firebase');
          return;
        }

        // Firebase tiene docentes pero no alumnos → cargar alumnos del GAS
        if (docentes.length > 0 && alumnos.length === 0) {
          console.warn('[FB-Docentes] Firebase sin alumnos → cargando alumnos del GAS');
          _poblarSelectDocentes(docentes);
          window.baseDatosDocentes = docentes;
          if (typeof window.inicializarMateriasUI === 'function') window.inicializarMateriasUI();

          const aluGAS = await _fetchGAS('alumnos').catch(() => []);
          if (aluGAS.length > 0) {
            aluGAS.sort((a, b) => (a.nombre||'').localeCompare(b.nombre||''));
            window.baseDatosAlumnos = aluGAS;
            if (typeof window.cargarAlumnos === 'function') window.cargarAlumnos();
            // Subir alumnos a Firebase en segundo plano
            setTimeout(() => _subirAlumnosFirebase(aluGAS).catch(() => {}), 2000);
          }
          return;
        }

        // Firebase vacío → usar GAS completo
        console.warn('[FB-Docentes] Firebase vacío → usando GAS completo');
      } catch (e) {
        console.warn('[FB-Docentes] Firebase falló (' + e.message + ') → usando GAS');
      }
    }

    // Fallback: GAS completo
    try {
      await _cargarDesdeGAS();
    } catch (e) {
      console.error('[FB-Docentes] GAS también falló:', e.message);
      if (sel) sel.innerHTML = '<option value="">❌ Error de conexión — reintentando...</option>';
      if (cont) cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--red-600);">Error de conexión. Reintentando en 8 segundos...</div>';
      setTimeout(() => _inicializar(), 8000);
    }
  }

  // ── Esperar que el INDEX cargue sus funciones y luego interceptar ──────────
  function _esperarEInicializar() {
    const MAX = 40; let t = 0;
    function intentar() {
      if (typeof window.inicializarBaseDatos === 'function' &&
          typeof window.cargarAlumnos === 'function') {
        // Reemplazar inicializarBaseDatos con nuestra versión
        window.inicializarBaseDatos = _inicializar;
        console.log('[FB-Docentes] inicializarBaseDatos reemplazada ✓');

        // También interceptar el login por dropdown para leer admin desde Firebase
        if (typeof window.entrarComoDocenteDropdown === 'function') {
          const _origLogin = window.entrarComoDocenteDropdown;
          window.entrarComoDocenteDropdown = async function(sel) {
            if (sel === null || sel === undefined) sel = document.getElementById("select-docente-inicio")?.value;
            if (!sel) return alert("Por favor, seleccione una opción.");

            if (sel !== "Invitado") {
              // Buscar en memoria
              let doc = (window.baseDatosDocentes || []).find(d => d.nombre === sel);

              // Si no está en memoria, buscar en Firebase
              if (!doc && _listo && _db) {
                try {
                  const norm = s => (s||'').trim().toLowerCase().normalize('NFD')
                    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'_')
                    .replace(/_+/g,'_').replace(/^_|_$/g,'');
                  const snap = await _db.collection('docentes_inmu').doc(norm(sel)).get();
                  if (snap.exists) {
                    doc = snap.data();
                    // Agregar a memoria
                    if (!window.baseDatosDocentes) window.baseDatosDocentes = [];
                    window.baseDatosDocentes.push(doc);
                  }
                } catch(e) {
                  console.warn('[FB-Docentes] Error buscando docente:', e.message);
                }
              }

              if (doc) {
                window.usuarioAdmin = doc.admin === true || doc.admin === 'true';
                if (typeof window.aplicarDatosDocenteSeleccionado === 'function') {
                  window.aplicarDatosDocenteSeleccionado(doc);
                }
              } else {
                window.usuarioAdmin = false;
              }
            } else {
              window.usuarioAdmin = false;
            }

            document.getElementById("modal-inicio-dropdown")?.classList.remove('open');
            if (typeof window.desbloquearInterfazMain === 'function') {
              window.desbloquearInterfazMain(sel !== "Invitado" ? sel : "invitado");
            }
          };
          console.log('[FB-Docentes] entrarComoDocenteDropdown reemplazada ✓');
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
    await _subirDocentesFirebase(lista);
  };

  window.FB_subirAlumnos = async function () {
    const lista = window.baseDatosAlumnos || [];
    if (!lista.length) { console.error('[FB-Docentes] baseDatosAlumnos vacío'); return; }
    await _subirAlumnosFirebase(lista);
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
    console.log('[FB-Docentes] Refrescando todo...');
    await _inicializar();
  };

  window.FB_limpiarCache = function () {
    ['fb_cache_docentes_v2','fb_cache_catalogo_v2','fb_cache_alumnos_v2',
     'fb_cache_docentes','fb_cache_alumnos','fb_cache_catalogo'].forEach(k => {
      try { localStorage.removeItem(k); } catch(_) {}
    });
    console.log('[FB-Docentes] ✅ Caché limpiada.');
  };

  // Marcar docente como admin
  window.FB_SetAdmin = async function(nombre, esAdmin) {
    if (!_listo || !_db) { console.error('Firebase no disponible'); return; }
    const norm = s => (s||'').trim().toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'_')
      .replace(/_+/g,'_').replace(/^_|_$/g,'');
    await _db.collection('docentes_inmu').doc(norm(nombre))
      .set({ admin: esAdmin !== false }, { merge: true });
    console.log('[FB-Docentes] ✅ Admin=' + (esAdmin !== false) + ' para:', nombre);
  };

  console.log('[FB-Docentes] Script cargado ✓');
  console.log('[FB-Docentes] Comandos: FB_refrescarTodo() | FB_limpiarCache() | FB_SetAdmin("NOMBRE") | FB_subirDocentes() | FB_subirAlumnos()');
})();
