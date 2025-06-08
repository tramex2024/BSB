// bitmart_indicator_analyzer.js

// Importa las librerías necesarias
const { RSI } = require('technicalindicators');
const fs = require('fs').promises; // Usamos fs.promises para operaciones asíncronas de archivo

const bitmartService = require('./services/bitmartService');

// Define el par de trading
const SYMBOL = 'BTC_USDT'; // El par de trading que te interesa

// --- Configuración de Indicadores (Ajustables) ---
// Puedes ajustar estos valores según tus pruebas y backtesting.

const RSI_PERIOD = 14;
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;

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
        // Llama directamente a la función getKlines de tu bitmartService
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
        // Si el error es debido a las claves API, esto ya debería ser manejado por bitmartService
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
    const requiredWarmUp = Math.max(RSI_PERIOD); // Solo RSI
    if (closePrices.length < requiredWarmUp) {
        console.warn(`calculateIndicators: Se necesitan al menos ${requiredWarmUp} velas para calcular todos los indicadores. Solo se tienen ${closePrices.length}.`);
        return []; // Retornar vacío si no hay suficientes datos para cálculo completo
    }

    const rsiValues = RSI.calculate({ values: closePrices, period: RSI_PERIOD });
    const rsiOffset = closePrices.length - rsiValues.length; // Número de valores iniciales indefinidos

    const maxOffset = Math.max(rsiOffset);

    const candlesWithIndicators = [];
    for (let i = maxOffset; i < candles.length; i++) {
        const candle = { ...candles[i] }; // Copia la vela original

        const rsiActualIndex = i - rsiOffset;

        candle.rsi = rsiValues[rsiActualIndex];

        candlesWithIndicators.push(candle);
    }

    console.log(`DEBUG: calculateIndicators produjo ${candlesWithIndicators.length} velas con todos los indicadores.`);
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
    // CORRECCIÓN: Aseguramos que tenemos al menos 2 velas para el análisis
    if (!candlesWithIndicators || candlesWithIndicators.length < 2) {
        const result = { action: "ESPERA", symbol: symbol, reason: "No hay suficientes datos de velas para determinar punto de entrada (necesita al menos 2)." };
        console.log(`[SEÑAL] ${result.action} - ${result.reason}`); // Log para ver en terminal
        return result;
    }

    const lastCandle = candlesWithIndicators[candlesWithIndicators.length - 1];
    const prevCandle = candlesWithIndicators[candlesWithIndicators.length - 2];

    // Esta comprobación de seguridad debería fallar raramente si calculateIndicators es correcto
    if ([lastCandle, prevCandle].some(c => c.rsi === undefined)) {
        const result = { action: "ESPERA", symbol: symbol, reason: "ERROR INTERNO: Indicadores inesperadamente no calculados para las últimas velas." };
        console.log(`[SEÑAL] ${result.action} - ${result.reason}`); // Log para ver en terminal
        return result;
    }

    // --- Lógica de Compra ---
    let buySignals = {
        rsi: false,
    };

    // Señal RSI: Subiendo desde sobreventa o cruzando al alza desde sobreventa
    if (lastCandle.rsi < RSI_OVERSOLD && lastCandle.rsi > prevCandle.rsi) {
        buySignals.rsi = true;
    } else if (prevCandle.rsi <= RSI_OVERSOLD && lastCandle.rsi > RSI_OVERSOLD) {
        buySignals.rsi = true;
    }

    const activeBuySignalsCount = Object.values(buySignals).filter(s => s).length;
    if (activeBuySignalsCount === 1) { // ¡CORREGIDO: Usando '===' para comparación!
        const result = {
            action: "COMPRA",
            symbol: symbol,
            entryPrice: parseFloat(lastCandle.close),
            timestamp: new Date().toISOString(),
            reason: `Señales de COMPRA: ${Object.keys(buySignals).filter(key => buySignals[key]).join(', ')}. Precio actual: ${lastCandle.close}`
        };
        console.log(`[SEÑAL] ${result.action} - ${result.reason}`); // Log para ver en terminal
        return result;
    }

    // --- Lógica de Venta/Salida (puedes expandirla con más señales) ---
    let sellSignals = {
        rsi: false,
    };

    // Señal RSI: Bajando desde sobrecompra o cruzando a la baja desde sobrecompra
    if (lastCandle.rsi > RSI_OVERBOUGHT && lastCandle.rsi < prevCandle.rsi) {
        sellSignals.rsi = true;
    } else if (prevCandle.rsi >= RSI_OVERBOUGHT && lastCandle.rsi < RSI_OVERBOUGHT) {
        sellSignals.rsi = true;
    }

    // Si no se detecta ninguna señal clara de compra o venta
    const result = { action: "ESPERA", symbol: symbol, reason: "No se encontraron señales de entrada o salida claras." };
    console.log(`[SEÑAL] ${result.action} - ${result.reason}`); // Log para ver en terminal
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
    // Pedimos 500 velas para asegurarnos de tener suficientes datos para el cálculo.
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
    // Aseguramos que tenemos al menos 2 velas para el análisis después del cálculo de indicadores
    if (candlesWithIndicators.length < 2) {
        const signal = { action: "ESPERA", symbol: SYMBOL, reason: "No hay suficientes velas con todos los indicadores calculados para determinar una señal." };
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