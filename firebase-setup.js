/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SICA-INMU — firebase-setup.js
 * Script de Configuración y Migración Inicial Completa
 * Ejecutar UNA SOLA VEZ en la consola del navegador
 * 2026
 *
 * INSTRUCCIONES:
 * 1. Abrir INDEX_DOCENTE.html con todos los firebase-*.js ya incluidos
 * 2. Esperar que el sistema cargue datos del GAS completamente
 * 3. Abrir la consola del navegador (F12)
 * 4. Pegar y ejecutar este script:
 *      await FB_MigracionCompleta()
 *
 * QUÉ HACE:
 *   Paso 1 → Sube config/sistema a Firestore (mantenimiento, horario, login)
 *   Paso 2 → Sube catálogo de materias a Firestore
 *   Paso 3 → Sube docentes a Firestore (los que ya están en baseDatosDocentes)
 *   Paso 4 → Sube alumnos a Firestore (los que ya están en baseDatosAlumnos)
 *   Paso 5 → Migra reportes históricos del GAS a Firestore
 *   Paso 6 → Migra informes históricos del GAS a Firestore
 *   Paso 7 → Verifica que todo esté correcto
 *
 * RESULTADO: el sistema funciona completamente desde Firebase
 *            (el GAS queda como respaldo para escrituras: PDFs, Excel, Sheets)
 * ══════════════════════════════════════════════════════════════════════════════
 */

/* ── Inicializar Firebase directamente (por si se ejecuta desde consola) ───── */
const _SETUP_CFG = {
  apiKey:            "AIzaSyCXILuuU2UZUZxG8iGkFpGN_mljN_e1ESc",
  authDomain:        "sica-inmu-2026.firebaseapp.com",
  projectId:         "sica-inmu-2026",
  storageBucket:     "sica-inmu-2026.firebasestorage.app",
  messagingSenderId: "264940304462",
  appId:             "1:264940304462:web:643c263f1ad46139102b1f"
};

(function() {
  if (!window.firebase) { console.error('[Setup] Firebase SDK no disponible. Incluye los scripts de Firebase antes de este archivo.'); return; }
  try {
    if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(_SETUP_CFG);
  } catch(e) {}
})();

/* ══════════════════════════════════════════════════════════════════════════════
 * MIGRACIÓN COMPLETA — función principal
 * ════════════════════════════════════════════════════════════════════════════ */

