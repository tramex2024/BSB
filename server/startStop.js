/**
 * BSB/server/startStop.js
 * Gestión de estados y configuración (Start/Stop/Update)
 */
const Autobot = require('./models/Autobot');
const orchestrator = require('./src/au/utils/cycleOrchestrator');
const { CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT } = require('./src/au/utils/cleanState');
const { canExecuteStrategy } = require('./src/au/utils/strategyValidator');

async function updateConfig(userId, newConfig) {
    const currentPrice = orchestrator.getLastPrice();
    const currentBot = await Autobot.findOne({ userId }).lean();
    if (!currentBot) return null;

    const finalConfig = JSON.parse(JSON.stringify(currentBot.config || {}));
    const mergeSide = (side) => {
        if (newConfig[side]) {
            if (!finalConfig[side]) finalConfig[side] = {};
            for (const key in newConfig[side]) {
                const val = newConfig[side][key];
                if (val !== undefined && val !== null && val !== "") {
                    finalConfig[side][key] = val;
                }
            }
        }
    };

    mergeSide('long');
    mergeSide('short');
    if (newConfig.ai) {
        if (!finalConfig.ai) finalConfig.ai = {};
        Object.assign(finalConfig.ai, newConfig.ai);
    }
    if (newConfig.symbol) finalConfig.symbol = newConfig.symbol;

    const bot = await Autobot.findOneAndUpdate({ userId }, { 
        $set: { config: finalConfig, lastUpdate: new Date() } 
    }, { new: true }).lean();

    orchestrator.log('✅ Configuración guardada correctamente.', 'success', userId);
    if (bot) await orchestrator.syncFrontendState(currentPrice, bot, userId);
    return bot;
}

async function startSide(userId, side, config) {
    const botState = await Autobot.findOne({ userId }).lean();
    if (!botState) throw new Error("Bot no encontrado");

    const currentPrice = orchestrator.getLastPrice();
    const finalConfig = JSON.parse(JSON.stringify(botState.config));
    
    if (config && config[side]) {
        Object.assign(finalConfig[side], config[side]);
    }

    // --- INTEGRACIÓN DEL VALIDADOR (GATEKEEPER) ---
    const dependencies = {
        botState,
        config: finalConfig,
        availableUSDT: botState.lastAvailableUSDT || 0,
        availableBTC: botState.lastAvailableBTC || 0,
        currentPrice,
        log: (msg, type) => orchestrator.log(msg, type, userId)
    };

    // Si el validador retorna false, bloqueamos el arranque
    if (!canExecuteStrategy(side, dependencies)) {
        throw new Error(`Validación de saldo fallida para ${side.toUpperCase()}. Revisa tus fondos disponibles.`);
    }

    let cleanData = {};
    let stateField = '';

    if (side === 'long') {
        cleanData = CLEAN_LONG_ROOT;
        stateField = 'lstate';
    } else if (side === 'short') {
        cleanData = CLEAN_SHORT_ROOT;
        stateField = 'sstate';
    } else if (side === 'ai') {
        stateField = 'aistate';
    }
    
    if (finalConfig[side]) finalConfig[side].enabled = true;

    const update = {
        ...cleanData, 
        [stateField]: 'RUNNING',
        config: finalConfig
    };
    
    const bot = await Autobot.findOneAndUpdate({ userId }, { $set: update }, { new: true }).lean();
    orchestrator.log(`🚀 Estrategia ${side.toUpperCase()} validada y encendida.`, 'success', userId);
    await orchestrator.slowBalanceCacheUpdate(userId); 
    return bot;
}

async function stopSide(userId, side) {
    const botState = await Autobot.findOne({ userId }).lean();
    if (!botState) throw new Error("Bot no encontrado");

    const stateField = side === 'long' ? 'lstate' : (side === 'short' ? 'sstate' : 'aistate'); 
    const newConfig = JSON.parse(JSON.stringify(botState.config));
    if (newConfig[side]) newConfig[side].enabled = false;

    const update = {
        [stateField]: 'STOPPED',
        config: newConfig,
        lastUpdate: new Date()
    };
    
    const bot = await Autobot.findOneAndUpdate({ userId }, { $set: update }, { new: true }).lean();
    if (bot) await orchestrator.syncFrontendState(orchestrator.getLastPrice(), bot, userId);
    orchestrator.log(`🛑 Estrategia ${side.toUpperCase()} apagada.`, 'warning', userId);
    return bot;
}

module.exports = { updateConfig, startSide, stopSide };