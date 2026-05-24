[README2.md](https://github.com/user-attachments/files/28197044/README2.md)
# 🏫 SISTEMA-DE-ASISTENCIA-INMU

<div align="center">

![Estado](https://img.shields.io/badge/Estado-Activo-brightgreen)
![Versión](https://img.shields.io/badge/Versión-v8__11-blue)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange)
![GAS](https://img.shields.io/badge/Backend-Apps%20Script-yellow)
![PWA](https://img.shields.io/badge/PWA-Instalable-purple)
![Ciclo](https://img.shields.io/badge/Ciclo-C1--2026-lightgrey)

**Sistema de Control de Asistencia del Instituto Nacional de Mercedes Umaña**  
DIRECCIÓN DE INNOVACIÓN — INMU · Usulután, El Salvador · 2026

</div>

---

## 📑 Índice

1. [Archivos del Repositorio](#0-archivos-del-repositorio)
2. [URLs en Producción](#-urls-en-producción)
3. [Arquitectura](#1-arquitectura-cómo-se-conecta-todo)
4. [Puesta en Marcha](#2-puesta-en-marcha)
5. [Firebase — Módulos y Colecciones](#-firebase--módulos-y-colecciones)
6. [Novedades v8_11](#-novedades-v8_11-mayo-2026)
7. [Agregados Clave (materias, escalas, docentes)](#3-agregados-clave-materias-escalas-docentes)
8. [Google Sheets — Base de Datos](#4-google-sheets-hojas-bd-y-propósito)
9. [Backend GAS — Endpoints GET/POST](#5-backend-apps-script-endpoints-getpost)
10. [Módulo Docente](#6-módulo-docente-funciones-del-sistema)
11. [Portal Alumno](#7-portal-alumno-index_alumnohtml)
12. [Control Global del Sistema](#8-apagón-global-login-y-portal-alumno)
13. [Problemas Comunes](#9-problemas-comunes)
14. [Seguridad](#10-notas-de-seguridad)
15. [Comandos de Emergencia Firebase](#-comandos-de-emergencia-firebase)

---

## 🌐 URLs en Producción

| Módulo | URL |
|--------|-----|
| 🖥️ Sistema Docente | https://sitioweb001.github.io/SISTEMA-DE-ASISTENCIA-INMU/ |
| 👨‍🎓 Portal Estudiante PERMANENCIA | https://sitioweb001.github.io/Instituto-Nacional-de-Mercedes-Uma-a-Portal-del-Estudiante/ |
| 🔥 Firebase Console | https://console.firebase.google.com/project/sica-inmu-2026 |

---

## 0) Archivos del Repositorio

| Archivo | Descripción |
|---------|-------------|
| `INDEX_DOCENTE.html` **(v8_11)** | Panel docente — asistencia, notas, QR, informes y administración |
| `INDEX_DOCENTE_BACKUP.html` | Respaldo del módulo Docente (referencia para revertir) |
| `INDEX_ALUMNO.html` | Portal del estudiante PERMANENCIA — marcación autónoma por NIE |
| `CODIGO_GS_APS_SCRIBT_.gs` | Backend completo en Google Apps Script (escritor maestro) |
| `firebase-config.js` 🆕 | Control de mantenimiento, login y horario en Firestore (tiempo real) |
| `firebase-docentes.js` 🆕 | Carga docentes, alumnos y catálogo desde Firestore con fallback GAS |
| `firebase-asistencia.js` 🆕 | Asistencia portal en tiempo real (onSnapshot) + status docentes |
| `firebase-reportes.js` 🆕 | Reportes e informes en Firestore |
| `firebase-alumno.js` 🆕 | Verificación NIE local (**<0.1 seg**) y horario tiempo real para el portal |
| `firebase-setup.js` 🆕 | Migración inicial GAS → Firestore (ejecutar **una sola vez**) |
| `firestore.rules` 🆕 | Reglas de seguridad de Firebase Firestore |
| `sw.js` (docente) | Service Worker PWA — `asistencia-inmu-pwa-v3` |
| `sw.js` (alumno) | Service Worker PWA — `permanencia-inmu-pwa-v2` |
| `manifest.webmanifest` | Manifiesto PWA para instalación nativa |
| `logo2.svg` 🆕 | Logo institucional SVG (reemplaza `logo.jpg` desde v8_11) |
| `plantilla_notas.xls` | Plantilla de notas compatible con importación |
| `INSTRUCCIONES IMPORTAR NOTAS.txt` | Guía de importación (actualizado 13-may-2026) |
| `app_inmu.exe` + `app_inmu_config.json` | App de escritorio Windows (pywebview) |

---

## 1) Arquitectura (cómo se conecta todo)

```
┌─────────────────────────────────────────────┐
│  CAPA 1 — PRESENTACIÓN (GitHub Pages)       │
│  INDEX_DOCENTE.html (v8_11)                 │
│  INDEX_ALUMNO.html                          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  CAPA 2 — TIEMPO REAL 🔥 (NUEVO)           │
│  Firebase Firestore                         │  ← onSnapshot / WebSocket
│  firebase-*.js  (6 módulos interceptores)   │     lecturas en milisegundos
└──────────────┬──────────────────────────────┘
               │ fallback automático (timeout 6 seg)
┌──────────────▼──────────────────────────────┐
│  CAPA 3 — LÓGICA DE NEGOCIO                 │
│  Google Apps Script (GAS)                   │  ← Web App HTTP GET/POST + JSONP
│  Escritor maestro de Sheets                 │     anti-CORS desde GitHub Pages
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  CAPA 4 — DATOS MAESTROS                    │
│  Google Sheets (15+ hojas)                  │  ← Fuente de verdad permanente
└─────────────────────────────────────────────┘
```

**Flujo general:**
1. Los HTML hacen peticiones primero a Firestore (vía `firebase-*.js`), luego al GAS como fallback.
2. Apps Script lee/escribe en Sheets (fuente maestra).
3. El módulo Docente genera PDF/Excel y guarda reportes en GAS + Firestore.
4. El portal Alumno valida NIE localmente (<0.1 seg) y marca vía GAS + Firestore simultáneamente.

---

## 2) Puesta en Marcha

### 2.1 Ejecutar el frontend

> ⚠️ **Para PWA y `sw.js`**: servir por `http://localhost` o `https://`, no desde `file://`.

```bash
# Opción 1
python -m http.server 8080

# Opción 2
npx http-server -p 8080
```

| Interfaz | URL local |
|----------|-----------|
| Docente | `http://localhost:8080/INDEX_DOCENTE.html` |
| Alumno | `http://localhost:8080/INDEX_ALUMNO.html` |

> Si abres desde `file://`, el módulo Docente entra en **modo offline automático** (útil para pruebas sin sincronizar a la nube).

### 2.2 Publicar el backend (Apps Script)

1. Crear hoja de cálculo en Google Drive (será la BD).
2. Pegar contenido de `CODIGO_GS_APS_SCRIBT_.gs` en el editor de Apps Script.
3. Desplegar como **Web App** (ejecutar como tú / acceso según política institucional).
4. Copiar la URL y actualizar la constante `SCRIPT_URL` en ambos HTML.

### 2.3 Migración Firebase (una sola vez)

```js
// En consola del navegador (F12) con INDEX_DOCENTE.html cargado:
await FB_MigracionCompleta()

// Migración parcial (sin re-subir alumnos):
await FB_MigracionCompleta({ saltarAlumnos: true })
```

---

## 🔥 Firebase — Módulos y Colecciones

### Módulos firebase-*.js — Patrón interceptor

Cada módulo espera a que la función original del INDEX esté definida, la guarda como `_orig` y la reemplaza con una versión que usa Firebase como fuente primaria. Si Firebase no responde en 6 seg → llama a `_orig` (GAS) automáticamente.

| Módulo | Función interceptada | Comportamiento |
|--------|---------------------|----------------|
| `firebase-config.js` | `chequearMantenimientoNube()` + toggles | Config en tiempo real desde `config_inmu/sistema` |
| `firebase-docentes.js` | `inicializarBaseDatos()` | Docentes, alumnos, catálogo desde Firestore |
| `firebase-asistencia.js` | `sincronizarAsistenciaAlumnos()` | onSnapshot → auto-marca checkbox docente |
| `firebase-reportes.js` | `cargarReportesSub()` · `guardarInformeEnNube()` | Reportes e informes en Firestore |
| `firebase-alumno.js` | `validarAlumnoNIE()` · `obtenerHorario()` | Verificación local + horario tiempo real |
| `firebase-setup.js` | — | Migración inicial: `await FB_MigracionCompleta()` |

### Colecciones Firestore

| Colección | Propósito | Escritor principal |
|-----------|-----------|-------------------|
| `config_inmu/sistema` | Mantenimiento, login, horario, modo_alumno | `firebase-config.js` |
| `alumnos_inmu/{nie}` | Lista para verificación local en portal | `firebase-setup.js` / `firebase-docentes.js` |
| `asistencia_alumnos_inmu/{nie}_{fecha}` | Marcaciones del portal (onSnapshot docente) | `INDEX_ALUMNO` + GAS |
| `presencia_docentes_inmu/{key}` | Estado online/offline en tiempo real | `firebase-asistencia.js` |
| `ausencias_inmu/{nie}` | Acumulado de ausencias | `firebase-asistencia.js` |
| `reportes_inmu/{id}` | Espejo de reportes de asistencia | `firebase-reportes.js` |
| `informes_inmu/{id}` | Espejo de informes administrativos | `firebase-reportes.js` |
| `docentes_inmu/{key}` | Fichas de docentes | `firebase-setup.js` |
| `catalogo_materias_inmu/{key}` | Catálogo de materias y módulos | `firebase-setup.js` |

---

## ✨ Novedades v8_11 (mayo 2026)

### 🤖 Auto-marcado del checkbox desde portal

La función `_pintarPortalAutoUI()` fue modificada: cuando un alumno confirma asistencia en PERMANENCIA, el `onSnapshot` lo detecta y **marca el checkbox automáticamente** en el panel del docente.

| Antes | Después |
|-------|---------|
| Docente debía presionar "✅ Marcar desde Portal" | El checkbox se activa **solo** vía onSnapshot |
| Verificación NIE: 6–10 seg (cold start GAS) | Verificación NIE: **<0.1 seg** (lista local Firestore) |
| Asistencia portal: polling 3–5 seg | Asistencia portal: **tiempo real** (onSnapshot) |

**Regla de protección:** si el docente ya marcó manualmente a un alumno → el auto-portal no lo sobreescribe.  
**Botón "✅ Marcar desde Portal"** sigue disponible para sincronización retroactiva.

### 🖼️ Logo institucional

- `logo.jpg` (rasterizado, fondo blanco circular) → `logo2.svg` (vector escalable)
- CSS: `filter: brightness(0) invert(1)` → blanco sobre fondo azul institucional

| Vista | Tamaño anterior | Tamaño nuevo |
|-------|----------------|--------------|
| Móvil (≤600px) | 48px | **80px** |
| Tablet (601–900px) | 56px | **100px** |
| Desktop | 70px | **140px** |
| Web-app | 100px | **160px** |

---

## 3) Agregados Clave (materias, escalas, docentes)

### 3.1 Escalas de notas: `0-10` (básicas) y `0-5` (módulos)

| Tipo | Escala | Hoja Sheets | Función de decisión |
|------|--------|-------------|---------------------|
| Materias básicas | 0–10 | `notas` | `normalizarEscalaMateriaGas()` |
| Módulos técnicos | 0–5 | `nota-tecnicos` | `getNombreHojaNotas()` / `getOrCreateNotasSheet()` |

### 3.2 Catálogo de materias y módulos

**Backend** — hoja `catalogo_materias`, creada con `asegurarHojaCatalogoMaterias()`.  
Si está vacía, carga catálogo predeterminado:

| Categoría | Materias |
|-----------|---------|
| **Básicas (0–10)** | Lenguaje · Matemática · Estudios Sociales · Ciencia/Salud · Inglés · Informática · Ed. Física · Moral · Seminario |
| **Módulos (0–5)** | Módulo 1 · Módulo 2 · Módulo 3 (con `requiere_especialidad` y lista de especialidades) |

Endpoints: `GET ?tipo=catalogo_materias` · `POST tipo_post: "guardar_catalogo_materias"`

### 3.3 Docentes y asignación de materias

El sistema separa la **ficha base** del docente de sus **asignaciones de materias**:

| Hoja | Contenido |
|------|-----------|
| `docentes` | Ficha base (Nombre, Grado, Sección, Materia, Escala, Admin) |
| `docente_materias` | Asignaciones (Docente, Grado, Sección, TipoMateria, Materia, Escala, Especialidad, EsOrientado, Activo) |

**Cómo registrar un docente (paso a paso):**
1. Entrar al menú admin → **"👨‍🏫 Añadir Docente"**
2. Completar Nombre + grado/sección orientado (si aplica)
3. Agregar ≥1 materia: seleccionar categoría → materia del catálogo → especialidad (si aplica)
4. Guardar → envía `tipo_post: "nuevo_docente"` → crea filas en `docentes` + `docente_materias`

**Cómo asignar / editar materias:**
1. Entrar a **"ASIGNAR MATERIA"** → seleccionar docente
2. Verificar resumen (grado, sección, materia orientada, escala)
3. Agregar o eliminar materias → marcar "orientado" si es la principal
4. Guardar → envía `tipo_post: "guardar_asignaciones_docente"`

> **"Orientado"** = materia principal de referencia del docente al cargar el sistema.

---

## 4) Google Sheets: Hojas (BD) y Propósito

> El backend crea las hojas automáticamente si no existen y agrega los encabezados correctos.

| Hoja | Descripción |
|------|-------------|
| `alumnos` | Matrícula principal (Grado, Sección, Nombre, Sexo, NIE, Teléfono) |
| `di_refuerzo` | Estudiantes del programa de refuerzo (misma estructura) |
| `docentes` | Ficha base del docente |
| `docente_materias` 🆕 | Asignaciones por docente con escala y especialidad |
| `catalogo_materias` 🆕 | Catálogo editable de materias y módulos |
| `reportes` | Reportes de asistencia diarios (Fecha, Grado, Sección, Docente, Presentes…) |
| `permisos` | Justificaciones/permisos (Fecha, Grado, NIE, Justificante…) |
| `conteo_ausencias` | Contador histórico de ausencias por estudiante |
| `asistencia_alumnos` | Asistencia marcada desde el portal PERMANENCIA |
| `asistencia_actualizaciones` | Bitácora de cambios y actualizaciones de asistencia |
| `observaciones` | Observaciones disciplinarias o notas del alumno |
| `estado_alumnos` 🆕 | Seguimiento por alumno (Fecha, NIE, Estado, Docente, Observación) |
| `informes` | Módulo de informes administrativos (ID, tipo, docente, alumnos JSON…) |
| `notas` | Calificaciones escala 0–10 por periodo y materia |
| `nota-tecnicos` 🆕 | Calificaciones escala 0–5 (módulos técnicos) |
| `EstadosDocentes` 🆕 | Estado online/offline de docentes |

---

## 5) Backend (Apps Script): Endpoints GET/POST

### 5.1 Endpoints GET (`doGet`)

> **CORS/JSONP**: todos soportan `?callback=...` para evitar bloqueos desde GitHub Pages.

| Endpoint | Descripción |
|----------|-------------|
| `?tipo=check_mantenimiento` | `{ mantenimiento, login_habilitado, modo_alumno }` |
| `?tipo=docentes` / `?tipo=lista_docentes` | Docentes con asignaciones completas |
| `?tipo=catalogo_materias` | Catálogo de materias y módulos |
| `?tipo=alumnos&grado=...&seccion=...` | Alumnos filtrados (incluye `di_refuerzo`) |
| `?tipo=reportes` | Lista de reportes de asistencia |
| `?tipo=detalles_asistencia&...` | Detalle puntual por fecha/grado/sección/docente |
| `?tipo=permisos` | Lista de permisos/justificaciones |
| `?tipo=detalle_alumno&nie=...` | Expediente rápido (faltas + justificantes) |
| `?tipo=obtener_observaciones&nie=...` | Observaciones del alumno |
| `?tipo=notas&grado=...&seccion=...&escala=...` | Notas por grado/sección/materia |
| `?tipo=historial_informes` | Historial del módulo de informes |
| `?tipo=buscar_alumno&query=...` | Búsqueda por nombre o NIE |
| `?tipo=horario_asistencia` | Horario + flags de acceso alumnos |
| `?tipo=validar_alumno_nie&nie=...` | Valida NIE y verifica si ya registró hoy |
| `?tipo=marcar_alumno&nie=...&estado=...` | Marca asistencia desde portal (GET/JSONP) |
| `?tipo=asistencia_diaria_grado` | Mapa de asistencias del día (NIE como llave) |

### 5.2 Endpoints POST (`doPost`)

**Administración global** *(requiere password maestra)*:

| `tipo_post` | Descripción |
|-------------|-------------|
| `toggle_mantenimiento` | Apagón global del sistema |
| `toggle_login` | Habilitar/deshabilitar login |
| `toggle_modo_alumno` | Activar/desactivar portal PERMANENCIA |
| `configurar_horario` | Ajustar ventana de marcación |

**Docentes y materias:**

| `tipo_post` | Descripción |
|-------------|-------------|
| `nuevo_docente` | Crear o actualizar ficha base + asignaciones |
| `guardar_asignaciones_docente` | Reemplazar todas las asignaciones de un docente |
| `guardar_catalogo_materias` | Guardar cambios al catálogo desde el panel |

**Asistencia e historial:**

| `tipo_post` | Descripción |
|-------------|-------------|
| `asistencia` | Guardar reporte diario |
| `actualizar_asistencia` | Bitácora de cambios |
| `agregar_observacion` | Nueva observación de alumno |
| `guardar_estado_alumno` | Estado/seguimiento del alumno |
| `update_docente_status` | Estado online/offline del docente |

**Notas e informes:**

| `tipo_post` | Descripción |
|-------------|-------------|
| `guardar_notas_alumno` | Notas individuales |
| `guardar_notas_grupo` | Notas de todo el grupo |
| `exportar_excel_notas` | Exportación Excel desde backend |
| `guardar_informe` | Guardar informe administrativo |
| `eliminar_informe` | Eliminar informe |

---

## 6) Módulo Docente (funciones del sistema)

### 6.1 Pasar lista (asistencia) — Flujo típico

1. Seleccionar **Grado** y **Sección**
2. Seleccionar **Docente** y **Materia** (según asignaciones de Firestore/GAS)
3. La lista carga desde Firestore en <1 seg (fallback GAS si timeout)
4. Los alumnos que marquen en el portal → **checkbox se activa automáticamente** (v8_11)
5. Marcar presentes/ausentes/permisos manualmente si aplica
6. Generar PDF → se registra en `reportes`, `permisos`, `conteo_ausencias` (Sheets) y `reportes_inmu` (Firestore)

### 6.2 PDF institucional y carpeta de descargas

- **Windows (app)**: seleccionar carpeta destino con `pywebview` (`app_inmu.exe`)
- **Android**: persiste `carpeta_pdf_uri` con `AndroidStorage`
- **Web**: carpeta de descargas del navegador

### 6.3 Notas por períodos + escalas

- Periodos: P1–P4 con componentes (Cuaderno / Integradora / Examen)
- Escala decide hoja destino: `0-10` → `notas` · `0-5` → `nota-tecnicos`
- Se usa `materia_clave` para separar materias y especialidades

### 6.4 Exportar e Importar notas (Excel)

- **Exportar**: "📊 Exportar Notas a Excel (.xlsx)" — SheetJS
- **Importar**: "📥 Importar Notas" — ver `INSTRUCCIONES IMPORTAR NOTAS.txt` (13-may-2026)

### 6.5 Informes (módulo administrativo)

Guarda registros en hoja `informes` con alumnos implicados, testigos, observaciones y metadatos. Espejado en `informes_inmu` de Firestore por `firebase-reportes.js`.

### 6.6 PWA + modo offline

| Función | Detalle |
|---------|---------|
| Instalación PWA | Botón "📥 Instalar app" (`beforeinstallprompt`) en `http/https` |
| Modo oscuro/claro | Botón 🌙/☀ — preferencia en `localStorage` |
| Service Worker | `sw.js` cachea recursos (`CACHE_NAME: asistencia-inmu-pwa-v3`) |
| Offline | Sin nube o en `file://` → carga fallback local (datos demo) |

---

## 7) Portal Alumno (`INDEX_ALUMNO.html`)

### 7.1 Verificación del sistema y bloqueo PWA

Al abrir, `firebase-alumno.js` consulta `config_inmu/sistema` en Firestore en tiempo real:

| Estado | Comportamiento |
|--------|---------------|
| `mantenimiento === true` | Bloqueo tipo "mantenimiento" |
| `acceso_alumnos === false` | Bloqueo tipo "alumnos_off" |
| Sin caché / sin red | Bloqueo tipo "offline" |

> Desbloqueo temporal con código admin → guarda flag en `sessionStorage` (modo docente emergencia).

### 7.2 Marcar asistencia (NIE) — Flujo

1. Alumno ingresa NIE o busca por nombre
2. `firebase-alumno.js` verifica localmente contra lista cacheada → **<0.1 seg** (sin llamada de red)
3. Si NIE válido y horario activo → mostrar botón "Confirmar asistencia"
4. Al confirmar: GAS registra en Sheets + Firestore actualiza `asistencia_alumnos_inmu`
5. Panel del docente detecta vía onSnapshot y marca el checkbox automáticamente

### 7.3 Service Worker (PWA) en Alumno

- Registra `./sw.js` cuando es servido por `http://` o `https://`
- `CACHE_NAME: permanencia-inmu-pwa-v2`

---

## 8) "Apagón Global", Login y Portal Alumno (Control Total)

### 8.1 Apagón global (MANTENIMIENTO)

- **Firebase** (tiempo real): `config_inmu/sistema` → campo `mantenimiento`
- **GAS**: `?tipo=check_mantenimiento` · `tipo_post: "toggle_mantenimiento"`
- Clave maestra hardcodeada en GAS (`747-8` por defecto). **⚠️ Cambiar antes de producción.**

### 8.2 Login global (LOGIN_HABILITADO)

- **Firebase**: `config_inmu/sistema` → campo `login_habilitado`
- **GAS**: `?tipo=check_mantenimiento` refleja estado · `tipo_post: "toggle_login"`

### 8.3 Portal Alumno (MODO_ALUMNO_ACTIVO)

- **Firebase**: `config_inmu/sistema` → campo `modo_alumno_activo`
- **GAS**: `?tipo=horario_asistencia` refleja `acceso_alumnos` · `tipo_post: "toggle_modo_alumno"`

> Los cambios en Firestore se reflejan en **todos los dispositivos en segundos** vía `onSnapshot`.

---

## 9) Problemas Comunes

| Problema | Solución |
|----------|----------|
| Lista de alumnos tarda | Firebase primero (<1 seg); si falla → GAS automático (5–15 seg cold start) |
| Checkbox no se marca automático | Verificar que auto-portal esté activo (botón 🔄 Auto en la barra) |
| Portal dice NIE no encontrado | Verificar alumno en hoja `alumnos` y que Firestore esté actualizado |
| Portal dice "fuera de horario" | Admin ajusta horario → cambio en segundos vía Firestore |
| Sistema bloqueado en mantenimiento | `FB_SalirMantenimiento()` en consola (F12) |
| PWA no instala | Abrir por `http://` o `https://` — no desde `file://` |
| PWA/offline no cachea | Revisar `sw.js` → `URLS_TO_CACHE` y ajustar rutas reales |
| Alumno bloqueado (alumnos_off) | Revisar `MODO_ALUMNO_ACTIVO` (toggle desde Docente/Firestore) |
| Notas mezcladas entre materias | Verificar `materia_clave` y escala correcta (`0-10` vs `0-5`) |
| Importación Excel falla | Usar archivo generado por el sistema (ver `INSTRUCCIONES IMPORTAR NOTAS.txt`) |
| Cuotas Firebase agotadas | Plan Spark: 50K lecturas/día · 20K escrituras/día. Monitorear en Firebase Console |

---

## 10) Notas de Seguridad

> ⚠️ Para producción con datos sensibles:

- **Contraseñas maestras** no deberían quedar en claro si el proyecto es público — mover a `PropertiesService` del GAS.
- **Firebase Authentication**: activar para restringir escrituras en Firestore y eliminar contraseñas compartidas. El proyecto `sica-inmu-2026` ya está configurado y listo para habilitarlo.
- **Firestore rules** (`firestore.rules`): las colecciones operativas tienen lectura pública en esta versión. Restringir con Auth en producción.
- **Docentes**: considerar OAuth 2.0 en lugar de usuario/contraseña en Sheets.
- **Web App GAS**: restringir a dominio/cuentas autorizadas si se desea mayor control de acceso.

---

## 🆘 Comandos de Emergencia Firebase

```js
// Sistema bloqueado en mantenimiento
FB_SalirMantenimiento()

// Desactivar login con contraseña
await FB_DesactivarLoginPassword()

// Subir configuración inicial a Firestore
await FB_subirConfigInicial({
  login_habilitado: false,
  modo_alumno_activo: true,
  horario_inicio: '07:00',
  horario_fin: '15:00'
})

// Migración completa GAS → Firestore
await FB_MigracionCompleta()

// Migración parcial (sin re-subir alumnos)
await FB_MigracionCompleta({ saltarAlumnos: true })
```

---

## 📊 Resumen de Tecnologías

| Tecnología | Tipo | Uso |
|------------|------|-----|
| HTML5 + CSS3 + JS ES6+ | Frontend | Interfaces, lógica, DOM, exportaciones |
| Firebase Firestore | BD NoSQL nube | Tiempo real, caché distribuida 🆕 |
| Google Apps Script | Backend serverless | CRUD, endpoints, escrituras en Sheets |
| Google Sheets | BD relacional simple | Fuente de verdad maestra |
| GitHub Pages | Hosting | Publicación pública de ambas interfaces |
| html2pdf.js | Librería | Generación de PDF institucional |
| SheetJS (xlsx) | Librería | Exportación/importación de Excel |
| jsQR | Librería | Decodificación QR en tiempo real |
| qrcode-generator | Librería | Generación de códigos QR por NIE |
| pywebview | Desktop | App Windows con acceso a carpetas |

---

<div align="center">

Desarrollado por **Emerson Castro** — Técnico Web INMU  
**DIRECCIÓN DE INNOVACIÓN — Instituto Nacional de Mercedes Umaña**  
Usulután, El Salvador · 2026

</div>
