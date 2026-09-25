// =========================================================================
// BACKEND API - SERVIDOR EXPRESS PARA CONTROL DE BOLETOS Y ESCÁNER QR
// =========================================================================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const db = require('./database');

const app = express();

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
  return 'TKT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// =========================================================================
// 1. ENDPOINT: Crear un nuevo boleto (POST /api/tickets)
// =========================================================================
app.post('/api/tickets', (req, res) => {
  const { guest_name, email, quantity } = req.body;
  
  if (!guest_name) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  const ticketId = generateTicketId();
  const guestsCount = quantity ? parseInt(quantity, 10) : 1;

  db.insertTicket({ id: ticketId, guest_name, email, quantity: guestsCount }, (err) => {
    if (err) {
      console.error('Error al registrar boleto:', err);
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

// Endpoint de prueba de vida (Healthcheck)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', version: '1.1.0', time: new Date().toISOString() });
});

// =========================================================================
// INICIALIZACIÓN DEL SERVIDOR
// =========================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor v1.1.0 corriendo en puerto ${PORT}`);
});

module.exports = app;
