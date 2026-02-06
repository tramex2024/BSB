// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Para acceder a JWT_SECRET

const authMiddleware = (req, res, next) => {
    // 1. Obtener el encabezado de autorización
    const authHeader = req.header('Authorization');
    
//    console.log("[authMiddleware] Received Authorization header:", authHeader);

    // 2. Verificar si el encabezado existe
    if (!authHeader) {
        console.warn("[authMiddleware] No Authorization header provided.");
        return res.status(401).json({ message: 'No token, authorization denied.' });
    }

    // 3. Dividir el encabezado en "Bearer" y el token
    const tokenParts = authHeader.split(' ');

    // 4. Asegurarse de que el formato sea "Bearer [token]"
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
        console.warn("[authMiddleware] Invalid token format. Expected: 'Bearer [token]'.");
        return res.status(401).json({ message: 'Invalid token format.' });
    }

    const token = tokenParts[1];
//    console.log("[authMiddleware] Extracted token:", token);

    try {
        // 5. Verificar el token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
//        console.log("[authMiddleware] Token verified. Decoded payload:", decoded);

        // 6. Asignar el payload decodificado a req.user
        req.user = decoded; 
        
        // 7. Pasar al siguiente middleware o ruta
        next();
        
    } catch (err) {
        console.error('Token verification failed:', err.message);
        // Si el token es inválido o ha expirado, responde con 401 Unauthorized.
        return res.status(401).json({ message: 'Token is not valid or has expired.' });
    }
};

module.exports = authMiddleware;