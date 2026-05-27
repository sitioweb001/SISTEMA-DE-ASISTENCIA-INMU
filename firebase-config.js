/**
 * SICA-INMU — firebase-config.js  v2 | 2026
 *
 * FIXES:
 *  1. El listener onSnapshot NO abre modales si el usuario ya está logueado
 *  2. _desactivarPantallaMantenimiento lee login_habilitado de Firebase y
 *     llama mostrarModalLogin() del INDEX (que tiene el guard de usuarioActual)
 *  3. toggleModoAlumno y toggleLogin actualizan caché ANTES de escribir a
 *     Firestore para que el listener no reactive el modal
 */

const FB_CFG = {
  apiKey:            "AIzaSyCXILuuU2UZUZxG8iGkFpGN_mljN_e1ESc",
  authDomain:        "sica-inmu-2026.firebaseapp.com",
  projectId:         "sica-inmu-2026",
  storageBucket:     "sica-inmu-2026.firebasestorage.app",
  messagingSenderId: "264940304462",
  appId:             "1:264940304462:web:643c263f1ad46139102b1f"
};

const FB_CONFIG_CACHE_KEY = 'fb_config_sistema';
const FB_CONFIG_TIMEOUT   = 3000;

let _cfgDb    = null;
let _cfgListo = false;
let _unsubCfg = null;

const _CFG_DEFAULT = {
  mantenimiento:      false,
  login_habilitado:   false,   // por defecto sin contraseña
  modo_alumno_activo: true,
  horario_inicio:     '07:00',
  horario_fin:        '15:00'
};

function _cfgConTimeout(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
}

/* ── Init ─────────────────────────────────────────────────────────────────── */
(function initConfig() {
  if (!window.firebase) { setTimeout(initConfig, 600); return; }
  try {
    if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(FB_CFG);
    _cfgDb    = firebase.firestore();
    _cfgListo = true;
    _escucharConfigEnTiempoReal();
    console.log('[FB-Config] Listo ✓');
  } catch (e) { console.warn('[FB-Config] No disponible:', e); }
})();

/* ── Listener tiempo real ─────────────────────────────────────────────────── */
function _escucharConfigEnTiempoReal() {
  if (!_cfgDb) return;
  _unsubCfg = _cfgDb.collection('config_inmu').doc('sistema')
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const cfg = snap.data();
      try { localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfg)); } catch (_) {}

      // ── GUARD: si el usuario ya está logueado, NO tocar modales ──────────
      if (window.usuarioActual && window.usuarioActual.trim()) {
        _aplicarConfigSoloUI(cfg);   // solo botones y horario
        return;
      }
      // Sin sesión → flujo completo (incluye modales)
      _aplicarConfigEnUI(cfg);

      // Si no hay mantenimiento y docentes aún no cargaron, disparar carga
      if (cfg.mantenimiento !== true && typeof inicializarBaseDatos === 'function') {
        var selDoc = document.getElementById('select-docente-inicio');
        var yaCargoDocentes = selDoc && selDoc.options.length > 1 &&
            !selDoc.options[0].text.includes('Cargando') &&
            !selDoc.options[0].text.includes('Descargando');
        if (!yaCargoDocentes) inicializarBaseDatos();
      }
    }, e => console.warn('[FB-Config] Error listener:', e));
}

/* ── Aplicar config completa (incluye modales) — solo sin sesión activa ───── */
function _aplicarConfigEnUI(cfg) {
  if (!cfg) return;
  if (cfg.mantenimiento === true) {
    _activarPantallaMantenimiento();
  } else {
    _desactivarPantallaMantenimiento(cfg);
  }
  _actualizarBotonesYHorario(cfg);
}

/* ── Aplicar config SIN tocar modales — cuando el admin ya está adentro ───── */
function _aplicarConfigSoloUI(cfg) {
  if (!cfg) return;
  // Si activaron mantenimiento desde otra pestaña, sí bloquear
  if (cfg.mantenimiento === true) { _activarPantallaMantenimiento(); return; }
  _actualizarBotonesYHorario(cfg);
}

