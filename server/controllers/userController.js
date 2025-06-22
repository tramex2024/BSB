// server/controllers/userController.js

const User = require('../models/User'); // Asegúrate de que la ruta a tu modelo User sea correcta
const jwt = require('jsonwebtoken'); // Para verificar el token JWT
const crypto = require('crypto'); // Para encriptar/desencriptar las claves
const bitmartService = require('../services/bitmartService'); // Tu servicio para interactuar con BitMart

// --- Middleware de Autenticación (para asegurar que el usuario esté logueado) ---
// Este middleware se usará en las rutas que requieren que el usuario esté autenticado.
exports.authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Espera "Bearer TOKEN"

    if (token == null) {
        console.warn("[AUTH MIDDLEWARE] No token provided.");
        return res.status(401).json({ message: 'Authentication token required.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error("[AUTH MIDDLEWARE] JWT Verification Error:", err.message);
            // Si el token es inválido o ha expirado, responde con 403 Forbidden.
            return res.status(403).json({ message: 'Invalid or expired authentication token.' });
        }
        req.user = user; // Guarda la información del usuario del token en el objeto de la petición
        next(); // Continúa con la siguiente función middleware/controlador
    });
};

// --- Funciones de Ayuda para Encriptación/Desencriptación ---
// Asegúrate de que process.env.ENCRYPTION_KEY esté configurado en Render y sea un string de 32 caracteres (256 bits).
// Usa un IV (Initialization Vector) fijo o genera uno por clave guardada (más complejo).
// Para simplificar, aquí usaremos un IV fijo. ENCRYPTION_IV también DEBE estar en Render.
const algorithm = 'aes-256-cbc'; // Algoritmo de encriptación

// Asegúrate de que tu ENCRYPTION_KEY sea de 32 bytes (256 bits)
const getEncryptionKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        console.error("ERROR: ENCRYPTION_KEY is not defined in environment variables!");
        throw new Error("ENCRYPTION_KEY is not defined.");
    }
    // Asegurarse de que la clave tenga el tamaño correcto (32 bytes para aes-256)
    // Puedes truncar o rellenar si es necesario, pero es mejor que la clave generada sea exacta.
    return crypto.createHash('sha256').update(key).digest('base64').substring(0, 32);
};

// Asegúrate de que tu ENCRYPTION_IV sea de 16 bytes (128 bits)
const getEncryptionIv = () => {
    const iv = process.env.ENCRYPTION_IV;
    if (!iv) {
        console.error("ERROR: ENCRYPTION_IV is not defined in environment variables!");
        // Para desarrollo o una primera vez, puedes generar uno y luego copiarlo a Render.
        // const generatedIv = crypto.randomBytes(16).toString('hex');
        // console.log("Generated IV for first time (COPY THIS TO RENDER ENCRYPTION_IV):", generatedIv);
        throw new Error("ENCRYPTION_IV is not defined. Please set it to a 16-byte hex string.");
    }
    // Convertir el IV de hex a Buffer
    return Buffer.from(iv, 'hex'); // Asume que ENCRYPTION_IV es un string hexadecimal de 32 caracteres (16 bytes)
};


