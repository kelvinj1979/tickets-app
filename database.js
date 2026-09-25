const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'tickets.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos SQLite en:', dbPath, err.message);
  } else {
    console.log('Conectado exitosamente a la base de datos SQLite en:', dbPath);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      guest_name TEXT NOT NULL,
      email TEXT,
      quantity INTEGER DEFAULT 1,
      status TEXT DEFAULT 'VALID',
      scanned_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error al verificar/crear la tabla tickets:', err.message);
    }
  });
});

module.exports = db;
