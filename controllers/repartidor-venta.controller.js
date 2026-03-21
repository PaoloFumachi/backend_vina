// src/controllers/repartidor-venta.controller.js
import db from '../config/db.js';

// En repartidor-venta.controller.js - CORREGIR iniciarRutaEntrega
// En repartidor-venta.controller.js - VERIFICAR QUE ESTÉ CORREGIDO
export const iniciarRutaEntrega = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        
        const [repartidores] = await connection.execute(`
            SELECT r.id_repartidor 
            FROM repartidor r
            JOIN usuario u ON r.id_persona = u.id_persona
            WHERE u.id_usuario = ?
        `, [req.user.id_usuario]);

        if (repartidores.length === 0) {
            return res.status(404).json({ error: 'Repartidor no encontrado para este usuario' });
        }

        const repartidorId = repartidores[0].id_repartidor;
        const { id } = req.params;
        const { coordenadas } = req.body;

        console.log(`🔄 Repartidor ${repartidorId} iniciando ruta física para venta ${id}`);
        console.log(`📍 Coordenadas recibidas:`, coordenadas);

        // ✅ CORRECIÓN: Convertir undefined a null para MySQL
        const coordenadasParam = coordenadas || null;

        // Verificar que la venta está asignada y en estado "En ruta"
        const [ventas] = await connection.execute(`
            SELECT id_venta, fecha_inicio_ruta, tracking_activo
            FROM venta 
            WHERE id_venta = ? AND id_repartidor = ? AND id_estado_venta = 5
            LIMIT 1
        `, [id, repartidorId]);

        if (ventas.length === 0) {
            return res.status(404).json({ 
                error: 'Venta no encontrada o no está en estado "En ruta"' 
            });
        }

        // Si ya se inició la ruta antes
        if (ventas[0].fecha_inicio_ruta) {
            return res.status(400).json({ 
                error: 'La ruta ya fue iniciada anteriormente',
                fecha_inicio_ruta: ventas[0].fecha_inicio_ruta
            });
        }

        // ✅ CORRECIÓN: Usar coordenadasParam en lugar de coordenadas directamente
        const [result] = await connection.execute(`
            UPDATE venta 
            SET fecha_inicio_ruta = NOW(), 
                ubicacion_inicio_ruta = ?,
                tracking_activo = 1
            WHERE id_venta = ? AND id_repartidor = ? AND fecha_inicio_ruta IS NULL
        `, [coordenadasParam, id, repartidorId]);

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'No se pudo iniciar la ruta' });
        }

        console.log(`✅ Ruta física iniciada para venta ${id} por repartidor ${repartidorId}`);
        
        res.json({ 
            success: true,
            message: 'Ruta iniciada correctamente',
            fecha_inicio_ruta: new Date(),
            tracking_activo: true,
            coordenadas_usadas: coordenadasParam
        });

    } catch (error) {
        console.error('Error iniciando ruta:', error);
        
        // Manejo específico de timeout
        if (error.code === 'ER_LOCK_WAIT_TIMEOUT') {
            return res.status(503).json({ 
                error: 'El sistema está ocupado. Por favor, intente nuevamente en unos momentos.' 
            });
        }
        
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};
// Controlador para obtener ventas con información de ruta
export const getVentasAsignadas = async (req, res) => {
    try {
        const [repartidores] = await db.execute(`
            SELECT r.id_repartidor 
            FROM repartidor r
            JOIN usuario u ON r.id_persona = u.id_persona
            WHERE u.id_usuario = ?
        `, [req.user.id_usuario]);

        if (repartidores.length === 0) {
            return res.status(404).json({ error: 'Repartidor no encontrado para este usuario' });
        }

        const repartidorId = repartidores[0].id_repartidor;
        
        const [ventas] = await db.execute(`
            SELECT 
                v.id_venta,
                v.id_cliente,
                DATE_FORMAT(v.fecha, '%Y-%m-%d') as fecha,
                TIME(v.hora) as hora,
                v.total,
                v.id_estado_venta,
                ev.estado,
                p_cliente.nombre_completo,
                p_cliente.telefono,
                p_cliente.direccion,
                p_cliente.coordenadas,
                c.razon_social,
                v.id_metodo_pago,  -- ✅ AGREGAR ESTE CAMPO
                mp.metodo_pago,
                v.notas,
                v.fecha_creacion,
                v.fecha_inicio_ruta,
                v.fecha_fin_ruta,
                v.ubicacion_inicio_ruta,
                v.tracking_activo
            FROM venta v
            LEFT JOIN cliente c ON v.id_cliente = c.id_cliente
            LEFT JOIN persona p_cliente ON c.id_persona = p_cliente.id_persona
            LEFT JOIN estado_venta ev ON v.id_estado_venta = ev.id_estado_venta
            LEFT JOIN metodo_pago mp ON v.id_metodo_pago = mp.id_metodo_pago
            WHERE v.id_repartidor = ? 
            AND v.id_estado_venta IN (4, 5) -- Listo para repartos, En ruta
            ORDER BY 
                CASE 
                    WHEN v.fecha_inicio_ruta IS NULL THEN 1 -- Primero las no iniciadas
                    ELSE 2 -- Luego las iniciadas
                END,
                v.fecha_creacion DESC
        `, [repartidorId]);
        
        console.log(`✅ Ventas asignadas encontradas: ${ventas.length}`);
        res.json(ventas);
    } catch (error) {
        console.error('Error obteniendo ventas asignadas:', error);
        res.status(500).json({ error: error.message });
    }
};
// Obtener entregas pendientes (estado "En ruta")
// Obtener entregas pendientes (estado "En ruta") - ACTUALIZADA
export const getEntregasPendientes = async (req, res) => {
    try {
        // Obtener el id_repartidor del usuario actual
        const [repartidores] = await db.execute(`
            SELECT r.id_repartidor 
            FROM repartidor r
            JOIN usuario u ON r.id_persona = u.id_persona
            WHERE u.id_usuario = ?
        `, [req.user.id_usuario]);

        if (repartidores.length === 0) {
            return res.status(404).json({ error: 'Repartidor no encontrado para este usuario' });
        }

        const repartidorId = repartidores[0].id_repartidor;
        console.log(`🔍 Buscando entregas pendientes para repartidor ID: ${repartidorId}`);
        
        // ✅ ACTUALIZAR ESTA CONSULTA PARA INCLUIR CAMPOS DE RUTA
        const [ventas] = await db.execute(`
            SELECT 
                v.id_venta,
                v.id_cliente,
                DATE_FORMAT(v.fecha, '%Y-%m-%d') as fecha,
                TIME(v.hora) as hora,
                v.total,
                v.id_estado_venta,
                ev.estado,
                p_cliente.nombre_completo,
                p_cliente.telefono,
                p_cliente.direccion,
                p_cliente.coordenadas,
                c.razon_social,
                v.id_metodo_pago,  -- ✅ AGREGAR ESTE CAMPO
                mp.metodo_pago,
                v.notas,
                v.fecha_creacion,
                -- ✅ AGREGAR ESTOS CAMPOS CRÍTICOS
                v.fecha_inicio_ruta,
                v.fecha_fin_ruta,
                v.ubicacion_inicio_ruta,
                v.tracking_activo
            FROM venta v
            LEFT JOIN cliente c ON v.id_cliente = c.id_cliente
            LEFT JOIN persona p_cliente ON c.id_persona = p_cliente.id_persona
            LEFT JOIN estado_venta ev ON v.id_estado_venta = ev.id_estado_venta
            LEFT JOIN metodo_pago mp ON v.id_metodo_pago = mp.id_metodo_pago
            WHERE v.id_repartidor = ? 
            AND v.id_estado_venta = 5 -- En ruta
            ORDER BY v.fecha_creacion DESC
        `, [repartidorId]);
        
        console.log(`✅ Entregas pendientes encontradas: ${ventas.length}`);
        
        // Debug: verificar qué datos están llegando
        if (ventas.length > 0) {
            console.log('📦 Datos de entrega pendiente:', {
                id_venta: ventas[0].id_venta,
                fecha_inicio_ruta: ventas[0].fecha_inicio_ruta,
                ubicacion_inicio_ruta: ventas[0].ubicacion_inicio_ruta
            });
        }
        
        res.json(ventas);
    } catch (error) {
        console.error('Error obteniendo entregas pendientes:', error);
        res.status(500).json({ error: error.message });
    }
};

