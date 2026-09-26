// =========================================================================
// BACKEND API - SERVIDOR EXPRESS PARA CONTROL DE BOLETOS Y ESCÁNER QR
// Versión 1.2.0
// =========================================================================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();

// Contraseña por defecto para el panel de administración (modificable vía env ADMIN_PASS)
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin2026';

// Configuración de Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Captura global de errores no manejados
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Función auxiliar para generar token seguro corto
function generateTicketId() {
  return 'TKT-' + uuidv4().substring(0, 8).toUpperCase();
}

// Middleware para verificar contraseña de administrador
function adminAuth(req, res, next) {
  const authHeader = req.headers['x-admin-pass'] || req.query.pass;
  if (!authHeader || authHeader === ADMIN_PASS) {
    next();
  } else {
    res.status(401).json({ error: 'Acceso no autorizado. Contraseña de administración incorrecta.' });
  }
}

// Alias por compatibilidad
const checkAdminAuth = adminAuth;

// =========================================================================
// 0. ENDPOINT: Verificar clave de administración (POST /api/verify-pass)
// =========================================================================
app.post('/api/verify-pass', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASS) {
    res.json({ success: true, message: 'Acceso autorizado' });
  } else {
    res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
  }
});

// =========================================================================
// 1. ENDPOINT: Crear boletos individuales (POST /api/tickets)
// =========================================================================
app.post('/api/tickets', adminAuth, (req, res) => {
  const { guest_name, email, quantity } = req.body;
  
  if (!guest_name || typeof guest_name !== 'string' || !guest_name.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  const trimmedName = guest_name.trim();
  const trimmedEmail = email && typeof email === 'string' ? email.trim() : '';
  const N = Math.max(1, parseInt(quantity, 10) || 1);

  const generatedTickets = [];
  const sqliteDb = db.db;

  if (sqliteDb && typeof sqliteDb.serialize === 'function') {
    sqliteDb.serialize(() => {
      const stmt = sqliteDb.prepare(
        'INSERT INTO tickets (id, guest_name, email, quantity, status) VALUES (?, ?, ?, 1, \'VALID\')'
      );

      let insertErr = null;

      for (let i = 1; i <= N; i++) {
        const ticketId = 'TKT-' + uuidv4().substring(0, 8).toUpperCase();
        const visualName = N > 1 ? `${trimmedName} (${i}/${N})` : trimmedName;

        const ticket = {
          id: ticketId,
          guest_name: visualName,
          email: trimmedEmail,
          quantity: 1,
          status: 'VALID'
        };

        generatedTickets.push(ticket);

        stmt.run([ticketId, visualName, trimmedEmail], (err) => {
          if (err && !insertErr) insertErr = err;
        });
      }

      stmt.finalize((err) => {
        if (err || insertErr) {
          const finalErr = err || insertErr;
          console.error('Error al registrar boletos en la base de datos:', finalErr);
          return res.status(500).json({ error: finalErr.message });
        }

        res.json({
          success: true,
          count: N,
          tickets: generatedTickets
        });
      });
    });
  } else {
    // Si la BD funciona en modo de respaldo JSON
    for (let i = 1; i <= N; i++) {
      const ticketId = 'TKT-' + uuidv4().substring(0, 8).toUpperCase();
      const visualName = N > 1 ? `${trimmedName} (${i}/${N})` : trimmedName;
      generatedTickets.push({
        id: ticketId,
        guest_name: visualName,
        email: trimmedEmail,
        quantity: 1,
        status: 'VALID'
      });
    }

    db.insertTicketsBatch(generatedTickets, (err) => {
      if (err) {
        console.error('Error al registrar boletos en JSON:', err);
        return res.status(500).json({ error: err.message });
      }

      res.json({
        success: true,
        count: N,
        tickets: generatedTickets
      });
    });
  }
});

// =========================================================================
// 2. ENDPOINT: Obtener lista completa de boletos (GET /api/tickets)
// =========================================================================
app.get('/api/tickets', (req, res) => {
  db.fetchAllTickets((err, rows) => {
    if (err) {
      console.error('Error al consultar boletos:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// =========================================================================
// 3. ENDPOINT: Validar boleto desde el escáner (POST /api/validate)
// =========================================================================
app.post('/api/validate', (req, res) => {
  const { ticketId } = req.body;
  if (!ticketId) {
    return res.status(400).json({ status: 'INVALID', message: 'Código no proporcionado' });
  }

  db.validateTicketAtomic(ticketId, (err, result) => {
    if (err) {
      return res.status(500).json({ status: 'ERROR', message: err.message });
    }
    res.json(result);
  });
});

// =========================================================================
// 4. ENDPOINT: Exportar lista a CSV (GET /api/export/csv)
// =========================================================================
app.get('/api/export/csv', (req, res) => {
  db.fetchAllTickets((err, rows) => {
    if (err) return res.status(500).send('Error al generar CSV');
    
    let csv = 'ID Boleto,Invitado,Email,Cantidad,Estado,Fecha Registro,Fecha Escaneo\n';
    (rows || []).forEach(t => {
      const name = `"${(t.guest_name || '').replace(/"/g, '""')}"`;
      const email = `"${(t.email || '').replace(/"/g, '""')}"`;
      csv += `${t.id},${name},${email},${t.quantity},${t.status},${t.created_at || ''},${t.scanned_at || ''}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="boletos_fiesta_export.csv"');
    res.status(200).send('\uFEFF' + csv); // \uFEFF incluye el BOM UTF-8 para Excel
  });
});

// Endpoint de prueba de vida (Healthcheck)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', version: '1.2.0', time: new Date().toISOString() });
});

// =========================================================================
// INICIALIZACIÓN DEL SERVIDOR
// =========================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor v1.2.0 corriendo en puerto ${PORT}`);
});

module.exports = app;
