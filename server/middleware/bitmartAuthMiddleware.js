// backend/middleware/bitmartAuthMiddleware.js
const User = require('../models/User'); // Importa tu modelo de usuario
const { decrypt } = require('../utils/encryption'); // Importa la función de desencriptación

const bitmartAuthMiddleware = async (req, res, next) => {
    try {
        const userId = req.user.id; // ID del usuario obtenido del JWT

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // Comprobar si el usuario tiene las claves de BitMart configuradas
        if (!user.bitmartApiKey || !user.bitmartSecretKeyEncrypted || !user.bitmartApiMemo) {
            return res.status(400).json({ message: 'Las API keys de BitMart no están configuradas para este usuario. Por favor, configúralas.' });
        }

        // Desencriptar la secretKey antes de pasarla al servicio
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted);

        // Adjuntar las credenciales desencriptadas al objeto de solicitud
        req.bitmartCreds = {
            apiKey: user.bitmartApiKey,
            secretKey: decryptedSecretKey, // Clave secreta desencriptada
            apiMemo: user.bitmartApiMemo
        };
        next();
    } catch (error) {
        console.error('Error en bitmartAuthMiddleware:', error.message);
        res.status(500).json({ message: 'Error interno del servidor al obtener y desencriptar credenciales de BitMart.' });
    }
};

module.exports = bitmartAuthMiddleware;