// Obtener historial de entregas completadas
export const getHistorialEntregas = async (req, res) => {
    try {
        // Obtener el id_repartidor del usuario actual
        const [repartidores] = await db.execute(`
            SELECT r.id_repartidor 
            FROM repartidor r
            JOIN usuario u ON r.id_persona = u.id_persona
            WHERE u.id_usuario = ?
        `, [req.user.id_usuario]);

        if (repartidores.length === 0) {
            return res.status(404).json({ error: 'Repartidor no encontrado para este usuario' });
        }

        const repartidorId = repartidores[0].id_repartidor;
        console.log(`🔍 Buscando historial para repartidor ID: ${repartidorId}`);
        
        const [ventas] = await db.execute(`
            SELECT 
                v.id_venta,
                v.id_cliente,
                DATE_FORMAT(v.fecha, '%Y-%m-%d') as fecha,
                TIME(v.hora) as hora,
                v.total,
                v.id_estado_venta,
                ev.estado,
                p_cliente.nombre_completo,
                p_cliente.telefono,
                p_cliente.direccion,
                p_cliente.coordenadas,
                c.razon_social,
                v.id_metodo_pago,
                mp.metodo_pago,
                v.notas,
                v.fecha_creacion
            FROM venta v
            LEFT JOIN cliente c ON v.id_cliente = c.id_cliente
            LEFT JOIN persona p_cliente ON c.id_persona = p_cliente.id_persona
            LEFT JOIN estado_venta ev ON v.id_estado_venta = ev.id_estado_venta
            LEFT JOIN metodo_pago mp ON v.id_metodo_pago = mp.id_metodo_pago
            WHERE v.id_repartidor = ? 
            AND v.id_estado_venta IN (7, 8) -- Pagado, Cancelado
            ORDER BY v.fecha_creacion DESC
        `, [repartidorId]);
        
        console.log(`✅ Historial de entregas encontrado: ${ventas.length}`);
        res.json(ventas);
    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ error: error.message });
    }
};

