// backend_dsi6/config/paths.js
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

// En Railway, el directorio de trabajo es /app
// Pero el repositorio se clona en /app
const projectRoot = process.cwd(); // Usar el directorio de trabajo actual

console.log('🔍 paths.js - Configuración:');
console.log('   - isProduction:', isProduction);
console.log('   - projectRoot (cwd):', projectRoot);
console.log('   - __dirname:', __dirname);

const paths = {
    // Uploads - En Railway: /app/uploads
    uploads: {
        root: path.join(projectRoot, 'uploads'),
        logos: path.join(projectRoot, 'uploads', 'logos')
    },
    
    // Rutas del frontend
    frontend: {
        root: path.join(projectRoot, 'frontend_dsi6'),
        assets: path.join(projectRoot, 'frontend_dsi6', 'dist', 'frontend-vina')
    },
    
    // URLs públicas
    urls: {
        assets: '/assets',
        uploads: '/uploads'
    },
    
    isProduction,
    projectRoot
};

// Crear la carpeta de uploads si no existe
if (!fs.existsSync(paths.uploads.logos)) {
    console.log('📁 Creando carpeta de uploads:', paths.uploads.logos);
    fs.mkdirSync(paths.uploads.logos, { recursive: true });
}

// Logs para depuración
console.log('📁 Configuración final de rutas:');
console.log('   🏭 Modo:', isProduction ? 'PRODUCCIÓN' : 'DESARROLLO');
console.log('   📂 Uploads logos:', paths.uploads.logos);
console.log('   📂 Existe?', fs.existsSync(paths.uploads.logos) ? '✅ SÍ' : '❌ NO');

export default paths;