// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import db from '../config/db.js';

/**
 * verifyToken
 * - Verifica el JWT
 * - Carga el usuario desde la BD y normaliza `req.user` con campos útiles
 */
export const verifyToken = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. Token requerido.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');

        const [rows] = await db.execute(
            `SELECT u.id_usuario, u.nombre_usuario, u.email, u.id_rol, u.activo, r.rol AS roleName, p.nombre_completo
             FROM usuario u
             LEFT JOIN rol r ON u.id_rol = r.id_rol
             LEFT JOIN persona p ON u.id_persona = p.id_persona
             WHERE u.id_usuario = ? AND u.activo = 1`,
            [decoded.userId]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Token inválido o usuario inactivo.' });
        }

        const u = rows[0];
        // Normalizar req.user con campos simples y consistentes
        req.user = {
            id_usuario: u.id_usuario,
            nombre_usuario: u.nombre_usuario,
            email: u.email,
            id_rol: u.id_rol,
            roleName: u.roleName || null,
            nombre_completo: u.nombre_completo || null,
            activo: u.activo
        };

        next();
    } catch (error) {
        console.error('verifyToken error:', error?.message || error);
        res.status(401).json({ error: 'Token inválido.' });
    }
};

/**
 * requireRole(roles, modulo)
 * - `roles` puede ser array de ids (number) o nombres (string)
 * - `modulo` es el nombre del módulo al que se intenta acceder
 * - Ejemplos: requireRole([1], 'usuarios')  o requireRole(['Administrador', 'Vendedor'], 'ventas')
 */
export const requireRole = (roles, modulo) => {
    // Definición de módulos permitidos por rol
  const MODULOS_POR_ROL = {
        1: [ // Administrador
            'usuarios', 'personas', 'clientes', 'productos', 'ventas', 
            'rutas', 'inventario', 'reportes','ventas_asignacion_rutas', 'repartidores',
            'inventario_movimiento','inventario_reportes', 'lotes', 'proveedores', 'pedido_proveedor', 'categorias', 'marcas','sunat','empresa','insumos',
            'recargas'
        ],
        2: [ // Vendedor
            //  
            'clientes','productos','ventas','ventas_asignacion_rutas','sunat','recargas'
        ],
        3: [ // Repartidor
            'rutas_asignadas', 'entregas_pendientes', 'historial_entregas'
        ],
        4: [ // Almacenero
            'inventario', 'productos', 'inventario_movimiento', 'inventario_reportes',
            'lotes', 'proveedores', 'pedido_proveedor', 'categorias', 'marcas'
        ]
    };

    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'No autenticado.' });

        const userRoleId = Number(req.user.id_rol);
        const userRoleName = String(req.user.roleName || '').toLowerCase();

        // Verificar si el rol está permitido
        const allowed = roles.some(r => {
            if (typeof r === 'number') return Number(r) === userRoleId;
            if (!isNaN(Number(r))) return Number(r) === userRoleId;
            return String(r).toLowerCase() === userRoleName;
        });

        if (!allowed) {
            return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
        }

        // Si se especifica un módulo, verificar acceso
        if (modulo) {
            const modulosPermitidos = MODULOS_POR_ROL[userRoleId] || [];
            if (!modulosPermitidos.includes(modulo)) {
                return res.status(403).json({ 
                    error: `No tienes acceso al módulo ${modulo}.`,
                    modulo,
                    modulosPermitidos
                });
            }
        }

        next();
    };
};

// helper: middleware específico para admin (comodidad)
export const requireAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado.' });
    if (Number(req.user.id_rol) !== 1) return res.status(403).json({ error: 'Se requieren permisos de administrador.' });
    next();
};