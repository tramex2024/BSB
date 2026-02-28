/**
 * services/cronService.js - Gestión de Tareas Programadas (BSB 2026)
 */
const cron = require('node-cron');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Autobot = require('../models/Autobot');
const autobotLogic = require('../autobotLogic');
const orderSyncService = require('./orderSyncService');
const { decrypt } = require('../utils/encryption');

function startCronJobs(io) {

    // --- TAREA 1: BALANCE CACHE (Cada 10 seg) ---
    setInterval(async () => {
        try {
            const activeBots = await Autobot.find({ 
                $or: [
                    { lstate: { $ne: 'STOPPED' } }, 
                    { sstate: { $ne: 'STOPPED' } }, 
                    { aistate: { $ne: 'STOPPED' } }
                ] 
            }).select('userId');
            
            for(const bot of activeBots) {
                await autobotLogic.slowBalanceCacheUpdate(bot.userId);
            }
        } catch (e) { 
            console.error("❌ Error en Balance Loop:", e.message); 
        }
    }, 10000);

    // --- TAREA 2: SYNC ÓRDENES Y NOTIFICACIÓN 401 (Cada 60 seg) ---
    setInterval(async () => {
        try {
            const users = await User.find({ 
                bitmartApiKey: { $exists: true, $ne: "" },
                apiStatus: { $ne: "INVALID_CREDENTIALS" } 
            });
            
            for (const user of users) {
                try {
                    const credentials = {
                        apiKey: decrypt(user.bitmartApiKey),
                        secretKey: decrypt(user.bitmartSecretKeyEncrypted),
                        memo: user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : ""
                    };

                    if (!credentials.apiKey || !credentials.secretKey) continue;
                    await orderSyncService.syncOpenOrders(user._id, credentials, io);

                } catch (userErr) {
                    if (userErr.message.includes('401') || userErr.message.includes('Unauthorized')) {
                        const errorMsg = "Tus API Keys de BitMart han expirado. El bot se ha detenido.";
                        await User.updateOne({ _id: user._id }, { $set: { apiStatus: "INVALID_CREDENTIALS" } });
                        
                        // Notificación en tiempo real y persistente
                        const userEmail = user.email.toLowerCase().trim();
                        io.to(userEmail).emit('admin-broadcast', { message: errorMsg, type: 'error' });
                        
                        await new Notification({
                            category: 'personal',
                            recipient: userEmail,
                            message: errorMsg,
                            date: new Date()
                        }).save();
                    }
                }
            }
        } catch (err) {
            console.error("❌ Error CRÍTICO en Sync Loop:", err.message);
        }
    }, 60000);

    // --- TAREA 3: GRAN MANTENIMIENTO DIARIO (00:00 AM) ---
    cron.schedule('0 0 * * *', async () => {
        console.log('🚀 [SISTEMA] Iniciando ciclo de mantenimiento diario...');
        try {
            await taskUpdateUserRoles(io);
            await taskCleanOldNotifications();
            console.log('✅ [SISTEMA] Mantenimiento diario completado con éxito.');
        } catch (err) {
            console.error('❌ [SISTEMA] Error crítico en el ciclo de mantenimiento:', err.message);
        }
    });

    console.log("🕒 [CRON-SERVICE] Todos los ciclos (10s, 60s, 24h) están activos.");
}

// ==========================================
//    FUNCIONES DE MANTENIMIENTO (SUB-TAREAS)
// ==========================================

async function taskUpdateUserRoles(io) {
    const now = new Date();
    const result = await User.updateMany(
        { 
            role: 'advanced', 
            roleExpiresAt: { $lt: now, $ne: null } 
        },
        { $set: { role: 'current', roleExpiresAt: null } }
    );

    if (result.modifiedCount > 0) {
        console.log(`- Roles: ${result.modifiedCount} usuarios degradados.`);
        io.emit('system-update', { type: 'ROLES_UPDATED' });
    }
}

async function taskCleanOldNotifications() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await Notification.deleteMany({ date: { $lt: sevenDaysAgo } });
    console.log(`- Notificaciones: ${result.deletedCount} mensajes antiguos eliminados.`);
}

module.exports = { startCronJobs };