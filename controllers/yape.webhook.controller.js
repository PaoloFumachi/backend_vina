// backend_dsi6/src/controllers/yape.webhook.controller.js
import db from '../config/db.js';
import crypto from 'crypto';

// ============================================
// GENERAR CÓDIGO ÚNICO DE VERIFICACIÓN
// ============================================
export const generarCodigoYape = () => {
  const fecha = new Date();
  const dia = fecha.getDate().toString().padStart(2, '0');
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const anio = fecha.getFullYear().toString().slice(-2);
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `YP-${anio}${mes}${dia}-${random}`;
};

// ============================================
// ENDPOINT PARA SOLICITAR CÓDIGO DE VERIFICACIÓN
// ============================================
export const solicitarCodigoYape = async (req, res) => {
  try {
    const { id_venta, monto } = req.body;
    
    // Generar código único
    const codigo = generarCodigoYape();
    
    // Guardar código en la venta
    await db.execute(`
      UPDATE venta 
      SET codigo_yape = ?, notas = CONCAT(notas, ' - YAPE PENDIENTE: ', ?)
      WHERE id_venta = ?
    `, [codigo, codigo, id_venta]);
    
    res.json({
      success: true,
      codigo: codigo,
      mensaje: 'Código generado correctamente'
    });
    
  } catch (error) {
    console.error('Error generando código Yape:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// WEBHOOK DE YAPE (RECIBE NOTIFICACIONES)
// ============================================
export const webhookYape = async (req, res) => {
  console.log('📱 WEBHOOK YAPE RECIBIDO');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  
  try {
    // ============================================
    // 1. VERIFICAR FIRMA DE SEGURIDAD (si Yape la envía)
    // ============================================
    const signature = req.headers['x-yape-signature'];
    const timestamp = req.headers['x-yape-timestamp'];
    
    if (process.env.YAPE_WEBHOOK_SECRET) {
      const payload = `${timestamp}.${JSON.stringify(req.body)}`;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.YAPE_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error('❌ Firma inválida - Posible intento de fraude');
        return res.status(401).json({ error: 'Firma inválida' });
      }
    }
    
    // ============================================
    // 2. EXTRAER DATOS DE LA NOTIFICACIÓN
    // ============================================
    const {
      transaction_id,      // ID único de transacción Yape
      amount,              // Monto pagado
      phone,               // Teléfono del pagador
      message,             // Mensaje del cliente (contiene el código)
      status,              // completed, pending, failed
      timestamp: yapeTimestamp, // Fecha de la transacción
      payment_method,      // YAPE
      customer_name        // Nombre del pagador (si está disponible)
    } = req.body;
    
    console.log(`📊 Datos recibidos:`, {
      transaction_id,
      amount,
      phone,
      message,
      status
    });
    
    // ============================================
    // 3. VERIFICAR QUE SEA UNA TRANSACCIÓN COMPLETADA
    // ============================================
    if (status !== 'completed') {
      console.log(`⏳ Transacción en estado: ${status}`);
      return res.json({ 
        received: true, 
        message: 'Transacción en proceso',
        status: 'pending'
      });
    }
    
    // ============================================
    // 4. EXTRAER CÓDIGO DEL MENSAJE
    // ============================================
    // Buscar código con formato YP-YYMMDD-XXXX
    const codigoMatch = message?.match(/YP-\d{6}-\d{4}/);
    
    if (!codigoMatch) {
      console.log('⚠️ No se encontró código de verificación en el mensaje');
      // Guardar transacción como no asociada
      await db.execute(`
        INSERT INTO transacciones_yape 
        (transaction_id, monto, telefono_pagador, mensaje, estado, fecha_transaccion)
        VALUES (?, ?, ?, ?, 'NO_ASOCIADA', ?)
      `, [transaction_id, amount, phone, message, yapeTimestamp]);
      
      return res.json({ 
        received: true, 
        message: 'Transacción recibida pero sin código',
        status: 'no_code'
      });
    }
    
    const codigoVerificacion = codigoMatch[0];
    console.log(`🔐 Código encontrado: ${codigoVerificacion}`);
    
    // ============================================
    // 5. BUSCAR VENTA CON ESE CÓDIGO
    // ============================================
    const [ventas] = await db.execute(`
      SELECT id_venta, id_cliente, total, codigo_yape, transaction_id_yape
      FROM venta 
      WHERE codigo_yape = ? 
        AND id_estado_venta = 4  -- Listo para repartos (recarga pendiente)
        AND transaction_id_yape IS NULL
      ORDER BY fecha_creacion DESC
      LIMIT 1
    `, [codigoVerificacion]);
    
    if (ventas.length === 0) {
      console.log('❌ Código no válido o ya utilizado');
      await db.execute(`
        INSERT INTO transacciones_yape 
        (transaction_id, monto, telefono_pagador, codigo_verificacion, mensaje, estado, fecha_transaccion)
        VALUES (?, ?, ?, ?, ?, 'CODIGO_INVALIDO', ?)
      `, [transaction_id, amount, phone, codigoVerificacion, message, yapeTimestamp]);
      
      return res.status(404).json({ 
        error: 'Código no válido o ya utilizado',
        code: 'INVALID_CODE'
      });
    }
    
    const venta = ventas[0];
    
    // ============================================
    // 6. VALIDAR MONTO
    // ============================================
    if (Number(venta.total) !== Number(amount)) {
      console.log(`❌ Monto incorrecto: esperado S/ ${venta.total}, recibido S/ ${amount}`);
      await db.execute(`
        INSERT INTO transacciones_yape 
        (transaction_id, monto, telefono_pagador, codigo_verificacion, mensaje, estado, fecha_transaccion, id_venta)
        VALUES (?, ?, ?, ?, ?, 'MONTO_INCORRECTO', ?, ?)
      `, [transaction_id, amount, phone, codigoVerificacion, message, yapeTimestamp, venta.id_venta]);
      
      return res.status(400).json({ 
        error: `Monto incorrecto. Esperado: S/ ${venta.total}`,
        code: 'AMOUNT_MISMATCH'
      });
    }
    
    // ============================================
    // 7. VERIFICAR QUE NO SE HAYA PROCESADO ANTES
    // ============================================
    const [transaccionExistente] = await db.execute(`
      SELECT id_transaccion FROM transacciones_yape 
      WHERE transaction_id = ? OR (codigo_verificacion = ? AND estado = 'CONFIRMADO')
    `, [transaction_id, codigoVerificacion]);
    
    if (transaccionExistente.length > 0) {
      console.log('⚠️ Transacción ya procesada anteriormente');
      return res.json({ 
        received: true, 
        message: 'Transacción ya procesada',
        status: 'duplicate'
      });
    }
    
    // ============================================
    // 8. ACTUALIZAR ESTADO DE LA VENTA A PAGADA
    // ============================================
    await db.execute(`
      UPDATE venta 
      SET id_estado_venta = 7,  -- Pagado
          transaction_id_yape = ?,
          notas = CONCAT(notas, ' - YAPE CONFIRMADO #', ?),
          fecha_actualizacion = NOW()
      WHERE id_venta = ?
    `, [transaction_id, transaction_id, venta.id_venta]);
    
    // ============================================
    // 9. REGISTRAR TRANSACCIÓN EXITOSA
    // ============================================
    await db.execute(`
      INSERT INTO transacciones_yape 
      (transaction_id, monto, telefono_pagador, codigo_verificacion, mensaje, estado, fecha_transaccion, id_venta)
      VALUES (?, ?, ?, ?, ?, 'CONFIRMADO', ?, ?)
    `, [transaction_id, amount, phone, codigoVerificacion, message, yapeTimestamp, venta.id_venta]);
    
    console.log(`✅ PAGO CONFIRMADO: Venta #${venta.id_venta}, Monto S/ ${amount}`);
    
    // ============================================
    // 10. RESPUESTA EXITOSA
    // ============================================
    res.json({
      success: true,
      message: 'Pago confirmado correctamente',
      data: {
        id_venta: venta.id_venta,
        monto: amount,
        codigo: codigoVerificacion,
        transaction_id: transaction_id
      }
    });
    
  } catch (error) {
    console.error('❌ Error en webhook Yape:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
};

// ============================================
// VERIFICAR ESTADO DE UN PAGO YAPE
// ============================================
export const verificarEstadoYape = async (req, res) => {
  try {
    const { id_venta } = req.params;
    
    const [ventas] = await db.execute(`
      SELECT id_venta, transaction_id_yape, id_estado_venta, codigo_yape
      FROM venta 
      WHERE id_venta = ?
    `, [id_venta]);
    
    if (ventas.length === 0) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    
    const venta = ventas[0];
    
    if (venta.id_estado_venta === 7 && venta.transaction_id_yape) {
      return res.json({
        pagado: true,
        transaction_id: venta.transaction_id_yape,
        codigo: venta.codigo_yape
      });
    }
    
    // Buscar en transacciones
    const [transaccion] = await db.execute(`
      SELECT estado, transaction_id 
      FROM transacciones_yape 
      WHERE id_venta = ?
      ORDER BY fecha_recepcion DESC LIMIT 1
    `, [id_venta]);
    
    if (transaccion.length > 0) {
      return res.json({
        pagado: transaccion[0].estado === 'CONFIRMADO',
        estado: transaccion[0].estado,
        transaction_id: transaccion[0].transaction_id
      });
    }
    
    res.json({ pagado: false });
    
  } catch (error) {
    console.error('Error verificando estado Yape:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// LISTAR TRANSACCIONES YAPE
// ============================================
export const listarTransaccionesYape = async (req, res) => {
  try {
    const { limite = 50, desde = 0 } = req.query;
    
    const [transacciones] = await db.execute(`
      SELECT 
        ty.*,
        v.id_venta,
        v.codigo_yape,
        v.total as monto_venta,
        c.nombre_completo as cliente
      FROM transacciones_yape ty
      LEFT JOIN venta v ON ty.id_venta = v.id_venta
      LEFT JOIN cliente cl ON v.id_cliente = cl.id_cliente
      LEFT JOIN persona c ON cl.id_persona = c.id_persona
      ORDER BY ty.fecha_recepcion DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limite), parseInt(desde)]);
    
    const [total] = await db.execute('SELECT COUNT(*) as total FROM transacciones_yape');
    
    res.json({
      data: transacciones,
      total: total[0].total,
      limite: parseInt(limite),
      desde: parseInt(desde)
    });
    
  } catch (error) {
    console.error('Error listando transacciones:', error);
    res.status(500).json({ error: error.message });
  }
};