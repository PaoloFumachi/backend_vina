// src/app.js
import fs from 'fs';
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

// Servir archivos estáticos del frontend (build)
console.log('📁 Sirviendo archivos estáticos desde:', paths.frontend.assets);
app.use(paths.urls.assets, express.static(paths.frontend.assets));

// ✅ NUEVO: Servir archivos subidos (logos) desde uploads
console.log('📁 Sirviendo uploads desde:', paths.uploads.logos);
app.use(paths.urls.uploads, express.static(paths.uploads.logos));
console.log('🔍 CONFIGURACIÓN ESTÁTICA:');
console.log('   - URL:', paths.urls.uploads);
console.log('   - Sirviendo desde:', paths.uploads.logos);
console.log('   - Existe la carpeta?', fs.existsSync(paths.uploads.logos));
if (fs.existsSync(paths.uploads.logos)) {
    console.log('   - Archivos:', fs.readdirSync(paths.uploads.logos));
}

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
                    url: `${paths.urls.uploads}/${file}`
                };
            });
        }
        
        // Verificar que la ruta está siendo servida
        const staticConfig = app._router.stack
            .filter(layer => layer.name === 'serveStatic')
            .map(layer => ({
                path: layer.regexp,
                dir: layer.handle?.root
            }));
        
        res.json({
            uploadsPath,
            exists,
            files: fileDetails,
            staticConfig,
            environment: process.env.NODE_ENV,
            projectRoot: paths.projectRoot,
            cwd: process.cwd(),
            __dirname
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

// Endpoint para ver un archivo específico
app.get('/debug-file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(paths.uploads.logos, filename);
    
    res.json({
        filePath,
        exists: fs.existsSync(filePath),
        isFile: fs.existsSync(filePath) ? fs.statSync(filePath).isFile() : false,
        size: fs.existsSync(filePath) ? fs.statSync(filePath).size : null
    });
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
  try {
    const [rows] = await db.query("SELECT 1+1 AS result");
    console.log("✅ Conexión a DB OK");
  } catch (err) {
    console.error("❌ Error conectando a la DB:", err.message);
  }
});

export default app;