# 🧠 SICA-INMU — Sistema de Control de Asistencia INMU

![Estado](https://img.shields.io/badge/Estado-Activo-success?style=for-the-badge)
![Frontend](https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3%20%7C%20JavaScript-blue?style=for-the-badge)
![Backend](https://img.shields.io/badge/Backend-Google%20Apps%20Script-yellow?style=for-the-badge)
![Base de Datos](https://img.shields.io/badge/Base%20de%20Datos-Google%20Sheets-green?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-purple?style=for-the-badge)
![Licencia](https://img.shields.io/badge/Licencia-Educativa-orange?style=for-the-badge)

> **Sistema web institucional para control de asistencia, gestión académica, reportes, notas, QR y portal del estudiante del Instituto Nacional de Mercedes Umaña.**

---

## 📚 Tabla de Contenidos

- [📌 Descripción General](#-descripción-general)
- [🎯 Objetivos](#-objetivos)
- [✨ Características Principales](#-características-principales)
- [👥 Roles del Sistema](#-roles-del-sistema)
- [🏗️ Arquitectura](#️-arquitectura)
- [🧰 Tecnologías Utilizadas](#-tecnologías-utilizadas)
- [📁 Estructura del Repositorio](#-estructura-del-repositorio)
- [🚀 Instalación y Puesta en Marcha](#-instalación-y-puesta-en-marcha)
- [🧩 Módulos del Sistema](#-módulos-del-sistema)
- [🗃️ Base de Datos](#️-base-de-datos)
- [🔌 API / Endpoints](#-api--endpoints)
- [📊 Notas y Escalas](#-notas-y-escalas)
- [📱 PWA y Modo Offline](#-pwa-y-modo-offline)
- [🔐 Seguridad](#-seguridad)
- [🧪 Pruebas](#-pruebas)
- [🧯 Problemas Comunes](#-problemas-comunes)
- [📈 Roadmap](#-roadmap)
- [👨‍💻 Autor](#-autor)
- [📜 Licencia](#-licencia)

---

## 📌 Descripción General

**SICA-INMU** es una plataforma web completa desarrollada para el **Instituto Nacional de Mercedes Umaña (INMU)**, ubicada en Usulután, El Salvador. Su objetivo es modernizar la gestión institucional mediante la digitalización de procesos académicos y administrativos.

El sistema permite:

- Registrar asistencia estudiantil de forma digital.
- Validar asistencia autónoma desde el portal del estudiante **PERMANENCIA**.
- Generar reportes institucionales en PDF.
- Gestionar calificaciones por materia, periodo y escala.
- Administrar docentes, materias y módulos técnicos.
- Utilizar códigos QR para agilizar la toma de asistencia.
- Centralizar datos en Google Sheets.
- Operar como PWA con soporte offline parcial.

---

## 🎯 Objetivos

### Objetivo General

Desarrollar un sistema web institucional que permita registrar, consultar y administrar la asistencia estudiantil, notas académicas, reportes e informes de manera eficiente, automatizada y accesible para docentes, estudiantes y administradores.

### Objetivos Específicos

- Automatizar el registro diario de asistencia.
- Reducir el uso de papel y errores manuales.
- Centralizar información académica en Google Sheets.
- Implementar validación de estudiantes mediante NIE.
- Integrar generación y lectura de códigos QR.
- Crear reportes PDF institucionales.
- Gestionar notas en escala `0-10` y `0-5`.
- Administrar docentes y sus asignaciones de materias.
- Incorporar modo mantenimiento y control global del sistema.
- Permitir instalación como aplicación PWA.

---

## ✨ Características Principales

| Característica | Descripción |
|---|---|
| 📋 Asistencia Digital | Registro de presentes, ausentes y permisos. |
| 🎓 Portal Alumno | Validación autónoma por NIE desde PERMANENCIA. |
| 📷 QR | Generación y escaneo de carnés QR. |
| 📄 PDF | Reportes institucionales descargables. |
| 📊 Excel | Exportación e importación de notas. |
| 👨‍🏫 Docentes | Registro, edición y asignación de materias. |
| 📚 Materias | Catálogo de materias básicas y módulos técnicos. |
| ⚙️ Administración | Mantenimiento, login global y portal alumno. |
| 📱 PWA | Instalación como app y caché offline parcial. |
| 🗃️ Sheets | Base de datos en Google Sheets. |

---

## 👥 Roles del Sistema

| Rol | Funciones |
|---|---|
| **Docente** | Pasa lista, genera reportes, gestiona notas, usa QR y consulta alumnos. |
| **Estudiante** | Ingresa NIE, verifica identidad y marca asistencia desde el portal. |
| **Administrador** | Gestiona docentes, horarios, mantenimiento, materias, accesos e informes. |

---

## 🏗️ Arquitectura

El sistema está compuesto por tres capas principales:

```text
┌─────────────────────────────────────────────┐
│ CAPA 1 — FRONTEND                           │
│ INDEX DOCENTE.html                          │
│ INDEX ALUMNO.html                           │
│ HTML5 + CSS3 + JavaScript                   │
└─────────────────────┬───────────────────────┘
                      │ HTTP GET / POST / JSONP
                      ▼
┌─────────────────────────────────────────────┐
│ CAPA 2 — BACKEND                            │
│ Google Apps Script Web App                  │
│ Validaciones, lógica, endpoints y caché     │
└─────────────────────┬───────────────────────┘
                      │ SpreadsheetApp
                      ▼
┌─────────────────────────────────────────────┐
│ CAPA 3 — BASE DE DATOS                      │
│ Google Sheets                               │
│ Alumnos, docentes, asistencia, notas        │
└─────────────────────────────────────────────┘
```

### Flujo General

1. El usuario abre el módulo Docente o Alumno.
2. El frontend consulta la URL del backend (`SCRIPT_URL`).
3. Apps Script procesa la petición.
4. Google Sheets almacena o devuelve la información.
5. La interfaz muestra resultados, confirma acciones o genera reportes.

---

## 🧰 Tecnologías Utilizadas

### Frontend

- **HTML5** — estructura del sistema.
- **CSS3** — estilos, responsive design, modo claro/oscuro.
- **JavaScript ES6+** — lógica del cliente, DOM, QR, PDF, Excel y peticiones.

### Backend

- **Google Apps Script** — backend serverless con endpoints GET/POST.

### Base de Datos

- **Google Sheets** — almacenamiento principal del sistema.

### Librerías y APIs

- **html2pdf.js** — generación de reportes PDF.
- **SheetJS / xlsx** — importación y exportación Excel.
- **jsQR** — lectura QR desde cámara.
- **qrcode-generator** — generación de códigos QR.
- **pdf.js** — visualización de PDF.
- **Service Worker** — caché offline y PWA.
- **localStorage / sessionStorage** — persistencia local.
- **pywebview** — app de escritorio Windows.

---

## 📁 Estructura del Repositorio

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

### Descripción de Archivos

| Archivo | Descripción |
|---|---|
| `INDEX DOCENTE.zip` | Paquete principal del módulo Docente. |
| `INDEX DOCENTE BACKUP.html` | Respaldo del panel docente. |
| `INDEX ALUMNO.html` | Portal del Estudiante PERMANENCIA. |
| `CODIGO GS APS SCRIBT BACKUP.gs` | Backend completo en Google Apps Script. |
| `INSTRUCCIONES IMPORTAR NOTAS.txt` | Guía para importar notas desde Excel. |
| `sw.js` | Service Worker para PWA y caché offline. |
| `manifest.webmanifest` | Manifiesto de aplicación web progresiva. |
| `plantilla_notas.xls` | Plantilla base para notas. |
| `app_inmu.exe` | App Windows basada en pywebview. |
| `app_inmu_config.json` | Configuración de la app de escritorio. |

---

## 🚀 Instalación y Puesta en Marcha

### Requisitos Previos

- Navegador moderno: Chrome, Edge, Firefox o Safari.
- Cuenta de Google para Apps Script y Sheets.
- Python o Node.js para servidor local opcional.
- Conexión a internet para sincronización con Google Sheets.

---

### 1. Ejecutar el Frontend Localmente

Se recomienda servir los archivos por `http://localhost` para que PWA y `sw.js` funcionen correctamente.

```bash
python -m http.server 8080
```

O usando Node.js:

```bash
npx http-server -p 8080
```

Abrir en el navegador:

```text
http://localhost:8080/INDEX%20DOCENTE.html
http://localhost:8080/INDEX%20ALUMNO.html
```

> Si se abre con `file://`, algunas funciones pueden ejecutarse en modo local/demo, pero no se garantiza sincronización completa con la nube.

---

### 2. Crear la Base de Datos

1. Crear una hoja de cálculo en Google Sheets.
2. Copiar el ID de la hoja.
3. Configurar el backend para usar esa hoja.
4. El sistema creará automáticamente las hojas necesarias si no existen.

---

### 3. Publicar el Backend

1. Abrir Google Apps Script.
2. Crear un nuevo proyecto.
3. Pegar el contenido de `CODIGO GS APS SCRIBT BACKUP.gs`.
4. Configurar permisos.
5. Desplegar como **Web App**.
6. Ejecutar como propietario.
7. Copiar la URL del despliegue.

---

### 4. Configurar `SCRIPT_URL`

En los archivos HTML, buscar:

```javascript
const SCRIPT_URL = "TU_URL_DE_GOOGLE_APPS_SCRIPT";
```

Reemplazar por la URL real del Web App.

Archivos donde debe configurarse:

- `INDEX DOCENTE.html`
- `INDEX ALUMNO.html`

---

## 🧩 Módulos del Sistema

## 1. Módulo Docente

Panel principal para docentes y administradores.

### Funciones

- Inicio de sesión.
- Selección de grado y sección.
- Selección de docente y materia.
- Carga de estudiantes.
- Registro de asistencia.
- Sincronización con portal alumno.
- Generación de reportes PDF.
- Gestión de notas.
- Importación/exportación Excel.
- Registro de docentes.
- Asignación de materias.
- Módulo QR.
- Informes administrativos.
- Modo mantenimiento.

### Flujo de Uso

1. Iniciar sesión.
2. Seleccionar grado y sección.
3. Seleccionar docente y materia.
4. Cargar alumnos.
5. Marcar asistencia.
6. Verificar contadores.
7. Generar PDF.
8. Guardar reporte.

### Estados de Asistencia

| Estado | Color | Uso |
|---|---|---|
| Presente | Verde | El estudiante asistió. |
| Ausente | Rojo | El estudiante no asistió. |
| Permiso | Ámbar | Ausencia justificada. |

---

## 2. Portal del Estudiante PERMANENCIA

Portal diseñado para que los estudiantes validen su asistencia usando su NIE.

### Funciones

- Ingreso de NIE.
- Búsqueda por nombre o NIE.
- Validación contra Google Sheets.
- Verificación de horario activo.
- Confirmación de asistencia.
- Bloqueo por mantenimiento.
- Bloqueo si el portal alumno está desactivado.
- Caché local para contingencias.

### Flujo de Uso

1. El estudiante abre el portal.
2. Ingresa su NIE.
3. El sistema valida identidad.
4. El estudiante confirma asistencia.
5. Apps Script registra el evento.
6. El portal muestra confirmación.

---

## 3. Módulo QR

Permite generar carnés y registrar asistencia mediante escaneo.

### Funciones

- Generación de QR por NIE.
- Lectura en tiempo real con cámara.
- Marcado automático como presente.
- Búsqueda manual como respaldo.
- Control de estudiantes no escaneados.

---

## 4. Módulo de Calificaciones

Administra notas por periodo, materia, grado, sección y escala.

### Escalas

| Tipo | Escala | Hoja |
|---|---:|---|
| Materias básicas | `0-10` | `notas` |
| Módulos técnicos | `0-5` | `nota-tecnicos` |

### Componentes

- Periodo 1
- Periodo 2
- Periodo 3
- Periodo 4
- Cuaderno
- Integradora
- Examen
- Promedio

---

## 5. Catálogo de Materias y Módulos

El catálogo permite administrar materias básicas y módulos técnicos.

### Hoja Principal

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

---

## 6. Gestión de Docentes

El sistema separa la ficha base del docente y sus asignaciones.

### Hojas Involucradas

```text
docentes
docente_materias
```

### Registro de Docente

1. Ir al panel administrativo.
2. Seleccionar **Añadir Docente**.
3. Completar nombre y datos base.
4. Agregar materias.
5. Seleccionar escala y especialidad si aplica.
6. Guardar.

### Asignación de Materias

1. Entrar a **ASIGNAR MATERIA**.
2. Seleccionar docente.
3. Agregar o eliminar materias.
4. Marcar materia orientada si corresponde.
5. Guardar cambios.

---

## 🗃️ Base de Datos

El backend crea hojas automáticamente si no existen.

| Hoja | Descripción |
|---|---|
| `alumnos` | Listado principal de estudiantes. |
| `di_refuerzo` | Estudiantes de DI Refuerzo. |
| `docentes` | Ficha base de docentes. |
| `docente_materias` | Materias asignadas por docente. |
| `catalogo_materias` | Catálogo de materias y módulos. |
| `reportes` | Reportes diarios de asistencia. |
| `permisos` | Permisos y justificaciones. |
| `conteo_ausencias` | Historial de ausencias. |
| `asistencia_actualizaciones` | Bitácora de cambios. |
| `observaciones` | Observaciones de estudiantes. |
| `estado_alumnos` | Seguimiento de estado del alumno. |
| `asistencia_alumnos` | Marcaciones desde el portal alumno. |
| `informes` | Informes administrativos. |
| `notas` | Notas en escala 0-10. |
| `nota-tecnicos` | Notas en escala 0-5. |
| `EstadosDocentes` | Estado online/offline de docentes. |

---

## 🔌 API / Endpoints

## GET — `doGet(e)`

### Sistema

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
?tipo=obtener_observaciones&nie=...
```

### Asistencia

```text
?tipo=validar_alumno_nie&nie=...
?tipo=marcar_alumno&nie=...&estado=presente&justificante=...
?tipo=asistencia_diaria_grado
?tipo=detalles_asistencia&grado=...&seccion=...&docente=...&fecha=...
```

### Reportes, Informes y Notas

```text
?tipo=reportes
?tipo=permisos
?tipo=historial_informes
?tipo=notas&grado=...&seccion=...&escala=0-10&materia_clave=...
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

### Asistencia e Historial

```json
{ "tipo_post": "asistencia" }
```

```json
{ "tipo_post": "actualizar_asistencia" }
```

```json
{ "tipo_post": "agregar_observacion" }
```

```json
{ "tipo_post": "guardar_estado_alumno" }
```

```json
{ "tipo_post": "update_docente_status" }
```

### Notas e Informes

```json
{ "tipo_post": "guardar_notas_alumno" }
```

```json
{ "tipo_post": "guardar_notas_grupo" }
```

```json
{ "tipo_post": "exportar_excel_notas" }
```

```json
{ "tipo_post": "guardar_informe" }
```

```json
{ "tipo_post": "eliminar_informe" }
```

---

## 📄 Reportes PDF

Los reportes incluyen:

- Encabezado institucional.
- Fecha y hora.
- Docente.
- Grado y sección.
- Materia.
- Total de estudiantes.
- Presentes.
- Ausentes.
- Permisos.
- Totales por sexo.
- Listas detalladas.
- Registro en Google Sheets.

---

## 📊 Notas y Escalas

El sistema decide automáticamente la hoja de destino según la escala.

```text
0-10 → notas
0-5  → nota-tecnicos
```

La función encargada de normalizar la escala es:

```text
normalizarEscalaMateriaGas()
```

La hoja de destino se define mediante:

```text
getNombreHojaNotas()
```

---

## 📤 Exportación e Importación de Notas

### Exportar

Desde el módulo de calificaciones:

```text
📊 Exportar Notas a Excel (.xlsx)
```

### Importar

Desde el módulo de calificaciones:

```text
📥 Importar Notas
```

### Recomendaciones

- Usar archivos generados por el sistema.
- No modificar encabezados.
- Verificar escala antes de importar.
- Revisar `INSTRUCCIONES IMPORTAR NOTAS.txt`.

---

## 📱 PWA y Modo Offline

El sistema puede instalarse como aplicación web progresiva.

### Funciones

- Instalación como app.
- Caché offline parcial.
- Service Worker.
- Modo claro/oscuro.
- Carga rápida.

### Requisitos

- Usar `http://localhost` o `https://`.
- No usar `file://` para pruebas PWA completas.
- Revisar rutas dentro de `sw.js`.

---

## 🖥️ App de Escritorio Windows

Archivos relacionados:

```text
app_inmu.exe
app_inmu_config.json
```

Permite:

- Abrir el sistema en ventana nativa.
- Seleccionar carpeta de descargas.
- Facilitar uso institucional en Windows.

---

## 🔐 Seguridad

### Medidas Implementadas

- Login docente.
- Verificación humana.
- Validación de NIE.
- Control de horario.
- Bloqueo de duplicados.
- Modo mantenimiento.
- Variables de control global.
- Registro con timestamp.
- Manejo de errores con `try/catch`.
- Lectura segura de JSON.

### Variables Globales

| Variable | Función |
|---|---|
| `MANTENIMIENTO` | Bloquea acceso general. |
| `LOGIN_HABILITADO` | Habilita/deshabilita login docente. |
| `MODO_ALUMNO_ACTIVO` | Activa/desactiva portal alumno. |

> ⚠️ Las claves maestras o administrativas **no deben publicarse en GitHub**.

---

## 🧪 Pruebas

### Pruebas Funcionales

- Login docente.
- Registro de asistencia.
- Generación de PDF.
- Validación de NIE.
- Registro de notas.
- Gestión de docentes.
- Escaneo QR.

### Pruebas de Conexión

- Conexión estable.
- Conexión lenta.
- JSONP desde GitHub Pages.
- Caché offline parcial.

### Pruebas QR

- Cámara móvil.
- Webcam.
- Baja iluminación.
- Búsqueda manual como respaldo.

---

## ✅ Ventajas

- Reduce el uso de papel.
- Centraliza información institucional.
- Permite reportes automáticos.
- Compatible con móvil, tableta y PC.
- Usa servicios gratuitos o de bajo costo.
- Incluye soporte PWA.
- Permite trazabilidad histórica.
- Integra notas, asistencia, informes y QR.

---

## ⚠️ Limitaciones

- Google Sheets tiene límites de escalabilidad.
- Apps Script posee cuotas de ejecución.
- JSONP funciona, pero no es la opción más moderna.
- La autenticación puede mejorar con OAuth o Firebase.
- Requiere cuidado al publicar claves o URLs privadas.

---

## 🧯 Problemas Comunes

### La PWA no instala

- Abrir desde `https://` o `http://localhost`.
- Verificar `manifest.webmanifest`.
- Revisar `sw.js`.

### El alumno aparece bloqueado

- Revisar `MODO_ALUMNO_ACTIVO`.
- Confirmar horario activo.
- Verificar modo mantenimiento.

### No cargan alumnos

- Revisar `SCRIPT_URL`.
- Confirmar permisos de Apps Script.
- Validar existencia de la hoja `alumnos`.

### Las notas se mezclan

- Revisar `materia_clave`.
- Confirmar escala.
- Separar materias básicas y módulos técnicos.

### Falla la importación Excel

- Usar archivo generado por el sistema.
- No modificar columnas.
- Revisar guía de importación.

---

## 📈 Roadmap

### Versión 1.1

- Mejorar interfaz administrativa.
- Optimizar Service Worker.
- Añadir validaciones extra.

### Versión 1.2

- Dashboard estadístico.
- Reportes por periodo.
- Mejor control de roles.

### Versión 2.0

- Migración a Firebase o Cloud SQL.
- Autenticación con OAuth 2.0.
- API REST moderna.
- Panel directivo avanzado.
- Notificaciones push.

---

## 👨‍💻 Autor

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
- Innovación tecnológica

LA LICENCIA SE PROPOCIONA POR INSTITUCION.
---

## 🙌 Créditos

Proyecto desarrollado para fortalecer la gestión académica y administrativa del **Instituto Nacional de Mercedes Umaña**, impulsando la innovación educativa mediante tecnología web.

---

## ⭐ Mensaje Final

> **SICA-INMU no solo digitaliza la asistencia; transforma la gestión educativa en un proceso más rápido, transparente, ordenado y moderno.**
