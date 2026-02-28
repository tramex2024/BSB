/**
 * services/socketManager.js - Gestión Centralizada de WebSockets (BSB 2026)
 */
const User = require('../models/User');
const Autobot = require('../models/Autobot');
const Order = require('../models/Order');

module.exports = function(io) {
    io.on('connection', async (socket) => {
        // El cliente envía su userId al conectar
        let userId = socket.handshake.query.userId;
        
        if (!userId || userId === 'undefined' || userId === 'null') {
            console.warn(`⚠️ Socket ${socket.id} rechazado: Sin userId válido.`);
            return socket.disconnect();
        }

        const userIdStr = userId.toString();
        
        // 1. UNIÓN A SALAS (ID, Email, Rol)
        socket.join(userIdStr);
        console.log(`👤 Socket Conectado: ${socket.id} -> Sala: ${userIdStr}`);

        try {
            const user = await User.findById(userIdStr).select('email role');
            if (user) {
                const userEmail = user.email.toLowerCase().trim();
                const userRole = user.role || 'current';
                
                socket.join(userEmail); // Para target: 'one'
                socket.join(userRole);  // Para target: 'advanced' o 'current'
                
                console.log(`📢 Salas de Notificación listas: [${userEmail}] [${userRole}]`);
            }
        } catch (err) {
            console.error("❌ Error uniendo a salas de notificación:", err.message);
        }

        // 2. ENVIAR ESTADO INICIAL DEL AUTOBOT
        try {
            const state = await Autobot.findOne({ userId: userIdStr }).lean();
            if (state) {
                socket.emit('bot-state-update', state);
            }
        } catch (err) {
            console.error("❌ Error enviando estado inicial:", err);
        }

        // 3. HIDRATAR HISTORIAL DE ÓRDENES
        try {
            const history = await Order.find({ userId: userIdStr })
                .sort({ orderTime: -1 })
                .limit(20);
            
            socket.emit('ai-history-update', history);
            console.log(`[SOCKET] 🔄 Historial enviado a ${userIdStr}`);
        } catch (err) {
            console.error("❌ Error hidratando historial:", err.message);
        }

        // 4. DESCONEXIÓN
        socket.on('disconnect', () => {
            console.log(`👤 Socket Desconectado: ${socket.id} de sala: ${userIdStr}`);
        });
    });
};