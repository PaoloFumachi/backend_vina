// backend_dsi6/sunat/sunat.service.js - VERSIÓN CORREGIDA
import axios from 'axios';
import db from '../config/db.js';

class SunatService {
   // backend_dsi6/sunat/sunat.service.js - MODIFICAR CONSTRUCTOR
constructor() {
    // Usar variable de entorno o fallback local
    this.phpServiceUrl = process.env.SUNAT_PHP_URL 
        ? `${process.env.SUNAT_PHP_URL}/src/endpoints/emitir_fake.php`
        : 'http://localhost:8000/src/endpoints/emitir_fake.php';
    
    console.log('📡 PHP Service URL:', this.phpServiceUrl);
}

    async emitirComprobante(idVenta) {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            console.log(`📄 Preparando comprobante para venta ${idVenta}`);

            // 1. Obtener venta completa
            const venta = await this.obtenerVentaCompleta(connection, idVenta);
            // ✅ NUEVO: Verificar el tipo de comprobante solicitado
        const tipoSolicitado = venta.tipo_comprobante_solicitado;
        
        if (tipoSolicitado === 'SIN_COMPROBANTE') {
            throw new Error('Esta venta fue registrada sin comprobante electrónico');
        }
        
        if (!tipoSolicitado || (tipoSolicitado !== 'FACTURA' && tipoSolicitado !== 'BOLETA')) {
            // Usar lógica automática basada en tipo de cliente
            const tipoAuto = venta.tipo_documento === 'RUC' ? 'FACTURA' : 'BOLETA';
            venta.tipo_comprobante_solicitado = tipoAuto;
        }
        
            if (!venta) {
                throw new Error(`Venta ${idVenta} no encontrada`);
            }

            // 2. Verificar que esté pagada
            if (venta.id_estado_venta !== 7) { // 7 = Pagado
                throw new Error('La venta debe estar en estado "Pagado"');
            }

            // 3. Verificar que no tenga comprobante previo
            const tieneComprobante = await this.verificarComprobanteExistente(connection, idVenta);
            if (tieneComprobante) {
                throw new Error('Esta venta ya tiene un comprobante emitido');
            }

            // 4. Preparar datos para PHP
            const datosParaPHP = await this.prepararDatosParaPHP(
            venta, 
            venta.tipo_comprobante_solicitado  // ← Pasar el tipo correcto
        );

            // 5. Enviar al microservicio PHP
            console.log('📡 Enviando datos al microservicio PHP...');
            const resultadoPHP = await this.enviarAPHP(datosParaPHP);

            if (!resultadoPHP.success) {
                throw new Error(`Error PHP: ${resultadoPHP.message}`);
            }

            // 6. Guardar en BD de Node.js (CON CAMPOS CORRECTOS)
            const comprobanteGuardado = await this.guardarComprobanteBD(
                connection,
                idVenta,
                venta, // Pasar venta para obtener cliente y total
                resultadoPHP
            );

            // 7. Actualizar estado de la venta
            await connection.execute(
                'UPDATE venta SET comprobante_emitido = 1 WHERE id_venta = ?',
                [idVenta]
            );

            await connection.commit();
            console.log(`✅ Comprobante emitido exitosamente: ${comprobanteGuardado.serie}-${comprobanteGuardado.numero_secuencial}`);

            return {
                success: true,
                comprobante: comprobanteGuardado,
                sunat: resultadoPHP.sunat
            };

        } catch (error) {
            await connection.rollback();
            console.error('❌ Error en emitirComprobante:', error);
            
            // Registrar error
            await this.registrarError(idVenta, error.message);
            throw error;
        } finally {
            connection.release();
        }
    }

    async obtenerVentaCompleta(connection, idVenta) {
        const [ventas] = await connection.execute(`
            SELECT v.*, c.tipo_cliente, p.numero_documento, p.tipo_documento, 
                   c.razon_social, p.nombre_completo, p.direccion, p.telefono
            FROM venta v
            LEFT JOIN cliente c ON v.id_cliente = c.id_cliente
            LEFT JOIN persona p ON c.id_persona = p.id_persona
            WHERE v.id_venta = ?
        `, [idVenta]);

        if (ventas.length === 0) return null;
        const venta = ventas[0];

        // Detalles
        const [detalles] = await connection.execute(`
            SELECT vd.*, p.nombre as producto_nombre, 
                   cat.nombre as categoria, m.nombre as marca
            FROM venta_detalle vd
            JOIN producto p ON vd.id_producto = p.id_producto
            LEFT JOIN categorias cat ON p.id_categoria = cat.id_categoria
            LEFT JOIN marcas m ON p.id_marca = m.id_marca
            WHERE vd.id_venta = ?
        `, [idVenta]);

        venta.detalles = detalles;
        return venta;
    }

    async verificarComprobanteExistente(connection, idVenta) {
        const [comprobantes] = await connection.execute(
            'SELECT id_comprobante FROM comprobante_sunat WHERE id_venta = ?',
            [idVenta]
        );
        return comprobantes.length > 0;
    }

    async prepararDatosParaPHP(venta, tipoComprobante = null, serie = null, correlativo = null) {
    const datos = {
        id_venta: venta.id_venta,
        fecha: venta.fecha,
        total: parseFloat(venta.total),
        // ✅ AGREGAR DATOS DE COMPROBANTE SI SE PROPORCIONAN
        ...(tipoComprobante && { tipo: tipoComprobante }),
        ...(serie && { serie: serie }),
        ...(correlativo && { correlativo: correlativo }),
        cliente: {
            id_cliente: venta.id_cliente,
            tipo_cliente: venta.tipo_cliente,
            tipo_documento: venta.tipo_documento,
            numero_documento: venta.numero_documento,
            nombre: venta.razon_social || venta.nombre_completo,
            direccion: venta.direccion || 'DIRECCIÓN NO ESPECIFICADA',
            telefono: venta.telefono || ''
        },
        detalles: []
    };
        for (const detalle of venta.detalles) {
            datos.detalles.push({
                id_producto: detalle.id_producto,
                codigo: `P${detalle.id_producto.toString().padStart(4, '0')}`,
                descripcion: `${detalle.categoria} ${detalle.marca} - ${detalle.producto_nombre}`,
                cantidad: detalle.cantidad,
                precio_unitario: parseFloat(detalle.precio_unitario),
                subtotal: parseFloat(detalle.subtotal),
                unidad: 'NIU'
            });
        }

        return datos;
    }

    async enviarAPHP(datos) {
        try {
            const response = await axios.post(
                this.phpServiceUrl,
                datos,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                }
            );
            return response.data;
        } catch (error) {
            console.error('❌ Error comunicándose con PHP:', error.message);
            throw error;
        }
    }

  // backend_dsi6/sunat/sunat.service.js
