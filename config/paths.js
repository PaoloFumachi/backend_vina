// backend_dsi6/config/paths.js
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

// ✅ En Railway, la raíz del proyecto es /app
// ✅ El backend está en /app (porque se clonó backend_vina)
const projectRoot = path.join(__dirname, '..'); // Subimos un nivel desde /config hasta la raíz del backend

console.log('🔍 Debug - __dirname:', __dirname);
console.log('🔍 Debug - projectRoot:', projectRoot);

const paths = {
    // Uploads (persistentes) - EN RAILWAY SERÁ /app/uploads/logos
    uploads: {
        root: path.join(projectRoot, 'uploads'),
        logos: path.join(projectRoot, 'uploads', 'logos')
    },
    
    // Rutas del frontend (solo para referencia)
    frontend: {
        root: path.join(projectRoot, 'frontend_dsi6'),
        assets: isProduction 
            ? path.join(projectRoot, 'frontend_dsi6', 'dist', 'assets')
            : path.join(projectRoot, 'frontend_dsi6', 'src', 'assets'),
        empresa: isProduction
            ? path.join(projectRoot, 'frontend_dsi6', 'dist', 'assets', 'empresa')
            : path.join(projectRoot, 'frontend_dsi6', 'src', 'assets', 'empresa')
    },
    
    // URLs públicas
    urls: {
        assets: '/assets',
        empresa: '/assets/empresa',
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
console.log('📁 Configuración de rutas:');
console.log('   🏭 Modo:', isProduction ? 'PRODUCCIÓN' : 'DESARROLLO');
console.log('   📂 Uploads root:', paths.uploads.root);
console.log('   📂 Uploads logos:', paths.uploads.logos);
console.log('   📂 Directorio existe?', fs.existsSync(paths.uploads.logos) ? '✅ SÍ' : '❌ NO');

export default paths;