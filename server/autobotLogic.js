const BotState = require('./models/BotState');

let botState = { userId: process.env.BOT_USER_ID || 'default_user', state: 'STOPPED' };
let ioInstance;

function setIoInstance(io) {
    ioInstance = io;
    console.log('[AUTOBOT] Socket.IO instance attached.');
}

async function saveBotStateToDB() {
    if (!botState || Object.keys(botState).length === 0) {
        console.error('[ERROR] Intento de guardar un botState vacío.');
        return;
    }
    try {
        await BotState.findOneAndUpdate(
            { userId: botState.userId },
            botState,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log('[DB] Estado del bot guardado.');
    } catch (error) {
        console.error('❌ Error guardando estado:', error.message);
    }
}

async function loadBotStateFromDB() {
    try {
        const savedState = await BotState.findOne({ userId: botState.userId });
        console.log('[DEBUG] Estado recuperado desde DB:', savedState);

        if (savedState) {
            Object.assign(botState, savedState.toObject());
            botState.state = botState.state || 'STOPPED';
        } else {
            console.warn('[DB] No hay estado guardado. Usando valores por defecto.');
        }
    } catch (error) {
        console.error('❌ Error al cargar estado:', error.message);
    }
}

async function startBotStrategy(params) {
    if (botState.state !== 'STOPPED' && botState.state !== 'NO_COVERAGE') {
        console.warn(`[AUTOBOT] Intento de iniciar bot ya activo (${botState.state}).`);
        return { success: false, message: `Bot is already ${botState.state}.`, botState: { ...botState } };
    }

    botState = { ...botState, ...params, state: 'RUNNING', cycle: 0, profit: 0 };
    saveBotStateToDB();
    if (ioInstance) ioInstance.emit('botStateUpdate', botState);
    return { success: true, message: 'Bot started', botState: { ...botState } };
}

async function stopBotStrategy() {
    botState.state = 'STOPPED';
    await saveBotStateToDB();
    if (ioInstance) ioInstance.emit('botStateUpdate', botState);
    return { success: true, message: 'Bot stopped', botState: { ...botState } };
}

module.exports = {
    botState,
    setIoInstance,
    loadBotStateFromDB,
    saveBotStateToDB,
    startBotStrategy,
    stopBotStrategy
};
