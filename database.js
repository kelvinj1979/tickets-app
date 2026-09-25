const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tickets.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      guest_name TEXT NOT NULL,
      email TEXT,
      quantity INTEGER DEFAULT 1,
      status TEXT DEFAULT 'VALID', -- 'VALID' o 'USED'
      scanned_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

module.exports = db;
