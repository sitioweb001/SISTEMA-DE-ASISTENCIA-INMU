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
