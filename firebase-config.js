/**
 * SICA-INMU — firebase-config.js
 * Fase 2-A | 2026
 * CON TIMEOUT 3 SEG + FALLBACK AUTOMÁTICO si Firebase está offline
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
const FB_CONFIG_TIMEOUT   = 3000; // 3 seg máximo

let _cfgDb    = null;
let _cfgListo = false;
let _unsubCfg = null;

/* ── Config por defecto si Firebase no responde ─────────────────────────── */
const _CFG_DEFAULT = {
  mantenimiento:      false,
  login_habilitado:   true,
  modo_alumno_activo: true,
  horario_inicio:     '07:00',
  horario_fin:        '15:00'
};

/* ── Promesa con timeout ────────────────────────────────────────────────── */
function _cfgConTimeout(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Config timeout ' + ms + 'ms')), ms))
  ]);
}

/* ── Init ───────────────────────────────────────────────────────────────── */
(function initConfig() {
  if (!window.firebase) { setTimeout(initConfig, 600); return; }
  try {
    if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(FB_CFG);
    _cfgDb    = firebase.firestore();
    _cfgListo = true;
    _escucharConfigEnTiempoReal();
    console.log('[FB-Config] Listo ✓');
  } catch (e) {
    console.warn('[FB-Config] No disponible:', e);
  }
})();

/* ── Listener tiempo real ───────────────────────────────────────────────── */
function _escucharConfigEnTiempoReal() {
  if (!_cfgDb) return;
  _unsubCfg = _cfgDb.collection('config_inmu').doc('sistema')
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const cfg = snap.data();
      try { localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfg)); } catch (_) {}
      _aplicarConfigEnUI(cfg);
    }, e => console.warn('[FB-Config] Error listener:', e));
}

/* ── Aplicar config en UI ───────────────────────────────────────────────── */
function _aplicarConfigEnUI(cfg) {
  if (!cfg) return;
  if (cfg.mantenimiento === true) {
    _activarPantallaMantenimiento();
  } else {
    _desactivarPantallaMantenimiento(cfg);
  }
  if (cfg.horario_inicio && cfg.horario_fin) {
    try {
      localStorage.setItem('horario_asistencia', JSON.stringify({
        inicio: cfg.horario_inicio, fin: cfg.horario_fin,
        activo: cfg.modo_alumno_activo !== false,
        acceso_alumnos: cfg.modo_alumno_activo !== false,
        mantenimiento: cfg.mantenimiento === true
      }));
      const iI = document.getElementById('config-hora-inicio');
      const iF = document.getElementById('config-hora-fin');
      if (iI) iI.value = cfg.horario_inicio;
      if (iF) iF.value = cfg.horario_fin;
    } catch (_) {}
  }
  const btnL = document.getElementById('btn-toggle-login');
  if (btnL) {
    const on = cfg.login_habilitado !== false;
    btnL.innerText = on ? 'Desactivar Login' : 'Activar Login';
    btnL.style.background = on ? 'var(--red-600)' : 'var(--green-600)';
  }
  const btnA = document.getElementById('btn-toggle-alumno');
  if (btnA) {
    const on = cfg.modo_alumno_activo !== false;
    btnA.textContent = on ? '✅ Activo' : '🚫 Desactivado';
    btnA.style.background = on ? 'var(--green-600)' : 'var(--red-600)';
  }
}

function _activarPantallaMantenimiento() {
  if (typeof sistemaEnMantenimiento !== 'undefined') window.sistemaEnMantenimiento = true;
  const pm = document.getElementById('pantalla-mantenimiento');
  const hp = document.getElementById('header-principal');
  const cp = document.getElementById('container-principal');
  const fp = document.getElementById('footer-sistema');
  if (pm) pm.style.display = 'flex';
  if (hp) hp.style.display = 'none';
  if (cp) cp.style.display = 'none';
  if (fp) fp.style.display = 'none';
  document.getElementById('modal-inicio-login')?.classList.remove('open');
  document.getElementById('modal-inicio-dropdown')?.classList.remove('open');
  const mt = document.getElementById('mantenimiento-titulo');
  const mx = document.getElementById('mantenimiento-texto');
  if (mt) mt.innerText = 'SITIO EN MANTENIMIENTO';
  if (mx) mx.innerText = 'SISTEMA BLOQUEADO. POR FAVOR NO UTILIZAR.';
}

function _desactivarPantallaMantenimiento(cfg) {
  if (typeof sistemaEnMantenimiento !== 'undefined') window.sistemaEnMantenimiento = false;
  const pm = document.getElementById('pantalla-mantenimiento');
  if (pm) pm.style.display = 'none';
  if (cfg && cfg.login_habilitado !== false) {
    document.getElementById('modal-inicio-login')?.classList.add('open');
  } else {
    document.getElementById('modal-inicio-login')?.classList.remove('open');
    document.getElementById('modal-inicio-dropdown')?.classList.add('open');
  }
}

