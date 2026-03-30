// src/routes/auth.routes.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const router = express.Router();

// Función auxiliar para obtener módulos por rol
const obtenerModulosPorRol = (idRol) => {
  const modulos = {
    // Administrador (id: 1)
    1: [
      'usuarios', 'personas', 'clientes', 'productos', 
      'ventas_nueva', 'ventas', 'ventas_asignacion_rutas',
      'rutas', 'inventario', 'reportes','repartidores',
      'inventario_movimiento', 'inventario_reportes','lotes', 'proveedores', 'pedido_proveedor', 'categorias', 'marcas','sunat','empresa','insumos',
      'recargas'
    ],
    // Vendedor (id: 2)
    2: [
      //
      'clientes','productos',  'ventas_nueva', 'ventas', 'ventas_asignacion_rutas','sunat','recargas'
    ],
    // Repartidor (id: 3)
    3: [
      'rutas_asignadas', 'entregas_pendientes', 'historial_entregas'
    ],
    // Almacenero (id: 4)
    4: [
      'inventario', 'productos', 'inventario_movimiento', 'inventario_reportes',
      'lotes', 'proveedores', 'pedido_proveedor', 'categorias', 'marcas'
    ]
  };
  
  return modulos[idRol] || [];
};

// ========================== LOGIN ==========================
router.post('/login', async (req, res) => {
  try {
    const { nombre_usuario, password } = req.body;

    const [users] = await db.execute(
      `SELECT u.*, r.rol, p.nombre_completo 
       FROM usuario u 
       JOIN rol r ON u.id_rol = r.id_rol 
       JOIN persona p ON u.id_persona = p.id_persona 
       WHERE u.nombre_usuario = ? AND u.activo = 1`,
      [nombre_usuario]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: 'Usuario o password incorrectos.' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: 'Usuario o password incorrectos.' });
    }

    // ✅ OBTENER MÓDULOS PARA EL LOGIN
    const modulos = obtenerModulosPorRol(user.id_rol);

    const token = jwt.sign(
      { 
        userId: user.id_usuario, 
        role: user.id_rol,
        username: user.nombre_usuario 
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '8h' }
    );

    // ✅ INCLUIR MÓDULOS EN LA RESPUESTA DEL LOGIN
    res.json({
      token,
      user: {
        id: user.id_usuario,
        username: user.nombre_usuario,
        nombre: user.nombre_completo,
        role: user.id_rol,
        roleName: user.rol,
        modulos: modulos // ← ESTO ES LO QUE FALTABA
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ========================== VERIFY TOKEN ==========================
router.get('/verify', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ valid: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const [users] = await db.execute(
      `SELECT u.*, r.rol, p.nombre_completo 
       FROM usuario u 
       JOIN rol r ON u.id_rol = r.id_rol 
       JOIN persona p ON u.id_persona = p.id_persona 
       WHERE u.id_usuario = ? AND u.activo = 1`,
      [decoded.userId]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ valid: false });
    }
    
    const user = users[0];
    
    // ✅ USAR LA MISMA FUNCIÓN PARA MANTENER CONSISTENCIA
    const modulos = obtenerModulosPorRol(user.id_rol);

    res.json({
      valid: true,
      user: {
        id: user.id_usuario,
        username: user.nombre_usuario,
        nombre: user.nombre_completo,
        role: user.id_rol,
        roleName: user.rol,
        modulos: modulos
      }
    });
  } catch (error) {
    res.status(401).json({ valid: false });
  }
});

// ========================== REGISTER ==========================
router.post('/register', async (req, res) => {
  try {
    const { nombre_usuario, email, password, id_rol, id_persona } = req.body;

    if (!nombre_usuario || !email || !password || !id_rol) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    // Verificar si ya existe usuario o email
    const [existing] = await db.execute(
      'SELECT * FROM usuario WHERE nombre_usuario = ? OR email = ?',
      [nombre_usuario, email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Usuario o correo ya registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Asegurar que exista id_persona (la columna es NOT NULL en la BD)
    let personaId = id_persona;
    if (!personaId) {
      const personaPayload = req.body.persona;
      if (personaPayload) {
        const tipoDocumento = personaPayload.tipo_documento || 'DNI';
        const numeroDocumento = (personaPayload.numero_documento && personaPayload.numero_documento.trim() !== '') ? personaPayload.numero_documento.trim() : null;
        const nombreCompleto = personaPayload.nombre_completo || nombre_usuario;
        const telefono = personaPayload.telefono || null;
        const direccion = personaPayload.direccion || null;

        const [pResult] = await db.execute(
          'INSERT INTO persona (tipo_documento, numero_documento, nombre_completo, telefono, direccion, activo) VALUES (?, ?, ?, ?, ?, 1)',
          [tipoDocumento, numeroDocumento, nombreCompleto, telefono, direccion]
        );
        personaId = pResult.insertId;
      } else {
        const nombreCompleto = nombre_usuario; // fallback si no se pasa persona
        const tipoDocumento = 'DNI';
        // Guardar NULL si no hay número de documento
        const numeroDocumento = null;
        const [pResult] = await db.execute(
          'INSERT INTO persona (tipo_documento, numero_documento, nombre_completo, activo) VALUES (?, ?, ?, 1)',
          [tipoDocumento, numeroDocumento, nombreCompleto]
        );
        personaId = pResult.insertId;
      }
    }

    const [result] = await db.execute(
      'INSERT INTO usuario (nombre_usuario, email, password, id_rol, id_persona, activo) VALUES (?, ?, ?, ?, ?, 1)',
      [nombre_usuario, email, hashedPassword, id_rol, personaId]
    );

    const id_usuario = result.insertId;

    // ✅ OBTENER MÓDULOS TAMBIÉN PARA REGISTER
    const modulos = obtenerModulosPorRol(id_rol);

    const token = jwt.sign(
      { userId: id_usuario, username: nombre_usuario, role: id_rol },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '8h' }
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: {
        id: id_usuario,
        username: nombre_usuario,
        email,
        role: id_rol,
        modulos: modulos // ← INCLUIR MÓDULOS TAMBIÉN AQUÍ
      }
    });
  } catch (error) {
    console.error('Error en register:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

export default router;