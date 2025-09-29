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
 * Realiza una validación de fondos en tiempo de ejecución antes de ejecutar la estrategia.
 */
async function botCycle(priceFromWebSocket) {
    try {
        let botState = await Autobot.findOne({});
        
        // 1. NORMALIZACIÓN DEL PRECIO
        const currentPrice = parseFloat(priceFromWebSocket); // Aseguramos que sea un número flotante

        // 2. Comprobación básica de estado y precio
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            if (priceFromWebSocket !== 'N/A') { 
                log(`Precio recibido no válido o botState no encontrado. Precio: ${priceFromWebSocket}`, 'warning');
            }
            return;
        }

        // --- INICIO DE LA VALIDACIÓN DE FONDOS EN TIEMPO DE EJECUCIÓN ---
        
        // 3. OBTENER SALDOS REALES DISPONIBLES EN BITMART
        const { availableUSDT, availableBTC } = await bitmartService.getAvailableTradingBalances();
        
        // Asignación de fondos según la configuración (asumo los mismos campos que en configRoutes.js)
        const assignedUSDT = parseFloat(botState.config.long.purchaseUsdt || 0);
        const assignedBTC = parseFloat(botState.config.short.purchaseBTC || 0);

        let longStrategyStopped = false;
        let shortStrategyStopped = false;

        // 4. VALIDACIÓN LONG (USDT)
        if (assignedUSDT > availableUSDT && botState.lstate !== 'STOPPED') {
            const msg = `CRÍTICO: Fondos de USDT insuficientes. Asignado: ${assignedUSDT.toFixed(2)}, Disponible Real: ${availableUSDT.toFixed(2)}. Deteniendo estrategia LONG.`;
            log(msg, 'error');
            
            // Detener la estrategia LONG y guardar el cambio
            await updateBotState({ lstate: 'STOPPED' });
            botState.lstate = 'STOPPED'; // Actualizar el estado local para este ciclo
            longStrategyStopped = true;
        }
        
        // 5. VALIDACIÓN SHORT (BTC)
        if (assignedBTC > availableBTC && botState.sstate !== 'STOPPED') {
            const msg = `CRÍTICO: Fondos de BTC insuficientes. Asignado: ${assignedBTC.toFixed(8)}, Disponible Real: ${availableBTC.toFixed(8)}. Deteniendo estrategia SHORT.`;
            log(msg, 'error');
            
            // Detener la estrategia SHORT y guardar el cambio
            await updateBotState({ sstate: 'STOPPED' });
            botState.sstate = 'STOPPED'; // Actualizar el estado local para este ciclo
            shortStrategyStopped = true;
        }

        if (longStrategyStopped || shortStrategyStopped) {
            // Si alguna estrategia fue detenida por falta de fondos, evitamos la ejecución del ciclo de trading por seguridad.
            return;
        }
        
        // --- FIN DE LA VALIDACIÓN DE FONDOS EN TIEMPO DE EJECUCIÓN ---

        // 6. Configurar las dependencias para la inyección
        const dependencies = {
            log,
            io,
            bitmartService,
            Autobot,
            currentPrice, 
            availableUSDT,  // Inyectamos el saldo real disponible
            availableBTC,   // Inyectamos el saldo real disponible
            botState,
            updateBotState, 
            updateLStateData,
            bitmartCredentials: {
                apiKey: process.env.BITMART_API_KEY,
                secretKey: process.env.BITMART_SECRET_KEY,
                memo: process.env.BITMART_API_MEMO
            }
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        // 7. Ejecutar estrategias (solo si el estado no fue forzado a STOPPED)
        if (botState.lstate !== 'STOPPED') {
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