const encrypt = (text) => {
    try {
        const key = Buffer.from(getEncryptionKey(), 'utf8'); // Convertir la clave a Buffer
        const iv = getEncryptionIv(); // Obtener el IV como Buffer

        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (error) {
        console.error("Encryption failed:", error);
        throw new Error("Failed to encrypt data.");
    }
};

const decrypt = (encryptedText) => {
    try {
        const key = Buffer.from(getEncryptionKey(), 'utf8'); // Convertir la clave a Buffer
        const iv = getEncryptionIv(); // Obtener el IV como Buffer

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Failed to decrypt data. Check ENCRYPTION_KEY/IV consistency.");
    }
};


// --- Controlador para guardar las API Keys de BitMart ---
exports.saveBitmartApiKeys = async (req, res) => {
    const { apiKey, secretKey, memo } = req.body;
    const userId = req.user.id; // Obtenido del token JWT verificado

    try {
        if (!apiKey || !secretKey) {
            return res.status(400).json({ message: 'API Key and Secret Key are required.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Encriptar las claves antes de guardarlas
        user.bitmartApiKey = encrypt(apiKey);
        user.bitmartSecretKey = encrypt(secretKey);
        user.bitmartMemo = memo ? encrypt(memo) : null; // El memo es opcional

        user.bitmartApiValidated = false; // Se validará al intentar la primera llamada
        await user.save();

        res.status(200).json({ message: 'BitMart API keys saved successfully. Please try to connect to validate them.' });

    } catch (error) {
        console.error('Error saving BitMart API keys:', error);
        res.status(500).json({ message: 'Error saving BitMart API keys. Please check server logs.' });
    }
};

// --- Controlador para obtener el balance de BitMart ---
exports.getBitmartBalance = async (req, res) => {
    const userId = req.user.id;

    try {
        const user = await User.findById(userId);
        if (!user || !user.bitmartApiKey || !user.bitmartSecretKey) {
            console.warn(`[BALANCE] User ${userId} tried to fetch balance but has no API keys.`);
            return res.status(400).json({ message: 'BitMart API keys not configured for this user.' });
        }

        // Desencriptar las claves antes de usarlas
        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKey);
        const decryptedMemo = user.bitmartMemo ? decrypt(user.bitmartMemo) : null;

        const authCredentials = {
            apiKey: decryptedApiKey,
            secretKey: decryptedSecretKey,
            apiMemo: decryptedMemo
        };

        const balances = await bitmartService.getBalance(authCredentials);
        res.status(200).json(balances);

    } catch (error) {
        // Este es el error que estabas viendo antes si fallaba la desencriptación
        console.error('Error getting BitMart balance:', error);
        res.status(500).json({ message: error.message || 'Error fetching BitMart balance.' });
    }
};

// --- Controlador para obtener órdenes abiertas de BitMart ---
exports.getBitmartOpenOrders = async (req, res) => {
    const userId = req.user.id;
    const { symbol } = req.query; // Espera el símbolo como query parameter, ej: ?symbol=BTC_USDT

    try {
        const user = await User.findById(userId);
        if (!user || !user.bitmartApiKey || !user.bitmartSecretKey) {
            console.warn(`[OPEN ORDERS] User ${userId} tried to fetch open orders but has no API keys.`);
            return res.status(400).json({ message: 'BitMart API keys not configured for this user.' });
        }

        // Desencriptar las claves
        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKey);
        const decryptedMemo = user.bitmartMemo ? decrypt(user.bitmartMemo) : null;

        const authCredentials = {
            apiKey: decryptedApiKey,
            secretKey: decryptedSecretKey,
            apiMemo: decryptedMemo
        };

        const openOrders = await bitmartService.getOpenOrders(authCredentials, symbol);
        res.status(200).json(openOrders);

    } catch (error) {
        console.error('Error getting BitMart open orders:', error);
        res.status(500).json({ message: error.message || 'Error fetching BitMart open orders.' });
    }
};

// --- Controlador para obtener el historial de órdenes (si ya lo tienes en bitmartService) ---
exports.getBitmartHistoryOrders = async (req, res) => {
    const userId = req.user.id;
    const { symbol, status } = req.query; // 'filled', 'cancelled', 'all'

    try {
        const user = await User.findById(userId);
        if (!user || !user.bitmartApiKey || !user.bitmartSecretKey) {
            return res.status(400).json({ message: 'BitMart API keys not configured for this user.' });
        }

        const decryptedApiKey = decrypt(user.bitmartApiKey);
        const decryptedSecretKey = decrypt(user.bitmartSecretKey);
        const decryptedMemo = user.bitmartMemo ? decrypt(user.bitmartMemo) : null;

        const authCredentials = {
            apiKey: decryptedApiKey,
            secretKey: decryptedSecretKey,
            apiMemo: decryptedMemo
        };

        // Asumiendo que bitmartService.getHistoryOrdersV4 ya existe
        const historyOrders = await bitmartService.getHistoryOrdersV4(authCredentials, { symbol, status });
        res.status(200).json(historyOrders);

    } catch (error) {
        console.error('Error getting BitMart history orders:', error);
        res.status(500).json({ message: error.message || 'Error fetching BitMart history orders.' });
    }
};