// Obtener detalle de una venta asignada al repartidor actual
// En repartidor-venta.controller.js - ACTUALIZAR getVentaDetalleAsignada
export const getVentaDetalleAsignada = async (req, res) => {
    try {
        // Obtener el id_repartidor del usuario actual
        const [repartidores] = await db.execute(`
            SELECT r.id_repartidor 
            FROM repartidor r
            JOIN usuario u ON r.id_persona = u.id_persona
            WHERE u.id_usuario = ?
        `, [req.user.id_usuario]);

        if (repartidores.length === 0) {
            return res.status(404).json({ error: 'Repartidor no encontrado para este usuario' });
        }

        const repartidorId = repartidores[0].id_repartidor;
        const { id } = req.params;

        console.log(`🔍 Buscando detalle de venta ${id} para repartidor ID: ${repartidorId}`);
        
        const [ventas] = await db.execute(`
            SELECT 
                v.id_venta,
                v.id_cliente,
                DATE_FORMAT(v.fecha, '%Y-%m-%d') as fecha,
                TIME(v.hora) as hora,
                v.total,
                v.id_metodo_pago,
                v.id_estado_venta,
                v.id_repartidor,
                v.id_vendedor,
                v.notas,
                v.fecha_creacion,
                v.fecha_actualizacion,
                DATE_FORMAT(v.fecha_inicio_ruta, '%Y-%m-%d %H:%i:%s') as fecha_inicio_ruta,
                DATE_FORMAT(v.fecha_fin_ruta, '%Y-%m-%d %H:%i:%s') as fecha_fin_ruta,
                v.ubicacion_inicio_ruta, 
                v.tracking_activo,   
                c.razon_social, 
                p_cliente.telefono,
                p_cliente.direccion,
                p_cliente.coordenadas,
                p_cliente.nombre_completo,
                ev.estado, 
                mp.metodo_pago, 
                u.nombre_usuario as vendedor,
                p_repartidor.nombre_completo as repartidor
            FROM venta v
            LEFT JOIN cliente c ON v.id_cliente = c.id_cliente
            LEFT JOIN persona p_cliente ON c.id_persona = p_cliente.id_persona
            LEFT JOIN estado_venta ev ON v.id_estado_venta = ev.id_estado_venta
            LEFT JOIN metodo_pago mp ON v.id_metodo_pago = mp.id_metodo_pago
            LEFT JOIN usuario u ON v.id_vendedor = u.id_usuario
            LEFT JOIN repartidor r ON v.id_repartidor = r.id_repartidor
            LEFT JOIN persona p_repartidor ON r.id_persona = p_repartidor.id_persona
            WHERE v.id_venta = ? AND v.id_repartidor = ?
        `, [id, repartidorId]);

        if (ventas.length === 0) {
            return res.status(404).json({ error: 'Venta no encontrada o no asignada a este repartidor' });
        }

        const [detalles] = await db.execute(`
            SELECT vd.*, p.nombre as producto_nombre, p.precio
            FROM venta_detalle vd
            JOIN producto p ON vd.id_producto = p.id_producto
            WHERE vd.id_venta = ?
        `, [id]);

        const venta = ventas[0];
        
        // ✅ DEBUG: Verificar qué campos están llegando
        console.log('📦 Datos de venta recibidos:', {
            id_venta: venta.id_venta,
            fecha_inicio_ruta: venta.fecha_inicio_ruta,
            fecha_fin_ruta: venta.fecha_fin_ruta,
            tracking_activo: venta.tracking_activo
        });
        
        res.json({
            ...venta,
            detalles
        });
    } catch (error) {
        console.error('Error obteniendo detalle de venta asignada:', error);
        res.status(500).json({ error: error.message });
    }
};