window.FB_MigracionCompleta = async function(opciones) {
  const opts = Object.assign({
    saltarAlumnos:   false,
    saltarDocentes:  false,
    saltarCatalogo:  false,
    saltarConfig:    false,
    saltarReportes:  false,
    saltarInformes:  false,
    horarioInicio:   '07:00',
    horarioFin:      '15:00'
  }, opciones || {});

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       SICA-INMU — MIGRACIÓN COMPLETA A FIREBASE      ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const db = firebase.firestore();
  const errores = [];

  /* ── PASO 1: Configuración del sistema ──────────────────────────────────── */
  if (!opts.saltarConfig) {
    console.log('\n▶ PASO 1 — Subiendo configuración del sistema...');
    try {
      const config = {
        mantenimiento:      false,
        login_habilitado:   true,
        modo_alumno_activo: true,
        horario_inicio:     opts.horarioInicio,
        horario_fin:        opts.horarioFin,
        actualizado:        new Date().toISOString()
      };
      await db.collection('config_inmu').doc('sistema').set(config, { merge: true });
      console.log('  ✅ Config subida:', config);
    } catch (e) {
      console.error('  ❌ Error config:', e);
      errores.push('config_sistema: ' + e.message);
    }
  } else {
    console.log('\n⏭  PASO 1 — Saltando config (saltarConfig=true)');
  }

  /* ── PASO 2: Catálogo de materias ───────────────────────────────────────── */
  if (!opts.saltarCatalogo) {
    console.log('\n▶ PASO 2 — Subiendo catálogo de materias...');
    try {
      if (typeof FB_subirCatalogo === 'function') {
        await FB_subirCatalogo();
      } else {
        // Catálogo hardcodeado como fallback
        const catalogo = _getCatalogoDefault();
        await db.collection('config_inmu').doc('catalogo_materias').set({
          items: catalogo,
          actualizado: new Date().toISOString()
        }, { merge: true });
        console.log('  ✅ Catálogo subido (default):', catalogo.length, 'materias');
      }
    } catch (e) {
      console.error('  ❌ Error catálogo:', e);
      errores.push('catalogo_materias: ' + e.message);
    }
  } else {
    console.log('\n⏭  PASO 2 — Saltando catálogo (saltarCatalogo=true)');
  }

  /* ── PASO 3: Docentes ───────────────────────────────────────────────────── */
  if (!opts.saltarDocentes) {
    console.log('\n▶ PASO 3 — Subiendo docentes...');
    const docentes = window.baseDatosDocentes || [];
    if (!docentes.length) {
      console.warn('  ⚠️  baseDatosDocentes está vacío. Asegúrate de cargar el sistema desde el GAS primero.');
      errores.push('docentes: baseDatosDocentes vacío');
    } else {
      try {
        if (typeof FB_subirDocentes === 'function') {
          await FB_subirDocentes();
        } else {
          let subidos = 0;
          for (let i = 0; i < docentes.length; i += 100) {
            const batch = db.batch();
            docentes.slice(i, i + 100).forEach(d => {
              if (!d.nombre) return;
              const key = _normKey(d.nombre);
              batch.set(db.collection('docentes_inmu').doc(key), {
                nombre:            d.nombre           || '',
                grado:             d.grado            || '',
                seccion:           d.seccion          || '',
                grado_orientado:   d.grado_orientado  || d.grado   || '',
                seccion_orientada: d.seccion_orientada|| d.seccion || '',
                materia:           d.materia          || '',
                tipo_materia:      d.tipo_materia     || '0-10',
                escala:            d.escala           || d.tipo_materia || '0-10',
                admin:             d.admin === true   || d.admin === 'true',
                materias_asignadas: Array.isArray(d.materias_asignadas) ? d.materias_asignadas : []
              }, { merge: true });
              subidos++;
            });
            await batch.commit();
          }
          console.log('  ✅ Docentes subidos:', subidos);
        }
      } catch (e) {
        console.error('  ❌ Error docentes:', e);
        errores.push('docentes: ' + e.message);
      }
    }
  } else {
    console.log('\n⏭  PASO 3 — Saltando docentes (saltarDocentes=true)');
  }

  /* ── PASO 4: Alumnos ────────────────────────────────────────────────────── */
  if (!opts.saltarAlumnos) {
    console.log('\n▶ PASO 4 — Subiendo alumnos...');
    const alumnos = window.baseDatosAlumnos || [];
    if (!alumnos.length) {
      console.warn('  ⚠️  baseDatosAlumnos está vacío.');
      errores.push('alumnos: baseDatosAlumnos vacío');
    } else {
      let subidos = 0, omitidos = 0;
      try {
        for (let i = 0; i < alumnos.length; i += 400) {
          const batch = db.batch();
          alumnos.slice(i, i + 400).forEach(a => {
            const nie = String(a.nie || '').trim();
            if (!nie || nie === 'N/A' || nie === 'n/a' || nie === '0' || nie.includes('/')) {
              omitidos++; return;
            }
            batch.set(db.collection('alumnos_inmu').doc(nie), {
              nie,
              nombre:  a.nombre  || '',
              grado:   a.grado   || '',
              seccion: a.seccion || '',
              sexo:    a.sexo    || '',
              telefono:a.telefono|| ''
            }, { merge: true });
            subidos++;
          });
          await batch.commit();
          console.log('  ↑ Alumnos subidos:', subidos);
        }
        console.log('  ✅ Alumnos:', subidos, 'subidos,', omitidos, 'omitidos (sin NIE válido)');
      } catch (e) {
        console.error('  ❌ Error alumnos:', e);
        errores.push('alumnos: ' + e.message);
      }
    }
  } else {
    console.log('\n⏭  PASO 4 — Saltando alumnos (saltarAlumnos=true)');
  }

  /* ── PASO 5: Reportes históricos del GAS ───────────────────────────────── */
  if (!opts.saltarReportes) {
    console.log('\n▶ PASO 5 — Migrando reportes históricos del GAS...');
    try {
      if (typeof FB_migrarReportesDesdeGAS === 'function') {
        await FB_migrarReportesDesdeGAS();
      } else {
        console.warn('  ⚠️  FB_migrarReportesDesdeGAS no disponible. Incluye firebase-reportes.js.');
      }
    } catch (e) {
      console.error('  ❌ Error migrando reportes:', e);
      errores.push('reportes: ' + e.message);
    }
  } else {
    console.log('\n⏭  PASO 5 — Saltando reportes (saltarReportes=true)');
  }

  /* ── PASO 6: Informes históricos del GAS ───────────────────────────────── */
  if (!opts.saltarInformes) {
    console.log('\n▶ PASO 6 — Migrando informes históricos del GAS...');
    try {
      if (typeof FB_migrarInformesDesdeGAS === 'function') {
        await FB_migrarInformesDesdeGAS();
      } else {
        console.warn('  ⚠️  FB_migrarInformesDesdeGAS no disponible. Incluye firebase-reportes.js.');
      }
    } catch (e) {
      console.error('  ❌ Error migrando informes:', e);
      errores.push('informes: ' + e.message);
    }
  } else {
    console.log('\n⏭  PASO 6 — Saltando informes (saltarInformes=true)');
  }

  /* ── PASO 7: Verificación ───────────────────────────────────────────────── */
  console.log('\n▶ PASO 7 — Verificación final...');
  try {
    const [snapDocentes, snapAlumnos, snapConfig, snapCatalogo] = await Promise.all([
      db.collection('docentes_inmu').get(),
      db.collection('alumnos_inmu').get(),
      db.collection('config_inmu').doc('sistema').get(),
      db.collection('config_inmu').doc('catalogo_materias').get()
    ]);

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║              RESULTADO DE MIGRACIÓN                  ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║  docentes_inmu:      ', String(snapDocentes.size).padEnd(4), 'documentos           ║');
    console.log('║  alumnos_inmu:       ', String(snapAlumnos.size).padEnd(4), 'documentos           ║');
    console.log('║  config/sistema:     ', snapConfig.exists ? '✅ OK' : '❌ FALTA', '                  ║');
    console.log('║  config/catalogo:    ', snapCatalogo.exists ? '✅ OK (' + (snapCatalogo.data().items||[]).length + ' materias)' : '❌ FALTA', '          ║');
    if (errores.length) {
      console.log('╠══════════════════════════════════════════════════════╣');
      console.log('║  ⚠️  ERRORES (' + errores.length + '):                                 ║');
      errores.forEach(e => console.log('║    ✗ ' + e.substring(0,47).padEnd(47) + '║'));
    }
    console.log('╚══════════════════════════════════════════════════════╝');

    if (!errores.length) {
      console.log('\n🎉 MIGRACIÓN COMPLETADA SIN ERRORES');
      console.log('   Ahora el sistema carga en < 0.5 seg en vez de 5-8 seg.');
      console.log('   El GAS sigue siendo necesario para: PDFs, Excel, appendRow en Sheets.');
    } else {
      console.log('\n⚠️  Migración completada con', errores.length, 'error(es). Revisa los mensajes anteriores.');
    }
  } catch (e) {
    console.error('  ❌ Error en verificación:', e);
  }

  return { errores, completado: errores.length === 0 };
};

