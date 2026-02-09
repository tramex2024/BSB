// BSB/server/middleware/bitmartAuthMiddleware.js

const { decrypt } = require('../utils/encryption'); 
const User = require('../models/User'); 

const bitmartAuthMiddleware = async (req, res, next) => {
    try {
        const userId = req.user.id; 
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
        }

        // 1. VALIDACIÓN ESTRICTA: ¿Existen las llaves?
        if (!user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            console.warn(`[AUTH-MW] ⚠️ Acceso denegado: ${user.email} no tiene API Keys configuradas.`);
            
            // En lugar de pasar con null, cortamos la petición si es una acción que REQUIERE llaves
            return res.status(403).json({ 
                success: false, 
                message: "No se detectaron API Keys vinculadas. Por favor, configúralas en tu perfil." 
            });
        }

        // 2. DESENCRIPTACIÓN Y CARGA
        try {
            req.bitmartCreds = {
                apiKey: decrypt(user.bitmartApiKey),
                secretKey: decrypt(user.bitmartSecretKeyEncrypted),
                apiMemo: user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : ''
            };
            
            // Log de éxito (opcional, útil en desarrollo)
            // console.log(`[AUTH-MW] 🛡️ Credenciales cargadas para: ${user.email}`);
            next();

        } catch (decryptError) {
            console.error(`[AUTH-MW] ❌ Error crítico de desencriptación para ${user.email}:`, decryptError.message);
            return res.status(500).json({ 
                success: false, 
                message: "Error al procesar tus credenciales de seguridad. Contacta al soporte." 
            });
        }
        
    } catch (error) {
        console.error('❌ Error general en bitmartAuthMiddleware:', error.message);
        res.status(500).json({ success: false, message: "Error interno de autenticación BitMart." });
    }
};

module.exports = bitmartAuthMiddleware;