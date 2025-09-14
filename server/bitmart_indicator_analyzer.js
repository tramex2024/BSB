// server/bitmart_indicator_analyzer.js

// Importa las librerías necesarias
const { RSI } = require('technicalindicators');
const fs = require('fs').promises; // Usamos fs.promises para operaciones asíncronas de archivo

const bitmartService = require('./services/bitmartService'); // Asegúrate de que la ruta sea correcta

// Define el par de trading
const SYMBOL = 'BTC_USDT'; // El par de trading que te interesa

// --- Configuración de Indicadores (Ajustables) ---
// Puedes ajustar estos valores según tus pruebas y backtesting.

const RSI_PERIOD = 21; // Usando 21 para velas de 1 minutos
const RSI_OVERSOLD = 30; // Umbral de Compra
const RSI_OVERBOUGHT = 70; // Nivel donde se considera "sobrecomprado" (para señales de venta)

/**
 * Obtiene datos de velas (ohlcv) de BitMart para un símbolo y período de tiempo dados,
 * utilizando tu `bitmartService.js` existente.
 *
 * @param {string} symbol - El par de trading (ej. "BTC_USDT").
 * @param {string} interval - El intervalo de las velas (ej. "1", "5", "60", "1D").
 * Debe coincidir con los valores esperados por BitMart V3 Klines API.
 * @param {number} size - El número de velas a obtener (máx. 500 para BitMart).
 * @returns {Promise<Array<Object>>} Un array de objetos de velas con 'open', 'high', 'low', 'close', 'volume' como números.
 */
async function getCandles(symbol, interval, size = 500) {
    console.log(`[ANALYZER] --- Obteniendo velas reales para ${symbol} en intervalo '${interval}' a través de bitmartService ---`);
    try {
        const rawCandlesData = await bitmartService.getKlines(symbol, interval, size);

        // --- LÍNEAS DE DEPURACIÓN (Mantenidas temporalmente para confirmar el formato) ---
        console.log(`[ANALYZER-DEBUG-RAW] Datos crudos de velas recibidos de bitmartService.getKlines. Longitud: ${rawCandlesData?.length}`);
        if (rawCandlesData && rawCandlesData.length > 0) {
            console.log(`[ANALYZER-DEBUG-RAW] Primer elemento de vela (rawCandlesData[0]):`, rawCandlesData[0]);
            console.log(`[ANALYZER-DEBUG-RAW] Tipo del primer elemento:`, typeof rawCandlesData[0]);
            if (rawCandlesData[0] && typeof rawCandlesData[0].close !== 'undefined') {
                console.log(`[ANALYZER-DEBUG-RAW] Valor del cierre (rawCandlesData[0].close):`, rawCandlesData[0].close);
                console.log(`[ANALYZER-DEBUG-RAW] Tipo del valor del cierre (rawCandlesData[0].close):`, typeof rawCandlesData[0].close);
            } else {
                console.log(`[ANALYZER-DEBUG-RAW] El primer elemento es un objeto, pero no tiene la propiedad 'close' o es undefined.`);
            }
        }
        // --- FIN DE LÍNEAS DE DEPURACIÓN ---

        if (!rawCandlesData || rawCandlesData.length === 0) {
            console.error("[ANALYZER] Tu bitmartService no devolvió datos de velas o los datos están vacíos.");
            return [];
        }

        // Simplemente aseguramos que los valores sean números, y filtramos cualquier objeto de vela que no tenga un 'close' válido.
        const formattedCandles = rawCandlesData.map(c => {
            if (c && typeof c.open === 'number' && typeof c.high === 'number' && typeof c.low === 'number' && typeof c.close === 'number' && typeof c.volume === 'number') {
                return c; // La vela ya está en el formato correcto y sus valores son números
            } else {
                console.warn(`[ANALYZER-DEBUG-WARN] Vela mal formada o con valores no numéricos encontrada:`, c);
                return null; // Devuelve null para filtrar más tarde
            }
        }).filter(c => c !== null); // Filtra cualquier vela mal formada

        console.log(`[ANALYZER] ✅ Velas para ${symbol} obtenidas con éxito (último cierre: ${formattedCandles[formattedCandles.length - 1]?.close?.toFixed(2) || 'N/A'}).`);
        return formattedCandles;

    } catch (error) {
        console.error(`[ANALYZER] ❌ Falló la obtención de velas para ${symbol} usando bitmartService.`);
        console.error('[ANALYZER] Error:', error.message);
        return [];
    }
}

