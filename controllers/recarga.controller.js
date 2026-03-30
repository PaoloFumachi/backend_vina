// backend_dsi6/src/controllers/recarga.controller.js
import db from '../config/db.js';

// Registrar nueva recarga
export const registrarRecarga = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id_cliente, id_producto, cantidad, total, id_metodo_pago, notas } = req.body;
    const id_usuario = req.user.id_usuario;

    // Validar cliente
    const [cliente] = await connection.execute(
      'SELECT id_cliente FROM cliente WHERE id_cliente = ? AND activo = 1',
      [id_cliente]
    );
    if (cliente.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Validar producto
    const [producto] = await connection.execute(
      'SELECT id_producto, nombre, precio, stock FROM producto WHERE id_producto = ? AND activo = 1',
      [id_producto]
    );
    if (producto.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Validar stock
    if (producto[0].stock < cantidad) {
      await connection.rollback();
      return res.status(400).json({ error: 'Stock insuficiente' });
    }

    // Obtener fecha y hora Perú
    const ahora = new Date();
    const offsetPeru = -5 * 60;
    const fechaPeru = new Date(ahora.getTime() + offsetPeru * 60 * 1000);
    const fechaStr = fechaPeru.toISOString().split('T')[0];
    const horaStr = fechaPeru.toTimeString().split(' ')[0];

    // Crear recarga (venta con estado pagado y sin repartidor)
    const [result] = await connection.execute(`
      INSERT INTO venta (
        id_cliente, fecha, hora, total, id_metodo_pago, id_estado_venta,
        id_vendedor, notas, tipo_comprobante_solicitado
      ) VALUES (?, ?, ?, ?, ?, 7, ?, ?, 'SIN_COMPROBANTE')
    `, [id_cliente, fechaStr, horaStr, total, id_metodo_pago, id_usuario, notas || 'Recarga de bidones']);

    const id_venta = result.insertId;

    // Crear detalle de venta
    await connection.execute(`
      INSERT INTO venta_detalle (id_venta, id_producto, cantidad, precio_unitario)
      VALUES (?, ?, ?, ?)
    `, [id_venta, id_producto, cantidad, producto[0].precio]);

    // Actualizar stock del producto
    await connection.execute(`
      UPDATE producto SET stock = stock - ? WHERE id_producto = ?
    `, [cantidad, id_producto]);

    // Registrar movimiento de stock
    await connection.execute(`
      INSERT INTO movimiento_stock 
      (id_producto, tipo_movimiento, cantidad, descripcion, id_usuario)
      VALUES (?, 'egreso', ?, 'Recarga de bidones - Venta #' || ?, ?)
    `, [id_producto, cantidad, id_venta, id_usuario]);

    await connection.commit();

    // Obtener datos del cliente para respuesta
    const [clienteInfo] = await connection.execute(`
      SELECT p.nombre_completo, p.telefono
      FROM cliente c
      JOIN persona p ON c.id_persona = p.id_persona
      WHERE c.id_cliente = ?
    `, [id_cliente]);

    res.status(201).json({
      success: true,
      message: 'Recarga registrada correctamente',
      recarga: {
        id_venta,
        id_cliente,
        id_producto,
        cantidad,
        total,
        id_metodo_pago,
        fecha: fechaStr,
        hora: horaStr,
        estado: 'PAGADO',
        cliente: clienteInfo[0]?.nombre_completo,
        telefono: clienteInfo[0]?.telefono
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error registrando recarga:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// Obtener historial de recargas
export const getHistorialRecargas = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        v.id_venta,
        v.fecha,
        v.hora,
        v.total,
        v.id_metodo_pago,
        mp.metodo_pago as metodo_pago_texto,
        p.nombre_completo as cliente,
        p.telefono,
        pr.nombre as producto,
        vd.cantidad,
        v.notas
      FROM venta v
      JOIN venta_detalle vd ON v.id_venta = vd.id_venta
      JOIN producto pr ON vd.id_producto = pr.id_producto
      JOIN cliente c ON v.id_cliente = c.id_cliente
      JOIN persona p ON c.id_persona = p.id_persona
      JOIN metodo_pago mp ON v.id_metodo_pago = mp.id_metodo_pago
      WHERE v.tipo_comprobante_solicitado = 'SIN_COMPROBANTE'
        AND v.id_estado_venta = 7
        AND v.id_repartidor IS NULL
      ORDER BY v.fecha_creacion DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ error: error.message });
  }
};

// Obtener recargas del día
export const getRecargasHoy = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        v.id_venta,
        v.fecha,
        v.hora,
        v.total,
        v.id_metodo_pago,
        mp.metodo_pago as metodo_pago_texto,
        p.nombre_completo as cliente,
        p.telefono,
        pr.nombre as producto,
        vd.cantidad
      FROM venta v
      JOIN venta_detalle vd ON v.id_venta = vd.id_venta
      JOIN producto pr ON vd.id_producto = pr.id_producto
      JOIN cliente c ON v.id_cliente = c.id_cliente
      JOIN persona p ON c.id_persona = p.id_persona
      JOIN metodo_pago mp ON v.id_metodo_pago = mp.id_metodo_pago
      WHERE v.tipo_comprobante_solicitado = 'SIN_COMPROBANTE'
        AND v.id_estado_venta = 7
        AND v.id_repartidor IS NULL
        AND DATE(v.fecha) = CURDATE()
      ORDER BY v.fecha_creacion DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo recargas del día:', error);
    res.status(500).json({ error: error.message });
  }
};
// ✅ AGREGAR ESTE MÉTODO
export const cancelarRecarga = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { motivo } = req.body;
    const id_usuario = req.user.id_usuario;

    // Verificar que la venta existe y está en estado pendiente (4 = Listo para repartos)
    const [ventas] = await connection.execute(`
      SELECT id_venta, id_estado_venta, transaction_id_yape
      FROM venta 
      WHERE id_venta = ? AND (id_estado_venta = 4 OR id_estado_venta = 1)
    `, [id]);

    if (ventas.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Venta no encontrada o ya procesada' });
    }

    const venta = ventas[0];

    // Si ya tiene transacción Yape asociada, no cancelar
    if (venta.transaction_id_yape) {
      await connection.rollback();
      return res.status(400).json({ error: 'No se puede cancelar una venta ya pagada con Yape' });
    }

    // Actualizar estado a cancelado
    await connection.execute(`
      UPDATE venta 
      SET id_estado_venta = 8, 
          notas = CONCAT(notas, ' - CANCELADA: ', ?),
          fecha_actualizacion = NOW()
      WHERE id_venta = ?
    `, [motivo, id]);

    await connection.commit();

    console.log(`✅ Venta #${id} cancelada por: ${motivo}`);

    res.json({
      success: true,
      message: 'Venta cancelada correctamente',
      id_venta: parseInt(id)
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error cancelando recarga:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};