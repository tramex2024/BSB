// server/bitmart_indicator_analyzer.js

// Importa las librerías necesarias
const { RSI } = require('technicalindicators');
const fs = require('fs').promises; // Usamos fs.promises para operaciones asíncronas de archivo

const bitmartService = require('./services/bitmartService');

// Define el par de trading
const SYMBOL = 'BTC_USDT'; // El par de trading que te interesa

// --- Configuración de Indicadores (Ajustables) ---
// Puedes ajustar estos valores según tus pruebas y backtesting.

const RSI_PERIOD = 14;
const RSI_OVERSOLD = 30; // Nivel donde se considera "sobrevendido"
const RSI_OVERBOUGHT = 70; // Nivel donde se considera "sobrecomprado"

/**
 * Obtiene datos de velas (ohlcv) de BitMart para un símbolo y período de tiempo dados,
 * utilizando tu `bitmartService.js` existente.
 *
 * @param {string} symbol - El par de trading (ej. "BTC_USDT").
 * @param {string} interval - El intervalo de las velas (ej. "1", "5", "60", "1D").
 * Debe coincidir con los valores esperados por BitMart V3 Klines API.
 * @param {number} size - El número de velas a obtener (máx. 500 para BitMart).
 * @returns {Promise<Array<Object>>} Un array de objetos de velas.
 */
async function getCandles(symbol, interval, size = 500) {
    console.log(`--- Obteniendo velas reales para ${symbol} en intervalo '${interval}' a través de bitmartService ---`);
    try {
        const candlesData = await bitmartService.getKlines(symbol, interval, size);

        if (!candlesData || candlesData.length === 0) {
            console.error("Tu bitmartService no devolvió datos de velas o los datos están vacíos.");
            return [];
        }

        console.log(`✅ Velas para ${symbol} obtenidas con éxito (último cierre: ${candlesData[candlesData.length - 1]?.close || 'N/A'}).`);
        return candlesData;

    } catch (error) {
        console.error(`❌ Falló la obtención de velas para ${symbol} usando bitmartService.`);
        console.error('Error:', error.message);
        return [];
    }
}

/**
 * Calcula varios indicadores técnicos para los datos de velas.
 * Los datos de velas deben ser un array de objetos, donde cada objeto
 * tiene una propiedad 'close' (y opcionalmente 'open', 'high', 'low', 'volume')
 * con valores numéricos (o strings parseables a número).
 *
 * @param {Array<Object>} candles - Un array de objetos de vela.
 * @returns {Array<Object>} Un nuevo array de velas con los indicadores calculados.
 */
function calculateIndicators(candles) {
    if (!candles || candles.length === 0) {
        console.warn("calculateIndicators: No hay datos de velas para calcular indicadores.");
        return [];
    }

    // Asegúrate de que los precios de cierre sean números
    const closePrices = candles.map(c => parseFloat(c.close));

    // Validar que tenemos suficientes datos para cada indicador
    const requiredWarmUp = RSI_PERIOD; // Para RSI
    if (closePrices.length < requiredWarmUp) {
        console.warn(`calculateIndicators: Se necesitan al menos ${requiredWarmUp} velas para calcular RSI. Solo se tienen ${closePrices.length}.`);
        return [];
    }

    const rsiValues = RSI.calculate({ values: closePrices, period: RSI_PERIOD });
    const rsiOffset = closePrices.length - rsiValues.length; // Número de valores iniciales indefinidos

    const candlesWithIndicators = [];
    for (let i = rsiOffset; i < candles.length; i++) { // Inicia desde el offset del RSI
        const candle = { ...candles[i] }; // Copia la vela original
        const rsiActualIndex = i - rsiOffset;
        candle.rsi = rsiValues[rsiActualIndex];
        candlesWithIndicators.push(candle);
    }

    console.log(`DEBUG: calculateIndicators produjo ${candlesWithIndicators.length} velas con indicadores.`);
    return candlesWithIndicators;
}

/**
 * Determina un punto de entrada potencial basado en los indicadores.
 * Esta lógica es el corazón de tu estrategia y DEBE ser refinada,
 * backtesteada y optimizada para tus necesidades.
 *
 * @param {Array<Object>} candlesWithIndicators - Array de velas con indicadores calculados.
 * @param {string} symbol - El símbolo del par de trading (ej. "BTC_USDT").
 * @returns {Object} Un objeto que describe el punto de entrada (acción, precio, razón).
 */
