import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db from './db.js';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const app = express();
app.use(cors());
app.use(express.json());

function broadcast(wsServer, payload) {
  const raw = JSON.stringify(payload);
  wsServer.clients.forEach(client => {
    if (client.readyState === 1) client.send(raw);
  });
}

app.get('/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

app.get('/api/notas', (req, res) => {
  const { grado, seccion, materia } = req.query;
  if (!grado || !seccion || !materia) {
    return res.status(400).json({ error: 'grado, seccion y materia son requeridos' });
  }
  const rows = db.prepare(`
    SELECT alumno_id, grado, seccion, materia, actividad, nota, updated_at
    FROM notas WHERE grado=? AND seccion=? AND materia=?
    ORDER BY alumno_id, actividad
  `).all(grado, seccion, materia);
  return res.json(rows);
});

app.post('/api/notas/upsert', (req, res) => {
  const { alumno_id, grado, seccion, materia, actividad, nota } = req.body;
  if (!alumno_id || !grado || !seccion || !materia || !actividad) {
    return res.status(400).json({ error: 'campos requeridos faltantes' });
  }
  db.prepare(`
    INSERT INTO notas (alumno_id, grado, seccion, materia, actividad, nota, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(alumno_id, grado, seccion, materia, actividad)
    DO UPDATE SET nota=excluded.nota, updated_at=datetime('now')
  `).run(alumno_id, grado, seccion, materia, actividad, nota);

  const payload = { type: 'nota_actualizada', alumno_id, grado, seccion, materia, actividad, nota };
  broadcast(globalThis.wsServer, payload);
  return res.json({ ok: true });
});

app.delete('/api/notas', (req, res) => {
  const { alumno_id, grado, seccion, materia, actividad } = req.body;
  const info = db.prepare(`
    DELETE FROM notas WHERE alumno_id=? AND grado=? AND seccion=? AND materia=? AND actividad=?
  `).run(alumno_id, grado, seccion, materia, actividad);
  broadcast(globalThis.wsServer, { type: 'nota_eliminada', alumno_id, grado, seccion, materia, actividad });
  return res.json({ ok: true, deleted: info.changes });
});

const server = createServer(app);
const wsServer = new WebSocketServer({ server, path: '/ws' });
globalThis.wsServer = wsServer;

wsServer.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'connected', at: new Date().toISOString() }));
});

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  console.log(`INMU API escuchando en http://localhost:${port}`);
});
