// ============================================
// RUTAS DE EMPRESA - CON UPLOADS PERSISTENTES
// ============================================
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { 
    getEmpresaConfig, 
    updateEmpresaConfig,
    uploadLogo 
} from '../controllers/empresa.controller.js';
import { verifyToken, requireRole } from '../middleware/auth.js';
import paths from '../config/paths.js';

const router = express.Router();

// ============================================
// 🎯 CONFIGURACIÓN DE MULTER - USANDO UPLOADS
// ============================================
// En empresa.routes.js - MODIFICAR EL storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const targetPath = paths.uploads.logos;
        
        console.log('🔍 MULTER DEBUG:');
        console.log('   - targetPath:', targetPath);
        console.log('   - existe?', fs.existsSync(targetPath));
        console.log('   - permisos:', fs.existsSync(targetPath) ? '✅' : '❌');
        
        // Listar archivos existentes antes de guardar
        if (fs.existsSync(targetPath)) {
            const files = fs.readdirSync(targetPath);
            console.log('   - archivos antes:', files);
        }
        
        cb(null, targetPath);
    },
    
    filename: (req, file, cb) => {
        const tipo = req.body.tipo || 'logo';
        const ext = path.extname(file.originalname);
        const filename = `logo-${tipo}-${Date.now()}${ext}`;
        console.log('📄 Nombre de archivo generado:', filename);
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|svg/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        
        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (JPEG, PNG, GIF, SVG)'));
        }
    }
});

// Rutas
router.get('/config', getEmpresaConfig);
router.use(verifyToken);
router.put('/config', requireRole([1], 'empresa'), updateEmpresaConfig);
router.post('/upload-logo', 
    requireRole([1], 'empresa'), 
    upload.single('logo'), 
    uploadLogo
);

export default router;