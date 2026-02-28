const roleMiddleware = (requiredRole) => {
    return (req, res, next) => {
        // req.user viene del authMiddleware que ya tienes
        if (!req.user || req.user.role !== requiredRole) {
            return res.status(403).json({ 
                message: `Forbidden: Requires ${requiredRole} role` 
            });
        }
        next();
    };
};

module.exports = roleMiddleware;