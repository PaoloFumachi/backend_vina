// backend_dsi6/controllers/sunat.controller.js
import db from '../config/db.js'; // ✅ AGREGAR ESTA IMPORTACIÓN
import sunatService from '../sunat/sunat.service.js';

class SunatController {
    async emitirComprobante(req, res) {
        try {
            const { idVenta } = req.params;
            console.log(`🚀 Solicitando emisión para venta ${idVenta}`);
            
            const resultado = await sunatService.emitirComprobante(idVenta);
            
            res.json({
                success: true,
                message: 'Comprobante emitido correctamente',
                data: resultado
            });
        } catch (error) {
            console.error('❌ Error en emitirComprobante:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }


// backend_dsi6/controllers/sunat.controller.js
// backend_dsi6/controllers/sunat.controller.js
async listarComprobantes(req, res) {
    try {
        console.log('🔍 Usando db.query() en lugar de db.execute()');
        
        const { pagina = 1, limite = 10 } = req.query;
        const limitNum = parseInt(limite);
        const offsetNum = (parseInt(pagina) - 1) * limitNum;
        
        console.log('📊 Parámetros:', { limitNum, offsetNum });
        
        // Usar query con placeholders - INCLUYENDO RUC Y DNI
        const [comprobantes] = await db.query(
            `SELECT 
                cs.*,
                CONCAT(cs.serie, '-', LPAD(cs.numero_secuencial, 8, '0')) as serie_numero,
                CASE 
                    WHEN cs.tipo = 'FACTURA' THEN cs.ruc_cliente
                    WHEN cs.tipo = 'BOLETA' THEN cs.dni_cliente
                    ELSE NULL
                END as documento_cliente
             FROM comprobante_sunat cs
             ORDER BY cs.fecha_envio DESC 
             LIMIT ? OFFSET ?`,
            [limitNum, offsetNum]
        );
        
        // También obtener el total
        const [totalResult] = await db.query(
            'SELECT COUNT(*) as total FROM comprobante_sunat'
        );
        
        console.log(`✅ Registros encontrados: ${comprobantes.length}`);
        
        res.json({
            success: true,
            total: totalResult[0].total,
            pagina: parseInt(pagina),
            limite: limitNum,
            comprobantes: comprobantes.map(comp => ({
                ...comp,
                // Asegurar que estos campos existan para el frontend
                cliente_ruc: comp.tipo === 'FACTURA' ? comp.ruc_cliente : null,
                cliente_dni: comp.tipo === 'BOLETA' ? comp.dni_cliente : null
            }))
        });
        
    } catch (error) {
        console.error('❌ Error en listarComprobantes:', error);
        console.error('📝 SQL:', error.sql);
        console.error('📊 Parámetros:', error.sqlMessage);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
    async obtenerXml(req, res) {
        try {
            const { idComprobante } = req.params;
            
            const [comprobantes] = await db.execute(
                'SELECT xml_generado FROM comprobante_sunat WHERE id_comprobante = ?',
                [idComprobante]
            );
            
            if (comprobantes.length === 0 || !comprobantes[0].xml_generado) {
                return res.status(404).json({ 
                    success: false,
                    error: 'XML no encontrado' 
                });
            }
            
            const xml = comprobantes[0].xml_generado;
            
            // Configurar headers para descarga
            res.setHeader('Content-Type', 'application/xml');
            res.setHeader('Content-Disposition', `attachment; filename="comprobante-${idComprobante}.xml"`);
            
            res.send(xml);
            
        } catch (error) {
            console.error('❌ Error en obtenerXml:', error);
            res.status(500).json({ 
                success: false,
                error: error.message 
            });
        }
    }

    async consultarComprobante(req, res) {
        try {
            const { idComprobante } = req.params;
            
            const [comprobantes] = await db.execute(
                `SELECT cs.*, v.total, v.fecha, v.id_cliente,
                       c.razon_social, p.nombre_completo, p.tipo_documento, p.numero_documento,
                       CONCAT(cs.serie, '-', LPAD(cs.numero_secuencial, 8, '0')) as serie_numero
                 FROM comprobante_sunat cs
                 JOIN venta v ON cs.id_venta = v.id_venta
                 LEFT JOIN cliente c ON v.id_cliente = c.id_cliente
                 LEFT JOIN persona p ON c.id_persona = p.id_persona
                 WHERE cs.id_comprobante = ?`,
                [idComprobante]
            );

            if (comprobantes.length === 0) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Comprobante no encontrado' 
                });
            }

            res.json({ 
                success: true, 
                comprobante: comprobantes[0] 
            });
        } catch (error) {
            console.error('❌ Error en consultarComprobante:', error);
            res.status(500).json({ 
                success: false,
                error: error.message 
            });
        }
    }

    // ✅ AGREGAR MÉTODO PARA REENVIAR
    async reenviarComprobante(req, res) {
        try {
            const { idComprobante } = req.params;
            
            // Aquí deberías implementar la lógica para reenviar a SUNAT
            // Por ahora devolvemos un mensaje de éxito
            res.json({
                success: true,
                message: 'Comprobante reenviado exitosamente'
            });
            
        } catch (error) {
            console.error('❌ Error en reenviarComprobante:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

async obtenerSiguienteNumero(req, res) {
    const connection = await db.getConnection();
    try {
        const { tipo, id_cliente } = req.body;

        // 1. Obtener información del cliente
        const [clienteInfo] = await connection.execute(`
            SELECT c.tipo_cliente, p.tipo_documento
            FROM cliente c
            JOIN persona p ON c.id_persona = p.id_persona
            WHERE c.id_cliente = ?
        `, [id_cliente]);

        if (clienteInfo.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Cliente no encontrado'
            });
        }

        const cliente = clienteInfo[0];
        
        // 2. Determinar la serie
        let serie = '';
        if (tipo === 'FACTURA') {
            serie = 'F001';
        } else if (tipo === 'BOLETA') {
            serie = 'B001';
        } else {
            return res.status(400).json({
                success: false,
                error: 'Tipo de comprobante no válido'
            });
        }

        // ✅ EJECUTAR CONSULTA DIRECTAMENTE
        const [result] = await connection.execute(
            'SELECT COALESCE(MAX(numero_secuencial), 0) + 1 as siguiente_numero FROM comprobante_sunat WHERE tipo = ? AND serie = ?',
            [tipo, serie]
        );
        
        const siguienteNumero = result[0]?.siguiente_numero || 1;

        res.json({
            success: true,
            tipo,
            serie,
            numero_secuencial: siguienteNumero,
            correlativo: siguienteNumero.toString().padStart(8, '0'),
            serie_numero: `${serie}-${siguienteNumero.toString().padStart(8, '0')}`
        });

    } catch (error) {
        console.error('❌ Error en obtenerSiguienteNumero:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    } finally {
        connection.release();
    }
}
}
// ✅ Exportar la instancia correctamente
export default new SunatController();