function determineEntryPoint(candlesWithIndicators, symbol = SYMBOL) {
    // Necesitamos al menos dos velas completas con indicadores para un análisis de cruces o tendencias recientes.
    if (!candlesWithIndicators || candlesWithIndicators.length < 2) {
        const result = { action: "ESPERA", symbol: symbol, reason: "No hay suficientes datos de velas para determinar punto de entrada (necesita al menos 2 velas completas con indicadores)." };
        console.log(`[SEÑAL] ${result.action} - ${result.reason}`);
        return result;
    }

    const lastCandle = candlesWithIndicators[candlesWithIndicators.length - 1];
    const prevCandle = candlesWithIndicators[candlesWithIndicators.length - 2];

    if (lastCandle.rsi === undefined || prevCandle.rsi === undefined) {
        const result = { action: "ESPERA", symbol: symbol, reason: "ERROR INTERNO: RSI no calculado para las últimas velas." };
        console.log(`[SEÑAL] ${result.action} - ${result.reason}`);
        return result;
    }

    // --- Lógica de Compra Simplificada y Más Directa ---
    let buySignalDetected = false;
    let buyReason = [];

    // Estrategia 1: RSI cruzando la zona de sobreventa al alza
    // Si la vela anterior estaba en sobreventa o tocando el límite, y la actual está por encima
    if (prevCandle.rsi <= RSI_OVERSOLD && lastCandle.rsi > RSI_OVERSOLD) {
        buySignalDetected = true;
        buyReason.push(`RSI cruzó ${RSI_OVERSOLD} al alza (${prevCandle.rsi.toFixed(2)} -> ${lastCandle.rsi.toFixed(2)})`);
    }
    // Estrategia 2: RSI en zona de sobreventa y empezando a subir (señal de reversión)
    else if (lastCandle.rsi < RSI_OVERSOLD && lastCandle.rsi > prevCandle.rsi) {
        buySignalDetected = true;
        buyReason.push(`RSI en sobreventa (${lastCandle.rsi.toFixed(2)}) y subiendo desde ${prevCandle.rsi.toFixed(2)}`);
    }

    if (buySignalDetected) {
        const result = {
            action: "COMPRA",
            symbol: symbol,
            entryPrice: parseFloat(lastCandle.close), // Precio de cierre de la vela que generó la señal
            timestamp: new Date().toISOString(),
            reason: `Señal de COMPRA: ${buyReason.join('. ')}. Precio de cierre de la vela: ${lastCandle.close}`
        };
        console.log(`[SEÑAL] ${result.action} - ${result.reason}`);
        return result;
    }

    // --- Lógica de Venta (Puedes expandirla si el bot no gestiona la venta con el trigger) ---
    // NOTA: Tu autobotLogic ya maneja la lógica de venta por "triggerPercentage" de forma global.
    // Esta sección aquí sería para una estrategia de venta basada puramente en indicadores,
    // que podría coexistir o ser secundaria a tu lógica de trigger.
    let sellSignalDetected = false;
    let sellReason = [];

    // Estrategia 1: RSI cruzando la zona de sobrecompra a la baja
    if (prevCandle.rsi >= RSI_OVERBOUGHT && lastCandle.rsi < RSI_OVERBOUGHT) {
        sellSignalDetected = true;
        sellReason.push(`RSI cruzó ${RSI_OVERBOUGHT} a la baja (${prevCandle.rsi.toFixed(2)} -> ${lastCandle.rsi.toFixed(2)})`);
    }
    // Estrategia 2: RSI en zona de sobrecompra y empezando a bajar
    else if (lastCandle.rsi > RSI_OVERBOUGHT && lastCandle.rsi < prevCandle.rsi) {
        sellSignalDetected = true;
        sellReason.push(`RSI en sobrecompra (${lastCandle.rsi.toFixed(2)}) y bajando desde ${prevCandle.rsi.toFixed(2)}`);
    }

    if (sellSignalDetected) {
        // En tu caso, la venta la maneja 'autobotLogic' con el trigger.
        // Podrías devolver 'ESPERA' incluso si hay señal de VENTA aquí,
        // o podrías usar esto como una señal de 'alerta' para el bot si lo deseas.
        // Por ahora, para no interferir con la lógica de venta del autobot,
        // si no hay señal de COMPRA, devolvemos 'ESPERA'.
        console.log(`[SEÑAL] DETECTADA SEÑAL DE VENTA POR INDICADOR (RSI: ${lastCandle.rsi.toFixed(2)}). El bot usa TRIGER para vender. Acción: ESPERA.`);
        return { action: "ESPERA", symbol: symbol, reason: sellReason.join('. ') + " (Señal de venta por indicador, bot prioriza Trigger para venta)." };
    }

    // Si no se detecta ninguna señal clara de compra o venta (según las reglas de compra/venta definidas aquí)
    const result = { action: "ESPERA", symbol: symbol, reason: "No se encontraron señales de entrada o salida claras en este momento." };
    console.log(`[SEÑAL] ${result.action} - ${result.reason}`);
    return result;
}

