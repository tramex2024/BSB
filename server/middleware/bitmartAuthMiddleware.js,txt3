// server/middleware/bitmartAuthMiddleware.js

const User = require('../models/User');
// IMPORTANTE: Importar las funciones de encriptación/desencriptación desde cryptoUtils
const { decrypt } = require('../utils/cryptoUtils'); 

const bitmartAuthMiddleware = async (req, res, next) => {
    try {
        const userId = req.user.id; // Asume que req.user.id ya está establecido por authenticateToken

        const user = await User.findById(userId);

        if (!user || !user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            // Si el usuario no tiene las claves configuradas, permite que la solicitud continúe
            // para que el controlador pueda manejarlo (ej. retornar 400 'claves no configuradas').
            return next(); 
        }

        // --- DEBUGGING CRÍTICO: Verificar si decrypt está disponible ---
        console.log(`[DEBUG MIDDLEWARE] Tipo de 'decrypt' antes de usarlo: ${typeof decrypt}`);
        if (typeof decrypt !== 'function') {
            console.error(`[CRITICAL ERROR] 'decrypt' NO ES UNA FUNCIÓN en bitmartAuthMiddleware. Revisa la importación desde cryptoUtils.js.`);
            throw new Error("Internal server error: Crypto functions not loaded correctly.");
        }
        // --- FIN DEBUGGING CRÍTICO ---

        // Desencriptar las claves para pasarlas a los controladores o servicios
        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted);
        // Si el memo desencriptado es una cadena vacía, pasamos null.
        const decryptedMemo = (user.bitmartApiMemo === undefined || user.bitmartApiMemo === null || decrypt(user.bitmartApiMemo) === '') ? null : decrypt(user.bitmartApiMemo);

        // Adjuntar las credenciales desencriptadas a la solicitud para que los controladores las usen
        req.bitmartAuth = {
            apiKey: decryptedApiKey,
            secretKey: decryptedSecretKey,
            apiMemo: decryptedMemo
        };
        next();
    } catch (error) {
        console.error('Error en bitmartAuthMiddleware:', error.message);
        // Aquí sí es un error crítico si la desencriptación falla.
        return res.status(500).json({ message: 'Error interno del servidor al procesar las credenciales de BitMart.' });
    }
};

module.exports = bitmartAuthMiddleware;
