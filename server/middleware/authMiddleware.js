// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Para acceder a JWT_SECRET

const authMiddleware = (req, res, next) => {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
        console.warn("[authMiddleware] No Authorization header provided.");
        return res.status(401).json({ message: 'No token, authorization denied.' });
    }

    // Espera "Bearer TOKEN" y extrae solo el TOKEN
    const token = authHeader.replace('Bearer ', '');

    if (!token || !authHeader.startsWith('Bearer ')) { // Asegurarse de que el formato sea 'Bearer '
        console.warn("[authMiddleware] Invalid token format or no token provided in header.");
        return res.status(401).json({ message: 'Invalid token format or no token provided.' });
    }

    try {
        // jwt.verify decodifica el token. Si tu payload es { id: user._id, email: user.email },
        // entonces 'decoded' ya será ese objeto.
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Asigna directamente el objeto decodificado a req.user
        // Si tu token se firmó con { id: user._id, email: user.email }, entonces 'decoded' ya tiene esas propiedades.
        req.user = decoded; // <--- ¡CAMBIO CRÍTICO AQUÍ!

        console.log("[authMiddleware] Token verified. req.user set to:", req.user); // Log para verificar
        next();
    } catch (err) {
        console.error('Token verification failed:', err.message);
        // Si el token es inválido o ha expirado, responde con 401 Unauthorized.
        res.status(401).json({ message: 'Token is not valid or has expired.' });
    }
};

module.exports = authMiddleware; // Exporta solo esta versión correcta del middleware