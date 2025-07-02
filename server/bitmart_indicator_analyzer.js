// server/bitmart_indicator_analyzer.js

// Importa las librerías necesarias
const { RSI } = require('technicalindicators');
const fs = require('fs').promises; // Usamos fs.promises para operaciones asíncronas de archivo

const bitmartService = require('./services/bitmartService');

// Define el par de trading
const SYMBOL = 'BTC_USDT'; // El par de trading que te interesa

// --- Configuración de Indicadores (Ajustables) ---
// Puedes ajustar estos valores según tus pruebas y backtesting.

const RSI_PERIOD = 21; // Usando 21 para velas de 5 minutos
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
    console.log(`[ANALYZER] --- Obteniendo velas reales para ${symbol} en intervalo '${interval}' a través de bitmartService ---`);
    try {
        const candlesData = await bitmartService.getKlines(symbol, interval, size);

        if (!candlesData || candlesData.length === 0) {
            console.error("[ANALYZER] Tu bitmartService no devolvió datos de velas o los datos están vacíos.");
            return [];
        }

        console.log(`[ANALYZER] ✅ Velas para ${symbol} obtenidas con éxito (último cierre: ${candlesData[candlesData.length - 1]?.close || 'N/A'}).`);
        // Asegúrate de que las propiedades de la vela sean numéricas para el cálculo de indicadores.
        return candlesData.map(c => ({
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseFloat(c.volume),
            timestamp: c.timestamp // Mantén el timestamp si lo necesitas
        }));

    } catch (error) {
        console.error(`[ANALYZER] ❌ Falló la obtención de velas para ${symbol} usando bitmartService.`);
        console.error('[ANALYZER] Error:', error.message);
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
        console.warn("[ANALYZER] calculateIndicators: No hay datos de velas para calcular indicadores.");
        return [];
    }

    // Asegúrate de que los precios de cierre sean números
    const closePrices = candles.map(c => c.close); // Ya deberían ser números si vienen de getCandles corregido.

    // LOG TEMPORAL: Mostrar precios de cierre que se usan para RSI
    console.log(`[ANALYZER-DEBUG] Precios de cierre para RSI (${closePrices.length} velas):`, closePrices.map(p => p.toFixed(2)).join(', '));


    // Validar que tenemos suficientes datos para cada indicador
    const requiredWarmUp = RSI_PERIOD; // Para RSI
    // Necesitas al menos (periodo + 1) velas para calcular el RSI y tener un 'prevCandle'
    if (closePrices.length < requiredWarmUp + 1) { 
        console.warn(`[ANALYZER] calculateIndicators: Se necesitan al menos ${requiredWarmUp + 1} velas para calcular RSI y realizar el análisis de cruces. Solo se tienen ${closePrices.length}.`);
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

    console.log(`[ANALYZER-DEBUG] calculateIndicators produjo ${candlesWithIndicators.length} velas con indicadores.`);
    return candlesWithIndicators;
}

/**
 * Determina un punto de entrada potencial basado en los indicadores.
 * Esta lógica es el corazón de tu estrategia y DEBE ser refinada,
 * backtesteada y optimizada para tus necesidades.
 *
 * @param {Array<Object>} candlesWithIndicators - Array de velas con indicadores calculados.
 * @param {number} currentPrice - El precio actual del activo, recibido de autobotLogic.
 * @param {string} symbol - El símbolo del par de trading (ej. "BTC_USDT").
 * @returns {Object} Un objeto que describe el punto de entrada (acción, precio, razón).
 */
