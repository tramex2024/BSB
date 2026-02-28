/**
 * services/cronService.js - Tareas Programadas y Sincronización (BSB 2026)
 */
const User = require('../models/User');
const Autobot = require('../models/Autobot');
const autobotLogic = require('../autobotLogic');
const orderSyncService = require('./orderSyncService');
const { decrypt } = require('../utils/encryption');

function startCronJobs(io) {
    
    // --- TAREA 1: INTERVALO DE RESPALDO DE BALANCES (Cada 10 seg) ---
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

    // --- TAREA 2: SINCRONIZACIÓN DE ÓRDENES Y FRENO 401 (Cada 60 seg) ---
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
                        console.error(`⚠️ [SYNC] Bloqueando API de ${user.email} por credenciales inválidas.`);
                        await User.updateOne({ _id: user._id }, { $set: { apiStatus: "INVALID_CREDENTIALS" } });
                        
                        io.to(user._id.toString()).emit('api-error', { 
                            message: "Tus API Keys de BitMart han expirado. Por favor actualízalas en Configuración." 
                        });
                    }
                }
            }
        } catch (err) {
            console.error("❌ Error CRÍTICO en Sync Loop:", err.message);
        }
    }, 60000);

    console.log("🕒 [CRON-SERVICE] Ciclos de balance y sincronización activos.");
}

module.exports = { startCronJobs };