/* ── Actualizar botones toggle y horario (nunca toca modales) ─────────────── */
function _actualizarBotonesYHorario(cfg) {
  if (!cfg) return;
  // Horario
  if (cfg.horario_inicio && cfg.horario_fin) {
    try {
      var horarioData = {
        inicio: cfg.horario_inicio, fin: cfg.horario_fin,
        activo: cfg.modo_alumno_activo !== false,
        acceso_alumnos: cfg.modo_alumno_activo !== false,
        mantenimiento: cfg.mantenimiento === true
      };
      localStorage.setItem('horario_asistencia', JSON.stringify(horarioData));
      // Sincronizar config_inmu/horario para que firebase-alumno.js lo lea
      if (_cfgListo && _cfgDb) {
        _cfgDb.collection('config_inmu').doc('horario')
          .set(horarioData, { merge: true }).catch(function(){});
      }
      var iI = document.getElementById('config-hora-inicio');
      var iF = document.getElementById('config-hora-fin');
      if (iI) iI.value = cfg.horario_inicio;
      if (iF) iF.value = cfg.horario_fin;
    } catch (_) {}
  }
  // Botón login
  var btnL = document.getElementById('btn-toggle-login');
  if (btnL) {
    var onL = cfg.login_habilitado !== false;
    btnL.innerText = onL ? 'Desactivar Login' : 'Activar Login';
    btnL.style.background = onL ? 'var(--red-600)' : 'var(--green-600)';
  }
  // Botón modo alumno
  var btnA = document.getElementById('btn-toggle-alumno');
  if (btnA) {
    var onA = cfg.modo_alumno_activo !== false;
    btnA.textContent = onA ? '✅ Activo' : '🚫 Desactivado';
    btnA.style.background = onA ? 'var(--green-600)' : 'var(--red-600)';
    localStorage.setItem('alumno_acceso', onA ? 'true' : 'false');
  }
  // Label acceso alumnos
  var lbl = document.getElementById('acceso-estado-lbl');
  if (lbl && cfg.modo_alumno_activo !== undefined) {
    var onLbl = cfg.modo_alumno_activo !== false;
    lbl.textContent = onLbl ? '🟢 Portal de alumnos ACTIVO' : '🔴 Portal de alumnos DESACTIVADO';
    lbl.style.color = onLbl ? '#166534' : '#991b1b';
  }
}

function _activarPantallaMantenimiento() {
  if (typeof window.sistemaEnMantenimiento !== 'undefined') window.sistemaEnMantenimiento = true;
  var pm = document.getElementById('pantalla-mantenimiento');
  var hp = document.getElementById('header-principal');
  var cp = document.getElementById('container-principal');
  var fp = document.getElementById('footer-sistema');
  if (pm) pm.style.display = 'flex';
  if (hp) hp.style.display = 'none';
  if (cp) cp.style.display = 'none';
  if (fp) fp.style.display = 'none';
  var ml = document.getElementById('modal-inicio-login');
  var md = document.getElementById('modal-inicio-dropdown');
  if (ml) ml.classList.remove('open');
  if (md) md.classList.remove('open');
  var mt = document.getElementById('mantenimiento-titulo');
  var mx = document.getElementById('mantenimiento-texto');
  if (mt) mt.innerText = 'SITIO EN MANTENIMIENTO';
  if (mx) mx.innerText = 'SISTEMA BLOQUEADO. POR FAVOR NO UTILIZAR.';
}

function _desactivarPantallaMantenimiento(cfg) {
  if (typeof window.sistemaEnMantenimiento !== 'undefined') window.sistemaEnMantenimiento = false;
  var pm = document.getElementById('pantalla-mantenimiento');
  if (pm) pm.style.display = 'none';

  // Sincronizar loginRequerido con el valor de Firebase
  if (cfg && typeof cfg.login_habilitado === 'boolean') {
    window.loginRequerido = cfg.login_habilitado;
  }

  // Cargar datos si aún no están cargados
  if (typeof inicializarBaseDatos === 'function') {
    var selDoc = document.getElementById('select-docente-inicio');
    var yaCargoDocentes = selDoc && selDoc.options.length > 1 &&
        !selDoc.options[0].text.includes('Cargando') &&
        !selDoc.options[0].text.includes('Descargando');
    if (!yaCargoDocentes) {
      inicializarBaseDatos();
    }
  }

  // Usar mostrarModalLogin() del INDEX — tiene el guard de usuarioActual
  if (typeof window.mostrarModalLogin === 'function') {
    window.mostrarModalLogin();
  } else {
    // Fallback si el INDEX aún no cargó la función
    var loginOn = cfg && cfg.login_habilitado !== false;
    var ml = document.getElementById('modal-inicio-login');
    var md = document.getElementById('modal-inicio-dropdown');
    if (loginOn) {
      if (ml) ml.classList.add('open');
      if (md) md.classList.remove('open');
    } else {
      if (ml) ml.classList.remove('open');
      if (md) md.classList.add('open');
    }
  }
}