/* ══════════════════════════════════════════════════════════════════════════════
 * COMANDOS INDIVIDUALES DE ADMINISTRACIÓN
 * (se pueden ejecutar sueltos en cualquier momento)
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Actualiza SOLO la configuración del sistema en Firestore.
 * USO: await FB_ActualizarConfig({ horarioInicio: '07:30', horarioFin: '14:30' })
 */
window.FB_ActualizarConfig = async function(cfg) {
  const db = firebase.firestore();
  const data = {
    mantenimiento:      cfg.mantenimiento      ?? false,
    login_habilitado:   cfg.login_habilitado   ?? true,
    modo_alumno_activo: cfg.modo_alumno_activo ?? true,
    horario_inicio:     cfg.horarioInicio      || cfg.horario_inicio || '07:00',
    horario_fin:        cfg.horarioFin         || cfg.horario_fin    || '15:00',
    actualizado:        new Date().toISOString()
  };
  await db.collection('config_inmu').doc('sistema').set(data, { merge: true });
  console.log('[Setup] ✅ Config actualizada:', data);
};

/**
 * Activa o desactiva el modo mantenimiento directamente desde consola.
 * USO: await FB_SetMantenimiento(true)   // activar
 *      await FB_SetMantenimiento(false)  // desactivar
 */