// Nuevo endpoint para verificar si puede marcar como pagado
export const verificarPuedeMarcarPagado = async (req, res) => {
    try {
        const [repartidores] = await db.execute(`
            SELECT r.id_repartidor 
            FROM repartidor r
            JOIN usuario u ON r.id_persona = u.id_persona
            WHERE u.id_usuario = ?
            LIMIT 1
        `, [req.user.id_usuario]);

        if (repartidores.length === 0) {
            return res.status(404).json({ 
                puede: false, 
                mensaje: 'Repartidor no encontrado' 
            });
        }

        const repartidorId = repartidores[0].id_repartidor;
        const { id } = req.params;

        // Verificar requisitos para marcar como pagado
        const [ventas] = await db.execute(`
            SELECT v.id_venta, v.fecha_inicio_ruta, v.id_estado_venta,
                   TIMESTAMPDIFF(MINUTE, v.fecha_inicio_ruta, NOW()) as minutos_desde_inicio
            FROM venta v
            WHERE v.id_venta = ? AND v.id_repartidor = ?
            LIMIT 1
        `, [id, repartidorId]);

        if (ventas.length === 0) {
            return res.status(404).json({ 
                puede: false, 
                mensaje: 'Venta no encontrada' 
            });
        }

        const venta = ventas[0];

        // Validaciones estrictas
        if (!venta.fecha_inicio_ruta) {
            return res.json({ 
                puede: false, 
                mensaje: 'Debe iniciar la ruta primero desde "Mis Rutas Asignadas" antes de marcar como pagado.' 
            });
        }

        if (venta.id_estado_venta !== 5) {
            return res.json({ 
                puede: false, 
                mensaje: 'La venta no está en estado "En ruta".' 
            });
        }

        // Verificar que haya pasado un tiempo mínimo desde el inicio de ruta (1 minuto)
        if (venta.minutos_desde_inicio < 1) {
            return res.json({ 
                puede: false, 
                mensaje: 'Debe esperar al menos 1 minuto después de iniciar la ruta para marcar como pagado.' 
            });
        }

        return res.json({ 
            puede: true 
        });

    } catch (error) {
        console.error('Error verificando pago:', error);
        res.status(500).json({ 
            puede: false, 
            mensaje: 'Error interno del servidor' 
        });
    }
};

