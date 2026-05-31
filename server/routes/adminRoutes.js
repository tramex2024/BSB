/**
 * routes/adminRoutes.js - Rutas de Control Administrativo con Persistencia
 */
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Autobot = require('../models/Autobot'); // Añade esta línea si no la tienes

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

    // --- RUTA 3: OBTENER DATOS DE AUTOBOT (DB EXPLORER) ---
    router.get('/bot-data', authMiddleware, roleMiddleware('admin'), async (req, res) => {
        try {
            const { email } = req.query;
            if (!email) {
                return res.status(400).json({ success: false, message: "Email is required" });
            }

            // 1. Buscar al usuario por email
            const user = await User.findOne({ email: email.toLowerCase().trim() });
            if (!user) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            // 2. Buscar el Autobot vinculado usando el userId
            // Nota: Como tu Autobot.js tiene userId, usamos ese campo para buscar
            const botData = await Autobot.findOne({ userId: user._id });
            
            if (!botData) {
                return res.status(404).json({ success: false, message: "No autobot found for this user" });
            }

            // 3. Devolver los datos
            res.status(200).json({
                success: true,
                data: botData
            });

        } catch (error) {
            console.error("❌ Admin DB Fetch Error:", error);
            res.status(500).json({ success: false, message: "Error fetching bot data" });
        }
    });

    // --- RUTA 4: LISTAR TODOS LOS EMAILS ---
    router.get('/users-list', authMiddleware, roleMiddleware('admin'), async (req, res) => {
        try {
            const users = await User.find({}, 'email'); // Solo traemos los emails
            res.status(200).json(users);
        } catch (error) {
            res.status(500).json({ success: false, message: "Error fetching users" });
        }
    });

    // --- RUTA 5: ACTUALIZAR DATOS DE AUTOBOT ---
    router.post('/update-bot', authMiddleware, roleMiddleware('admin'), async (req, res) => {
        try {
            const { userId, updatedData } = req.body;

            // Buscamos y actualizamos el bot del usuario específico
            const result = await Autobot.findOneAndUpdate(
                { userId: userId },
                { $set: updatedData },
                { new: true }
            );

            if (!result) return res.status(404).json({ success: false, message: "Bot not found" });

            res.status(200).json({ success: true, message: "Database updated successfully" });
        } catch (error) {
            console.error("❌ Admin Update Error:", error);
            res.status(500).json({ success: false, message: "Error updating database" });
        }
    });

    return router;
};