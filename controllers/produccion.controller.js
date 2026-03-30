// src/controllers/produccion.controller.js
import db from "../config/db.js";

// ============================================
// 1. OBTENER RECETA DE UN PRODUCTO
// ============================================
export const getRecetaProducto = async (req, res) => {
  try {
    const { id_producto } = req.params;
    
    const [rows] = await db.query(`
      SELECT 
        r.id_receta,
        r.id_insumo,
        r.cantidad_necesaria,
        i.nombre as insumo_nombre,
        i.unidad_medida,
        i.stock_actual,
        i.stock_minimo,
        i.costo_promedio
      FROM receta_producto r
      LEFT JOIN insumo i ON r.id_insumo = i.id_insumo
      WHERE r.id_producto = ? AND r.activo = 1
    `, [id_producto]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        message: "Este producto no tiene receta definida" 
      });
    }
    
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener receta:", error);
    res.status(500).json({ message: "Error al obtener receta" });
  }
};

// ============================================
// 2. VERIFICAR DISPONIBILIDAD DE INSUMOS
// ============================================
export const verificarDisponibilidad = async (req, res) => {
  try {
    const { id_producto, cantidad_producir } = req.body;
    
    if (!id_producto || !cantidad_producir || cantidad_producir <= 0) {
      return res.status(400).json({ message: "Datos incompletos" });
    }
    
    // Obtener receta
    const [receta] = await db.query(`
      SELECT 
        r.id_insumo,
        r.cantidad_necesaria,
        i.nombre as insumo_nombre,
        i.stock_actual,
        i.unidad_medida
      FROM receta_producto r
      LEFT JOIN insumo i ON r.id_insumo = i.id_insumo
      WHERE r.id_producto = ? AND r.activo = 1
    `, [id_producto]);
    
    if (receta.length === 0) {
      return res.status(404).json({ 
        message: "Este producto no tiene receta definida" 
      });
    }
    
    // Calcular disponibilidad
    const insumosFaltantes = [];
    let disponible = true;
    
    for (const insumo of receta) {
      const cantidadNecesaria = insumo.cantidad_necesaria * cantidad_producir;
      const stockActual = insumo.stock_actual || 0;
      
      if (stockActual < cantidadNecesaria) {
        disponible = false;
        insumosFaltantes.push({
          id_insumo: insumo.id_insumo,
          nombre: insumo.insumo_nombre,
          unidad: insumo.unidad_medida,
          necesarios: cantidadNecesaria,
          disponibles: stockActual,
          faltante: cantidadNecesaria - stockActual,
          costo_unitario: insumo.costo_promedio || 0
        });
      }
    }
    
    res.json({
      disponible,
      insumosFaltantes,
      resumen: {
        producto_id: id_producto,
        cantidad_producir,
        total_insumos: receta.length,
        insumos_suficientes: receta.length - insumosFaltantes.length
      },
      receta: receta.map(r => ({
        id_insumo: r.id_insumo,
        nombre: r.insumo_nombre,
        unidad: r.unidad_medida,
        cantidad_por_unidad: r.cantidad_necesaria,
        cantidad_total: r.cantidad_necesaria * cantidad_producir,
        stock_actual: r.stock_actual
      }))
    });
    
  } catch (error) {
    console.error("Error verificando disponibilidad:", error);
    res.status(500).json({ message: "Error al verificar disponibilidad" });
  }
};

// ============================================
// 3. GENERAR NÚMERO DE LOTE ÚNICO
// ============================================
const generarNumeroLote = async (connection, id_producto, nombreProducto) => {
  let prefijo = "LOTE";
  if (nombreProducto.includes("Bella")) prefijo = "BL";
  else if (nombreProducto.includes("Viña")) prefijo = "VL";
  else if (nombreProducto.includes("Paquete")) prefijo = "PK";
  else if (nombreProducto.includes("Bidón")) prefijo = "BD";
  
  const fecha = new Date();
  const año = fecha.getFullYear();
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const baseLote = `${prefijo}-${año}${mes}`;
  
  // Buscar último consecutivo
  const [lotesExistentes] = await connection.query(
    `SELECT numero_lote FROM lote_producto 
     WHERE numero_lote LIKE ? AND id_producto = ?
     ORDER BY id_lote DESC LIMIT 1`,
    [`${baseLote}-%`, id_producto]
  );
  
  let consecutivo = 1;
  if (lotesExistentes.length > 0) {
    const partes = lotesExistentes[0].numero_lote.split('-');
    if (partes.length > 2) {
      const ultimoConsecutivo = parseInt(partes[2]);
      if (!isNaN(ultimoConsecutivo)) {
        consecutivo = ultimoConsecutivo + 1;
      }
    }
  }
  
  return `${baseLote}-${consecutivo.toString().padStart(3, '0')}`;
};

