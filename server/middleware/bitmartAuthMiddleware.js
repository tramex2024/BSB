// server/middleware/bitmartAuthMiddleware.js
// Importa las funciones de encriptación/desencriptación directamente desde userController
// para asegurar que se utilice la misma lógica y variables de entorno.
const { decrypt } = require('../controllers/userController'); // Importa la función decrypt directamente
const User = require('../models/User'); // Importa tu modelo de usuario

const bitmartAuthMiddleware = async (req, res, next) => {
    try {
        const userId = req.user.id; // ID del usuario obtenido del JWT

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // Comprobar si el usuario tiene las claves de BitMart configuradas
        // (Nota: bitmartApiMemo puede ser null si no se proporcionó inicialmente)
        if (!user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            return res.status(400).json({ message: 'Las API keys de BitMart no están configuradas para este usuario. Por favor, configúralas.' });
        }

        // --- CORRECCIÓN CLAVE: Desencriptar TODAS las claves aquí ---
        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted);
        // El memo es opcional, si es null o undefined en la DB, se tratará como cadena vacía.
        const decryptedMemo = (user.bitmartApiMemo === undefined || user.bitmartApiMemo === null) ? '' : decrypt(user.bitmartApiMemo);

        // --- NUEVOS LOGS DE DEPURACIÓN EN EL MIDDLEWARE ---
        // ¡ADVERTENCIA DE SEGURIDAD! Estos logs exponen partes de las claves en texto plano.
        // ELIMÍNALOS DESPUÉS DE QUE LA DEPURACIÓN TERMINE.
        console.log(`[MIDDLEWARE DECRYPT] Decrypted API Key (partial): ${decryptedApiKey.substring(0, 5)}...${decryptedApiKey.substring(decryptedApiKey.length - 5)} (Length: ${decryptedApiKey.length})`);
        console.log(`[MIDDLEWARE DECRYPT] Decrypted Secret Key (partial): ${decryptedSecretKey.substring(0, 5)}...${decryptedSecretKey.substring(decryptedSecretKey.length - 5)} (Length: ${decryptedSecretKey.length})`);
        console.log(`[MIDDLEWARE DECRYPT] Decrypted Memo: '${decryptedMemo}' (Length: ${decryptedMemo.length})`);
        // --- FIN LOGS ---


        // Adjuntar las credenciales desencriptadas al objeto de solicitud
        req.bitmartCreds = {
            apiKey: decryptedApiKey, // Ahora desencriptada
            secretKey: decryptedSecretKey, // Ya desencriptada
            apiMemo: decryptedMemo // Ahora desencriptada
        };
        next();
    } catch (error) {
        console.error('Error en bitmartAuthMiddleware:', error.message);
        // Mensaje de error más descriptivo para el frontend
        res.status(500).json({ message: 'Error interno del servidor al obtener y desencriptar credenciales de BitMart. Por favor, verifica tus API Keys en la aplicación.' });
    }
};

module.exports = bitmartAuthMiddleware;
