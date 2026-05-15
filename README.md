# SISTEMA-DE-ASISTENCIA-INMU — README2 (Documentación completa del sistema)

Este README2 documenta **todo el sistema**: módulo **Docente**, módulo **Alumno**, y backend en **Google Apps Script + Google Sheets**. También explica los **agregados recientes**: catálogo de **materias/módulos**, **escala 0–10 / 0–5**, **docentes + asignación de materias**, PWA/offline, “apagón global” (mantenimiento), importación/exportación de notas, informes, QR, etc.

---

## 0) Archivos principales del repositorio

- `INDEX DOCENTE.zip`: paquete principal. Aquí viene `INDEX DOCENTE.html` (módulo Docente) + recursos.
- `INDEX DOCENTE BACKUP.html`: respaldo del módulo Docente (útil como referencia y para revertir).
- `INDEX ALUMNO.html`: portal del estudiante (marcar asistencia por NIE/QR + bloqueo PWA).
- `CODIGO GS APS SCRIBT BACKUP.gs`: backend completo (Apps Script) con endpoints GET/POST.
- `INSTRUCCIONES IMPORTAR NOTAS.txt`: guía operativa de “Importar notas desde Excel” (13-may-2026).
- `sw.js`: Service Worker para PWA/caché offline.
- `plantilla_notas.xls`: plantilla de notas (base).
- `app_inmu.exe` + `app_inmu_config.json`: app de escritorio Windows (usa `pywebview` para integraciones como carpeta de descargas).

---

## 1) Arquitectura (cómo se conecta todo)

**Frontends**
- Docente: `INDEX DOCENTE.html` (en `INDEX DOCENTE.zip`, con respaldo en `INDEX DOCENTE BACKUP.html`).
- Alumno: `INDEX ALUMNO.html`.

**Backend**
- Apps Script: `CODIGO GS APS SCRIBT BACKUP.gs` publicado como **Web App**.

**Base de datos**
- Google Sheets: hojas como `alumnos`, `docentes`, `docente_materias`, `catalogo_materias`, `reportes`, `notas`, `nota-tecnicos`, etc. (ver sección 4).

**Flujo**
1. Los HTML hacen peticiones a `SCRIPT_URL` (Web App de Apps Script).
2. Apps Script lee/escribe en Sheets.
3. El módulo Docente genera PDF/Excel y guarda reportes.
4. El portal Alumno valida NIE y marca asistencia vía endpoint GET/JSONP.

---

## 2) Puesta en marcha (pasos completos)

### 2.1 Ejecutar el front (Docente/Alumno)

**Recomendado (para PWA y `sw.js`)**: servir por `http://localhost` o `https://`.

1. Extrae `INDEX DOCENTE.zip` en una carpeta.
2. Sirve esa carpeta:
   - `python -m http.server 8080`
   - o `npx http-server -p 8080`
3. Abre:
   - Docente: `http://localhost:8080/INDEX%20DOCENTE.html`
   - Alumno: `http://localhost:8080/INDEX%20ALUMNO.html`

**Modo demo/local sin servidor**
- Si abres desde `file://`, el módulo Docente puede entrar en **modo offline automático** (sirve para pruebas, sin sincronizar a la nube).

### 2.2 Publicar el backend (Apps Script) y obtener `SCRIPT_URL`

1. En Google Drive crea una hoja de cálculo (Google Sheets) que será la BD.
2. En Apps Script pega el contenido de `CODIGO GS APS SCRIBT BACKUP.gs`.
3. Despliega como **Web App** (ejecutar como tú / acceso según tu política).
4. Copia la URL del Web App y colócala en:
   - `INDEX DOCENTE.html`: constante `SCRIPT_URL`.
   - `INDEX ALUMNO.html`: constante `SCRIPT_URL`.

---

## 3) Agregados clave (materias, escalas, docentes, asignación)

Esta es la parte más importante para la versión actual del sistema.

### 3.1 Escalas de notas: `0-10` (básicas) y `0-5` (módulos)

**Regla del sistema**
- Materias **básicas** usan escala `0-10`.
- Materias tipo **módulo** (técnicas) usan escala `0-5`.

**En backend (`CODIGO GS APS SCRIBT BACKUP.gs`)**
- Normaliza escala: `normalizarEscalaMateriaGas()`.
- Decide hoja de notas:
  - `notas` si escala 10
  - `nota-tecnicos` si escala 5
  - (ver `getNombreHojaNotas()` / `getOrCreateNotasSheet()`)

**En Docente (`INDEX DOCENTE BACKUP.html`)**
- Selector “Tipo de materia” (básica/módulo) y escala visible:
  - “Escala 0-10” / “Escala 0-5”.
- Los formularios de asignación muestran la escala según la materia seleccionada.

### 3.2 Catálogo de materias y módulos (con especialidades)

**Backend**
- Hoja: `catalogo_materias`.
- Se crea/asegura con: `asegurarHojaCatalogoMaterias()`.
- Si está vacía, carga un catálogo predeterminado:
  - Básicas (0–10): Lenguaje y Literatura, Matemática, Estudios Sociales y Cívica, Ciencia/Salud/Medio Ambiente, Inglés, Informática, Educación Física, Moral/Urbanidad/Cívica, Seminario.
  - Módulos (0–5): Módulo 1/2/3 (con `requiere_especialidad` y lista de especialidades por grado/técnico).
- Endpoint GET: `SCRIPT_URL?tipo=catalogo_materias`.
- Endpoint POST: `tipo_post: "guardar_catalogo_materias"`.

