// backend_dsi6/src/routes/recarga.routes.js
import express from 'express';
import { verifyToken, requireRole } from '../middleware/auth.js';
import {
  registrarRecarga,
  getHistorialRecargas,
  getRecargasHoy,
  cancelarRecarga  // ✅ AGREGAR
} from '../controllers/recarga.controller.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Rutas de recargas
router.post('/', requireRole([1, 2], 'ventas'), registrarRecarga);
router.get('/', requireRole([1, 2], 'ventas'), getHistorialRecargas);
router.get('/hoy', requireRole([1, 2], 'ventas'), getRecargasHoy);
router.patch('/:id/cancelar', requireRole([1, 2], 'ventas'), cancelarRecarga); // ✅ AGREGAR
export default router;