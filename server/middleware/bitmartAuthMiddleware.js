// server/middleware/bitmartAuthMiddleware.js

const User = require('../models/User');
// IMPORTANTE: Importar las funciones de encriptación/desencriptación desde userController
const { decrypt, encrypt } = require('../controllers/userController'); 

const bitmartAuthMiddleware = async (req, res, next) => {
    try {
        const userId = req.user.id; // Asume que req.user.id ya está establecido por authenticateToken

        const user = await User.findById(userId);

        if (!user || !user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            // Si el usuario no tiene las claves configuradas, no es un error de autenticación per se para el middleware,
            // pero el controlador posterior necesitará manejarlo.
            // No se debe llamar a next() con un error aquí si simplemente faltan las claves,
            // ya que algunos endpoints (como guardar claves) no requieren que estén presentes aún.
            // Para proteger los controladores, estos deben verificar la presencia de las claves.
            return next(); 
        }

        // Desencriptar las claves para pasarlas a los controladores o servicios
        // Los logs de depuración para la desencriptación ya están en userController.js
        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted);
        // FIX: Asegurar que memo se maneje como null si está vacío/indefinido en DB,
        // para que bitmartService.js pueda interpretarlo correctamente.
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
