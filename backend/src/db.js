import Database from 'better-sqlite3';

const db = new Database(process.env.DB_PATH || 'backend/data.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS notas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alumno_id TEXT NOT NULL,
  grado TEXT NOT NULL,
  seccion TEXT NOT NULL,
  materia TEXT NOT NULL,
  actividad INTEGER NOT NULL CHECK (actividad BETWEEN 1 AND 3),
  nota REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(alumno_id, grado, seccion, materia, actividad)
);

CREATE INDEX IF NOT EXISTS idx_notas_filtro
ON notas (grado, seccion, materia, alumno_id);
`);

export default db;
