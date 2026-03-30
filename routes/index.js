// src/routes/index.js
import express from "express";
import productoRoutes from "./producto.routes.js";
import categoriaRoutes from "./categoria.routes.js";
import marcaRoutes from "./marca.routes.js";
import proveedorRoutes from "./proveedor.routes.js";
import paisRoutes from "./pais.routes.js";
import clienteRoutes from "./cliente.routes.js";
import ubicacionRoutes from "./ubicacion.routes.js";
import authRoutes from "./auth.routes.js";
import ventaRoutes from "./venta.routes.js";
import repartidorRoutes from './repartidor.routes.js';
import usuarioRoutes from './usuario.routes.js';
import personaRoutes from "./persona.routes.js"
import repartidorVentaRoutes from './repartidor-venta.routes.js';
import movimientoStockRoutes from "./movimiento_stock.routes.js";
import loteRoutes from "./lote.routes.js"; // ✅ NUEVA RUTA AÑADIDA
import pedidoProveedorRoutes from "./pedido_proveedor.routes.js"; // ✅ NUEVA RUTA AÑADIDA
import inventarioRoutes from "./inventario.routes.js"; // ✅ NUEVA RUTA AÑADIDA
import insumoRoutes from "./insumo.routes.js";
import sunatRoutes from "./sunat.routes.js"; // ✅ NUEVA IMPORTACIÓN
import entregaDineroRoutes from "./entrega-dinero.routes.js"; // ✅ NUEVA RUTA
import empresaRoutes from "./empresa.routes.js";
import produccionRoutes from "./produccion.routes.js"; // ✅ AGREGAR
import recargaRoutes from './recarga.routes.js'; // ✅ AGREGAR
import yapeRoutes from './yape.routes.js'; // ✅ AGREGAR
const router = express.Router();

// Rutas públicas (sin autenticación)
router.use("/auth", authRoutes);

// Rutas protegidas (con autenticación)
router.use("/productos", productoRoutes);
router.use("/categorias", categoriaRoutes);
router.use("/marcas", marcaRoutes);
router.use("/proveedores", proveedorRoutes);
router.use("/personas", personaRoutes);
router.use("/paises", paisRoutes);
router.use("/clientes", clienteRoutes);
router.use("/ubicacion", ubicacionRoutes);
router.use("/ventas", ventaRoutes);
// ✅ CORREGIDO: Cambiar de '/api/repartidores' a '/repartidores'
router.use("/repartidores", repartidorRoutes);
// Rutas para administración de usuarios (roles, activar/desactivar)
router.use('/usuarios', usuarioRoutes);
router.use("/ventas", repartidorVentaRoutes);
// ✅ CORREGIDO: Cambiar de '/api/movimientos' a '/movimientos-stock'
router.use("/movimientos-stock", movimientoStockRoutes);
router.use("/lotes", loteRoutes); // ✅ NUEVA RUTA AÑADIDA
router.use("/pedidos-proveedor", pedidoProveedorRoutes); // ✅ NUEVA RUTA AÑADIDA
router.use("/inventario", inventarioRoutes); // ✅ NUEVA RUTA AÑADIDA
router.use("/insumos", insumoRoutes); // ✅ NUEVA RUTA AÑADIDA
router.use("/sunat", sunatRoutes); // ✅ NUEVA RUTA SUNAT
router.use("/entregas-dinero", entregaDineroRoutes); // ✅ NUEVA RUTA AGREGADA
router.use("/empresa", empresaRoutes);
router.use("/produccion", produccionRoutes); // ✅ AGREGAR
router.use("/recargas", recargaRoutes); // ✅ AGREGAR
router.use("/yape", yapeRoutes); // ✅ AGREGAR
export default router;