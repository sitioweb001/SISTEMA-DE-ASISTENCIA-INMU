# Plan fase 2: migración de Google Sheets a base de datos gratuita

## Problema actual (fase 1)

- Escrituras `fetch(..., { mode: 'no-cors' })` sin confirmación real del servidor.
- Consistencia eventual en hojas: cambios que aparecen/desaparecen al refrescar.
- Sin canal en tiempo real entre dispositivos (4 teléfonos en paralelo).

## Solución recomendada

1. Mantener `index.html` actual.
2. Conectar módulo de notas al backend `backend/src/server.js`.
3. Sustituir lecturas/escrituras de notas por REST:
   - Guardar: `POST /api/notas/upsert`
   - Eliminar: `DELETE /api/notas`
   - Cargar: `GET /api/notas`
4. Activar sync multi-dispositivo por `WebSocket /ws`.
5. Dejar Google Sheets solo para reportes históricos (si se desea).

## Beneficio esperado

- Menos errores intermitentes.
- Actualización inmediata de notas en todos los teléfonos.
- Menor latencia y control de errores (respuestas HTTP reales).
