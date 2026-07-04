/**
 * BSB/server/middleware/bitmartAuthMiddleware.js
 * VERSIÓN DE AUDITORÍA Y DIAGNÓSTICO
 */

const { decrypt } = require('../utils/encryption'); 
const User = require('../models/User'); 

const bitmartAuthMiddleware = async (req, res, next) => {
    try {
        // Verificar si el middleware previo inyectó al usuario
        if (!req.user || !req.user.id) {
            console.error('[AUDITORÍA-MW] ❌ ERROR: req.user o req.user.id no existen. El middleware de autenticación previo falló.');
            return res.status(500).json({ 
                success: false, 
                message: "Fallo de flujo: req.user no está poblado." 
            });
        }

        const userId = req.user.id; 
        console.log(`[AUDITORÍA-MW] 🔍 Buscando usuario en DB con ID: ${userId}`);
        
        const user = await User.findById(userId);

        if (!user) {
            console.warn(`[AUDITORÍA-MW] ⚠️ Usuario con ID ${userId} no existe en la DB.`);
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // 1. VALIDACIÓN ESTRICTA: ¿Existen las llaves en el documento?
        if (!user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            console.warn(`[AUDITORÍA-MW] ⚠️ Acceso denegado: ${user.email} no tiene API Keys configuradas en DB.`);
            return res.status(403).json({ 
                success: false, 
                message: "No linked API Keys detected. Please configure them in your profile." 
            });
        }

        // 2. DESENCRIPTACIÓN Y CARGA
        try {
            console.log(`[AUDITORÍA-MW] 🔐 Intentando desencriptar llaves para: ${user.email}`);
            
            req.bitmartCreds = {
                apiKey: decrypt(user.bitmartApiKey),
                secretKey: decrypt(user.bitmartSecretKeyEncrypted),
                apiMemo: user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : ''
            };
            
            console.log(`[AUDITORÍA-MW] ✅ Credenciales desencriptadas con éxito para: ${user.email}`);
            next();

        } catch (decryptError) {
            console.error(`[AUDITORÍA-MW] ❌ CRÍTICO: Error de desencriptación para ${user.email}:`, decryptError);
            return res.status(500).json({ 
                success: false, 
                message: `Error de desencriptación (Crypto): ${decryptError.message}` 
            });
        }
        
    } catch (error) {
        console.error('❌ Error general en bitmartAuthMiddleware:', error);
        res.status(500).json({ 
            success: false, 
            message: `Error general en Middleware: ${error.message}` 
        });
    }
};

module.exports = bitmartAuthMiddleware;