/**
 * Calcula varios indicadores técnicos para los datos de velas.
 * Los datos de velas deben ser un array de objetos, donde cada objeto
 * tiene una propiedad 'close' con valores numéricos.
 *
 * @param {Array<Object>} candles - Un array de objetos de vela.
 * @returns {Array<Object>} Un nuevo array de velas con los indicadores calculados.
 */
function calculateIndicators(candles) {
    if (!candles || candles.length === 0) {
        console.warn("[ANALYZER] calculateIndicators: No hay datos de velas para calcular indicadores.");
        return [];
    }

    // Asegúrate de que los precios de cierre sean números
    const closePrices = candles.map(c => c.close);

    // LOG TEMPORAL: Mostrar precios de cierre que se usan para RSI
    console.log(`[ANALYZER-DEBUG] Precios de cierre para RSI (${closePrices.length} velas):`, closePrices.map(p => p.toFixed(2)).join(', '));

    // Validar que tenemos suficientes datos para cada indicador
    const requiredWarmUp = RSI_PERIOD; // Para RSI
    if (closePrices.length < requiredWarmUp + 1) { // Necesitamos al menos el periodo + 1 para tener un RSI válido y previo
        console.warn(`[ANALYZER] calculateIndicators: Se necesitan al menos ${requiredWarmUp + 1} velas para calcular RSI y realizar el análisis de cruces. Solo se tienen ${closePrices.length}.`);
        return [];
    }

    const rsiValues = RSI.calculate({ values: closePrices, period: RSI_PERIOD });
    // El RSI tiene un "warm-up period", lo que significa que las primeras (RSI_PERIOD - 1) velas no tendrán un valor de RSI.
    // Necesitamos alinear los valores de RSI con sus velas correspondientes.
    const rsiOffset = closePrices.length - rsiValues.length;

    const candlesWithIndicators = [];
    for (let i = rsiOffset; i < candles.length; i++) {
        const candle = { ...candles[i] }; // Copia la vela original
        const rsiActualIndex = i - rsiOffset;
        candle.rsi = rsiValues[rsiActualIndex];
        candlesWithIndicators.push(candle);
    }

    console.log(`[ANALYZER-DEBUG] calculateIndicators produjo ${candlesWithIndicators.length} velas con indicadores.`);
    return candlesWithIndicators;
}

/**
 * Determina un punto de entrada potencial basado en los indicadores.
 *
 * @param {Array<Object>} candlesWithIndicators - Array de velas con indicadores calculados (ya sin la vela actual incompleta).
 * @param {number} currentPrice - El precio actual del activo, recibido de autobotLogic (ticker actual).
 * @param {string} symbol - El símbolo del par de trading (ej. "BTC_USDT").
 * @returns {Object} Un objeto que describe el punto de entrada (acción, precio, razón).
 */