// Controlador mejorado y más restrictivo para marcar como pagado
export const updateEstadoVentaRepartidor = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        
        const [repartidores] = await connection.execute(`
            SELECT r.id_repartidor 
            FROM repartidor r
            JOIN usuario u ON r.id_persona = u.id_persona
            WHERE u.id_usuario = ?
            LIMIT 1
        `, [req.user.id_usuario]);

        if (repartidores.length === 0) {
            return res.status(404).json({ error: 'Repartidor no encontrado para este usuario' });
        }

        const repartidorId = repartidores[0].id_repartidor;
        const { id } = req.params;

        console.log(`🔄 Repartidor ${repartidorId} marcando venta ${id} como pagada`);

        // Verificación estricta antes de permitir el pago
        const [ventas] = await connection.execute(`
            SELECT id_venta, fecha_inicio_ruta, id_estado_venta
            FROM venta 
            WHERE id_venta = ? AND id_repartidor = ? AND id_estado_venta = 5
            AND fecha_inicio_ruta IS NOT NULL
            AND TIMESTAMPDIFF(MINUTE, fecha_inicio_ruta, NOW()) >= 1
            LIMIT 1
        `, [id, repartidorId]);

        if (ventas.length === 0) {
            return res.status(400).json({ 
                error: 'No puede marcar como pagado. Verifique que: 1) La ruta esté iniciada, 2) La entrega esté en estado "En ruta", 3) Hayan pasado al menos 1 minuto desde el inicio de la ruta.' 
            });
        }

        // ✅ CORREGIR: Agregar validación de fecha_inicio_ruta
        const venta = ventas[0];
        if (!venta.fecha_inicio_ruta) {
            return res.status(400).json({ 
                error: 'No puede marcar como pagado. La ruta no ha sido iniciada.' 
            });
        }

        // Actualizar estado a pagado
        const [result] = await connection.execute(`
            UPDATE venta 
            SET id_estado_venta = 7, 
                fecha_fin_ruta = NOW(),
                tracking_activo = 0
            WHERE id_venta = ? AND id_repartidor = ?
        `, [id, repartidorId]);

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'No se pudo marcar como pagado' });
        }

        console.log(`✅ Venta ${id} marcada como pagada por repartidor ${repartidorId}`);
        res.json({ 
            message: 'Entrega marcada como pagada correctamente',
            id_estado_venta: 7,
            estado: 'Pagado',
            fecha_fin_ruta: new Date()
        });

    } catch (error) {
        console.error('Error actualizando estado de venta:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};
// En repartidor-venta.controller.js - ACTUALIZAR cancelarEntregaRepartidor
// src/controllers/repartidor-venta.controller.js

export const cancelarEntregaRepartidor = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Obtener el id_repartidor del usuario actual
        const [repartidores] = await connection.execute(`
            SELECT r.id_repartidor 
            FROM repartidor r
            JOIN usuario u ON r.id_persona = u.id_persona
            WHERE u.id_usuario = ?
        `, [req.user.id_usuario]);

        if (repartidores.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Repartidor no encontrado para este usuario' });
        }

        const repartidorId = repartidores[0].id_repartidor;
        const { id } = req.params;
        const { motivo } = req.body;
        const id_usuario = req.user.id_usuario;

        console.log(`🔄 Repartidor ${repartidorId} cancelando venta ${id} con restauración de stock`);

        if (!motivo) {
            await connection.rollback();
            return res.status(400).json({ error: 'El motivo de cancelación es requerido' });
        }

        // Verificar que la venta está asignada a este repartidor y obtener información de ruta
        const [ventas] = await connection.execute(`
            SELECT id_venta, id_estado_venta, fecha_inicio_ruta, fecha_fin_ruta
            FROM venta 
            WHERE id_venta = ? AND id_repartidor = ?
        `, [id, repartidorId]);

        if (ventas.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                error: 'Venta no encontrada o no asignada a este repartidor' 
            });
        }

        const venta = ventas[0];

        // ✅ NUEVO: Determinar si la ruta fue iniciada
        const rutaIniciada = !!venta.fecha_inicio_ruta;
        
        // ✅ NUEVO: Si la ruta fue iniciada pero no finalizada, registrar fecha_fin_ruta como NOW()
        // Esto permitirá calcular el tiempo transcurrido hasta la cancelación
        let fechaFinRuta = null;
        if (rutaIniciada && !venta.fecha_fin_ruta) {
            fechaFinRuta = new Date();
            console.log(`📅 Registrando fecha de fin de ruta para cancelación: ${fechaFinRuta}`);
            
            // Actualizar la venta con fecha_fin_ruta
            await connection.execute(`
                UPDATE venta 
                SET fecha_fin_ruta = NOW(),
                    tracking_activo = 0
                WHERE id_venta = ?
            `, [id]);
        }

        // Importar la función utilitaria
        const { cancelarVentaConStock } = await import('../utils/venta-cancelacion.utils.js');
        
        // Ejecutar cancelación con restauración de stock
        const resultado = await cancelarVentaConStock(
            id, 
            id_usuario, 
            `CANCELACIÓN REPARTIDOR: ${motivo}`, 
            connection
        );

        await connection.commit();

        console.log(`✅ Venta ${id} cancelada por repartidor ${repartidorId}`);
        console.log(`   - Ruta iniciada: ${rutaIniciada ? 'SÍ' : 'NO'}`);
        console.log(`   - Fecha fin ruta registrada: ${fechaFinRuta || 'No aplica'}`);
        
        res.json({ 
            success: true,
            message: 'Venta cancelada y stock restaurado correctamente',
            id_venta: parseInt(id),
            lotes_restaurados: resultado.lotes_restaurados,
            ruta_iniciada: rutaIniciada,
            fecha_fin_ruta: fechaFinRuta
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error cancelando venta:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    } finally {
        connection.release();
    }
};