/**
 * Escribe el punto de entrada detectado en un archivo JSON.
 *
 * @param {Object} entryPointData - El objeto con los datos del punto de entrada.
 * @param {string} filename - El nombre del archivo donde se guardará.
 */
async function writeEntryPointToFile(entryPointData, filename = "bitmart_entry_point.json") {
    try {
        await fs.writeFile(filename, JSON.stringify(entryPointData, null, 4), 'utf8');
        console.log(`[Archivo] Punto de entrada escrito en '${filename}'`);
    } catch (error) {
        console.error(`[Archivo] Error al escribir el archivo '${filename}':`, error);
    }
}

// --- FUNCIÓN PRINCIPAL PARA EJECUTAR EL ANÁLISIS ---
// Esta función es la que vas a ejecutar para obtener la señal.
async function runAnalysis() {
    console.log(`\n--- Iniciando análisis para ${SYMBOL} ---`);

    // Paso 1: Obtener las velas de BitMart
    // Pedimos 500 velas para asegurarnos de tener suficientes datos para el cálculo del RSI.
    // Intervalo '1' significa velas de 1 minuto.
    const rawCandlesFromAPI = await getCandles(SYMBOL, '1', 500);

    console.log(`DEBUG: Se obtuvieron ${rawCandlesFromAPI.length} velas de la API.`);

    if (rawCandlesFromAPI.length === 0) {
        console.error("No se pudieron obtener velas para el análisis. Deteniendo.");
        return { action: "ERROR", symbol: SYMBOL, reason: "No se obtuvieron datos de velas." };
    }

    // Cortar la última vela de la API porque podría estar incompleta
    const candlesForAnalysis = rawCandlesFromAPI.slice(0, -1);

    console.log(`DEBUG: Se usarán ${candlesForAnalysis.length} velas para el cálculo de indicadores (última vela de la API ignorada para seguridad).`);

    // Paso 2: Calcular los indicadores técnicos
    const candlesWithIndicators = calculateIndicators(candlesForAnalysis);

    // DEBUG: Muestra las últimas 5 velas con sus indicadores calculados
    console.log("\nDEBUG: Últimas 5 velas (con indicadores completos):");
    if (candlesWithIndicators.length > 0) {
        candlesWithIndicators.slice(-5).forEach(candle => {
            console.log(`Cierre: ${candle.close}, RSI: ${candle.rsi?.toFixed(2) || 'N/A'}`);
        });
    }

    // Paso 3: Determinar el punto de entrada.
    // Aseguramos que tenemos al menos 2 velas para el análisis después del cálculo de indicadores.
    // Esto es crucial para la lógica de cruces (prevCandle y lastCandle).
    if (candlesWithIndicators.length < 2) {
        const signal = { action: "ESPERA", symbol: SYMBOL, reason: "No hay suficientes velas con todos los indicadores calculados para determinar una señal clara." };
        console.log("\n--- Señal de Trading Generada ---");
        console.log(signal);
        await writeEntryPointToFile(signal);
        return signal;
    }

    const signal = determineEntryPoint(candlesWithIndicators, SYMBOL);

    console.log("\n--- Señal de Trading Generada ---");
    console.log(signal);

    // Paso 4: Guardar la señal en un archivo
    await writeEntryPointToFile(signal);

    return signal;
}

// --- LÓGICA PARA EJECUTAR EL ARCHIVO DIRECTAMENTE ---
// Esto permite que puedas ejecutar este archivo con `node bitmart_indicator_analyzer.js`
// y ver la señal directamente en la consola y en el archivo JSON.
if (require.main === module) {
    // Si estás ejecutando este archivo directamente
    runAnalysis().catch(error => {
        console.error("Error al ejecutar el análisis:", error);
    });
}

// Exportar la función principal para que pueda ser llamada desde otro script (autobotLogic.js)
module.exports = {
    runAnalysis
};