**Docente**
- Existe “Catálogo de materias y módulos” (panel/listado) para guiar la asignación.
- Si el backend no responde, el Docente usa un catálogo fallback interno.

### 3.3 Docentes (registro) y asignación de materias (lo nuevo)

El sistema separa:
- La “ficha base” del docente (nombre, grado/sección orientado, admin, etc.).
- Sus **materias asignadas** (pueden ser varias, con escala y especialidad).

**Hojas en Sheets**
- `docentes`: ficha base (y migración de columnas si era versión vieja).
- `docente_materias`: asignaciones detalladas por docente.

**Backend (Apps Script)**
- Asegura `docentes`: `asegurarHojaDocentes()` (migración a columnas `Materia`, `Escala`, `Admin`).
- Asegura `docente_materias`: `asegurarHojaAsignacionesDocente()`.
- Endpoint GET (lista docentes con asignaciones): `SCRIPT_URL?tipo=docentes` o `SCRIPT_URL?tipo=lista_docentes`.
- Endpoint POST (crear docente): `tipo_post: "nuevo_docente"`.
- Endpoint POST (guardar cambios de asignaciones): `tipo_post: "guardar_asignaciones_docente"`.

**Cómo registrar un docente (paso a paso)**
1. En Docente, entra al menú admin “👨‍🏫 Añadir Docente”.
2. Completa Nombre + (grado/sección orientado si aplica).
3. Agrega al menos 1 materia:
   - Selecciona categoría: “materias básicas (0-10)” o “módulos (0-5)”.
   - Selecciona materia del catálogo.
   - Si requiere especialidad, elige especialidad.
4. Guarda. El sistema envía `tipo_post: "nuevo_docente"` al backend y crea/actualiza:
   - `docentes` (fila principal)
   - `docente_materias` (todas las asignaciones)

**Cómo asignar / editar materias a un docente (paso a paso)**
1. En Docente, entra a “ASIGNAR MATERIA”.
2. Selecciona el docente en la lista.
3. Verifica el resumen (grado, sección, materia orientada, escala).
4. Agrega o elimina materias, y marca la asignación “orientada” si corresponde.
5. Guarda cambios → envía `tipo_post: "guardar_asignaciones_docente"`.

**Qué significa “orientado”**
- Una asignación marcada como “orientada” define la materia principal que se usa como referencia (por ejemplo, materia/escala principal al cargar el sistema).

---

## 4) Google Sheets: hojas (BD) y propósito (completo)

> El backend crea hojas automáticamente si no existen, y agrega encabezados.

- `alumnos`: listado principal de estudiantes (Grado, Sección, Nombre, Sexo, NIE, Teléfono).
- `di_refuerzo`: estudiantes de DI Refuerzo (misma estructura que `alumnos`).
- `docentes`: ficha base del docente (Nombre, Grado, Sección, Materia, Escala, Admin).
- `docente_materias`: asignaciones por docente (Docente, Grado, Sección, TipoMateria, Materia, Escala, Especialidad, EsOrientado, Activo).
- `catalogo_materias`: catálogo editable (Nombre, Categoría, Escala, RequiereEspecialidad, EspecialidadesJSON, Activo).
- `reportes`: reportes de asistencia diarios (Fecha, Grado, Sección, Docente, Presentes, Ausentes, Permisos, M, F, listas JSON).
- `permisos`: justificaciones/permisos (Fecha, Grado, Sección, Docente, Estudiante, Sexo, NIE, Justificante).
- `conteo_ausencias`: contador histórico de ausencias por estudiante (Estudiante, NIE, Grado, Sección, Conteo).
- `asistencia_actualizaciones`: bitácora de cambios/actualizaciones de asistencia.
- `observaciones`: observaciones disciplinarias o notas del alumno (NIE, Fecha, Docente, Observación).
- `estado_alumnos`: estados/seguimiento por alumno (Fecha, NIE, Nombre, Grado, Sección, Estado, Docente, Observación).
- `asistencia_alumnos`: asistencia marcada desde el portal Alumno (Fecha, NIE, Nombre, Grado, Sección, Estado, Hora, Justificante).
- `informes`: módulo de informes (ID, fecha registro, tipo, docente, grado, sección, alumnos JSON, testigos, etc.).
- `notas`: notas escala 10 (básicas), por (Grado, Sección, NIE, ClaveMateria…).
- `nota-tecnicos`: notas escala 5 (módulos técnicos), misma lógica que `notas`.
- `EstadosDocentes`: estado online/offline de docentes (usado por `docentes_status` / `update_docente_status`).

---

## 5) Backend (Apps Script): endpoints GET/POST (resumen operativo)

### 5.1 Endpoints GET (`doGet`)

