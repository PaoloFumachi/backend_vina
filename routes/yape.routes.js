// backend_dsi6/src/routes/yape.routes.js
import express from 'express';
import { verifyToken, requireRole } from '../middleware/auth.js';
import {
  solicitarCodigoYape,
  webhookYape,
  verificarEstadoYape,
  listarTransaccionesYape
} from '../controllers/yape.webhook.controller.js';

const router = express.Router();

// ============================================
// RUTAS PÚBLICAS (WEBHOOK)
// ============================================
// Ruta para recibir notificaciones de Yape (no requiere autenticación)
router.post('/webhook', webhookYape);

// ============================================
// RUTAS PROTEGIDAS
// ============================================
router.use(verifyToken);

// Solicitar código de verificación para Yape
router.post('/solicitar-codigo', requireRole([1, 2], 'ventas'), solicitarCodigoYape);

// Verificar estado de un pago
router.get('/verificar/:id_venta', requireRole([1, 2], 'ventas'), verificarEstadoYape);

// Listar transacciones (solo admin)
router.get('/transacciones', requireRole([1], 'ventas'), listarTransaccionesYape);

export default router;