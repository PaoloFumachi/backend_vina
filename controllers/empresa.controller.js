// src/controllers/empresa.controller.js
import db from '../config/db.js';

// Obtener configuración activa
export const getEmpresaConfig = async (req, res) => {
    try {
        const [config] = await db.execute(
            'SELECT * FROM empresa_config WHERE activo = 1 LIMIT 1'
        );
        
        if (config.length === 0) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }
        
        res.json(config[0]);
    } catch (error) {
        console.error('❌ Error en getEmpresaConfig:', error);
        res.status(500).json({ error: error.message });
    }
};

// Actualizar configuración (texto)
export const updateEmpresaConfig = async (req, res) => {
    try {
        const { 
            nombre, ruc, eslogan, direccion, telefono, 
            logo_texto, web, email, nombre_sistema,
            logo_login, logo_navbar
        } = req.body;

        // Validaciones básicas
        if (!nombre || !ruc || !direccion) {
            return res.status(400).json({ 
                error: 'Nombre, RUC y dirección son obligatorios' 
            });
        }

        const [result] = await db.execute(`
            UPDATE empresa_config 
            SET nombre = ?, ruc = ?, eslogan = ?, direccion = ?, 
                telefono = ?, logo_texto = ?, web = ?, email = ?,
                nombre_sistema = ?, logo_login = ?, logo_navbar = ?
            WHERE activo = 1
        `, [nombre, ruc, eslogan, direccion, telefono, logo_texto, web, email, 
            nombre_sistema, logo_login, logo_navbar]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        // Obtener configuración actualizada
        const [config] = await db.execute(
            'SELECT * FROM empresa_config WHERE activo = 1 LIMIT 1'
        );

        res.json({
            success: true,
            message: 'Configuración actualizada correctamente',
            config: config[0]
        });
    } catch (error) {
        console.error('❌ Error en updateEmpresaConfig:', error);
        res.status(500).json({ error: error.message });
    }
};

// En uploadLogo - DESPUÉS de guardar
export const uploadLogo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }

        console.log('✅ ARCHIVO GUARDADO:');
        console.log('   - filename:', req.file.filename);
        console.log('   - path:', req.file.path);
        console.log('   - size:', req.file.size);
        console.log('   - exists?', fs.existsSync(req.file.path));
        
        // Verificar que se puede leer
        if (fs.existsSync(req.file.path)) {
            const stats = fs.statSync(req.file.path);
            console.log('   - stats:', stats);
        }

        const { tipo } = req.body;
        const filename = req.file.filename;
        
        // Ruta relativa para guardar en BD
        const rutaRelativa = `uploads/logos/${filename}`;

        // Actualizar la configuración con la nueva ruta
        const campo = tipo === 'login' ? 'logo_login' : 'logo_navbar';
        
        await db.execute(
            `UPDATE empresa_config SET ${campo} = ? WHERE activo = 1`,
            [rutaRelativa]
        );

        res.json({
            success: true,
            message: 'Logo subido correctamente',
            ruta: rutaRelativa
        });
    } catch (error) {
        console.error('❌ Error al subir logo:', error);
        res.status(500).json({ error: error.message });
    }
};