function determineEntryPoint(candlesWithIndicators, currentPrice, symbol = SYMBOL) {
    if (!candlesWithIndicators || candlesWithIndicators.length < 2) {
        const result = { action: "BUY", symbol: symbol, reason: "No hay suficientes datos de velas completas con RSI para determinar punto de entrada." };
        console.log(`[ANALYZER-SEÑAL] ${result.action} - ${result.reason}`);
        return result;
    }

    // `candlesWithIndicators` ya contiene velas COMPLETAS y sus RSIs.
    // `lastCompleteCandleRSI` es el RSI de la última vela cerrada y completa.
    // `prevCompleteCandleRSI` es el RSI de la vela anterior a la última completa.
    const lastCompleteCandle = candlesWithIndicators[candlesWithIndicators.length - 1];
    const prevCompleteCandle = candlesWithIndicators[candlesWithIndicators.length - 2];

    const prevCompleteCandleRSI = prevCompleteCandle ? prevCompleteCandle.rsi : NaN;
    const lastCompleteCandleRSI = lastCompleteCandle ? lastCompleteCandle.rsi : NaN;

    // Calculamos un "RSI actual" usando el `currentPrice`.
    // Esto se hace sobre la base de todos los cierres anteriores MÁS el precio actual.
    const allClosePricesIncludingCurrent = candlesWithIndicators.map(c => c.close);
    allClosePricesIncludingCurrent.push(currentPrice); // Añade el precio actual como la última "vela" para este cálculo de RSI

    const latestRsiValuesWithCurrentPrice = RSI.calculate({ values: allClosePricesIncludingCurrent, period: RSI_PERIOD });
    const currentRSI = latestRsiValuesWithCurrentPrice[latestRsiValuesWithCurrentPrice.length - 1]; // Este es el RSI más actual considerando currentPrice

    if (isNaN(prevCompleteCandleRSI) || isNaN(lastCompleteCandleRSI) || isNaN(currentRSI)) {
        const result = { action: "BUY", symbol: symbol, reason: `RSI no calculado o inválido para las últimas velas o precio actual. Prev Complete RSI: ${prevCompleteCandleRSI}, Last Complete RSI: ${lastCompleteCandleRSI}, Current Price RSI: ${currentRSI}.` };
        console.log(`[ANALYZER-SEÑAL] ${result.action} - ${result.reason}`);
        return result;
    }

    console.log(`[ANALYZER-DEBUG] Analizando señales - RSI Vela Anterior Completa: ${prevCompleteCandleRSI.toFixed(2)}, RSI Última Vela Completa: ${lastCompleteCandleRSI.toFixed(2)}, RSI (con Precio Actual): ${currentRSI.toFixed(2)}`);
    console.log(`[ANALYZER-DEBUG] Umbral de Compra (RSI_OVERSOLD): ${RSI_OVERSOLD}`);


    // --- Lógica de COMPRA (Refinada) ---
    let buySignalDetected = false;
    let buyReason = [];

    // Estrategia 1 de Compra: RSI cruzando la zona de sobreventa al alza
    // Si el RSI de la última vela completa estaba por debajo o igual al umbral de sobreventa,
    // Y el RSI con el precio actual cruzó por encima del umbral de sobreventa.
    if (lastCompleteCandleRSI <= RSI_OVERSOLD && currentRSI > RSI_OVERSOLD) {
        buySignalDetected = true;
        buyReason.push(`RSI (con precio actual) cruzó ${RSI_OVERSOLD} al alza desde la última vela completa (${lastCompleteCandleRSI.toFixed(2)} -> ${currentRSI.toFixed(2)})`);
        console.log(`[ANALYZER-DEBUG] ✅ Condición de COMPRA (RSI cruzó oversold al alza) detectada.`);
    }
    // Estrategia 2 de Compra: RSI en zona de sobreventa y empezando a subir
    // Si el RSI con el precio actual está por debajo del umbral de sobreventa,
    // Y el RSI con el precio actual es mayor que el RSI de la última vela completa.
    else if (currentRSI < RSI_OVERSOLD && currentRSI > lastCompleteCandleRSI) {
        buySignalDetected = true;
        buyReason.push(`RSI (con precio actual) en sobreventa (${currentRSI.toFixed(2)}) y subiendo desde el RSI de la última vela completa (${lastCompleteCandleRSI.toFixed(2)})`);
        console.log(`[ANALYZER-DEBUG] ✅ Condición de COMPRA (RSI en oversold y subiendo) detectada.`);
    }

    if (buySignalDetected) {
        const result = {
            action: "BUY",
            symbol: symbol,
            entryPrice: currentPrice, // Usar el currentPrice real recibido de autobotLogic
            timestamp: new Date().toISOString(),
            reason: `Señal de COMPRA: ${buyReason.join('. ')}. Precio actual: ${currentPrice}`
        };
        console.log(`[ANALYZER-SEÑAL] ${result.action} - ${result.reason}`);
        return result;
    }

    // --- Lógica de VENTA ---
    let sellSignalDetected = false;
    let sellReason = [];

    // Estrategia 1 de Venta: RSI cruzando la zona de sobrecompra a la baja
    if (lastCompleteCandleRSI >= RSI_OVERBOUGHT && currentRSI < RSI_OVERBOUGHT) {
        sellSignalDetected = true;
        sellReason.push(`RSI (con precio actual) cruzó ${RSI_OVERBOUGHT} a la baja desde la última vela completa (${lastCompleteCandleRSI.toFixed(2)} -> ${currentRSI.toFixed(2)})`);
        console.log(`[ANALYZER-DEBUG] ✅ Condición de VENTA (RSI cruzó overbought a la baja) detectada.`);
    }
    // Estrategia 2 de Venta: RSI en zona de sobrecompra y empezando a bajar
    else if (currentRSI > RSI_OVERBOUGHT && currentRSI < lastCompleteCandleRSI) {
        sellSignalDetected = true;
        sellReason.push(`RSI (con precio actual) en sobrecompra (${currentRSI.toFixed(2)}) y bajando desde el RSI de la última vela completa (${lastCompleteCandleRSI.toFixed(2)})`);
        console.log(`[ANALYZER-DEBUG] ✅ Condición de VENTA (RSI en overbought y bajando) detectada.`);
    }

    if (sellSignalDetected) {
        const result = { action: "SELL", symbol: symbol, reason: sellReason.join('. ') };
        console.log(`[ANALYZER-SEÑAL] ${result.action} - ${result.reason}`);
        return result;
    }

    // Si no se detecta ninguna señal clara de COMPRA o VENTA, la acción por defecto es ESPERA
    const result = { action: "BUY", symbol: symbol, reason: "No se encontraron señales de entrada o salida claras en este momento." };
    console.log(`[ANALYZER-SEÑAL] ${result.action} - ${result.reason}`);
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
        console.log(`[ANALYZER-FILE] Punto de entrada escrito en '${filename}'`);
    } catch (error) {
        console.error(`[ANALYZER-FILE] Error al escribir el archivo '${filename}':`, error);
    }
}

