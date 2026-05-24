[README2.md](https://github.com/user-attachments/files/28196946/README2.md)
# SISTEMA-DE-ASISTENCIA-INMU

Sistema de Control de Asistencia del **Instituto Nacional de Mercedes Umaña (INMU)**  
**DIRECCIÓN DE INNOVACIÓN — INMU · Ciclo C1-2026**

---

## 🌐 URLs en Producción

| Módulo | URL |
|--------|-----|
| Sistema Docente | https://sitioweb001.github.io/SISTEMA-DE-ASISTENCIA-INMU/ |
| Portal Estudiante PERMANENCIA | https://sitioweb001.github.io/Instituto-Nacional-de-Mercedes-Uma-a-Portal-del-Estudiante/ |
| Firebase Console | https://console.firebase.google.com/project/sica-inmu-2026 |

---

## 📁 Archivos del Repositorio

| Archivo | Descripción |
|---------|-------------|
| `INDEX_DOCENTE.html` (v8_11) | Panel docente — asistencia, notas, QR, informes y administración |
| `INDEX_ALUMNO.html` | Portal del estudiante PERMANENCIA — marcación autónoma por NIE |
| `CODIGO_GS_APS_SCRIBT_.gs` | Backend completo en Google Apps Script (escritor maestro) |
| `firebase-config.js` | Control de mantenimiento, login y horario en Firestore (tiempo real) |
| `firebase-docentes.js` | Carga docentes, alumnos y catálogo desde Firestore con fallback GAS |
| `firebase-asistencia.js` | Asistencia portal en tiempo real (onSnapshot) + status docentes |
| `firebase-reportes.js` | Reportes e informes en Firestore |
| `firebase-alumno.js` | Verificación NIE local (<0.1 seg) y horario en tiempo real para el portal |
| `firebase-setup.js` | Migración inicial GAS → Firestore (ejecutar **una sola vez**) |
| `firestore.rules` | Reglas de seguridad de Firebase Firestore |
| `sw.js` (docente) | Service Worker PWA — `asistencia-inmu-pwa-v3` |
| `sw.js` (alumno) | Service Worker PWA — `permanencia-inmu-pwa-v2` |
| `manifest.webmanifest` | Manifiesto PWA para instalación nativa |
| `logo2.svg` | Logo institucional (reemplaza logo.jpg desde v8_11) |
| `plantilla_notas.xls` | Plantilla de notas compatible con importación |
| `INSTRUCCIONES IMPORTAR NOTAS.txt` | Guía de importación de notas (actualizado 13-may-2026) |
| `app_inmu.exe` + `app_inmu_config.json` | App de escritorio Windows (pywebview) |

---

## 🏗️ Arquitectura

```
┌─────────────────────────────┐
│  CAPA 1 — PRESENTACIÓN      │
│  INDEX_DOCENTE.html (v8_11) │
│  INDEX_ALUMNO.html          │  ← GitHub Pages (estático)
└────────────┬────────────────┘
             │
┌────────────▼────────────────┐
│  CAPA 2 — TIEMPO REAL       │
│  Firebase Firestore         │  ← onSnapshot / WebSocket
│  firebase-*.js              │     lecturas <1 seg
└────────────┬────────────────┘
             │ fallback (timeout 6 seg)
┌────────────▼────────────────┐
│  CAPA 3 — LÓGICA DE NEGOCIO │
│  Google Apps Script (GAS)   │  ← Web App HTTP GET/POST + JSONP
│  Escritor maestro           │     escrituras en Sheets
└────────────┬────────────────┘
             │
┌────────────▼────────────────┐
│  CAPA 4 — DATOS MAESTROS    │
│  Google Sheets (11+ hojas)  │  ← Fuente de verdad permanente
└─────────────────────────────┘
```

---

## 🔥 Firebase — Módulos y Colecciones

### Módulos firebase-*.js

| Módulo | Función |
|--------|---------|
| `firebase-config.js` | Configuración global (mantenimiento, login, horario). Intercepta `chequearMantenimientoNube()` y los toggles POST. |
| `firebase-docentes.js` | Intercepta `inicializarBaseDatos()` → carga docentes, alumnos y catálogo desde Firestore. Fallback GAS si timeout 6 seg. |
| `firebase-asistencia.js` | onSnapshot sobre `asistencia_alumnos_inmu`. Auto-marca checkbox del docente. Espeja status docentes. |
| `firebase-reportes.js` | Intercepta `cargarReportesSub()`, `guardarInformeEnNube()`, `cargarHistorialInformes()`. |
| `firebase-alumno.js` | Verificación NIE local (<0.1 seg) + horario tiempo real para `INDEX_ALUMNO.html`. |
| `firebase-setup.js` | Migración inicial. Ejecutar una vez: `await FB_MigracionCompleta()` |

### Colecciones Firestore

| Colección | Propósito |
|-----------|-----------|
| `config_inmu/sistema` | Mantenimiento, login_habilitado, horario, modo_alumno_activo |
| `alumnos_inmu/{nie}` | Lista para verificación local en portal |
| `asistencia_alumnos_inmu/{nie}_{fecha}` | Marcaciones del portal (onSnapshot docente) |
| `presencia_docentes_inmu/{key}` | Estado online/offline en tiempo real |
| `ausencias_inmu/{nie}` | Acumulado de ausencias |
| `reportes_inmu/{id}` | Espejo de reportes de asistencia |
| `informes_inmu/{id}` | Espejo de informes administrativos |
| `docentes_inmu/{key}` | Fichas de docentes |
| `catalogo_materias_inmu/{key}` | Catálogo de materias y módulos |

---

## ⚡ Novedades v8_11 (mayo 2026)

### Auto-marcado del checkbox desde portal
La función `_pintarPortalAutoUI()` fue modificada: cuando un alumno confirma asistencia en el portal PERMANENCIA, el onSnapshot lo detecta y **marca el checkbox automáticamente** en el panel del docente, sin necesidad de presionar ningún botón.

- ✅ Columna Portal muestra hora exacta
- ✅ Checkbox se activa solo
- ✅ Contadores se actualizan automáticamente  
- ✅ Si el docente ya marcó manualmente → no se sobreescribe (regla de protección)
- El botón **"✅ Marcar desde Portal"** sigue disponible para sincronización retroactiva

### Logo institucional
- `logo.jpg` → `logo2.svg`
- Filtro CSS: `filter: brightness(0) invert(1)` → blanco sobre fondo azul
- Tamaños: Móvil 80px · Tablet 100px · Desktop 140px · Web-app 160px
- Sin fondo blanco circular (eliminado)

---

## 📋 Google Sheets — Hojas de la Base de Datos

| Hoja | Descripción |
|------|-------------|
| `alumnos` | Matrícula principal (Grado, Sección, Nombre, Sexo, NIE, Teléfono) |
| `di_refuerzo` | Estudiantes del programa de refuerzo |
| `docentes` | Ficha base del docente (Nombre, Grado, Sección, Materia, Escala, Admin) |
| `docente_materias` | Asignaciones por docente con escala y especialidad |
| `catalogo_materias` | Catálogo editable de materias y módulos |
| `reportes` | Reportes de asistencia diarios generados por docentes |
| `permisos` | Justificaciones y permisos otorgados |
| `conteo_ausencias` | Acumulado histórico de inasistencias |
| `asistencia_alumnos` | Marcaciones desde el portal PERMANENCIA |
| `notas` | Calificaciones escala 0–10 por periodo |
| `nota-tecnicos` | Calificaciones escala 0–5 (módulos técnicos) |
| `observaciones` | Observaciones académicas o de conducta |
| `informes` | Historial de informes administrativos |
| `EstadosDocentes` | Seguimiento online/offline del personal |
| `docente_materias` | Asignaciones de materias por docente |
| `estado_alumnos` | Seguimiento por alumno (Fecha, NIE, Estado, Docente, Observación) |

---

## 🔌 Endpoints GAS

### GET (`doGet`)

| Endpoint | Descripción |
|----------|-------------|
| `?tipo=check_mantenimiento` | Estado del sistema (mantenimiento, login, modo_alumno) |
| `?tipo=docentes` | Docentes con asignaciones completas |
| `?tipo=catalogo_materias` | Catálogo de materias y módulos |
| `?tipo=alumnos&grado=...&seccion=...` | Alumnos filtrados |
| `?tipo=reportes` | Lista de reportes de asistencia |
| `?tipo=notas&grado=...&seccion=...&escala=...` | Notas por grupo y materia |
| `?tipo=horario_asistencia` | Horario + flags de acceso alumnos |
| `?tipo=validar_alumno_nie&nie=...` | Valida NIE para el portal |
| `?tipo=marcar_alumno&nie=...&estado=...` | Marca asistencia (GET/JSONP) |
| `?tipo=asistencia_diaria_grado` | Mapa de asistencias del día |
| `?tipo=historial_informes` | Historial de informes administrativos |

> **CORS/JSONP**: Todos los endpoints soportan `?callback=...` para evitar bloqueos CORS desde GitHub Pages.

### POST (`doPost`)

| `tipo_post` | Descripción |
|-------------|-------------|
| `toggle_mantenimiento` | Apagón global del sistema |
| `toggle_login` | Habilitar/deshabilitar login |
| `toggle_modo_alumno` | Activar/desactivar portal PERMANENCIA |
| `configurar_horario` | Ajustar ventana de marcación |
| `nuevo_docente` | Crear o actualizar docente |
| `guardar_asignaciones_docente` | Reemplazar asignaciones de un docente |
| `guardar_catalogo_materias` | Guardar cambios al catálogo |
| `asistencia` | Guardar reporte de asistencia diario |
| `guardar_notas_grupo` | Guardar calificaciones del grupo |
| `guardar_informe` | Guardar informe administrativo |
| `update_docente_status` | Actualizar estado online/offline |

---

## 🚀 Puesta en Marcha

### Frontend

```bash
# Opción 1 — servidor local (recomendado para PWA)
python -m http.server 8080
# Abrir: http://localhost:8080/INDEX%20DOCENTE.html

# Opción 2
npx http-server -p 8080
```

> Si se abre desde `file://`, el sistema entra en modo offline automático (demo/pruebas).

### Backend (Apps Script)

1. Crear hoja de cálculo en Google Drive
2. Pegar contenido de `CODIGO_GS_APS_SCRIBT_.gs`
3. Desplegar como **Web App**
4. Copiar URL y actualizar `SCRIPT_URL` en ambos HTML

### Migración Firebase (una sola vez)

```js
// En consola del navegador con INDEX_DOCENTE.html cargado:
await FB_MigracionCompleta()

// Migración parcial (sin re-subir alumnos):
await FB_MigracionCompleta({ saltarAlumnos: true })
```

---

## 🛡️ Seguridad

- **Docentes**: usuario + contraseña en hoja `docentes`. `firebase-docentes.js` verifica con fallback GAS.
- **Guard de sesión**: `firebase-config.js` no reabre modales si el docente ya tiene sesión activa (`window.usuarioActual`).
- **Alumnos**: NIE verificado localmente contra lista de Firestore. Restricción por horario en tiempo real.
- **Dispositivo único**: combinación fecha+ID en `localStorage`. Anulación administrativa disponible.
- **Mantenimiento**: configurable desde Firestore sin modificar código.
- **Firestore rules**: `firestore.rules` — colecciones operativas con lectura pública; escrituras validadas por campos requeridos.

---

## 🆘 Comandos de Emergencia (Consola del Navegador)

```js
// Sistema bloqueado en mantenimiento
FB_SalirMantenimiento()

// Desactivar login con contraseña
await FB_DesactivarLoginPassword()

// Subir configuración inicial a Firestore
await FB_subirConfigInicial({ login_habilitado: false, modo_alumno_activo: true })

// Migración completa
await FB_MigracionCompleta()
```

---

## ❓ Problemas Comunes

| Problema | Solución |
|----------|----------|
| Lista de alumnos tarda en cargar | Firebase primero (<1 seg); si falla → GAS automáticamente (5–15 seg cold start) |
| Checkbox no se marca automático | Verificar que auto-portal esté activo (botón 🔄 Auto) |
| Portal dice NIE no encontrado | Verificar alumno en hoja `alumnos` y que Firestore esté actualizado |
| Portal dice "fuera de horario" | Administrador ajusta horario → cambio en segundos vía Firestore |
| Sistema en mantenimiento bloqueado | `FB_SalirMantenimiento()` en consola (F12) |
| PWA no instala | Abrir por `http://` o `https://` — no desde `file://` |
| Notas mezcladas entre materias | Verificar `materia_clave` y escala correcta (0–10 vs 0–5) |
| Importación Excel falla | Usar archivo generado por el sistema (ver `INSTRUCCIONES IMPORTAR NOTAS.txt`) |

---

## 📊 Escalas de Calificación

| Tipo | Escala | Hoja Sheets | Función de decisión |
|------|--------|-------------|---------------------|
| Materias básicas | 0–10 | `notas` | `normalizarEscalaMateriaGas()` |
| Módulos técnicos | 0–5 | `nota-tecnicos` | `getNombreHojaNotas()` |

---

## 📱 PWA

| Función | Detalle |
|---------|---------|
| Instalación | Botón "📥 Instalar app" en navegador compatible (http/https) |
| Modo oscuro/claro | Botón 🌙/☀ — preferencia en `localStorage` |
| Offline (docente) | `sw.js` cachea recursos — `CACHE_NAME: asistencia-inmu-pwa-v3` |
| Offline (alumno) | `sw.js` — `CACHE_NAME: permanencia-inmu-pwa-v2` |
| App escritorio | `app_inmu.exe` — pywebview con acceso a carpetas del sistema |

---

## 👨‍💻 Desarrollado por

**Emerson Castro** — Técnico Web INMU  
**DIRECCIÓN DE INNOVACIÓN — Instituto Nacional de Mercedes Umaña**  
Usulután, El Salvador · 2026
