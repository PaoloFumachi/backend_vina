// src/app.js
import fs from 'fs';
import path from 'path'; // ✅ IMPORTANTE: Asegurar que path está importado
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import db from "./config/db.js";
import indexRoutes from "./routes/index.js";
import paths from './config/paths.js';

dotenv.config();

// Configurar zona horaria
process.env.TZ = 'America/Lima';
console.log('⏰ Zona horaria del backend:', process.env.TZ);

const app = express();

// CORS mejorado para producción
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// ✅ CORREGIDO: Servir archivos estáticos del frontend (build)
// ============================================
if (fs.existsSync(paths.frontend.assets)) {
  console.log('📁 Sirviendo frontend desde:', paths.frontend.assets);
  app.use(paths.urls.assets, express.static(paths.frontend.assets));
} else {
  console.warn('⚠️ No se encontró la carpeta de assets del frontend:', paths.frontend.assets);
}

// ============================================
// ✅ CORREGIDO: Servir archivos subidos (logos) - VERSIÓN MEJORADA
// ============================================
console.log('🔍 CONFIGURACIÓN DE UPLOADS:');
console.log('   - URL pública:', paths.urls.uploads);
console.log('   - Ruta física:', paths.uploads.logos);
console.log('   - Existe la carpeta?', fs.existsSync(paths.uploads.logos));

// ✅ SOLUCIÓN 1: Usar múltiples formas de servir los archivos
// Forma 1: Usando la ruta relativa a uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Forma 2: Usando la ruta absoluta de paths
if (fs.existsSync(paths.uploads.logos)) {
  app.use('/uploads/logos', express.static(paths.uploads.logos));
  console.log('✅ Ruta estática configurada: /uploads/logos ->', paths.uploads.logos);
  
  // Listar archivos para verificar
  const files = fs.readdirSync(paths.uploads.logos);
  console.log('   - Archivos encontrados:', files);
} else {
  console.error('❌ CRÍTICO: La carpeta de uploads NO EXISTE:', paths.uploads.logos);
  
  // Intentar crearla
  try {
    fs.mkdirSync(paths.uploads.logos, { recursive: true });
    console.log('✅ Carpeta de uploads creada exitosamente');
  } catch (mkdirError) {
    console.error('❌ No se pudo crear la carpeta de uploads:', mkdirError);
  }
}

// ============================================
// ENDPOINTS DE DEBUG MEJORADOS
// ============================================

// Endpoint para verificar archivos específicos
app.get('/check-file/:filename', (req, res) => {
  const filename = req.params.filename;
  const possiblePaths = [
    path.join(process.cwd(), 'uploads', 'logos', filename),
    path.join(paths.uploads.logos, filename),
    path.join('/app', 'uploads', 'logos', filename) // Ruta típica en Railway
  ];
  
  const results = possiblePaths.map(filePath => ({
    path: filePath,
    exists: fs.existsSync(filePath),
    isFile: fs.existsSync(filePath) ? fs.statSync(filePath).isFile() : false,
    size: fs.existsSync(filePath) ? fs.statSync(filePath).size : null
  }));
  
  res.json({
    filename,
    cwd: process.cwd(),
    uploadsPath: paths.uploads.logos,
    exists: fs.existsSync(paths.uploads.logos),
    files: fs.existsSync(paths.uploads.logos) ? fs.readdirSync(paths.uploads.logos) : [],
    possiblePaths: results
  });
});

// Endpoint de debug mejorado
app.get('/debug-uploads', (req, res) => {
  try {
    const uploadsPath = paths.uploads.logos;
    const exists = fs.existsSync(uploadsPath);
    
    let files = [];
    let fileDetails = [];
    
    if (exists) {
      files = fs.readdirSync(uploadsPath);
      fileDetails = files.map(file => {
        const filePath = path.join(uploadsPath, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          url: `/uploads/logos/${file}`,
          fullUrl: `https://backendvina-production.up.railway.app/uploads/logos/${file}`
        };
      });
    }
    
    // Información del sistema
    res.json({
      success: true,
      environment: process.env.NODE_ENV,
      cwd: process.cwd(),
      uploadsPath,
      exists,
      files: fileDetails,
      projectRoot: paths.projectRoot,
      staticRoutes: app._router.stack
        .filter(layer => layer.name === 'serveStatic' || layer.regexp.toString().includes('uploads'))
        .map(layer => ({
          path: layer.regexp ? layer.regexp.toString() : 'unknown',
          dir: layer.handle?.root || 'unknown'
        }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Rutas
app.use("/api", indexRoutes);

// Ruta de prueba
app.get("/", (req, res) => res.json({ 
  message: "Backend DSI6 funcionando",
  environment: process.env.NODE_ENV,
  timestamp: new Date().toISOString()
}));

// Health check para Railway
app.get("/health", (req, res) => res.status(200).json({ status: "OK" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV}`);
  console.log(`📂 Directorio actual: ${process.cwd()}`);
  
  try {
    const [rows] = await db.query("SELECT 1+1 AS result");
    console.log("✅ Conexión a DB OK");
  } catch (err) {
    console.error("❌ Error conectando a la DB:", err.message);
  }
});

export default app;