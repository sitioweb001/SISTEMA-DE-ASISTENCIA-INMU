# Backend fase 2 (rápido y gratis)

Este backend reemplaza la dependencia de Google Sheets para notas con SQLite (gratis) + API REST + WebSocket para sincronización en tiempo real.

## Ejecutar local

```bash
cd backend
npm install
npm run migrate
npm run dev
```

## Endpoints

- `GET /health`
- `GET /api/notas?grado=...&seccion=...&materia=...`
- `POST /api/notas/upsert`
- `DELETE /api/notas`
- `WS /ws` (eventos `nota_actualizada` y `nota_eliminada`)

## Deploy gratis sugerido

- Render (free web service) para API Node.
- Neon/Supabase (Postgres free) como siguiente mejora si crece el sistema.

> SQLite con WAL soporta concurrencia ligera/média y responde rápido para múltiples teléfonos.