// src/controllers/repartidor-venta.controller.js - AGREGAR ESTE MÉTODO

export const cambiarMetodoPago = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        
        const [repartidores] = await connection.execute(`
            SELECT r.id_repartidor 
            FROM repartidor r
            JOIN usuario u ON r.id_persona = u.id_persona
            WHERE u.id_usuario = ?
            LIMIT 1
        `, [req.user.id_usuario]);

        if (repartidores.length === 0) {
            return res.status(404).json({ error: 'Repartidor no encontrado para este usuario' });
        }

        const repartidorId = repartidores[0].id_repartidor;
        const { id } = req.params;
        const { id_metodo_pago } = req.body;

        console.log(`🔄 Repartidor ${repartidorId} cambiando método de pago para venta ${id} a ${id_metodo_pago}`);

        // Validar que el método de pago sea válido
        const [metodosPago] = await connection.execute(
            'SELECT id_metodo_pago FROM metodo_pago WHERE id_metodo_pago = ?',
            [id_metodo_pago]
        );

        if (metodosPago.length === 0) {
            return res.status(400).json({ error: 'Método de pago no válido' });
        }

        // Verificar que la venta está asignada a este repartidor y en estado "En ruta"
        const [ventas] = await connection.execute(`
            SELECT id_venta, id_estado_venta, fecha_inicio_ruta, id_metodo_pago
            FROM venta 
            WHERE id_venta = ? AND id_repartidor = ? AND id_estado_venta = 5
        `, [id, repartidorId]);

        if (ventas.length === 0) {
            return res.status(404).json({ 
                error: 'Venta no encontrada, no asignada a este repartidor o no está en estado "En ruta"' 
            });
        }

        const venta = ventas[0];

        // Verificar que la ruta haya sido iniciada
        if (!venta.fecha_inicio_ruta) {
            return res.status(400).json({ 
                error: 'No se puede cambiar el método de pago. La ruta no ha sido iniciada.' 
            });
        }

        // Actualizar método de pago
        const [result] = await connection.execute(`
            UPDATE venta 
            SET id_metodo_pago = ?, fecha_actualizacion = NOW()
            WHERE id_venta = ? AND id_repartidor = ?
        `, [id_metodo_pago, id, repartidorId]);

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'No se pudo cambiar el método de pago' });
        }

        // Obtener nombre del método de pago actualizado
        const [metodoInfo] = await connection.execute(
            'SELECT metodo_pago FROM metodo_pago WHERE id_metodo_pago = ?',
            [id_metodo_pago]
        );

        const nombreMetodo = metodoInfo[0]?.metodo_pago || 'Desconocido';

        console.log(`✅ Método de pago cambiado a: ${nombreMetodo}`);

        res.json({ 
            success: true,
            message: 'Método de pago actualizado correctamente',
            id_metodo_pago: id_metodo_pago,
            metodo_pago: nombreMetodo,
            venta_actualizada: {
                id_venta: parseInt(id),
                id_metodo_pago: id_metodo_pago,
                metodo_pago: nombreMetodo
            }
        });

    } catch (error) {
        console.error('Error cambiando método de pago:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};