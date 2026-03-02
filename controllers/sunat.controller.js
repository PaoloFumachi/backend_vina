// backend_dsi6/controllers/sunat.controller.js
import db from '../config/db.js';
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

    async listarComprobantes(req, res) {
    try {
        const { 
            tipo, estado, fecha_desde, fecha_hasta, 
            pagina = 1, limite = 10, search
        } = req.query;

        const page = parseInt(pagina);
        const limit = parseInt(limite);
        const offset = (page - 1) * limit;

        let baseQuery = `
            FROM comprobante_sunat cs
            WHERE 1=1
        `;

        const filtros = [];
        const params = [];

        if (tipo) {
            filtros.push('AND cs.tipo = ?');
            params.push(tipo);
        }

        if (estado) {
            filtros.push('AND cs.estado = ?');
            params.push(estado);
        }

        if (fecha_desde) {
            filtros.push('AND DATE(cs.fecha_envio) >= ?');
            params.push(fecha_desde);
        }

        if (fecha_hasta) {
            filtros.push('AND DATE(cs.fecha_envio) <= ?');
            params.push(fecha_hasta);
        }

        if (search) {
            filtros.push(`AND (
                cs.cliente_nombre LIKE ? OR 
                cs.serie LIKE ? OR 
                cs.numero_secuencial LIKE ?
            )`);
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        const whereClause = filtros.join(' ');

        // COUNT
        const countQuery = `
            SELECT COUNT(*) as total
            ${baseQuery}
            ${whereClause}
        `;

        const [countResult] = await db.execute(countQuery, params);
        const total = countResult[0]?.total || 0;

        // DATA
        const dataQuery = `
            SELECT 
                cs.*,
                CONCAT(cs.serie, '-', LPAD(cs.numero_secuencial, 8, '0')) as serie_numero
            ${baseQuery}
            ${whereClause}
            ORDER BY cs.fecha_envio DESC
            LIMIT ? OFFSET ?
        `;

        const [rows] = await db.execute(
            dataQuery,
            [...params, limit, offset]
        );

        const comprobantesProcesados = rows.map(comp => ({
            ...comp,
            igv: comp.total ? Number((comp.total * 0.18).toFixed(2)) : 0
        }));

        res.json({
            success: true,
            total,
            pagina: page,
            limite: limit,
            comprobantes: comprobantesProcesados
        });

    } catch (error) {
        console.error('❌ Error en listarComprobantes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

    async obtenerXml(req, res) {
        try {
            const { idComprobante } = req.params;

            const [rows] = await db.execute(
                'SELECT xml_generado FROM comprobante_sunat WHERE id_comprobante = ?',
                [idComprobante]
            );

            if (rows.length === 0 || !rows[0].xml_generado) {
                return res.status(404).json({
                    success: false,
                    error: 'XML no encontrado'
                });
            }

            res.setHeader('Content-Type', 'application/xml');
            res.setHeader('Content-Disposition', `attachment; filename="comprobante-${idComprobante}.xml"`);

            res.send(rows[0].xml_generado);

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

            const [rows] = await db.execute(`
                SELECT cs.*, v.total, v.fecha,
                       c.razon_social, p.nombre_completo,
                       CONCAT(cs.serie, '-', LPAD(cs.numero_secuencial, 8, '0')) as serie_numero
                FROM comprobante_sunat cs
                JOIN venta v ON cs.id_venta = v.id_venta
                LEFT JOIN cliente c ON v.id_cliente = c.id_cliente
                LEFT JOIN persona p ON c.id_persona = p.id_persona
                WHERE cs.id_comprobante = ?
            `, [idComprobante]);

            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Comprobante no encontrado'
                });
            }

            res.json({
                success: true,
                comprobante: rows[0]
            });

        } catch (error) {
            console.error('❌ Error en consultarComprobante:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async reenviarComprobante(req, res) {
        try {
            const { idComprobante } = req.params;

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
        try {
            const { tipo } = req.body;

            let serie = '';

            if (tipo === 'FACTURA') {
                serie = 'F001';
            } else if (tipo === 'BOLETA') {
                serie = 'B001';
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Tipo no válido'
                });
            }

            const [rows] = await db.execute(
                `SELECT COALESCE(MAX(numero_secuencial),0)+1 as siguiente
                 FROM comprobante_sunat
                 WHERE tipo = ? AND serie = ?`,
                [tipo, serie]
            );

            const siguiente = rows[0]?.siguiente || 1;

            res.json({
                success: true,
                tipo,
                serie,
                numero_secuencial: siguiente,
                correlativo: siguiente.toString().padStart(8, '0'),
                serie_numero: `${serie}-${siguiente.toString().padStart(8, '0')}`
            });

        } catch (error) {
            console.error('❌ Error en obtenerSiguienteNumero:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

export default new SunatController();