// ============================================
// 4. CALCULAR FECHA DE CADUCIDAD
// ============================================
const calcularFechaCaducidad = (nombreProducto) => {
  const fecha = new Date();
  let meses = 6; // Por defecto 6 meses
  
  if (nombreProducto.includes("Bidón")) meses = 6;
  else if (nombreProducto.includes("Paquete")) meses = 12;
  else if (nombreProducto.includes("Botella")) meses = 12;
  
  fecha.setMonth(fecha.getMonth() + meses);
  return fecha.toISOString().split('T')[0];
};

// ============================================
// 5. EJECUTAR PRODUCCIÓN (EL MÉTODO PRINCIPAL)
// ============================================
export const ejecutarProduccion = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    const { id_producto, cantidad_producir, descripcion } = req.body;
    const id_usuario = req.user.id_usuario;
    
    // Validar datos
    if (!id_producto || !cantidad_producir || cantidad_producir <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: "Datos incompletos" });
    }
    
    // 1. Obtener información del producto
    const [productoInfo] = await connection.query(
      "SELECT nombre, precio FROM producto WHERE id_producto = ? AND activo = 1",
      [id_producto]
    );
    
    if (productoInfo.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    
    const nombreProducto = productoInfo[0].nombre;
    
    // 2. Obtener receta del producto
    const [receta] = await connection.query(`
      SELECT 
        r.id_insumo,
        r.cantidad_necesaria,
        i.nombre as insumo_nombre,
        i.stock_actual,
        i.costo_promedio
      FROM receta_producto r
      LEFT JOIN insumo i ON r.id_insumo = i.id_insumo
      WHERE r.id_producto = ? AND r.activo = 1
    `, [id_producto]);
    
    if (receta.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        message: "Este producto no tiene receta definida" 
      });
    }
    
    // 3. Verificar stock de insumos (consumo)
    for (const insumo of receta) {
      const cantidadNecesaria = insumo.cantidad_necesaria * cantidad_producir;
      if (insumo.stock_actual < cantidadNecesaria) {
        await connection.rollback();
        return res.status(400).json({ 
          message: `Stock insuficiente de ${insumo.insumo_nombre}. 
                   Disponible: ${insumo.stock_actual}, 
                   Necesario: ${cantidadNecesaria}` 
        });
      }
    }
    
    // 4. Generar número de lote
    const numeroLote = await generarNumeroLote(connection, id_producto, nombreProducto);
    
    // 5. Calcular fecha de caducidad
    const fechaCaducidad = calcularFechaCaducidad(nombreProducto);
    
    // 6. CREAR NUEVO LOTE DEL PRODUCTO TERMINADO
    const [loteResult] = await connection.query(
      `INSERT INTO lote_producto 
       (id_producto, numero_lote, fecha_caducidad, cantidad_inicial, cantidad_actual) 
       VALUES (?, ?, ?, ?, ?)`,
      [id_producto, numeroLote, fechaCaducidad, cantidad_producir, cantidad_producir]
    );
    const id_lote = loteResult.insertId;
    
    // 7. REGISTRAR MOVIMIENTO DE INGRESO DEL PRODUCTO
    await connection.query(
      `INSERT INTO movimiento_stock 
       (id_producto, tipo_movimiento, cantidad, descripcion, id_usuario, id_lote) 
       VALUES (?, 'ingreso', ?, ?, ?, ?)`,
      [id_producto, cantidad_producir, 
       descripcion || `🏭 PRODUCCIÓN: ${cantidad_producir} unidades de ${nombreProducto} - Lote ${numeroLote}`, 
       id_usuario, id_lote]
    );
    
    // 8. ACTUALIZAR STOCK DEL PRODUCTO
    await connection.query(
      "UPDATE producto SET stock = stock + ? WHERE id_producto = ?",
      [cantidad_producir, id_producto]
    );
    
    // 9. CONSUMIR INSUMOS Y REGISTRAR MOVIMIENTOS
    const insumosConsumidos = [];
    for (const insumo of receta) {
      const cantidadConsumir = insumo.cantidad_necesaria * cantidad_producir;
      
      // Actualizar stock del insumo (restar)
      await connection.query(
        "UPDATE insumo SET stock_actual = stock_actual - ? WHERE id_insumo = ?",
        [cantidadConsumir, insumo.id_insumo]
      );
      
      // Registrar movimiento de EGRESO del insumo
      await connection.query(
        `INSERT INTO movimiento_stock 
         (id_producto, tipo_movimiento, cantidad, descripcion, id_usuario) 
         VALUES (?, 'egreso', ?, ?, ?)`,
        [insumo.id_insumo, cantidadConsumir, 
         `⚙️ CONSUMO: ${cantidadConsumir} ${insumo.insumo_nombre} para producción de ${cantidad_producir} unidades de ${nombreProducto}`, 
         id_usuario]
      );
      
      insumosConsumidos.push({
        id_insumo: insumo.id_insumo,
        nombre: insumo.insumo_nombre,
        cantidad: cantidadConsumir,
        costo_unitario: insumo.costo_promedio || 0,
        subtotal: (insumo.costo_promedio || 0) * cantidadConsumir
      });
    }
    
    // 10. REGISTRAR EN HISTORIAL DE PRODUCCIÓN
    await connection.query(
      `INSERT INTO produccion_historial 
       (id_producto, cantidad_producida, numero_lote, id_usuario, descripcion) 
       VALUES (?, ?, ?, ?, ?)`,
      [id_producto, cantidad_producir, numeroLote, id_usuario, 
       descripcion || `Producción de ${cantidad_producir} unidades`]
    );
    
    await connection.commit();
    
    // Calcular costo total de producción
    const costoTotal = insumosConsumidos.reduce((sum, i) => sum + i.subtotal, 0);
    const costoUnitario = costoTotal / cantidad_producir;
    
    res.status(201).json({
      success: true,
      message: `✅ Producción completada: ${cantidad_producir} unidades de ${nombreProducto}`,
      produccion: {
        id_producto,
        nombre_producto: nombreProducto,
        cantidad_producida: cantidad_producir,
        numero_lote: numeroLote,
        fecha_caducidad: fechaCaducidad,
        fecha_produccion: new Date().toISOString(),
        costo_total: costoTotal,
        costo_unitario: costoUnitario
      },
      insumos_consumidos: insumosConsumidos,
      stock_actual_producto: (productoInfo[0].stock || 0) + cantidad_producir
    });
    
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error en producción:", error);
    res.status(500).json({ 
      success: false,
      message: "Error al procesar la producción",
      error: error.message 
    });
  } finally {
    connection.release();
  }
};