async guardarComprobanteBD(connection, idVenta, venta, resultadoPHP) {
    const { comprobante, sunat, archivos } = resultadoPHP;
    const xmlContent = archivos?.xml_content 
        ? Buffer.from(archivos.xml_content, 'base64').toString('utf-8')
        : null;

    // ✅ OBTENER NÚMERO ÚNICO
    const siguienteNumero = await this.obtenerSiguienteNumero(
        connection,
        comprobante.tipo,
        comprobante.serie
    );

    console.log(`📊 Número calculado: ${siguienteNumero}, PHP envió: ${comprobante.correlativo}`);

    // ✅ SINCRONIZAR LA RESPUESTA DEL PHP CON NUESTRO NÚMERO
    resultadoPHP.comprobante.correlativo = siguienteNumero.toString().padStart(8, '0');
    resultadoPHP.comprobante.nombre = `${comprobante.serie}-${resultadoPHP.comprobante.correlativo}`;

    // ✅ DETERMINAR RUC Y DNI SEGÚN TIPO DE DOCUMENTO
    let rucCliente = null;
    let dniCliente = null;
    
    if (venta.tipo_documento === 'RUC') {
        rucCliente = venta.numero_documento;
    } else if (venta.tipo_documento === 'DNI') {
        dniCliente = venta.numero_documento;
    }

    const [result] = await connection.execute(`
        INSERT INTO comprobante_sunat 
        (id_venta, tipo, serie, numero_secuencial, estado,
         xml_generado, respuesta_sunat, total,
         cliente_nombre, fecha_envio, intentos_envio,
         ruc_cliente, dni_cliente)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, ?, ?)
    `, [
        idVenta,
        comprobante.tipo,
        comprobante.serie,
        siguienteNumero,
        sunat.estado === 'ACEPTADO' ? 'ACEPTADO' : 'RECHAZADO',
        xmlContent,
        JSON.stringify(sunat),
        venta.total,
        venta.razon_social || venta.nombre_completo || 'Cliente',
        rucCliente,
        dniCliente
    ]);

    return {
        id: result.insertId,
        tipo: comprobante.tipo,
        serie: comprobante.serie,
        numero_secuencial: siguienteNumero,
        correlativo: resultadoPHP.comprobante.correlativo,
        estado: sunat.estado,
        ruc_cliente: rucCliente,
        dni_cliente: dniCliente
    };
}
    async registrarError(idVenta, mensajeError) {
        try {
            await db.execute(
                `INSERT INTO errores_sunat (id_venta, mensaje_error, fecha_error)
                 VALUES (?, ?, NOW())`,
                [idVenta, mensajeError.substring(0, 500)]
            );
        } catch (error) {
            console.error('No se pudo registrar el error:', error);
        }
    }
    // ✅ NUEVO MÉTODO: Obtener siguiente número disponible
async obtenerSiguienteNumero(connection, tipo, serie) {
    try {
        // Intentar obtener el siguiente número usando el procedimiento almacenado si existe
        const [result] = await connection.execute(
            'SELECT COALESCE(MAX(numero_secuencial), 0) + 1 as siguiente_numero FROM comprobante_sunat WHERE tipo = ? AND serie = ?',
            [tipo, serie]
        );
        
        return result[0]?.siguiente_numero || 1;
    } catch (error) {
        console.log('⚠️ Usando número por defecto (1) debido a error:', error.message);
        return 1;
    }
}
}

export default new SunatService();