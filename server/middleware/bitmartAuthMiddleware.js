// BSB/server/middleware/bitmartAuthMiddleware.js

const { decrypt } = require('../utils/encryption'); 
const User = require('../models/User'); 

const bitmartAuthMiddleware = async (req, res, next) => {
    try {
        const userId = req.user.id; 
        const user = await User.findById(userId);

        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

        if (!user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            console.log(`[AUTH-MW] Sin llaves en DB para ${user.email}. Usando fallback .env`);
            req.bitmartCreds = null;
            return next();
        }

        // --- DESENCRIPTACIÓN TOTAL ---
        // Ahora desencriptamos los tres campos porque los tres están cifrados
        req.bitmartCreds = {
            apiKey: decrypt(user.bitmartApiKey),
            secretKey: decrypt(user.bitmartSecretKeyEncrypted),
            apiMemo: user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : ''
        };

        console.log(`[AUTH-MW] 🛡️ Credenciales descifradas correctamente para: ${user.email}`);
        next();
        
    } catch (error) {
        console.error('❌ Error de descifrado en Middleware:', error.message);
        // Si hay un error de descifrado (ej. cambió la ENCRYPTION_KEY), 
        // limpiamos para que no intente usar datos corruptos
        req.bitmartCreds = null;
        next();
    }
};

module.exports = bitmartAuthMiddleware;