/* ── INTERCEPTAR chequearMantenimientoNube ──────────────────────────────── */
(function interceptarChequeo() {
  const MAX = 25; let t = 0;
  function intentar() {
    if (typeof window.chequearMantenimientoNube === 'function') {
      const _orig = window.chequearMantenimientoNube;
      window.chequearMantenimientoNube = async function () {

        // 1. Usar caché local INMEDIATAMENTE (< 1ms) — nunca bloquear
        let cfgCached = null;
        try { cfgCached = JSON.parse(localStorage.getItem(FB_CONFIG_CACHE_KEY) || 'null'); } catch (_) {}

        if (cfgCached) {
          console.log('[FB-Config] Config desde caché local ✓');
          // Si mantenimiento estaba activo en caché, verificar con Firebase antes de bloquear
          if (cfgCached.mantenimiento === true) {
            console.log('[FB-Config] Mantenimiento en caché — verificando con Firebase...');
            try {
              const snap = await _cfgConTimeout(
                _cfgDb.collection('config_inmu').doc('sistema').get(), FB_CONFIG_TIMEOUT
              );
              if (snap.exists) {
                cfgCached = snap.data();
                localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfgCached));
              }
            } catch (e) {
              // Firebase offline: si mantenimiento en caché, NO bloquear — usar default
              console.warn('[FB-Config] Firebase offline al verificar mantenimiento → desactivando mantenimiento por seguridad');
              cfgCached = { ...cfgCached, mantenimiento: false };
              localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfgCached));
            }
          }
          _aplicarConfigEnUI(cfgCached);
          if (cfgCached.mantenimiento !== true) {
            if (typeof inicializarBaseDatos    === 'function') inicializarBaseDatos();
            setTimeout(() => { if (typeof restaurarSesionGuardada === 'function') restaurarSesionGuardada(); }, 500);
          }
          return;
        }

        // 2. Sin caché → intentar Firebase con timeout
        if (_cfgListo && _cfgDb) {
          try {
            const snap = await _cfgConTimeout(
              _cfgDb.collection('config_inmu').doc('sistema').get(), FB_CONFIG_TIMEOUT
            );
            if (snap.exists) {
              const cfg = snap.data();
              localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfg));
              _aplicarConfigEnUI(cfg);
              if (cfg.mantenimiento !== true) {
                if (typeof inicializarBaseDatos    === 'function') inicializarBaseDatos();
                setTimeout(() => { if (typeof restaurarSesionGuardada === 'function') restaurarSesionGuardada(); }, 500);
              }
              return;
            }
          } catch (e) {
            console.warn('[FB-Config] Firebase timeout/offline → usando config por defecto + GAS fallback:', e.message);
          }
        }

        // 3. Firebase no disponible o sin datos → config por defecto y llamar GAS
        console.warn('[FB-Config] Usando config por defecto, llamando GAS...');
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

/* ── Interceptar toggles (POST al GAS) ─────────────────────────────────── */
(function interceptarToggle() {
  const _origFetch = window.fetch;
  window.fetch = function (url, opts) {
    if (opts && opts.body && _cfgListo && _cfgDb) {
      try {
        const body = JSON.parse(opts.body);
        const ref  = _cfgDb.collection('config_inmu').doc('sistema');
        if (body.tipo_post === 'toggle_mantenimiento') {
          ref.get().then(snap => {
            const actual = snap.exists ? snap.data().mantenimiento : false;
            ref.set({ mantenimiento: !actual }, { merge: true }).catch(() => {});
          });
        }
        if (body.tipo_post === 'toggle_login') {
          ref.get().then(snap => {
            const actual = snap.exists ? snap.data().login_habilitado : true;
            ref.set({ login_habilitado: !actual }, { merge: true }).catch(() => {});
          });
        }
        if (body.tipo_post === 'toggle_modo_alumno') {
          ref.set({ modo_alumno_activo: body.activo }, { merge: true }).catch(() => {});
        }
        if (body.tipo_post === 'configurar_horario') {
          ref.set({ horario_inicio: body.inicio, horario_fin: body.fin }, { merge: true }).catch(() => {});
        }
      } catch (_) {}
    }
    return _origFetch.apply(this, arguments);
  };
  console.log('[FB-Config] fetch interceptado para toggles ✓');
})();

/* ── API pública ────────────────────────────────────────────────────────── */
window.FB_subirConfigInicial = async function (opts) {
  if (!_cfgListo || !_cfgDb) { console.error('[FB-Config] Firebase no listo'); return; }
  opts = opts || {};
  const cfg = {
    mantenimiento:      opts.mantenimiento      ?? false,
    login_habilitado:   opts.login_habilitado   ?? true,
    modo_alumno_activo: opts.modo_alumno_activo ?? true,
    horario_inicio:     opts.horario_inicio     ?? '07:00',
    horario_fin:        opts.horario_fin        ?? '15:00'
  };
  await _cfgDb.collection('config_inmu').doc('sistema').set(cfg, { merge: true });
  console.log('[FB-Config] ✅ Config subida:', cfg);
};

/* ── Salida de emergencia: desactivar mantenimiento desde consola ────────── */
window.FB_SalirMantenimiento = function () {
  const cfg = { ..._CFG_DEFAULT, mantenimiento: false };
  try { localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfg)); } catch (_) {}
  if (_cfgListo && _cfgDb) {
    _cfgDb.collection('config_inmu').doc('sistema')
      .set({ mantenimiento: false }, { merge: true })
      .catch(() => {});
  }
  _desactivarPantallaMantenimiento(cfg);
  if (typeof inicializarBaseDatos === 'function') inicializarBaseDatos();
  console.log('[FB-Config] ✅ Mantenimiento desactivado de emergencia.');
};

console.log('[FB-Config] Módulo cargado ✓  |  Emergencia: FB_SalirMantenimiento()');