/* ── INTERCEPTAR chequearMantenimientoNube ────────────────────────────────── */
(function interceptarChequeo() {
  var MAX = 25; var t = 0;
  function intentar() {
    if (typeof window.chequearMantenimientoNube === 'function') {
      var _orig = window.chequearMantenimientoNube;
      window.chequearMantenimientoNube = async function () {

        // 1. Usar caché local inmediatamente
        var cfgCached = null;
        try { cfgCached = JSON.parse(localStorage.getItem(FB_CONFIG_CACHE_KEY) || 'null'); } catch (_) {}

        if (cfgCached) {
          console.log('[FB-Config] Config desde caché ✓ login_habilitado=' + cfgCached.login_habilitado);
          if (cfgCached.mantenimiento === true) {
            // ── SIEMPRE verificar con Firebase antes de mostrar la pantalla de mantenimiento ──
            // Si Firebase no responde (cuota excedida / offline), NO bloquear — usar login normal.
            try {
              var snap = await _cfgConTimeout(
                _cfgDb.collection('config_inmu').doc('sistema').get(), FB_CONFIG_TIMEOUT
              );
              if (snap.exists) {
                cfgCached = snap.data();
                localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfgCached));
              }
            } catch (e) {
              // Firebase no respondió → limpiar mantenimiento de caché y continuar con login
              console.warn('[FB-Config] Firebase no respondió para verificar mantenimiento. Ignorando caché y mostrando login.', e.message);
              cfgCached = Object.assign({}, cfgCached, { mantenimiento: false });
              localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfgCached));
            }
          }
          _aplicarConfigEnUI(cfgCached);
          if (cfgCached.mantenimiento !== true) {
            if (typeof inicializarBaseDatos === 'function') inicializarBaseDatos();
            setTimeout(function() {
              if (typeof restaurarSesionGuardada === 'function') restaurarSesionGuardada();
            }, 500);
          }
          return;
        }

        // 2. Sin caché → Firebase con timeout
        if (_cfgListo && _cfgDb) {
          try {
            var snap2 = await _cfgConTimeout(
              _cfgDb.collection('config_inmu').doc('sistema').get(), FB_CONFIG_TIMEOUT
            );
            if (snap2.exists) {
              var cfg2 = snap2.data();
              localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfg2));
              _aplicarConfigEnUI(cfg2);
              if (cfg2.mantenimiento !== true) {
                if (typeof inicializarBaseDatos === 'function') inicializarBaseDatos();
                setTimeout(function() {
                  if (typeof restaurarSesionGuardada === 'function') restaurarSesionGuardada();
                }, 500);
              }
              return;
            }
          } catch (e) {
            console.warn('[FB-Config] Firebase timeout → GAS fallback:', e.message);
          }
        }

        // 3. Fallback: config por defecto + GAS
        console.warn('[FB-Config] Usando config por defecto.');
        _aplicarConfigEnUI(_CFG_DEFAULT);
        return _orig.call(this);
      };
      console.log('[FB-Config] chequearMantenimientoNube interceptada ✓');
    } else if (t++ < MAX) {
      setTimeout(intentar, 400);
    }
  }
  intentar();
})();