function determineEntryPoint(candlesWithIndicators, currentPrice, symbol = SYMBOL) {
    // Si no tenemos velas con indicadores, o no son suficientes para un análisis significativo
    if (!candlesWithIndicators || candlesWithIndicators.length < 1) {
        const result = { action: "ESPERA", symbol: symbol, reason: "No hay suficientes datos de velas para determinar punto de entrada después del cálculo de indicadores." };
        console.log(`[ANALYZER-SEÑAL] ${result.action} - ${result.reason}`);
        return result;
    }

    let lastCandle = candlesWithIndicators[candlesWithIndicators.length - 1];
    let prevCandle = candlesWithIndicators[candlesWithIndicators.length - 2];

    // **IMPORTANTE:** Si el `currentPrice` es más reciente que el cierre de la última vela,
    // o si solo tenemos una vela calculada, usamos `currentPrice` como el dato más actual.
    // Esto es crucial para un análisis en tiempo real.
    // Creamos una "vela virtual" con el currentPrice para el análisis más reciente.
    if (!lastCandle || currentPrice > lastCandle.close) { // Si el precio actual es más alto o si no tenemos una última vela
        // Si no hay prevCandle (menos de 2 velas después del warmup), o si la última vela está incompleta
        // y el currentPrice es significativamente diferente, podemos ajustar.
        // Por simplicidad, si lastCandle es nula, o prevCandle es nula, o el currentPrice es mucho más reciente,
        // asumimos que currentPrice es el dato más fresco para una "vela actual".
        
        // Si no tenemos una vela anterior para comparar el RSI, no podemos hacer un cruce.
        if (!prevCandle || isNaN(prevCandle.rsi)) {
            const result = { action: "ESPERA", symbol: symbol, reason: `No hay suficientes velas completas con RSI para análisis de tendencias (solo ${candlesWithIndicators.length} velas con indicadores, ${prevCandle ? 'RSI previo: ' + prevCandle.rsi : 'no hay vela previa'}).` };
            console.log(`[ANALYZER-SEÑAL] ${result.action} - ${result.reason}`);
            return result;
        }

        // Si tenemos un prevCandle válido y currentPrice disponible,
        // calculamos un RSI "actual" basado en el currentPrice y el historial.
        // Esto es un poco hacky para un RSI preciso, pero nos da un valor de referencia.
        // Para un RSI preciso, necesitarías alimentar el `currentPrice` a la serie de `closePrices` y recalcular el RSI completo.
        // Por ahora, usaremos el RSI de la `lastCandle` disponible si no es nulo.

        // Si currentPrice es significativamente diferente, podríamos considerar esto como un movimiento en la última "no-vela"
        // Para simplificar, si no hay lastCandle o el precio actual es el más alto, simplemente considera la última vela calculada
        // y el currentPrice como el dato más fresco.

        // Para el RSI, necesitamos una serie de valores de cierre. Si currentPrice es el nuevo cierre,
        // lo añadimos a la serie para recalcular el RSI más actual.
        const allClosePrices = candlesWithIndicators.map(c => c.close);
        allClosePrices.push(currentPrice); // Añadir el precio actual como el último "cierre"

        const latestRsiValues = RSI.calculate({ values: allClosePrices, period: RSI_PERIOD });
        const latestRsi = latestRsiValues[latestRsiValues.length - 1];

        console.log(`[ANALYZER-DEBUG] Usando currentPrice (${currentPrice.toFixed(2)}) para análisis de señal. RSI calculado con el precio actual: ${latestRsi?.toFixed(2) || 'N/A'}`);

        // Actualiza lastCandle y prevCandle para el análisis de señal
        // Aquí, lastCandle.rsi es el RSI de la vela anterior, y latestRsi es el RSI "actual"
        prevCandle = lastCandle; // La antigua última vela se convierte en la previa
        lastCandle = { close: currentPrice, rsi: latestRsi }; // La "nueva" última vela es el precio actual
    }

    if (lastCandle.rsi === undefined || prevCandle.rsi === undefined || isNaN(lastCandle.rsi) || isNaN(prevCandle.rsi)) {
        const result = { action: "ESPERA", symbol: symbol, reason: `RSI no calculado o inválido para las últimas velas. Last RSI: ${lastCandle.rsi}, Prev RSI: ${prevCandle.rsi}. Se pasará a ESPERA hasta tener datos válidos.` };
        console.log(`[ANALYZER-SEÑAL] ${result.action} - ${result.reason}`);
        return result;
    }

    // LOG TEMPORAL: Mostrar valores del RSI actual y anterior
    console.log(`[ANALYZER-DEBUG] Analizando señales - Último RSI: ${lastCandle.rsi.toFixed(2)}, RSI Anterior: ${prevCandle.rsi.toFixed(2)}`);

    // --- Lógica de COMPRA ---
    let buySignalDetected = false;
    let buyReason = [];

    // Estrategia 1 de Compra: RSI cruzando la zona de sobreventa al alza
    if (prevCandle.rsi <= RSI_OVERSOLD && lastCandle.rsi > RSI_OVERSOLD) {
        buySignalDetected = true;
        buyReason.push(`RSI cruzó ${RSI_OVERSOLD} al alza (${prevCandle.rsi.toFixed(2)} -> ${lastCandle.rsi.toFixed(2)})`);
        console.log(`[ANALYZER-DEBUG] ✅ Condición de COMPRA (RSI cruzó oversold al alza) detectada.`);
    }
    // Estrategia 2 de Compra: RSI en zona de sobreventa y empezando a subir (señal de reversión)
    // Se activa si el RSI está debajo del nivel de sobreventa y empieza a subir desde allí
    else if (lastCandle.rsi < RSI_OVERSOLD && lastCandle.rsi > prevCandle.rsi) {
        buySignalDetected = true;
        buyReason.push(`RSI en sobreventa (${lastCandle.rsi.toFixed(2)}) y subiendo desde ${prevCandle.rsi.toFixed(2)}`);
        console.log(`[ANALYZER-DEBUG] ✅ Condición de COMPRA (RSI en oversold y subiendo) detectada.`);
    }

    if (buySignalDetected) {
        const result = {
            action: "COMPRA",
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
    if (prevCandle.rsi >= RSI_OVERBOUGHT && lastCandle.rsi < RSI_OVERBOUGHT) {
        sellSignalDetected = true;
        sellReason.push(`RSI cruzó ${RSI_OVERBOUGHT} a la baja (${prevCandle.rsi.toFixed(2)} -> ${lastCandle.rsi.toFixed(2)})`);
        console.log(`[ANALYZER-DEBUG] ✅ Condición de VENTA (RSI cruzó overbought a la baja) detectada.`);
    }
    // Estrategia 2 de Venta: RSI en zona de sobrecompra y empezando a bajar
    // Se activa si el RSI está por encima del nivel de sobrecompra y empieza a bajar desde allí
    else if (lastCandle.rsi > RSI_OVERBOUGHT && lastCandle.rsi < prevCandle.rsi) {
        sellSignalDetected = true;
        sellReason.push(`RSI en sobrecompra (${lastCandle.rsi.toFixed(2)}) y bajando desde ${prevCandle.rsi.toFixed(2)}`);
        console.log(`[ANALYZER-DEBUG] ✅ Condición de VENTA (RSI en overbought y bajando) detectada.`);
    }

    if (sellSignalDetected) {
        const result = { action: "VENTA", symbol: symbol, reason: sellReason.join('. ') };
        console.log(`[ANALYZER-SEÑAL] ${result.action} - ${result.reason}`);
        return result;
    }

    // Si no se detecta ninguna señal clara de COMPRA o VENTA, la acción por defecto es ESPERA
    const result = { action: "ESPERA", symbol: symbol, reason: "No se encontraron señales de entrada o salida claras en este momento." };
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
// Esta función es la que vas a ejecutar para obtener la señal.
async function runAnalysis(currentPriceFromBotLogic) { // Acepta el currentPrice de autobotLogic
    console.log(`\n[ANALYZER] --- Iniciando análisis para ${SYMBOL}. Precio actual recibido: ${currentPriceFromBotLogic?.toFixed(2) || 'N/A'} ---`);

    // Paso 1: Obtener las velas de BitMart
    const rawCandlesFromAPI = await getCandles(SYMBOL, '5', 500);

    console.log(`[ANALYZER-DEBUG] Se obtuvieron ${rawCandlesFromAPI.length} velas de la API.`);

    if (rawCandlesFromAPI.length === 0) {
        console.error("[ANALYZER] No se pudieron obtener velas para el análisis. Devolviendo ESPERA.");
        const signal = { action: "ESPERA", symbol: SYMBOL, reason: "No se obtuvieron datos de velas para el análisis." };
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

    // DEBUG: Muestra las últimas 5 velas con sus indicadores calculados
    console.log("\n[ANALYZER-DEBUG] Últimas 5 velas (con indicadores completos):");
    if (candlesWithIndicators.length > 0) {
        candlesWithIndicators.slice(-5).forEach(candle => {
            console.log(`[ANALYZER-DEBUG]    Cierre: ${parseFloat(candle.close).toFixed(2)}, RSI: ${candle.rsi?.toFixed(2) || 'N/A'}`);
        });
    } else {
        console.warn("[ANALYZER-DEBUG] No hay velas completas con indicadores para mostrar. Esto puede ocurrir si no hay suficientes datos para el RSI.");
        const signal = { action: "ESPERA", symbol: SYMBOL, reason: "No hay suficientes velas con todos los indicadores calculados para determinar una señal clara." };
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

// --- LÓGICA PARA EJECUTAR EL ARCHIVO DIRECTAMENTE ---
// Esto permite que puedas ejecutar este archivo con `node bitmart_indicator_analyzer.js`
// y ver la señal directamente en la consola y en el archivo JSON.
if (require.main === module) {
    // Si estás ejecutando este archivo directamente para pruebas, puedes pasar un precio simulado
    const simulatedPrice = 65000; // Por ejemplo, un precio actual simulado
    runAnalysis(simulatedPrice).catch(error => {
        console.error("[ANALYZER] Error al ejecutar el análisis general:", error);
    });
}

// Exportar la función principal para que pueda ser llamada desde otro script (autobotLogic.js)
module.exports = {
    runAnalysis
};