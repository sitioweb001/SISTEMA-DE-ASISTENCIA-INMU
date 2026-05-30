/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SICA-INMU — firebase-asistencia.js
 * Versión: 3.0 — MODO AHORRO 2026
 *
 * CAMBIOS v3.0:
 *   ❌ ELIMINADO: onSnapshot() en portal de asistencia    → era lectura continua
 *   ❌ ELIMINADO: onSnapshot() en status docentes         → era lectura continua
 *   ✅ NUEVO: get() solo al presionar botón "Portal 🟢/🔴"
 *   ✅ NUEVO: Botón Portal con parpadeo rojo/verde en HTML puro (sin JS continuo)
 *   ✅ NUEVO: Status docentes con get() al abrir la pantalla, no listener
 *
 * RESULTADO: 0 lecturas pasivas → lecturas solo cuando el docente lo pide
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

  /* ── Estado interno ──────────────────────────────────────────────────────── */
  let _db            = null;
  let _listo         = false;
  let _portalActivo  = false;   // true = el docente tiene el panel portal abierto
  let _gradoActual   = '';
  let _seccionActual = '';

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
      _inyectarBotonPortal();
      console.log('[FB-Asistencia] Módulo v3.0 listo ✓ — MODO AHORRO (sin onSnapshot)');
    } catch (e) {
      console.warn('[FB-Asistencia] Error al inicializar:', e);
    }
  })();

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 1 — BOTÓN PORTAL CON PARPADEO ROJO / VERDE (HTML puro)
   * Sin JS continuo, sin setInterval — solo CSS animation
   * ═════════════════════════════════════════════════════════════════════════ */

  /**
   * Inyecta el CSS de parpadeo y el botón "Portal" en la UI.
   * El botón alterna entre estado INACTIVO (rojo parpadeante) y
   * ACTIVO (verde parpadeante) al presionarlo.
   */
  function _inyectarBotonPortal() {
    // Esperar a que el DOM esté listo
    const MAX = 30; let t = 0;
    function buscar() {
      // Buscar el contenedor donde va el botón (junto al botón de sincronizar)
      const contenedor = document.getElementById('btn-sync-asist')?.parentElement
                      || document.querySelector('.asistencia-toolbar')
                      || document.querySelector('.toolbar-asistencia');
      if (contenedor) {
        _crearBotonPortal(contenedor);
      } else if (t++ < MAX) {
        setTimeout(buscar, 400);
      }
    }
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', buscar)
      : buscar();
  }

  function _crearBotonPortal(contenedor) {
    // Evitar duplicados
    if (document.getElementById('btn-portal-asistencia')) return;

    /* ── CSS de parpadeo ── */
    if (!document.getElementById('portal-parpadeo-css')) {
      const style = document.createElement('style');
      style.id = 'portal-parpadeo-css';
      style.textContent = `
        /* Parpadeo rojo — portal INACTIVO */
        @keyframes portal-blink-rojo {
          0%, 100% { background-color: #dc2626; box-shadow: 0 0 0 0 rgba(220,38,38,0.7); }
          50%       { background-color: #b91c1c; box-shadow: 0 0 0 6px rgba(220,38,38,0); }
        }
        /* Parpadeo verde — portal ACTIVO */
        @keyframes portal-blink-verde {
          0%, 100% { background-color: #16a34a; box-shadow: 0 0 0 0 rgba(22,163,74,0.7); }
          50%       { background-color: #15803d; box-shadow: 0 0 0 6px rgba(22,163,74,0); }
        }
        #btn-portal-asistencia {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          cursor: pointer;
          transition: opacity 0.2s;
          margin-left: 6px;
        }
        #btn-portal-asistencia.portal-inactivo {
          animation: portal-blink-rojo 1.4s ease-in-out infinite;
        }
        #btn-portal-asistencia.portal-activo {
          animation: portal-blink-verde 1.4s ease-in-out infinite;
        }
        #btn-portal-asistencia:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          animation: none;
          background-color: #6b7280;
        }
        #btn-portal-asistencia .portal-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: rgba(255,255,255,0.85);
          flex-shrink: 0;
        }
      `;
      document.head.appendChild(style);
    }

    /* ── Botón ── */
    const btn = document.createElement('button');
    btn.id = 'btn-portal-asistencia';
    btn.className = 'portal-inactivo';
    btn.title = 'Ver quién marcó asistencia desde el portal hoy';
    btn.innerHTML = `<span class="portal-dot"></span> Portal 🔴`;

    btn.addEventListener('click', async () => {
      const grado   = (document.getElementById('grado-select')?.value   || '').trim();
      const seccion = (document.getElementById('seccion-select')?.value || '').trim();
      if (!grado || !seccion) {
        if (typeof mostrarNotificacion === 'function')
          mostrarNotificacion('Selecciona un grado y sección primero.', 'warning');
        return;
      }
      if (!_listo || !_db) {
        if (typeof mostrarNotificacion === 'function')
          mostrarNotificacion('Firebase no disponible.', 'error');
        return;
      }

      // Deshabilitar mientras carga
      btn.disabled = true;
      btn.innerHTML = `<span class="portal-dot"></span> Cargando...`;

      try {
        const mapa = await _getAsistenciaPortalHoy(grado, seccion);
        _pintarPortalEnUI(mapa);
        window._mapaPortalActual = mapa;

        const marcados = Object.keys(mapa).length;
        const total    = (window.alumnosFiltrados || []).length;

        // Activar estado verde
        _portalActivo  = true;
        _gradoActual   = grado;
        _seccionActual = seccion;
        btn.className  = 'portal-activo';
        btn.innerHTML  = `<span class="portal-dot"></span> Portal 🟢`;

        if (typeof mostrarNotificacion === 'function')
          mostrarNotificacion(`📡 Portal: ${marcados} de ${total} marcaron asistencia hoy.`, 'success', 4000);

        console.log(`[FB-Asistencia] Portal cargado con get() ✓ — ${marcados}/${total}`);
      } catch (err) {
        console.warn('[FB-Asistencia] Error al cargar portal:', err);
        btn.className = 'portal-inactivo';
        btn.innerHTML = `<span class="portal-dot"></span> Portal 🔴`;
        if (typeof mostrarNotificacion === 'function')
          mostrarNotificacion('Error al cargar portal. Intenta de nuevo.', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    // Volver a rojo si cambia grado o sección
    ['grado-select', 'seccion-select'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        _portalActivo = false;
        btn.className = 'portal-inactivo';
        btn.innerHTML = `<span class="portal-dot"></span> Portal 🔴`;
        // Limpiar indicadores de la tabla
        document.querySelectorAll('[id^="asist-portal-"]').forEach(el => {
          el.style.cssText = 'text-align:center;font-size:11px;font-weight:700;padding:2px 5px;border-radius:6px;color:#6b7280;background:#f3f4f6;';
          el.textContent = '—';
        });
      });
    });

    // Insertar después del botón de sincronizar si existe, o al final del contenedor
    const btnSync = document.getElementById('btn-sync-asist');
    if (btnSync && btnSync.parentElement === contenedor) {
      btnSync.insertAdjacentElement('afterend', btn);
    } else {
      contenedor.appendChild(btn);
    }

    console.log('[FB-Asistencia] Botón Portal inyectado ✓');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 2 — SINCRONIZAR ASISTENCIA (mantiene el botón original)
   * Ahora el botón original "📡 Sincronizar" sigue funcionando igual,
   * pero usa get() en vez de onSnapshot
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
            // Una sola consulta get(), sin listener
            const mapa = await _getAsistenciaPortalHoy(grado, seccion);
            _pintarPortalEnUI(mapa);
            window._mapaPortalActual = mapa;
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
        console.log('[FB-Asistencia] sincronizarAsistenciaAlumnos() interceptada ✓ — usa get()');
      } else if (t++ < MAX) {
        setTimeout(intentar, 400);
      }
    }
    intentar();
  }

  /**
   * Consulta Firestore UNA SOLA VEZ (get, no onSnapshot).
   * @returns {Object} mapa { [nie]: { estado, hora } }
   */
  async function _getAsistenciaPortalHoy(grado, seccion) {
    const hoy  = _fechaKey();
    const snap = await _db.collection('asistencia_alumnos_inmu')
      .where('fecha_key', '==', hoy)
      .where('grado', '==', grado)
      .where('seccion', '==', seccion)
      .get();   // ← get() no onSnapshot

    const mapa = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (d.nie) mapa[String(d.nie).trim()] = { estado: d.estado || 'presente', hora: d.hora || '' };
    });
    return mapa;
  }

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

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 3 — STATUS DOCENTES (get() en vez de onSnapshot)
   * Se lee UNA VEZ al cargar la página. Sin listener continuo.
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarStatusDocentes() {
    const MAX = 25; let t = 0;
    function intentar() {
      if (typeof window.actualizarStatusDocente === 'function' &&
          typeof window.obtenerStatusDocentes   === 'function') {

        // Reemplazar actualizarStatusDocente → escribe en Firestore (igual que antes)
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

        // Reemplazar obtenerStatusDocentes → get() UNA VEZ, sin listener
        window.obtenerStatusDocentes = async function () {
          if (!_listo || !_db) return;
          try {
            const INACTIVIDAD_MS = 5 * 60 * 1000;
            const ahora = Date.now();
            const snap = await _db.collection('presencia_docentes_inmu').get(); // get(), no onSnapshot
            if (typeof window.docentesStatus !== 'object') window.docentesStatus = {};

            snap.forEach(doc => {
              const d = doc.data();
              const nombre = d.docente || doc.id;
              let status = d.status || 'offline';
              if (status === 'online' && (ahora - (d.ultima_actividad || 0)) > INACTIVIDAD_MS) {
                status = 'offline';
                // Actualizar en Firestore silenciosamente (1 escritura, no lectura)
                _db.collection('presencia_docentes_inmu').doc(doc.id)
                  .set({ status: 'offline' }, { merge: true })
                  .catch(() => {});
              }
              window.docentesStatus[nombre] = status;
              if (!window.docentesIds) window.docentesIds = {};
              window.docentesIds[nombre] = doc.id;
            });

            if (typeof actualizarListaStatus === 'function') actualizarListaStatus();
            console.log('[FB-Asistencia] Status docentes cargado con get() ✓');
          } catch (e) {
            console.warn('[FB-Asistencia] Error al obtener status docentes:', e);
          }
        };

        // Cargar status una vez al inicio
        window.obtenerStatusDocentes();

        console.log('[FB-Asistencia] Status docentes → get() único al cargar ✓');
      } else if (t++ < MAX) {
        setTimeout(intentar, 500);
      }
    }
    intentar();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECCIÓN 4 — ESTUDIANTES EN PELIGRO (get() igual que antes, sin cambio)
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarEstudiantesPeligro() {
    const _origFetch = window.fetch;
    window.fetch = function (url, opts) {
      if (typeof url === 'string' && url.includes('tipo=estudiantes_peligro') && _listo && _db) {
        const urlObj = new URL(url, location.href);
        const grado   = urlObj.searchParams.get('grado')   || '';
        const seccion = urlObj.searchParams.get('seccion') || '';
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
   * SECCIÓN 5 — ACTUALIZAR ASISTENCIA (igual que antes)
   * ═════════════════════════════════════════════════════════════════════════ */

  function _interceptarActualizarAsistencia() {
    const _prev = window.fetch;
    window.fetch = function (url, opts) {
      if (opts && opts.body && _listo && _db) {
        try {
          const body = JSON.parse(opts.body);
          if (body.tipo_post === 'asistencia') {
            const ausentes = body.ausentes_lista || [];
            const grado    = body.grado   || '';
            const seccion  = body.seccion || '';
            ausentes.forEach(nombre => {
              _incrementarAusenciaFirestore(nombre, grado, seccion);
            });
          }
        } catch (_) {}
      }
      return _prev.apply(this, arguments);
    };
  }

  async function _incrementarAusenciaFirestore(nombre, grado, seccion) {
    if (!nombre || !grado) return;
    try {
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
   * SECCIÓN 6 — EXPOSICIÓN PÚBLICA
   * ═════════════════════════════════════════════════════════════════════════ */

  /** Fuerza una recarga manual del portal (equivalente a presionar el botón). */
  window.FB_activarPortal = function (grado, seccion) {
    const btn = document.getElementById('btn-portal-asistencia');
    if (btn) btn.click(); // simular clic al botón
    else {
      // Fallback directo si el botón no existe aún
      const g = grado || (document.getElementById('grado-select')?.value   || '').trim();
      const s = seccion || (document.getElementById('seccion-select')?.value || '').trim();
      if (g && s && _listo && _db) {
        _getAsistenciaPortalHoy(g, s).then(mapa => {
          _pintarPortalEnUI(mapa);
          window._mapaPortalActual = mapa;
        });
      }
    }
  };

  /** Recarga el status de docentes manualmente. */
  window.FB_recargarStatusDocentes = function () {
    if (typeof window.obtenerStatusDocentes === 'function') window.obtenerStatusDocentes();
  };

  /** Sube ausencias en batch (igual que antes). */
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
    const dd   = String(ahora.getDate()).padStart(2, '0');
    const mm   = String(ahora.getMonth() + 1).padStart(2, '0');
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

  console.log('[FB-Asistencia] Script v3.0 cargado ✓ — MODO AHORRO');
})();
