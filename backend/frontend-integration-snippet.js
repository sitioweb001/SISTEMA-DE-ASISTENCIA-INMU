// Integración mínima para index.html (fase 2)
// 1) Reemplazar SCRIPT_URL de notas por API_BASE.
const API_BASE = localStorage.getItem('INMU_API_BASE') || 'http://localhost:3001';

async function notasFetch(grado, seccion, materia) {
  const u = new URL(`${API_BASE}/api/notas`);
  u.searchParams.set('grado', grado);
  u.searchParams.set('seccion', seccion);
  u.searchParams.set('materia', materia);
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error('No se pudieron cargar notas');
  return r.json();
}

async function notaUpsert(data) {
  const r = await fetch(`${API_BASE}/api/notas/upsert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('No se pudo guardar la nota');
}

async function notaDelete(data) {
  const r = await fetch(`${API_BASE}/api/notas`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('No se pudo eliminar la nota');
}

function conectarNotasRealtime(onEvent) {
  const ws = new WebSocket(`${API_BASE.replace('http', 'ws')}/ws`);
  ws.onmessage = (e) => onEvent(JSON.parse(e.data));
  return ws;
}