/* ── Interceptar fetch para toggles → escribir en Firestore ──────────────── */
(function interceptarToggle() {
  var _origFetch = window.fetch;
  window.fetch = function (url, opts) {
    if (opts && opts.body && _cfgListo && _cfgDb) {
      try {
        var body = JSON.parse(opts.body);
        var ref  = _cfgDb.collection('config_inmu').doc('sistema');

        if (body.tipo_post === 'toggle_mantenimiento') {
          ref.get().then(function(snap) {
            var actual = snap.exists ? snap.data().mantenimiento : false;
            ref.set({ mantenimiento: !actual }, { merge: true }).catch(function(){});
          });
        }
        if (body.tipo_post === 'toggle_login') {
          // Leer estado actual de caché para actualizar correctamente
          ref.get().then(function(snap) {
            var actual = snap.exists ? (snap.data().login_habilitado !== false) : true;
            var nuevo  = !actual;
            // Actualizar caché ANTES para que el listener no reactive el modal
            try {
              var cached = JSON.parse(localStorage.getItem(FB_CONFIG_CACHE_KEY) || '{}');
              cached.login_habilitado = nuevo;
              localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cached));
            } catch(_) {}
            ref.set({ login_habilitado: nuevo }, { merge: true }).catch(function(){});
          });
        }
        if (body.tipo_post === 'toggle_modo_alumno') {
          // Actualizar caché ANTES
          try {
            var cached2 = JSON.parse(localStorage.getItem(FB_CONFIG_CACHE_KEY) || '{}');
            cached2.modo_alumno_activo = body.activo;
            localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cached2));
          } catch(_) {}
          ref.set({ modo_alumno_activo: body.activo }, { merge: true }).catch(function(){});
        }
        if (body.tipo_post === 'configurar_horario') {
          // Guardar en config_inmu/sistema (para INDEX_DOCENTE)
          ref.set({ horario_inicio: body.inicio, horario_fin: body.fin }, { merge: true }).catch(function(){});
          // También guardar en config_inmu/horario (para firebase-alumno.js del portal alumno)
          _cfgDb.collection('config_inmu').doc('horario').set({
            inicio:         body.inicio,
            fin:            body.fin,
            activo:         true,
            acceso_alumnos: true,
            mantenimiento:  false
          }, { merge: true }).catch(function(){});
        }
      } catch (_) {}
    }
    return _origFetch.apply(this, arguments);
  };
  console.log('[FB-Config] fetch interceptado ✓');
})();

/* ── API pública ──────────────────────────────────────────────────────────── */
window.FB_subirConfigInicial = async function (opts) {
  if (!_cfgListo || !_cfgDb) { console.error('[FB-Config] Firebase no listo'); return; }
  opts = opts || {};
  var cfg = {
    mantenimiento:      opts.mantenimiento      !== undefined ? opts.mantenimiento      : false,
    login_habilitado:   opts.login_habilitado   !== undefined ? opts.login_habilitado   : false,
    modo_alumno_activo: opts.modo_alumno_activo !== undefined ? opts.modo_alumno_activo : true,
    horario_inicio:     opts.horario_inicio     || '07:00',
    horario_fin:        opts.horario_fin        || '15:00'
  };
  await _cfgDb.collection('config_inmu').doc('sistema').set(cfg, { merge: true });
  console.log('[FB-Config] ✅ Config subida:', cfg);
};

window.FB_SalirMantenimiento = function () {
  var cfg = Object.assign({}, _CFG_DEFAULT, { mantenimiento: false });
  try { localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfg)); } catch (_) {}
  if (_cfgListo && _cfgDb) {
    _cfgDb.collection('config_inmu').doc('sistema')
      .set({ mantenimiento: false }, { merge: true }).catch(function(){});
  }
  _desactivarPantallaMantenimiento(cfg);
  if (typeof inicializarBaseDatos === 'function') inicializarBaseDatos();
  console.log('[FB-Config] ✅ Mantenimiento desactivado.');
};

/* ── Forzar login_habilitado=false en Firestore desde consola ────────────── */
window.FB_DesactivarLoginPassword = async function() {
  if (!_cfgListo || !_cfgDb) { console.error('Firebase no listo'); return; }
  try {
    var cached = JSON.parse(localStorage.getItem(FB_CONFIG_CACHE_KEY) || '{}');
    cached.login_habilitado = false;
    localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cached));
  } catch(_) {}
  await _cfgDb.collection('config_inmu').doc('sistema').set({ login_habilitado: false }, { merge: true });
  console.log('[FB-Config] ✅ Login con contraseña DESACTIVADO. Recarga la página.');
};

console.log('[FB-Config] v2 cargado ✓');
console.log('[FB-Config] Para desactivar login con contraseña: await FB_DesactivarLoginPassword()');
console.log('[FB-Config] Emergencia mantenimiento: FB_SalirMantenimiento()');
