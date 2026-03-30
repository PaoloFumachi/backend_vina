// src/routes/produccion.routes.js
import express from "express";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { 
  getRecetaProducto,
  verificarDisponibilidad,
  ejecutarProduccion,
  getHistorialProduccion,
  getCostosProduccion
} from "../controllers/produccion.controller.js";

const router = express.Router();

// Rutas de producción (solo Admin y Almacenero)
router.get("/receta/:id_producto", 
  verifyToken, 
  requireRole([1, 4], 'inventario'), 
  getRecetaProducto
);

router.post("/verificar", 
  verifyToken, 
  requireRole([1, 4], 'inventario'), 
  verificarDisponibilidad
);

router.post("/ejecutar", 
  verifyToken, 
  requireRole([1, 4], 'inventario'), 
  ejecutarProduccion
);

router.get("/historial", 
  verifyToken, 
  requireRole([1, 4], 'inventario'), 
  getHistorialProduccion
);

router.get("/costos", 
  verifyToken, 
  requireRole([1, 4], 'inventario'), 
  getCostosProduccion
);

export default router;