window.FB_SetMantenimiento = async function(valor) {
  const db = firebase.firestore();
  await db.collection('config_inmu').doc('sistema').set(
    { mantenimiento: !!valor, actualizado: new Date().toISOString() },
    { merge: true }
  );
  console.log('[Setup] ✅ Mantenimiento:', valor ? 'ACTIVADO' : 'DESACTIVADO');
};

/**
 * Lista todos los docentes en Firestore.
 * USO: await FB_ListarDocentes()
 */
window.FB_ListarDocentes = async function() {
  const db = firebase.firestore();
  const snap = await db.collection('docentes_inmu').get();
  const lista = [];
  snap.forEach(doc => lista.push(doc.data()));
  console.table(lista.map(d => ({ nombre: d.nombre, grado: d.grado, seccion: d.seccion, materia: d.materia, admin: d.admin })));
  return lista;
};

/**
 * Elimina un docente de Firestore por nombre.
 * USO: await FB_EliminarDocente('KARLA VERALYS')
 */
window.FB_EliminarDocente = async function(nombre) {
  const db  = firebase.firestore();
  const key = _normKey(nombre);
  await db.collection('docentes_inmu').doc(key).delete();
  console.log('[Setup] ✅ Docente eliminado:', nombre);
};

/**
 * Agrega o actualiza un docente manualmente.
 * USO: await FB_AgregarDocente({ nombre: 'PROF. EJEMPLO', grado: '1° General', seccion: 'A', materia: 'Matemática', escala: '0-10', admin: false })
 */
window.FB_AgregarDocente = async function(d) {
  if (!d || !d.nombre) { console.error('[Setup] Se requiere al menos nombre'); return; }
  const db  = firebase.firestore();
  const key = _normKey(d.nombre);
  await db.collection('docentes_inmu').doc(key).set({
    nombre:            d.nombre          || '',
    grado:             d.grado           || '',
    seccion:           d.seccion         || '',
    grado_orientado:   d.grado           || '',
    seccion_orientada: d.seccion         || '',
    materia:           d.materia         || '',
    tipo_materia:      d.escala          || '0-10',
    escala:            d.escala          || '0-10',
    admin:             d.admin === true,
    materias_asignadas: d.materias_asignadas || []
  }, { merge: true });
  console.log('[Setup] ✅ Docente guardado:', d.nombre);
};

/**
 * Diagnóstico rápido del estado de Firestore.
 * USO: await FB_Diagnostico()
 */
window.FB_Diagnostico = async function() {
  const db = firebase.firestore();
  console.log('[Setup] Ejecutando diagnóstico...');
  const colecciones = [
    'alumnos_inmu', 'docentes_inmu', 'config_inmu',
    'asistencia_alumnos_inmu', 'notas_inmu',
    'reportes_inmu', 'informes_inmu',
    'ausencias_inmu', 'presencia_docentes_inmu'
  ];
  const resultados = {};
  await Promise.all(colecciones.map(async col => {
    try {
      const snap = await db.collection(col).limit(1000).get();
      resultados[col] = snap.size;
    } catch (e) {
      resultados[col] = '❌ ERROR: ' + e.code;
    }
  }));
  console.log('\n══════════════ DIAGNÓSTICO FIRESTORE ══════════════');
  Object.entries(resultados).forEach(([col, count]) => {
    console.log(`  ${col.padEnd(30)} → ${count} doc(s)`);
  });
  console.log('════════════════════════════════════════════════════');

  // Verificar reglas de Firestore
  console.log('\nReglas recomendadas (agregar en Firestore Console → Rules):');
  console.log(`
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /alumnos_inmu/{doc}              { allow read, write: if true; }
    match /docentes_inmu/{doc}             { allow read, write: if true; }
    match /config_inmu/{doc}               { allow read, write: if true; }
    match /asistencia_alumnos_inmu/{doc}   { allow read, write: if true; }
    match /notas_inmu/{doc}                { allow read, write: if true; }
    match /reportes_inmu/{doc}             { allow read, write: if true; }
    match /informes_inmu/{doc}             { allow read, write: if true; }
    match /ausencias_inmu/{doc}            { allow read, write: if true; }
    match /presencia_docentes_inmu/{doc}   { allow read, write: if true; }
  }
}
  `);

  return resultados;
};