// ============================================
// 6. OBTENER HISTORIAL DE PRODUCCIÓN
// ============================================
export const getHistorialProduccion = async (req, res) => {
  try {
    const { limite = 50, pagina = 1 } = req.query;
    const offset = (pagina - 1) * limite;
    
    const [rows] = await db.query(`
      SELECT 
        ph.id_produccion,
        ph.id_producto,
        ph.cantidad_producida,
        ph.numero_lote,
        ph.fecha_produccion,
        ph.descripcion,
        p.nombre as producto_nombre,
        u.nombre_usuario,
        per.nombre_completo as usuario_nombre
      FROM produccion_historial ph
      LEFT JOIN producto p ON ph.id_producto = p.id_producto
      LEFT JOIN usuario u ON ph.id_usuario = u.id_usuario
      LEFT JOIN persona per ON u.id_persona = per.id_persona
      ORDER BY ph.fecha_produccion DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limite), offset]);
    
    const [total] = await db.query(
      "SELECT COUNT(*) as total FROM produccion_historial"
    );
    
    res.json({
      data: rows,
      paginacion: {
        total: total[0].total,
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total_paginas: Math.ceil(total[0].total / limite)
      }
    });
    
  } catch (error) {
    console.error("Error al obtener historial:", error);
    res.status(500).json({ message: "Error al obtener historial" });
  }
};

// ============================================
// 7. OBTENER COSTOS DE PRODUCCIÓN
// ============================================
export const getCostosProduccion = async (req, res) => {
  try {
    const { id_producto, fecha_inicio, fecha_fin } = req.query;
    
    let query = `
      SELECT 
        ph.id_produccion,
        ph.fecha_produccion,
        ph.numero_lote,
        ph.cantidad_producida,
        p.nombre as producto,
        SUM(ms.cantidad * i.costo_promedio) as costo_total,
        (SUM(ms.cantidad * i.costo_promedio) / ph.cantidad_producida) as costo_unitario
      FROM produccion_historial ph
      JOIN producto p ON ph.id_producto = p.id_producto
      JOIN movimiento_stock ms ON ms.id_lote = ph.id_produccion
      JOIN insumo i ON ms.id_producto = i.id_insumo
      WHERE ms.tipo_movimiento = 'egreso'
        AND ms.descripcion LIKE CONCAT('%', ph.numero_lote, '%')
    `;
    
    const params = [];
    
    if (id_producto) {
      query += " AND ph.id_producto = ?";
      params.push(id_producto);
    }
    
    if (fecha_inicio && fecha_fin) {
      query += " AND ph.fecha_produccion BETWEEN ? AND ?";
      params.push(fecha_inicio, fecha_fin);
    }
    
    query += " GROUP BY ph.id_produccion ORDER BY ph.fecha_produccion DESC";
    
    const [rows] = await db.query(query, params);
    
    res.json(rows);
    
  } catch (error) {
    console.error("Error al obtener costos:", error);
    res.status(500).json({ message: "Error al obtener costos" });
  }
};