/**
 * roleMiddleware.js - Control de acceso basado en jerarquías
 */
const roleMiddleware = (requiredRole) => {
    return (req, res, next) => {
        // 1. Verificar si el usuario fue autenticado previamente por authMiddleware
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized: No user found" });
        }

        const userRole = req.user.role;

        // 2. Lógica de Jerarquía: 
        // El 'admin' siempre tiene acceso a todo.
        // El 'advanced' tiene acceso a rutas 'advanced' y 'current'.
        if (userRole === 'admin') {
            return next();
        }

        if (userRole === requiredRole) {
            return next();
        }

        // 3. Fallo de permisos
        console.warn(`[SECURITY] Acceso denegado para ${req.user.email}. Requería: ${requiredRole}, Tenía: ${userRole}`);
        
        return res.status(403).json({ 
            success: false,
            message: `Access denied: This section requires ${requiredRole} privileges.` 
        });
    };
};

module.exports = roleMiddleware;