- `?tipo=check_mantenimiento`: devuelve `{ mantenimiento, login_habilitado, modo_alumno }`.
- `?tipo=docentes` / `?tipo=lista_docentes`: docentes + materias asignadas.
- `?tipo=catalogo_materias`: catálogo de materias/módulos.
- `?tipo=alumnos&grado=...&seccion=...`: alumnos filtrados (incluye `di_refuerzo`).
- `?tipo=reportes`: lista de reportes de asistencia.
- `?tipo=detalles_asistencia&grado=...&seccion=...&docente=...&fecha=...`: detalle puntual.
- `?tipo=permisos`: lista de permisos/justificaciones.
- `?tipo=detalle_alumno&nie=...&grado=...&seccion=...`: expediente rápido (faltas + justificantes).
- `?tipo=obtener_observaciones&nie=...`: observaciones del alumno.
- `?tipo=notas&grado=...&seccion=...&escala=0-10|0-5&materia_clave=...`: notas por grado/sección/materia.
- `?tipo=historial_informes`: historial del módulo de informes.
- `?tipo=buscar_alumno&query=...`: búsqueda (nombre o NIE).
- `?tipo=obtener_alumno_nie&nie=...`: obtener alumno por NIE.
- `?tipo=expediente_alumno&nie=...`: expediente más completo (según implementación).
- `?tipo=horario_asistencia`: devuelve horario + flags de acceso alumnos.
- `?tipo=validar_alumno_nie&nie=...`: valida NIE y marca si ya registró hoy.
- `?tipo=marcar_alumno&nie=...&estado=presente|...&justificante=...`: marca asistencia desde portal Alumno (GET/JSONP).
- `?tipo=asistencia_diaria_grado`: mapa de asistencias del día (usa NIE como llave).

Nota CORS/JSONP:
- El backend soporta JSONP con `?callback=...` para evitar bloqueos CORS desde GitHub Pages.

### 5.2 Endpoints POST (`doPost`)

Administración global (requiere password “maestra” en el backend):
- `tipo_post: "toggle_mantenimiento"` (apagón global).
- `tipo_post: "toggle_login"` (habilitar/deshabilitar login global).
- `tipo_post: "toggle_modo_alumno"` (habilitar/deshabilitar portal de alumnos).
- `tipo_post: "configurar_horario"` (horario y modo alumno, con password).

Docentes/materias:
- `tipo_post: "nuevo_docente"`.
- `tipo_post: "guardar_asignaciones_docente"`.
- `tipo_post: "guardar_catalogo_materias"`.

Asistencia e historial:
- `tipo_post: "asistencia"` (guarda reporte diario).
- `tipo_post: "actualizar_asistencia"` (bitácora de cambios).
- `tipo_post: "agregar_observacion"`.
- `tipo_post: "guardar_estado_alumno"`.
- `tipo_post: "update_docente_status"`.

Notas e informes:
- `tipo_post: "guardar_notas_alumno"`.
- `tipo_post: "guardar_notas_grupo"`.
- `tipo_post: "exportar_excel_notas"`.
- `tipo_post: "guardar_informe"`.
- `tipo_post: "eliminar_informe"`.

Portal Alumno:
- `tipo_post: "marcar_asistencia_alumno"` (existe, pero el portal alumno usa principalmente el GET `tipo=marcar_alumno` por robustez).

---

## 6) Módulo Docente (funciones del sistema)

### 6.1 Pasar lista (asistencia)

Flujo típico:
1. Selecciona `Grado` y `Sección`.
2. Selecciona `Docente` y `Materia` (según asignaciones).
3. Marca presentes/ausentes/permisos.
4. Genera PDF y guarda reporte (se registra en `reportes`, `permisos`, `conteo_ausencias`).

### 6.2 PDF institucional y carpeta de descargas (app)

- En Windows (app) se puede seleccionar carpeta destino (PDF/Excel/TXT) usando `pywebview`.
- En Android se persiste `carpeta_pdf_uri`/`nombre` con `AndroidStorage`.
- En web se usa la carpeta de descargas del navegador.

### 6.3 Notas (por períodos) + escalas + materia clave

- El sistema maneja notas por períodos (P1..P4) y componentes (Cuaderno/Integradora/Examen).
- La **escala** define hoja destino:
  - `0-10` → `notas`
  - `0-5`  → `nota-tecnicos`
- Se usa `materia_clave`/`ClaveMateria` para separar materias y especialidades.

### 6.4 Exportar e Importar notas (Excel)

- Exportación: “📊 Exportar Notas a Excel (.xlsx)” (SheetJS).
- Importación: “📥 Importar Notas” (ver `INSTRUCCIONES IMPORTAR NOTAS.txt`, cambio 13-may-2026).

### 6.5 Informes (módulo administrativo)

- Guarda registros en la hoja `informes` con alumnos implicados, testigos, observaciones y metadatos.

### 6.6 PWA + mantenimiento + offline (Docente)

- PWA: botón “📥 Instalar app” aparece cuando el navegador lo permite (`beforeinstallprompt`).
- Service Worker: `sw.js` se registra fuera de `file://`.
- Mantenimiento: `toggleMantenimiento()` envía `tipo_post: "toggle_mantenimiento"`.
- Offline: si no hay nube o se abre en `file://`, se carga fallback local (datos demo).

---

## 7) Portal Alumno (`INDEX ALUMNO.html`) — funcionamiento completo

### 7.1 Verificación del sistema y bloqueo PWA

Al abrir:
1. Consulta `SCRIPT_URL?tipo=horario_asistencia` (usa `fetchJsonp` con fallback JSONP).
2. Si `mantenimiento === true` → muestra bloqueo “mantenimiento”.
3. Si `acceso_alumnos`/`activo` es falso → bloqueo “alumnos_off”.
4. Si no logra verificar (sin caché) → bloqueo “offline”.

Bloqueo fullscreen:
- Overlay de bloqueo con tipos: `mantenimiento`, `alumnos_off`, `offline`.
- Permite desbloqueo temporal (modo docente) mediante código admin y guarda flag en `sessionStorage`.

### 7.2 Marcar asistencia del alumno (NIE)

