// server/middleware/bitmartAuthMiddleware.js

// CORRECT IMPORT: Import the decrypt function directly from the encryption utility
const { decrypt } = require('../utils/encryption'); 
const User = require('../models/User'); // Import your user model

const bitmartAuthMiddleware = async (req, res, next) => {
    try {
        const userId = req.user.id; // User ID obtained from JWT

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // Check if the user has BitMart keys configured
        // (Note: bitmartApiMemo can be null if not initially provided)
        if (!user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            return res.status(400).json({ message: 'Las API keys de BitMart no están configuradas para este usuario. Por favor, configúralas.' });
        }

        // --- KEY CORRECTION: Decrypt ALL keys here ---
        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted);
        // Memo is optional; if null or undefined in DB, it will be treated as an empty string.
        const decryptedMemo = (user.bitmartApiMemo === undefined || user.bitmartApiMemo === null) ? '' : decrypt(user.bitmartApiMemo);

        // --- NEW DEBUG LOGS IN THE MIDDLEWARE ---
        // WARNING! These logs expose parts of the keys in plain text.
        // REMOVE THEM AFTER DEBUGGING IS COMPLETE.
        console.log(`[MIDDLEWARE DECRYPT] Decrypted API Key (partial): ${decryptedApiKey.substring(0, 5)}...${decryptedApiKey.substring(decryptedApiKey.length - 5)} (Length: ${decryptedApiKey.length})`);
        console.log(`[MIDDLEWARE DECRYPT] Decrypted Secret Key (partial): ${decryptedSecretKey.substring(0, 5)}...${decryptedSecretKey.substring(decryptedSecretKey.length - 5)} (Length: ${decryptedSecretKey.length})`);
        console.log(`[MIDDLEWARE DECRYPT] Decrypted Memo: '${decryptedMemo}' (Length: ${decryptedMemo.length})`);
        // --- END LOGS ---

        // Attach the decrypted credentials to the request object
        req.bitmartCreds = {
            apiKey: decryptedApiKey, // Now decrypted
            secretKey: decryptedSecretKey, // Now decrypted
            apiMemo: decryptedMemo // Now decrypted
        };
        next();
    } catch (error) {
        console.error('Error en bitmartAuthMiddleware:', error.message);
        // More descriptive error message for the frontend
        res.status(500).json({ message: 'Error interno del servidor al obtener y desencriptar credenciales de BitMart. Por favor, verifica tus API Keys en la aplicación.' });
    }
};

module.exports = bitmartAuthMiddleware;