const fs = require('fs');
const path = require('path');

let db = null;
let isSqlite = false;
const jsonDbPath = path.join(__dirname, 'tickets.json');

// Intentar usar SQLite3
try {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'tickets.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.warn('SQLite warning, utilizando respaldo JSON:', err.message);
      initJsonDb();
    } else {
      console.log('Base de datos SQLite3 conectada en:', dbPath);
      isSqlite = true;
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
      `);
    }
  });
} catch (e) {
  console.warn('SQLite3 no está disponible en este servidor. Activando modo almacenamiento JSON en:', jsonDbPath);
  initJsonDb();
}

// Inicializar almacenamiento JSON de respaldo
function initJsonDb() {
  isSqlite = false;
  if (!fs.existsSync(jsonDbPath)) {
    fs.writeFileSync(jsonDbPath, JSON.stringify([], null, 2));
  }
}

// Métodos unificados para abstraer la base de datos
function getTicketsJson() {
  try {
    const data = fs.readFileSync(jsonDbPath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (e) {
    return [];
  }
}

function saveTicketsJson(tickets) {
  fs.writeFileSync(jsonDbPath, JSON.stringify(tickets, null, 2));
}

// Funciones exportadas universales
function insertTicket(ticket, callback) {
  if (isSqlite && db) {
    const query = `INSERT INTO tickets (id, guest_name, email, quantity) VALUES (?, ?, ?, ?)`;
    db.run(query, [ticket.id, ticket.guest_name, ticket.email, ticket.quantity], callback);
  } else {
    try {
      const tickets = getTicketsJson();
      const newTicket = {
        id: ticket.id,
        guest_name: ticket.guest_name,
        email: ticket.email || '',
        quantity: parseInt(ticket.quantity, 10) || 1,
        status: 'VALID',
        scanned_at: null,
        created_at: new Date().toISOString()
      };
      tickets.unshift(newTicket);
      saveTicketsJson(tickets);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

function fetchAllTickets(callback) {
  if (isSqlite && db) {
    db.all(`SELECT * FROM tickets ORDER BY created_at DESC`, [], callback);
  } else {
    try {
      const tickets = getTicketsJson();
      callback(null, tickets);
    } catch (err) {
      callback(err, []);
    }
  }
}

function validateTicketAtomic(ticketId, callback) {
  const cleanId = ticketId.trim();
  const now = new Date().toISOString();

  if (isSqlite && db) {
    const updateQuery = `
      UPDATE tickets 
      SET status = 'USED', scanned_at = ? 
      WHERE id = ? AND status = 'VALID'
    `;
    db.run(updateQuery, [now, cleanId], function (err) {
      if (err) return callback(err, { status: 'ERROR', message: err.message });

      if (this.changes > 0) {
        db.get(`SELECT * FROM tickets WHERE id = ?`, [cleanId], (err, row) => {
          callback(null, { status: 'SUCCESS', message: '¡Acceso Concedido!', ticket: row });
        });
      } else {
        db.get(`SELECT * FROM tickets WHERE id = ?`, [cleanId], (err, row) => {
          if (!row) {
            return callback(null, { status: 'NOT_FOUND', message: 'Boleto inexistente o inválido' });
          }
          callback(null, {
            status: 'ALREADY_USED',
            message: `Este boleto YA FUE USADO a las ${new Date(row.scanned_at).toLocaleTimeString()}`,
            ticket: row
          });
        });
      }
    });
  } else {
    try {
      const tickets = getTicketsJson();
      const ticket = tickets.find(t => t.id === cleanId);

      if (!ticket) {
        return callback(null, { status: 'NOT_FOUND', message: 'Boleto inexistente o inválido' });
      }

      if (ticket.status === 'USED') {
        return callback(null, {
          status: 'ALREADY_USED',
          message: `Este boleto YA FUE USADO a las ${new Date(ticket.scanned_at).toLocaleTimeString()}`,
          ticket
        });
      }

      // Marcar como usado
      ticket.status = 'USED';
      ticket.scanned_at = now;
      saveTicketsJson(tickets);

      callback(null, { status: 'SUCCESS', message: '¡Acceso Concedido!', ticket });
    } catch (err) {
      callback(err, { status: 'ERROR', message: err.message });
    }
  }
}

module.exports = {
  db,
  insertTicket,
  fetchAllTickets,
  validateTicketAtomic
};
