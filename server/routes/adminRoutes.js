/**
 * routes/adminRoutes.js - Rutas de Control Administrativo con Persistencia
 */
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

module.exports = function(io) {

    // --- RUTA 1: ACTIVACIÓN DE USUARIOS (Corregida para usar roleExpiresAt) ---
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
                    roleExpiresAt: expirationDate // <-- CORREGIDO: Ahora coincide con el Modelo y el Cron
                },
                { new: true }
            );

            if (!user) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            res.status(200).json({ 
                success: true, 
                message: `User ${email} activated until ${expirationDate.toLocaleDateString()}`,
                expiresAt: expirationDate
            });

        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // --- RUTA 2: BROADCAST & PERSISTENCIA DE NOTIFICACIONES ---
    router.post('/notify', authMiddleware, roleMiddleware('admin'), async (req, res) => {
        try {
            const { target, message, email } = req.body;

            if (!message) {
                return res.status(400).json({ success: false, message: "Message is required" });
            }

            let category = target; 
            let recipient = null;

            if (target === 'one' && email) {
                category = 'personal';
                recipient = email.toLowerCase().trim();
            }

            // 1. GUARDAR EN BASE DE DATOS
            const newNotif = new Notification({
                category,
                recipient,
                message,
                date: new Date()
            });
            await newNotif.save();

            // 2. MANTENER LÍMITE DE 5 (Solo para categorías globales/roles)
            if (category !== 'personal') {
                // Buscamos si excedemos los 5
                const count = await Notification.countDocuments({ category });
                if (count > 5) {
                    // Borramos los más antiguos dejando solo los 5 más recientes
                    const toDelete = await Notification.find({ category })
                        .sort({ date: 1 })
                        .limit(count - 5);
                    
                    const idsToDelete = toDelete.map(d => d._id);
                    await Notification.deleteMany({ _id: { $in: idsToDelete } });
                }
            }

            // 3. EMISIÓN EN TIEMPO REAL (SOCKET)
            const payload = { message, date: new Date(), category };

            if (category === 'all') {
                io.emit('admin-broadcast', { ...payload, type: 'info' });
            } 
            else if (category === 'personal') {
                io.to(recipient).emit('admin-broadcast', { ...payload, type: 'direct' });
            } 
            else {
                io.to(category).emit('admin-broadcast', { ...payload, type: 'segment' });
            }

            res.json({ success: true, message: `Notification saved and sent to ${target}` });

        } catch (error) {
            console.error("❌ Admin Notify Error:", error);
            res.status(500).json({ success: false, message: "Error processing notification" });
        }
    });

    return router;
};