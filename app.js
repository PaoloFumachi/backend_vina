// src/app.js
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

// Servir archivos estáticos
console.log('📁 Sirviendo archivos estáticos desde:', paths.frontend.assets);
app.use(paths.urls.assets, express.static(paths.frontend.assets));

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