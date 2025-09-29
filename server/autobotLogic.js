// BSB/server/autobotLogic.js (CORREGIDO)

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/shortStrategy');
// Ya no necesitamos calculateLongCoverage/Short aquí, ya que server.js lo hace.

let io;

function setIo(socketIo) {
    io = socketIo;
}

function log(message, type = 'info') {
    if (io) {
        io.emit('bot-log', { message, type, timestamp: new Date().toISOString() });
    }
    console.log(`[BOT LOG]: ${message}`);
}

/**
 * CICLO DE ESTRATEGIA (DISPARO RÁPIDO): Recibe el precio en tiempo real del WebSocket.
 * SOLO debe ejecutar la lógica de trading (runLongStrategy, etc.).
 */
async function botCycle(currentPrice) {
    try {
        let botState = await Autobot.findOne({});
        if (!botState || currentPrice === 'N/A') {
            return;
        }
        
        // **ELIMINADAS LAS LLAMADAS LENTAS A BITMART SERVICE.getBalance()**

        // Nota: Los balances (availableUSDT/BTC) NO se actualizan en cada ciclo.
        // Se usarán los últimos balances disponibles (emitidos por balanceCycle) 
        // o se obtendrán al comienzo del ciclo de estrategia si es CRÍTICO. 
        // Vamos a REUTILIZAR los balances del ciclo LENTO para inyección de dependencias
        // para evitar llamadas innecesarias a la API.

        // Por ahora, asumiremos que los balances necesarios para la estrategia
        // deben ser recuperados si son CRÍTICOS (e.g., para placeFirstBuyOrder).
        // Para los estados de cobertura, usaremos la lógica actual del bot.
        
        // Recuperamos balances solo si es CRÍTICO para la estrategia (lo moveremos a balanceCycle)
        // Por ahora, para mantener la funcionalidad, simularemos balances estáticos o inyectados
        
        // **OPCIÓN TEMPORAL: Recuperar balances para inyección**
        const balancesArray = await bitmartService.getBalance({
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO
        });
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');

        const availableUSDT = parseFloat(usdtBalance?.available || 0);
        const availableBTC = parseFloat(btcBalance?.available || 0);

        const dependencies = {
            log,
            io,
            bitmartService,
            Autobot,
            currentPrice,
            availableUSDT, // Inyectado
            availableBTC, // Inyectado
            botState,
            bitmartCredentials: {
                apiKey: process.env.BITMART_API_KEY,
                secretKey: process.env.BITMART_SECRET_KEY,
                memo: process.env.BITMART_API_MEMO
            }
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        if (botState.lstate !== 'STOPPED') { // Solo corre la estrategia si está activa
            await runLongStrategy();
        }
        if (botState.sstate !== 'STOPPED') {
            // await runShortStrategy();
        }
    } catch (error) {
        log(`Error en el ciclo principal del bot: ${error.message}`, 'error');
    }
}


/**
 * CICLO DE BALANCES (DISPARO LENTO): Obtiene balances y los emite al frontend.
 */
async function balanceCycle() {
    try {
        const balancesArray = await bitmartService.getBalance({
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO
        });
        
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');

        if (!usdtBalance || !btcBalance) {
            log('No se pudieron obtener los balances de la cuenta.', 'error');
            return;
        }

        // Emitir al frontend para actualizar la UI
        io.emit('wallet-balances', {
            USDT: { available: parseFloat(usdtBalance.available), frozen: parseFloat(usdtBalance.frozen) },
            BTC: { available: parseFloat(btcBalance.available), frozen: parseFloat(btcBalance.frozen) }
        });

    } catch (error) {
        log(`Error en el ciclo de balances: ${error.message}`, 'error');
    }
}

// BSB/server/autobotLogic.js (RESTORE THE FOLLOWING FUNCTIONS)

/**
 * Función que actualiza únicamente el estado principal del bot (lstate/sstate).
 * @param {string} newState - El nuevo estado a establecer.
 * @param {string} strategy - 'long' o 'short'.
 */
async function updateBotState(newState, strategy) {
    try {
        const updateField = strategy === 'long' ? 'lstate' : 'sstate';
        await Autobot.findOneAndUpdate({}, { [updateField]: newState });
        log(`Estado de la estrategia ${strategy} actualizado a: ${newState}`, 'info');
    } catch (error) {
        log(`Error al actualizar el estado: ${error.message}`, 'error');
    }
}

/**
 * Función que actualiza únicamente los datos del ciclo Long (lStateData) en la base de datos.
 * @param {object} lStateData - El objeto lStateData actualizado con nuevos precios/montos.
 */
async function updateLStateData(lStateData) {
    try {
        await Autobot.findOneAndUpdate({}, { lStateData: lStateData });
        // No es necesario loguear en cada actualización de dato
    } catch (error) {
        log(`Error al guardar lStateData: ${error.message}`, 'error');
    }
}

async function start() {
    log('El bot se ha iniciado. El ciclo lo controla server.js', 'success');
}

async function stop() {
    log('El bot se ha detenido. El ciclo lo controla server.js', 'success');
}

// **AGREGA BALANCE CYCLE A LAS EXPORTACIONES**
module.exports = {
    setIo,
    start,
    stop,
    log,
    botCycle,        // Ciclo RÁPIDO (Estrategia)
    balanceCycle,    // Ciclo LENTO (Balances)
    updateBotState,
    updateLStateData
};