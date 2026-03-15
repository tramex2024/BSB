/**
 * services/socketManager.js - Gestión Centralizada de WebSockets (BSB 2026)
 */
const User = require('../models/User');
const Autobot = require('../models/Autobot');
const Order = require('../models/Order');
const Notification = require('../models/Notification'); // Importamos el modelo de notificaciones

module.exports = function(io) {
    io.on('connection', async (socket) => {
        // El cliente envía su userId al conectar
        let userId = socket.handshake.query.userId;
        
        if (!userId || userId === 'undefined' || userId === 'null') {
            console.warn(`⚠️ Socket ${socket.id} rechazado: Sin userId válido.`);
            return socket.disconnect();
        }

        const userIdStr = userId.toString();
        
        // 1. UNIÓN A SALAS Y VALIDACIÓN DE USUARIO
        try {
            const user = await User.findById(userIdStr).select('email role');
            
            if (user) {
                const userEmail = user.email.toLowerCase().trim();
                const userRole = user.role || 'current';
                
                // Unirse a salas para segmentación
                socket.join(userIdStr);  // Sala por ID único
                socket.join(userEmail);  // Sala para mensajes personales ('one')
                socket.join(userRole);   // Sala para mensajes por rol ('advanced'/'current')
                
                console.log(`👤 Socket Conectado: ${socket.id} -> [${userEmail}] [${userRole}]`);

                // --- HIDRATAR HISTORIAL DE NOTIFICACIONES ---
                const notifHistory = await Notification.find({
                    $or: [
                        { category: 'all' },
                        { category: userRole },
                        { category: 'personal', recipient: userEmail }
                    ]
                })
                .sort({ date: -1 }) // Las más recientes primero
                .limit(15);

                socket.emit('notification-history', notifHistory);
//                console.log(`[SOCKET] 🔔 Historial de notificaciones enviado a ${userEmail}`);

            } else {
                // SEGURIDAD: Si el token existe pero el usuario no está en la DB
                console.warn(`⚠️ Intento de conexión con userId inexistente: ${userIdStr}`);
                return socket.disconnect();
            }
        } catch (err) {
            console.error("❌ Error en validación de socket:", err.message);
            return socket.disconnect();
        }

        // 2. ENVIAR ESTADO INICIAL DEL AUTOBOT
        try {
            const state = await Autobot.findOne({ userId: userIdStr }).lean();
            if (state) {
                socket.emit('bot-state-update', state);
            }
        } catch (err) {
            console.error("❌ Error enviando estado inicial del bot:", err);
        }

        // 3. HIDRATAR HISTORIAL DE ÓRDENES
        try {
            const history = await Order.find({ userId: userIdStr })
                .sort({ orderTime: -1 })
                .limit(20);
            
            socket.emit('ai-history-update', history);
//            console.log(`[SOCKET] 🔄 Historial de órdenes enviado a ${userIdStr}`);
        } catch (err) {
            console.error("❌ Error hidratando historial de órdenes:", err.message);
        }

        // 4. DESCONEXIÓN
        socket.on('disconnect', () => {
            console.log(`👤 Socket Desconectado: ${socket.id} de sala: ${userIdStr}`);
        });
    });
};