Flujo:
1. El alumno ingresa NIE o busca por nombre/NIE.
2. Se valida con `SCRIPT_URL?tipo=validar_alumno_nie&nie=...` (o búsqueda con `?tipo=buscar_alumno`).
3. Para marcar asistencia usa endpoint robusto GET:
   - `SCRIPT_URL?tipo=marcar_alumno&nie=...&estado=presente&justificante=...`
4. Si hay red, guarda en nube; si no hay red, guarda localmente y muestra éxito.

### 7.3 Service Worker (PWA) en Alumno

- Registra `./sw.js` cuando está servido por http/https (no `file://`).

---

## 8) “Apagón global”, login global y portal alumno (control total)

### 8.1 Apagón global (MANTENIMIENTO)

- GET: `?tipo=check_mantenimiento` refleja `mantenimiento`.
- POST: `tipo_post: "toggle_mantenimiento"` alterna el estado.
  - En `CODIGO GS APS SCRIBT BACKUP.gs` la clave maestra está hardcodeada (por defecto aparece como `747-8`). Cámbiala antes de producción.

### 8.2 Login global (LOGIN_HABILITADO)

- GET: `?tipo=check_mantenimiento` refleja `login_habilitado`.
- POST: `tipo_post: "toggle_login"` alterna login.

### 8.3 Portal Alumno (MODO_ALUMNO_ACTIVO)

- GET: `?tipo=check_mantenimiento` refleja `modo_alumno`.
- GET: `?tipo=horario_asistencia` refleja `acceso_alumnos`.
- POST: `tipo_post: "toggle_modo_alumno"` activa/desactiva acceso alumnos.

---

## 9) Problemas comunes (y cómo resolver)

- **PWA no instala**: abrir por `http://localhost` o `https://` (no `file://`). Añadir `manifest.json` si quieres instalación completa (este repo no lo incluye).
- **PWA/offline no cachea lo esperado**: revisa `sw.js` → `URLS_TO_CACHE` y ajusta rutas/nombres reales de tus HTML/recursos.
- **Alumno bloqueado (alumnos_off)**: revisa `MODO_ALUMNO_ACTIVO` (toggle desde Docente/backend).
- **Mantenimiento activo**: desactívalo con “apagón global” desde Docente (requiere clave).
- **Notas mezcladas entre materias**: asegúrate de usar `materia_clave`/materia correcta y escala adecuada (`0-10` vs `0-5`).
- **Importación Excel falla**: usa un archivo con el formato generado por el sistema (ver `INSTRUCCIONES IMPORTAR NOTAS.txt`).

---

## 10) Notas de seguridad (recomendado)

- Las claves maestras/admin no SE DARA POR ACA.
- Para producción: mover controles a backend con usuarios/roles, o restringir el Web App a dominio/cuentas autorizadas.




































# 🧠 Sistema de Control de Asistencia INMU — SICA-INMU