// --- FUNCIÓN PRINCIPAL PARA EJECUTAR EL ANÁLISIS ---
// Esta es la única función 'runAnalysis' que debe ser exportada y llamada por autobotLogic.
async function runAnalysis(currentPriceFromBotLogic) { // Acepta el currentPrice de autobotLogic
    console.log(`\n[ANALYZER] --- Iniciando análisis para ${SYMBOL}. Precio actual recibido: ${currentPriceFromBotLogic?.toFixed(2) || 'N/A'} ---`);

    // Paso 1: Obtener las velas de BitMart
    // Se solicitan 500 velas para asegurar que haya suficientes datos para el RSI,
    // incluso después de descartar la última incompleta y el período de calentamiento del RSI.
    const rawCandlesFromAPI = await getCandles(SYMBOL, '1', 500);

    console.log(`[ANALYZER-DEBUG] Se obtuvieron ${rawCandlesFromAPI.length} velas de la API.`);

    if (rawCandlesFromAPI.length === 0) {
        console.error("[ANALYZER] No se pudieron obtener velas para el análisis. Devolviendo HOLD.");
        const signal = { action: "BUY", symbol: SYMBOL, reason: "No se obtuvieron datos de velas para el análisis." };
        console.log("\n[ANALYZER] --- Señal de Trading Generada ---");
        console.log(signal);
        await writeEntryPointToFile(signal);
        return signal;
    }

    // Cortar la última vela de la API porque podría estar incompleta
    // y para asegurar que el `currentPriceFromBotLogic` sea el dato más fresco.
    const candlesForAnalysis = rawCandlesFromAPI.slice(0, -1);

    console.log(`[ANALYZER-DEBUG] Se usarán ${candlesForAnalysis.length} velas para el cálculo de indicadores (última vela de la API ignorada para seguridad).`);

    // Paso 2: Calcular los indicadores técnicos
    const candlesWithIndicators = calculateIndicators(candlesForAnalysis);

    // DEBUG: Muestra las últimas velas con sus indicadores calculados
    console.log("\n[ANALYZER-DEBUG] Últimas velas completas con indicadores (hasta 5):");
    if (candlesWithIndicators.length > 0) {
        candlesWithIndicators.slice(-5).forEach(candle => {
            console.log(`[ANALYZER-DEBUG]    Cierre: ${parseFloat(candle.close).toFixed(2)}, RSI: ${candle.rsi?.toFixed(2) || 'N/A'}`);
        });
    } else {
        console.warn("[ANALYZER-DEBUG] No hay velas completas con indicadores para mostrar. Esto puede ocurrir si no hay suficientes datos para el RSI.");
        const signal = { action: "BUY", symbol: SYMBOL, reason: "No hay suficientes velas con todos los indicadores calculados para determinar una señal clara." };
        console.log("\n[ANALYZER] --- Señal de Trading Generada ---");
        console.log(signal);
        await writeEntryPointToFile(signal);
        return signal;
    }

    // Paso 3: Determinar el punto de entrada.
    // Pasa el `currentPriceFromBotLogic` a la función `determineEntryPoint`
    const signal = determineEntryPoint(candlesWithIndicators, currentPriceFromBotLogic, SYMBOL);

    console.log("\n[ANALYZER] --- Señal de Trading Generada ---");
    console.log(signal);

    // Paso 4: Guardar la señal en un archivo
    await writeEntryPointToFile(signal);

    return signal;
}

// Exportar la función principal para que pueda ser llamada desde otro script (autobotLogic.js)
module.exports = {
    runAnalysis
};