/* ── Helper interno ──────────────────────────────────────────────────────────── */
function _normKey(s) {
  return (s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function _getCatalogoDefault() {
  const esp = ["1° Adm. Contable","1° S. Eléctricos","2° Adm. Contable","2° Sist. Eléctricos","3° Adm. Contable","3° Sist. Eléctricos"];
  return [
    { nombre: "Lenguaje y Literatura",             categoria: "basica",  escala: "0-10", requiere_especialidad: false, especialidades: [] },
    { nombre: "Matemática",                        categoria: "basica",  escala: "0-10", requiere_especialidad: false, especialidades: [] },
    { nombre: "Estudios Sociales y Cívica",        categoria: "basica",  escala: "0-10", requiere_especialidad: false, especialidades: [] },
    { nombre: "Ciencia, Salud y Medio Ambiente",   categoria: "basica",  escala: "0-10", requiere_especialidad: false, especialidades: [] },
    { nombre: "Inglés",                            categoria: "basica",  escala: "0-10", requiere_especialidad: false, especialidades: [] },
    { nombre: "Informática",                       categoria: "basica",  escala: "0-10", requiere_especialidad: false, especialidades: [] },
    { nombre: "Educación Física",                  categoria: "basica",  escala: "0-10", requiere_especialidad: false, especialidades: [] },
    { nombre: "Moral, Urbanidad y Cívica",         categoria: "basica",  escala: "0-10", requiere_especialidad: false, especialidades: [] },
    { nombre: "Seminario",                         categoria: "basica",  escala: "0-10", requiere_especialidad: false, especialidades: [] },
    { nombre: "Módulo 1",                          categoria: "modulo",  escala: "0-5",  requiere_especialidad: true,  especialidades: esp },
    { nombre: "Módulo 2",                          categoria: "modulo",  escala: "0-5",  requiere_especialidad: true,  especialidades: esp },
    { nombre: "Módulo 3",                          categoria: "modulo",  escala: "0-5",  requiere_especialidad: true,  especialidades: esp }
  ];
}

console.log('[Setup] firebase-setup.js cargado.');
console.log('[Setup] Comandos disponibles:');
console.log('  await FB_MigracionCompleta()          — Migración completa (usa 1ª vez)');
console.log('  await FB_Diagnostico()                — Ver estado de todas las colecciones');
console.log('  await FB_ActualizarConfig({...})      — Cambiar config del sistema');
console.log('  await FB_SetMantenimiento(true/false) — Activar/desactivar mantenimiento');
console.log('  await FB_ListarDocentes()             — Ver docentes en Firestore');
console.log('  await FB_AgregarDocente({...})        — Agregar/editar docente');
console.log('  await FB_EliminarDocente("NOMBRE")    — Eliminar docente');
console.log('  await FB_subirDocentes()              — Subir docentes de memoria a Firestore');
console.log('  await FB_subirCatalogo()              — Subir catálogo de materias');
console.log('  await FB_refrescarTodo()              — Recargar todo desde Firestore a memoria');
console.log('  await FB_limpiarCache()               — Limpiar caché de localStorage');
console.log('  await FB_subirAusencias([...])        — Subir conteo de ausencias');
console.log('  await FB_migrarReportesDesdeGAS()     — Migrar historial de reportes del GAS');
console.log('  await FB_migrarInformesDesdeGAS()     — Migrar historial de informes del GAS');
