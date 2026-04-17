// BSB/server/startStop.js
// Management of states and configuration (Start/Stop/Update) - English Version

const Autobot = require('./models/Autobot');
const orchestrator = require('./src/au/utils/cycleOrchestrator');
const { CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT } = require('./src/au/utils/cleanState');
const { getStartAnalysis } = require('./src/au/utils/strategyValidator');

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

    orchestrator.log('✅ Configuration saved successfully.', 'success', userId);
    if (bot) await orchestrator.syncFrontendState(currentPrice, bot, userId);
    return bot;
}

async function startSide(userId, side, config) {
    const botState = await Autobot.findOne({ userId }).lean();
    if (!botState) throw new Error("Bot not found");

    const currentPrice = orchestrator.getLastPrice();
    const finalConfig = JSON.parse(JSON.stringify(botState.config));
    
    if (config && config[side]) {
        Object.assign(finalConfig[side], config[side]);
    }

    // --- START VALIDATOR INTEGRATION (GATEKEEPER) ---
    // Now AI is also validated against REAL funds (availableUSDT/BTC)
    const dependencies = {
        botState,
        availableUSDT: botState.lastAvailableUSDT || 0,
        availableBTC: botState.lastAvailableBTC || 0,
        currentPrice
    };

    // This performs the real budget check for Long, Short, and now AI
    const analysis = getStartAnalysis(side, dependencies);

    if (!analysis.canPass) {
        const errorMsg = `🚫 ${analysis.report.title}: ${analysis.report.disclaimer} (${analysis.report.liquidity})`;
        orchestrator.log(errorMsg, 'error', userId);
        throw new Error(errorMsg);
    }

    let cleanData = {};
    let stateField = '';

    if (side === 'long') {
        cleanData = {
            ...CLEAN_LONG_ROOT,
            lstate: 'RUNNING', // Forzamos RUNNING aquí
            llastOrder: null,  // <--- CRÍTICO: Limpia la orden fantasma
            locc: 0            // <--- CRÍTICO: Asegura que no crea que tiene órdenes ocupadas
        };
        stateField = 'lstate';
    } else if (side === 'short') {
        cleanData = {
            ...CLEAN_SHORT_ROOT,
            sstate: 'RUNNING',
            slastOrder: null,  // <--- CRÍTICO: Limpia la orden fantasma
            socc: 0
        };
        stateField = 'sstate';
    } else if (side === 'ai') {
        stateField = 'aistate';
        // AI specific cleanup to ensure a fresh cycle
        cleanData = {
            ailastEntryPrice: 0,
            aihighestPrice: 0,
            ainorder: 0,
            aistartTime: null
        };
    }
    
    if (finalConfig[side]) finalConfig[side].enabled = true;

    const update = {
        ...cleanData, 
        [stateField]: 'RUNNING',
        config: finalConfig,
        lastUpdate: new Date()
    };
    
    const bot = await Autobot.findOneAndUpdate({ userId }, { $set: update }, { new: true }).lean();
    
    // Log showing that real funds were verified even for AI
    orchestrator.log(`🚀 ${side.toUpperCase()} strategy validated (Real Funds) and started. ${analysis.report.netAvailable}`, 'success', userId);
    
    await orchestrator.slowBalanceCacheUpdate(userId); 
    return bot;
}

async function stopSide(userId, side) {
    const botState = await Autobot.findOne({ userId }).lean();
    if (!botState) throw new Error("Bot not found");

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
    orchestrator.log(`🛑 ${side.toUpperCase()} strategy stopped.`, 'warning', userId);
    return bot;
}

module.exports = { updateConfig, startSide, stopSide };