/**
 * routes/adminRoutes.js - Rutas de Control Administrativo
 */
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// Nota: Pasamos 'io' como parámetro desde el server.js para que las rutas tengan acceso a los sockets
module.exports = function(io) {

    // --- RUTA 1: ACTIVACIÓN DE USUARIOS (PLANES) ---
    router.post('/activate-user', authMiddleware, roleMiddleware('admin'), async (req, res) => {
        try {
            const { email, days = 30 } = req.body;
            const numDays = parseInt(days);

            if (isNaN(numDays)) {
                return res.status(400).json({ success: false, message: "Invalid number of days" });
            }

            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + numDays);

            const user = await User.findOneAndUpdate(
                { email: email.toLowerCase().trim() },
                { 
                    role: 'advanced',
                    roleUpdatedAt: new Date(),
                    roleExpiresAt: expirationDate
                },
                { new: true }
            );

            if (!user) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            console.log(`✅ [ADMIN] ${req.user.email} activated ${email} until ${expirationDate}`);

            res.status(200).json({ 
                success: true, 
                message: `User ${email} activated for ${days} days.`,
                expiresAt: expirationDate
            });

        } catch (error) {
            console.error("❌ Admin Activation Error:", error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // --- RUTA 2: BROADCAST DE NOTIFICACIONES ---
    router.post('/notify', authMiddleware, roleMiddleware('admin'), async (req, res) => {
        try {
            const { target, message, email } = req.body;

            if (!message) {
                return res.status(400).json({ success: false, message: "Message is required" });
            }

            // Lógica de segmentación usando el objeto 'io' inyectado
            if (target === 'all') {
                io.emit('admin-broadcast', { message, type: 'info' });
            } 
            else if (target === 'one' && email) {
                io.to(email.toLowerCase().trim()).emit('admin-broadcast', { message, type: 'direct' });
            } 
            else {
                // Roles: 'advanced' o 'current'
                io.to(target).emit('admin-broadcast', { message, type: 'segment' });
            }

            res.json({ success: true, message: `Notification sent to ${target}` });

        } catch (error) {
            console.error("❌ Admin Notify Error:", error);
            res.status(500).json({ success: false, message: "Error sending notification" });
        }
    });

    return router;
};