/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SICA-INMU — firebase-config.js
 * Módulo: Configuración, Mantenimiento y Horario en Tiempo Real
 * Fase 2-A | 2026
 *
 * REEMPLAZA:
 *   chequearMantenimientoNube()  → cold start 5-8 seg → < 0.3 seg
 *   toggle_mantenimiento POST   → tiempo real con onSnapshot
 *   toggle_login POST
 *   toggle_modo_alumno POST
 *   configurar_horario POST
 * ══════════════════════════════════════════════════════════════════════════════
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

let _cfgDb     = null;
let _cfgListo  = false;
let _unsubCfg  = null;

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

function _escucharConfigEnTiempoReal() {
  if (!_cfgDb) return;
  _unsubCfg = _cfgDb.collection('config_inmu').doc('sistema')
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const cfg = snap.data();
      try { localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfg)); } catch (_) {}
      _aplicarConfigEnUI(cfg);
      console.log('[FB-Config] Config actualizada en tiempo real:', cfg);
    }, e => console.warn('[FB-Config] Error listener config:', e));
}

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
        inicio: cfg.horario_inicio,
        fin:    cfg.horario_fin,
        activo: cfg.modo_alumno_activo !== false,
        acceso_alumnos: cfg.modo_alumno_activo !== false,
        mantenimiento:  cfg.mantenimiento === true
      }));
      const iI = document.getElementById('config-hora-inicio');
      const iF = document.getElementById('config-hora-fin');
      if (iI) iI.value = cfg.horario_inicio;
      if (iF) iF.value = cfg.horario_fin;
    } catch (_) {}
  }
  const btnToggle = document.getElementById('btn-toggle-login');
  if (btnToggle) {
    const loginOn = cfg.login_habilitado !== false;
    btnToggle.innerText = loginOn ? 'Desactivar Login' : 'Activar Login';
    btnToggle.style.background = loginOn ? 'var(--red-600)' : 'var(--green-600)';
  }
  const btnAlumno = document.getElementById('btn-toggle-alumno');
  if (btnAlumno) {
    const alumnoOn = cfg.modo_alumno_activo !== false;
    btnAlumno.textContent = alumnoOn ? '✅ Activo' : '🚫 Desactivado';
    btnAlumno.style.background = alumnoOn ? 'var(--green-600)' : 'var(--red-600)';
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
  document.getElementById('pantalla-mantenimiento')?.style?.setProperty('display', 'none');
  if (cfg && cfg.login_habilitado !== false) {
    document.getElementById('modal-inicio-login')?.classList.add('open');
  } else {
    document.getElementById('modal-inicio-login')?.classList.remove('open');
    document.getElementById('modal-inicio-dropdown')?.classList.add('open');
  }
}

(function interceptarChequeo() {
  const MAX = 25; let t = 0;
  function intentar() {
    if (typeof window.chequearMantenimientoNube === 'function') {
      const _orig = window.chequearMantenimientoNube;
      window.chequearMantenimientoNube = async function() {
        try {
          const cached = JSON.parse(localStorage.getItem(FB_CONFIG_CACHE_KEY) || 'null');
          if (cached) {
            console.log('[FB-Config] Config desde caché local (instantáneo) ✓');
            _aplicarConfigEnUI(cached);
            if (cached.mantenimiento !== true) {
              if (typeof inicializarBaseDatos === 'function') inicializarBaseDatos();
              setTimeout(() => { if (typeof restaurarSesionGuardada === 'function') restaurarSesionGuardada(); }, 500);
            }
            return;
          }
        } catch (_) {}
        if (_cfgListo && _cfgDb) {
          try {
            const snap = await _cfgDb.collection('config_inmu').doc('sistema').get();
            if (snap.exists) {
              const cfg = snap.data();
              localStorage.setItem(FB_CONFIG_CACHE_KEY, JSON.stringify(cfg));
              _aplicarConfigEnUI(cfg);
              if (cfg.mantenimiento !== true) {
                if (typeof inicializarBaseDatos === 'function') inicializarBaseDatos();
                setTimeout(() => { if (typeof restaurarSesionGuardada === 'function') restaurarSesionGuardada(); }, 500);
              }
              return;
            }
          } catch (e) {
            console.warn('[FB-Config] Firestore falló, usando GAS:', e);
          }
        }
        return _orig.call(this);
      };
      console.log('[FB-Config] chequearMantenimientoNube interceptada ✓');
    } else if (t++ < MAX) setTimeout(intentar, 400);
  }
  intentar();
})();

(function interceptarToggle() {
  const _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (opts && opts.body) {
      try {
        const body = JSON.parse(opts.body);
        if (body.tipo_post === 'toggle_mantenimiento' && _cfgListo && _cfgDb) {
          _cfgDb.collection('config_inmu').doc('sistema').get().then(snap => {
            const actual = snap.exists ? snap.data().mantenimiento : false;
            _cfgDb.collection('config_inmu').doc('sistema').set(
              { mantenimiento: !actual }, { merge: true }
            ).catch(e => console.warn('[FB-Config] Error toggle mantenimiento:', e));
          });
        }
        if (body.tipo_post === 'toggle_login' && _cfgListo && _cfgDb) {
          _cfgDb.collection('config_inmu').doc('sistema').get().then(snap => {
            const actual = snap.exists ? snap.data().login_habilitado : true;
            _cfgDb.collection('config_inmu').doc('sistema').set(
              { login_habilitado: !actual }, { merge: true }
            ).catch(e => console.warn('[FB-Config] Error toggle login:', e));
          });
        }
        if (body.tipo_post === 'toggle_modo_alumno' && _cfgListo && _cfgDb) {
          _cfgDb.collection('config_inmu').doc('sistema').set(
            { modo_alumno_activo: body.activo }, { merge: true }
          ).catch(e => console.warn('[FB-Config] Error toggle alumno:', e));
        }
        if (body.tipo_post === 'configurar_horario' && _cfgListo && _cfgDb) {
          _cfgDb.collection('config_inmu').doc('sistema').set({
            horario_inicio: body.inicio,
            horario_fin:    body.fin
          }, { merge: true }).catch(e => console.warn('[FB-Config] Error guardar horario:', e));
        }
      } catch (_) {}
    }
    return _origFetch.apply(this, arguments);
  };
  console.log('[FB-Config] fetch interceptado para config/toggle ✓');
})();

window.FB_subirConfigInicial = async function(opts) {
  if (!_cfgListo || !_cfgDb) { console.error('[FB-Config] Firebase no listo'); return; }
  opts = opts || {};
  const cfg = {
    mantenimiento:       opts.mantenimiento       ?? false,
    login_habilitado:    opts.login_habilitado    ?? true,
    modo_alumno_activo:  opts.modo_alumno_activo  ?? true,
    horario_inicio:      opts.horario_inicio      ?? '07:00',
    horario_fin:         opts.horario_fin         ?? '15:00'
  };
  await _cfgDb.collection('config_inmu').doc('sistema').set(cfg, { merge: true });
  console.log('[FB-Config] ✅ Config inicial subida a Firestore:', cfg);
};

console.log('[FB-Config] Módulo cargado ✓');
