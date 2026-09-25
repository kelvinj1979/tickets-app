// =========================================================================
// BACKEND API - SERVIDOR EXPRESS PARA CONTROL DE BOLETOS Y ESCÁNER QR
// =========================================================================

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();

// Configuración de Middlewares
app.use(cors()); // Permite peticiones desde otros orígenes
app.use(express.json()); // Parsea datos enviados en formato JSON
app.use(express.static('public')); // Sirve archivos estáticos (index.html, scanner.html)

// Captura global de errores no manejados
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// =========================================================================
// 1. ENDPOINT: Crear un nuevo boleto (POST /api/tickets)
// Recibe: { guest_name, email, quantity }
// Genera: ID único con formato 'TKT-XXXXXXXX' y guarda en la BD
// =========================================================================
app.post('/api/tickets', (req, res) => {
  const { guest_name, email, quantity } = req.body;
  
  // Validación de campo requerido
  if (!guest_name) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  // Generamos un token seguro y corto (ej. TKT-ABC12345)
  const ticketId = 'TKT-' + uuidv4().substring(0, 8).toUpperCase();
  const guestsCount = quantity ? parseInt(quantity, 10) : 1;

  // Insertar boleto con estado por defecto 'VALID'
  const query = `INSERT INTO tickets (id, guest_name, email, quantity) VALUES (?, ?, ?, ?)`;
  db.run(query, [ticketId, guest_name, email, guestsCount], function (err) {
    if (err) {
      console.error('Error insertando boleto en BD:', err);
      return res.status(500).json({ error: err.message });
    }
    
    res.json({
      success: true,
      ticket: { id: ticketId, guest_name, email, quantity: guestsCount, status: 'VALID' }
    });
  });
});

// =========================================================================
// 2. ENDPOINT: Obtener lista completa de boletos (GET /api/tickets)
// Retorna: Array JSON con todos los boletos registrados ordenados por fecha
// =========================================================================
app.get('/api/tickets', (req, res) => {
  db.all(`SELECT * FROM tickets ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) {
      console.error('Error consultando boletos en BD:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// =========================================================================
// 3. ENDPOINT: Validar boleto desde el escáner (POST /api/validate)
// Recibe: { ticketId }
// Proceso: Actualización atómica (UPDATE) que solo cambia a 'USED' si estaba 'VALID'.
// Evita accesos duplicados en escaneos simultáneos.
// =========================================================================
app.post('/api/validate', (req, res) => {
  const { ticketId } = req.body;
  if (!ticketId) {
    return res.status(400).json({ status: 'INVALID', message: 'Código no proporcionado' });
  }

  const cleanId = ticketId.trim();
  const now = new Date().toISOString();

  // Intento de actualización atómica: solo pasa a 'USED' si actualmente está en 'VALID'
  const updateQuery = `
    UPDATE tickets 
    SET status = 'USED', scanned_at = ? 
    WHERE id = ? AND status = 'VALID'
  `;

  db.run(updateQuery, [now, cleanId], function (err) {
    if (err) return res.status(500).json({ status: 'ERROR', message: err.message });

    // Si this.changes > 0, la fila cambió de 'VALID' a 'USED' exitosamente (Acceso permitido)
    if (this.changes > 0) {
      db.get(`SELECT * FROM tickets WHERE id = ?`, [cleanId], (err, row) => {
        return res.json({
          status: 'SUCCESS',
          message: '¡Acceso Concedido!',
          ticket: row
        });
      });
    } else {
      // Si no hubo cambios, consultamos la BD para distinguir si fue ya usado o si no existe
      db.get(`SELECT * FROM tickets WHERE id = ?`, [cleanId], (err, row) => {
        if (!row) {
          return res.json({
            status: 'NOT_FOUND',
            message: 'Boleto inexistente o inválido'
          });
        }
        return res.json({
          status: 'ALREADY_USED',
          message: `Este boleto YA FUE USADO a las ${new Date(row.scanned_at).toLocaleTimeString()}`,
          ticket: row
        });
      });
    }
  });
});

// =========================================================================
// INICIALIZACIÓN DEL SERVIDOR
// =========================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Panel de boletos: http://localhost:${PORT}/index.html`);
  console.log(`Escáner para celular: http://localhost:${PORT}/scanner.html`);
});

module.exports = app;