![Estado](https://img.shields.io/badge/Estado-Activo-success)
![Frontend](https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3%20%7C%20JavaScript-blue)
![Backend](https://img.shields.io/badge/Backend-Google%20Apps%20Script-yellow)
![Base de Datos](https://img.shields.io/badge/Base%20de%20Datos-Google%20Sheets-green)
![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-purple)
![Licencia](https://img.shields.io/badge/Licencia-Educativa-orange)

---

## 📌 Descripción General

**SICA-INMU** es un sistema web institucional desarrollado para el **Instituto Nacional de Mercedes Umaña (INMU)**, orientado a la digitalización del control de asistencia estudiantil, administración académica, generación de reportes, gestión de notas y validación autónoma de estudiantes mediante el portal **PERMANENCIA**.

El proyecto integra tres componentes principales:

1. **Módulo Docente**  
   Panel administrativo para docentes y personal autorizado.

2. **Portal del Estudiante PERMANENCIA**  
   Interfaz para que los estudiantes validen su asistencia mediante NIE.

3. **Backend en Google Apps Script + Google Sheets**  
   API serverless encargada de leer, escribir, validar y almacenar toda la información institucional.

El sistema busca reemplazar procesos manuales en papel por una plataforma digital **rápida, trazable, accesible, responsive y de bajo costo**.

---

## 🎯 Objetivo General

Desarrollar una plataforma web de control de asistencia estudiantil que permita registrar, consultar y administrar información académica de forma eficiente, automatizada y accesible para docentes, estudiantes y administradores, usando tecnologías gratuitas o de bajo costo.

---

## ✅ Objetivos Específicos

- Automatizar el registro diario de asistencia estudiantil.
- Reducir errores humanos en conteos de presentes, ausentes y permisos.
- Implementar un portal del estudiante con validación por NIE.
- Centralizar la información académica en Google Sheets.
- Generar reportes institucionales en PDF.
- Exportar e importar calificaciones mediante Excel.
- Integrar escaneo QR para agilizar la toma de asistencia.
- Incorporar controles administrativos como mantenimiento global, login global y portal alumno.
- Permitir funcionamiento parcial offline mediante PWA y Service Worker.
- Mantener una arquitectura simple, económica y funcional para entornos educativos.

---

## 👥 Usuarios del Sistema

| Rol | Funciones Principales |
|---|---|
| 👨‍🏫 Docentes | Registrar asistencia, generar reportes, gestionar notas, usar QR, consultar alumnos e informes. |
| 🎓 Estudiantes | Validar su identidad mediante NIE y marcar asistencia desde el portal PERMANENCIA. |
| ⚙️ Administradores | Gestionar docentes, asignaciones, horarios, mantenimiento, catálogo de materias y configuración global. |

---

## 🏗️ Arquitectura General

El sistema utiliza una arquitectura cliente-servidor de tres capas:

```text
┌───────────────────────────────────────┐
│ CAPA 1 — FRONTEND                     │
│ INDEX DOCENTE.html                    │
│ INDEX ALUMNO.html                     │
│ HTML5 + CSS3 + JavaScript             │
└───────────────────┬───────────────────┘
                    │ HTTP GET / POST / JSONP
                    ▼
┌───────────────────────────────────────┐
│ CAPA 2 — BACKEND                      │
│ Google Apps Script Web App            │
│ Endpoints, validaciones y lógica      │
└───────────────────┬───────────────────┘
                    │ SpreadsheetApp
                    ▼
┌───────────────────────────────────────┐
│ CAPA 3 — BASE DE DATOS                │
│ Google Sheets                         │
│ Alumnos, docentes, notas, reportes    │
└───────────────────────────────────────┘
```

### Flujo Resumido

1. El usuario accede al módulo Docente o Alumno.
2. El frontend realiza peticiones a `SCRIPT_URL`.
3. Google Apps Script procesa las solicitudes.
4. Los datos se leen o escriben en Google Sheets.
5. El sistema devuelve una respuesta JSON o JSONP.
6. La interfaz actualiza la vista, genera reportes o confirma acciones.

---

## 🧰 Tecnologías Utilizadas

### Frontend

- **HTML5** — estructura semántica, formularios, PWA.
- **CSS3** — diseño responsive, modo oscuro/claro, variables, animaciones.
- **JavaScript ES6+** — lógica del cliente, DOM, peticiones, QR, PDF, Excel.

### Backend

- **Google Apps Script** — backend serverless, endpoints GET/POST, validaciones y conexión con Sheets.

### Base de Datos

- **Google Sheets** — almacenamiento de alumnos, docentes, asistencia, notas, reportes e informes.

### Librerías Externas

- **html2pdf.js** — generación de PDF desde HTML.
- **SheetJS / xlsx** — exportación e importación de notas Excel.
- **qrcode-generator** — generación de códigos QR.
- **jsQR** — lectura de códigos QR desde cámara.
- **pdf.js** — visualización de PDFs.
- **Google Fonts / Inter** — tipografía moderna en portal alumno.

### Plataforma

- **GitHub Pages** — publicación del frontend.
- **Service Worker** — caché offline y soporte PWA.
- **pywebview** — app de escritorio Windows para envoltorio nativo.

---

## 📁 Archivos Principales del Repositorio

```text
SISTEMA-DE-ASISTENCIA-INMU/
│
├── INDEX DOCENTE.zip
├── INDEX DOCENTE BACKUP.html
├── INDEX ALUMNO.html
├── CODIGO GS APS SCRIBT BACKUP.gs
├── INSTRUCCIONES IMPORTAR NOTAS.txt
├── sw.js
├── manifest.webmanifest
├── plantilla_notas.xls
├── app_inmu.exe
├── app_inmu_config.json
└── README.md
```

| Archivo | Descripción |
|---|---|
| `INDEX DOCENTE.zip` | Paquete principal del módulo Docente. |
| `INDEX DOCENTE BACKUP.html` | Respaldo del panel docente para referencia o reversión. |
| `INDEX ALUMNO.html` | Portal del Estudiante PERMANENCIA. |
| `CODIGO GS APS SCRIBT BACKUP.gs` | Backend completo en Google Apps Script. |
| `INSTRUCCIONES IMPORTAR NOTAS.txt` | Guía operativa para importar notas desde Excel. |
| `sw.js` | Service Worker para caché offline/PWA. |
| `manifest.webmanifest` | Manifiesto PWA para instalación nativa. |
| `plantilla_notas.xls` | Plantilla base de calificaciones. |
| `app_inmu.exe` | Aplicación Windows basada en pywebview. |
| `app_inmu_config.json` | Configuración de la app de escritorio. |

---

## 🚀 Instalación y Puesta en Marcha

### 1. Ejecutar el Frontend Localmente

Para probar correctamente PWA y Service Worker se recomienda usar un servidor local.

```bash
python -m http.server 8080
```

Luego abrir:

```text
http://localhost:8080/INDEX%20DOCENTE.html
http://localhost:8080/INDEX%20ALUMNO.html
```

También puede usarse:

```bash
npx http-server -p 8080
```

> ⚠️ Si se abre directamente con `file://`, algunas funciones pueden ejecutarse en modo offline/demo, pero no se garantiza sincronización completa con la nube.

---

### 2. Crear Base de Datos en Google Sheets

1. Crear una hoja de cálculo en Google Drive.
2. Nombrarla como base de datos del sistema.
3. Permitir acceso al propietario del Apps Script.
4. El backend creará hojas necesarias si no existen.

---

### 3. Publicar Backend en Google Apps Script

1. Abrir Google Apps Script.
2. Pegar el contenido de `CODIGO GS APS SCRIBT BACKUP.gs`.
3. Configurar el ID de la hoja de cálculo si aplica.
4. Desplegar como **Web App**.
5. Ejecutar como propietario.
6. Copiar la URL del Web App.

---

### 4. Configurar `SCRIPT_URL`

Pegar la URL del Web App en:

```javascript
const SCRIPT_URL = "TU_URL_DE_GOOGLE_APPS_SCRIPT";
```

Debe actualizarse en:

- `INDEX DOCENTE.html`
- `INDEX ALUMNO.html`

---

## 🧩 Módulos del Sistema

## 1. Módulo Docente

El módulo Docente es el panel principal para personal docente y administrativo.

### Funciones Principales

- Inicio de sesión.
- Selección de grado y sección.
- Carga dinámica de estudiantes.
- Registro de asistencia.
- Sincronización con portal alumno.
- Generación de PDF institucional.
- Gestión de notas.
- Exportación/importación Excel.
- Módulo QR.
- Informes administrativos.
- Control de mantenimiento.
- Gestión de docentes y materias.

---

### Flujo de Asistencia Docente

1. Iniciar sesión.
2. Seleccionar grado y sección.
3. Seleccionar docente y materia.
4. Cargar alumnos.
5. Marcar estado:
   - Presente
   - Ausente
   - Permiso
6. Verificar contadores.
7. Sincronizar con portal si aplica.
8. Generar PDF.
9. Guardar reporte.

---

### Estados de Asistencia

| Estado | Color | Descripción |
|---|---|---|
| Presente | Verde | El estudiante asistió. |
| Ausente | Rojo | El estudiante no asistió. |
| Permiso | Ámbar/Naranja | Ausencia justificada. |

---

## 2. Portal del Estudiante PERMANENCIA

El portal del estudiante permite que el alumno registre su asistencia de forma autónoma usando su NIE.

### Funciones

- Validación de NIE.
- Búsqueda por nombre o NIE.
- Verificación de horario activo.
- Bloqueo por mantenimiento.
- Bloqueo por modo alumno desactivado.
- Marcación de asistencia.
- Confirmación con hora exacta.
- Caché local ante fallos de conectividad.

---

### Flujo del Estudiante

1. Abrir portal PERMANENCIA.
2. Ingresar NIE.
3. Pulsar verificar.
4. El sistema valida el estudiante.
5. Si el horario está activo, permite marcar.
6. El alumno confirma asistencia.
7. El sistema registra en Google Sheets.
8. Se muestra pantalla de éxito.

---

## 3. Módulo QR

El sistema incluye generación y lectura de códigos QR basados en el NIE del estudiante.

### Funciones QR

- Generar carnés QR.
- Leer códigos con cámara.
- Marcar estudiantes como presentes automáticamente.
- Usar búsqueda manual como respaldo.
- Marcar ausentes en bloque al finalizar.

---

## 4. Módulo de Notas

El sistema administra calificaciones por materia, periodo y escala.

### Escalas Soportadas

| Tipo de Materia | Escala | Hoja Destino |
|---|---:|---|
| Materias básicas | 0–10 | `notas` |
| Módulos técnicos | 0–5 | `nota-tecnicos` |

### Componentes de Evaluación

- Periodo 1
- Periodo 2
- Periodo 3
- Periodo 4
- Cuaderno
- Integradora
- Examen
- Promedios

---

## 5. Catálogo de Materias y Módulos

El sistema posee un catálogo centralizado en la hoja:

```text
catalogo_materias
```

### Materias Básicas Predeterminadas

- Lenguaje y Literatura
- Matemática
- Estudios Sociales y Cívica
- Ciencia, Salud y Medio Ambiente
- Inglés
- Informática
- Educación Física
- Moral, Urbanidad y Cívica
- Seminario

### Módulos Técnicos

- Módulo 1
- Módulo 2
- Módulo 3

Los módulos pueden requerir especialidad según grado/técnico.

---

## 6. Gestión de Docentes y Asignación de Materias

El sistema separa la ficha del docente de sus materias asignadas.

### Hojas Relacionadas

```text
docentes
docente_materias
```

### `docentes`

Contiene la ficha base:

- Nombre
- Grado
- Sección
- Materia
- Escala
- Admin

### `docente_materias`

Contiene asignaciones detalladas:

- Docente
- Grado
- Sección
- TipoMateria
- Materia
- Escala
- Especialidad
- EsOrientado
- Activo

---

## 🗃️ Base de Datos en Google Sheets

El backend crea automáticamente las hojas necesarias si no existen.

| Hoja | Propósito |
|---|---|
| `alumnos` | Listado principal de estudiantes. |
| `di_refuerzo` | Estudiantes del programa DI Refuerzo. |
| `docentes` | Ficha base de docentes. |
| `docente_materias` | Asignaciones de materias por docente. |
| `catalogo_materias` | Catálogo editable de materias y módulos. |
| `reportes` | Reportes diarios de asistencia. |
| `permisos` | Justificaciones o permisos. |
| `conteo_ausencias` | Historial acumulado de ausencias. |
| `asistencia_actualizaciones` | Bitácora de cambios en asistencia. |
| `observaciones` | Observaciones académicas/conductuales. |
| `estado_alumnos` | Seguimiento de estados del alumno. |
| `asistencia_alumnos` | Marcaciones desde portal alumno. |
| `informes` | Informes administrativos. |
| `notas` | Calificaciones escala 0–10. |
| `nota-tecnicos` | Calificaciones escala 0–5. |
| `EstadosDocentes` | Estado online/offline de docentes. |

---

## 🔌 Endpoints del Backend

## GET — `doGet(e)`

### Sistema y Configuración

```text
?tipo=check_mantenimiento
?tipo=horario_asistencia
```

### Docentes y Materias

```text
?tipo=docentes
?tipo=lista_docentes
?tipo=catalogo_materias
```

### Alumnos

```text
?tipo=alumnos&grado=...&seccion=...
?tipo=buscar_alumno&query=...
?tipo=obtener_alumno_nie&nie=...
?tipo=detalle_alumno&nie=...
?tipo=expediente_alumno&nie=...
```

### Asistencia

```text
?tipo=validar_alumno_nie&nie=...
?tipo=marcar_alumno&nie=...&estado=presente
?tipo=asistencia_diaria_grado
?tipo=detalles_asistencia&grado=...&seccion=...&docente=...&fecha=...
```

### Reportes e Informes

```text
?tipo=reportes
?tipo=permisos
?tipo=historial_informes
```

### Notas

```text
?tipo=notas&grado=...&seccion=...&escala=0-10&materia_clave=...
?tipo=notas&grado=...&seccion=...&escala=0-5&materia_clave=...
```

---

## POST — `doPost(e)`

### Administración Global

```json
{ "tipo_post": "toggle_mantenimiento" }
```

```json
{ "tipo_post": "toggle_login" }
```

```json
{ "tipo_post": "toggle_modo_alumno" }
```

```json
{ "tipo_post": "configurar_horario" }
```

### Docentes y Materias

```json
{ "tipo_post": "nuevo_docente" }
```

```json
{ "tipo_post": "guardar_asignaciones_docente" }
```

```json
{ "tipo_post": "guardar_catalogo_materias" }
```

### Asistencia

```json
{ "tipo_post": "asistencia" }
```

```json
{ "tipo_post": "actualizar_asistencia" }
```

```json
{ "tipo_post": "guardar_estado_alumno" }
```

```json
{ "tipo_post": "update_docente_status" }
```

### Observaciones

```json
{ "tipo_post": "agregar_observacion" }
```

### Notas

```json
{ "tipo_post": "guardar_notas_alumno" }
```

```json
{ "tipo_post": "guardar_notas_grupo" }
```

```json
{ "tipo_post": "exportar_excel_notas" }
```

### Informes

```json
{ "tipo_post": "guardar_informe" }
```

```json
{ "tipo_post": "eliminar_informe" }
```

### Portal Alumno

```json
{ "tipo_post": "marcar_asistencia_alumno" }
```

> Nota: el portal alumno utiliza principalmente el endpoint GET `tipo=marcar_alumno` por compatibilidad y robustez con JSONP.

---

## 📄 Reportes PDF

El módulo Docente puede generar PDFs institucionales con:

- Membrete del instituto.
- Fecha.
- Grado y sección.
- Docente.
- Materia.
- Estadísticas.
- Lista de presentes.
- Lista de ausentes.
- Lista de permisos.
- Totales por sexo.
- Registro histórico en Google Sheets.

---

## 📊 Exportación e Importación de Notas

### Exportar

Desde el módulo de calificaciones:

```text
📊 Exportar Notas a Excel (.xlsx)
```

El sistema genera un archivo compatible con SheetJS.

### Importar

Desde el módulo de calificaciones:

```text
📥 Importar Notas
```

Recomendaciones:

- Usar archivos generados por el propio sistema.
- No alterar estructura de columnas.
- Revisar `INSTRUCCIONES IMPORTAR NOTAS.txt`.
- Validar escala antes de importar.

---

## 📱 Progressive Web App — PWA

El sistema soporta instalación como aplicación web progresiva.

### Funciones PWA

- Instalación en escritorio y móvil.
- Caché offline mediante `sw.js`.
- Carga rápida.
- Modo claro/oscuro.
- Funcionamiento parcial sin conexión.

### Requisitos

- Servir por `http://localhost` o `https://`.
- No usar `file://` para pruebas completas.
- Revisar rutas en `URLS_TO_CACHE` del Service Worker.

---

## 🖥️ App de Escritorio Windows

El proyecto incluye una app Windows basada en **pywebview**:

```text
app_inmu.exe
app_inmu_config.json
```

### Funciones

- Abrir el módulo Docente en ventana nativa.
- Seleccionar carpeta de destino para descargas.
- Facilitar uso institucional en computadoras Windows.

---

## 🔐 Seguridad

### Mecanismos Implementados

- Login docente.
- Verificación humana.
- Contraseña maestra para administración.
- Validación de NIE para estudiantes.
- Restricción de horario.
- Bloqueo de duplicados.
- Mantenimiento global.
- Registro con timestamp automático.
- Manejo de errores con `try/catch`.
- JSON seguro con `parseSafeJSON()`.

### Recomendaciones de Seguridad

- Cambiar la clave maestra antes de producción.
- Evitar publicar contraseñas en repositorios públicos.
- Restringir acceso a Google Sheets.
- Usar cuentas institucionales.
- Migrar a OAuth 2.0 o Firebase Authentication en futuras versiones.

---

## 🛠️ Variables de Control Global

| Variable | Valor | Función |
|---|---|---|
| `MANTENIMIENTO` | `true/false` | Bloquea acceso global. |
| `LOGIN_HABILITADO` | `true/false` | Activa/desactiva login docente. |
| `MODO_ALUMNO_ACTIVO` | `true/false` | Activa/desactiva portal alumno. |

---

## 🚨 Modo Mantenimiento

El sistema permite activar un “apagón global” desde administración.

Cuando está activo:

- El portal docente puede bloquearse.
- El portal alumno muestra pantalla de mantenimiento.
- Se impide el uso normal del sistema.
- El backend sigue respondiendo el estado del sistema.

---

## 🌐 JSONP y CORS

Como el frontend puede estar alojado en GitHub Pages y el backend en Apps Script, el sistema utiliza JSONP como mecanismo para evitar bloqueos CORS.

Ejemplo:

```text
SCRIPT_URL?tipo=validar_alumno_nie&nie=123456&callback=miCallback
```

---

## ⚙️ Funciones Técnicas Importantes

| Función | Responsabilidad |
|---|---|
| `doGet(e)` | Atiende solicitudes GET. |
| `doPost(e)` | Procesa solicitudes POST. |
| `getAlumnosCache(ss)` | Obtiene alumnos con caché. |
| `normalizarTexto(valor)` | Normaliza tildes y texto. |
| `parseSafeJSON(value)` | Evita errores por JSON inválido. |
| `normalizarEscalaMateriaGas()` | Normaliza escala 0–10 / 0–5. |
| `getNombreHojaNotas()` | Decide hoja de notas según escala. |
| `marcarAsistenciaAlumno(data)` | Registra asistencia desde portal. |
| `guardarInforme(informe)` | Guarda informes administrativos. |
| `updateDocenteStatus()` | Actualiza estado docente online/offline. |

---

## 🧪 Pruebas Realizadas

### Pruebas Funcionales

- Login docente.
- Registro de asistencia.
- Estados presente/ausente/permiso.
- Generación PDF.
- Validación NIE.
- Duplicados en portal alumno.
- Notas por escala.
- Registro de docentes.

### Pruebas de Conexión

- Conexión estable.
- Conexión lenta.
- Modo offline parcial.
- Respuesta con caché.
- JSONP desde GitHub Pages.

### Pruebas QR

- Cámara de teléfono.
- Webcam de computadora.
- Lectura con poca luz.
- Códigos generados por sistema.
- Búsqueda manual como respaldo.

### Resultado

El sistema mostró funcionamiento estable en condiciones normales, con integración correcta entre frontend, backend y Google Sheets.

---

## ✅ Ventajas

- Reduce el uso de papel.
- Ahorra tiempo administrativo.
- Centraliza datos institucionales.
- Genera reportes automáticos.
- Funciona desde cualquier navegador moderno.
- Puede instalarse como PWA.
- Usa servicios gratuitos o de bajo costo.
- Permite trazabilidad mediante registros históricos.
- Incluye soporte QR.
- Permite notas por escala.
- Tiene control administrativo global.

---

## ⚠️ Limitaciones

- Google Sheets no es ideal para alta concurrencia masiva.
- Apps Script posee cuotas diarias y límites de ejecución.
- JSONP es funcional, pero no es la opción más moderna.
- La autenticación básica puede mejorarse.
- Las claves administrativas no deben quedar expuestas.
- Se recomienda migrar a una base más robusta si crece el sistema.

---

## 🧯 Problemas Comunes y Soluciones

### La PWA no instala

Solución:

- Abrir desde `https://` o `http://localhost`.
- Verificar `manifest.webmanifest`.
- Revisar `sw.js`.

### El portal alumno aparece bloqueado

Solución:

- Revisar `MODO_ALUMNO_ACTIVO`.
- Verificar horario.
- Confirmar que mantenimiento esté desactivado.

### No carga la lista de alumnos

Solución:

- Revisar `SCRIPT_URL`.
- Confirmar permisos del Apps Script.
- Validar que la hoja `alumnos` exista.

### Las notas se mezclan

Solución:

- Revisar `materia_clave`.
- Confirmar escala correcta.
- Separar básicas y módulos técnicos.

### Importación Excel falla

Solución:

- Usar plantilla generada por el sistema.
- No cambiar encabezados.
- Revisar instrucciones de importación.

---

## 📈 Recomendaciones Futuras

- Migrar a Firebase Firestore o Cloud SQL.
- Implementar OAuth 2.0.
- Agregar notificaciones push.
- Crear dashboard de estadísticas.
- Implementar gráficos con Chart.js.
- Mejorar accesibilidad WCAG.
- Documentar funciones con JSDoc.
- Usar GitHub Actions para control de versiones.
- Separar frontend en módulos.
- Añadir roles más granulares.

---

## 🔮 Roadmap Propuesto

### Versión 1.1

- Mejorar interfaz de configuración.
- Optimizar Service Worker.
- Añadir más validaciones.

### Versión 1.2

- Dashboard estadístico.
- Reportes por periodo.
- Mejor control de roles.

### Versión 2.0

- Migración a Firebase.
- Autenticación moderna.
- API REST más segura.
- Panel directivo avanzado.

---

## 👨‍💻 Autor / Desarrollador

**Emerson Giancarlo Castro Pleitez**  
Desarrollador del Sistema SICA-INMU  
Instituto Nacional de Mercedes Umaña  
El Salvador — 2026

---

## 🏫 Institución

**Instituto Nacional de Mercedes Umaña — INMU**  
Usulután, El Salvador

---

## 📜 Licencia

Este proyecto se desarrolla con fines:

- Educativos
- Institucionales
- Académicos
- De innovación tecnológica

> Si se publica de forma pública, se recomienda revisar credenciales, claves, URLs privadas y permisos antes de subir el repositorio.

---

## ⭐ Mensaje Final

> “SICA-INMU no solo digitaliza la asistencia; transforma la gestión educativa en un proceso más rápido, transparente, ordenado y moderno.”

---

## 🙌 Créditos

Proyecto impulsado por la **Dirección de Innovación INMU** y desarrollado para fortalecer los procesos académicos del Instituto Nacional de Mercedes Umaña.
