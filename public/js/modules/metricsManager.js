/**
 * metricsManager.js - Motor de Análisis de Rentabilidad (TradeCycles Only)
 * ETAPA 2: Persistencia de datos y protección contra vaciado de gráfica.
 * Esta versión evita que mensajes parciales del socket (ej. solo Short) 
 * borren los datos globales (All) de la memoria del navegador.
 */

// --- Estado Persistente ---
const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Recibe datos del socket, los limpia de duplicados y los fusiona con la memoria existente.
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    
    if (rawData.length === 0) return;

    let addedNew = false;

    rawData.forEach(c => {
        const profitValue = c.netProfit !== undefined ? c.netProfit : (c.profit || 0);
        let rawDate = c.endTime || c.timestamp;
        let finalDate;
        
        if (rawDate?.$date) finalDate = new Date(rawDate.$date);
        else if (rawDate) finalDate = new Date(rawDate);
        else finalDate = new Date();

        const strategy = (c.strategy || 'unknown').toLowerCase();
        
        // Huella única para evitar duplicados exactos: Tiempo-Estrategia-Ganancia
        const fingerPrint = `${finalDate.getTime()}-${strategy}-${profitValue}`;
        
        if (!globalCyclesMap.has(fingerPrint)) {
            globalCyclesMap.set(fingerPrint, {
                ...c,
                netProfit: parseFloat(profitValue),
                profitPercentage: parseFloat(c.profitPercentage || 0),
                processedDate: finalDate,
                strategy: strategy
            });
            addedNew = true;
        }
    });

    // Log para depuración en consola
    console.log(`📊 Metrics: ${globalCyclesMap.size} ciclos en memoria total (Vista: ${currentBotFilter}).`);
    
    // Siempre actualizamos el display para reflejar posibles cambios, 
    // pero la data base ya está protegida de borrados accidentales.
    updateMetricsDisplay();
}

/**
 * setChartParameter
 * Cambia entre 'accumulatedProfit' (USD) o 'profitPercentage' (%)
 */
export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

/**
 * setBotFilter
 * Filtra la vista del Dashboard: 'all', 'long', 'short', o 'ai'
 */
export function setBotFilter(filter) {
    console.log(`🎯 Filtrando Dashboard por: ${filter}`);
    currentBotFilter = filter.toLowerCase();
    updateMetricsDisplay();
}

/**
 * updateMetricsDisplay
 * Calcula los KPIs y dispara el evento para que Chart.js redibuje.
 */
function updateMetricsDisplay() {
    // Convertimos el Map a Array para procesarlo
    const allData = Array.from(globalCyclesMap.values());
    
    // Aplicamos el filtro de la UI
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

    const totalCycles = filtered.length;

    if (totalCycles === 0) {
        return resetKPIs();
    }

    // Ordenar cronológicamente para cálculos correctos
    filtered.sort((a, b) => a.processedDate - b.processedDate);

    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let winningCycles = 0;
    let totalTimeMs = 0;

    filtered.forEach(cycle => {
        totalProfitPct += cycle.profitPercentage;
        totalNetProfitUsdt += cycle.netProfit;
        if (cycle.netProfit > 0) winningCycles++;

        let startRaw = cycle.startTime;
        const start = startRaw?.$date ? new Date(startRaw.$date) : new Date(startRaw);
        const end = cycle.processedDate;

        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diff = end.getTime() - start.getTime();
            if (diff > 0) totalTimeMs += diff;
        }
    });

    const avgProfit = totalProfitPct / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const profitPerHour = totalHours > 0.1 ? (totalNetProfitUsdt / totalHours) : 0;

    // --- Renderizado de KPIs en el DOM ---
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`);

    // --- Notificar a la Gráfica ---
    try {
        const chartData = getFilteredData();
        window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
    } catch (e) {
        console.error("❌ Metrics Dispatch Error:", e);
    }
}

/**
 * getFilteredData
 * Prepara los puntos (X, Y) para el componente de Chart.js
 */
export function getFilteredData() {
    const allData = Array.from(globalCyclesMap.values());
    
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

    // Ordenar para que la línea del gráfico sea continua
    filtered.sort((a, b) => a.processedDate - b.processedDate);

    let accumulated = 0;
    const points = [{ time: 'Start', value: 0 }];

    filtered.forEach(cycle => {
        accumulated += cycle.netProfit;
        const date = cycle.processedDate;
        const timeLabel = `${date.getDate()}/${date.getMonth()+1} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;

        points.push({
            time: timeLabel,
            value: currentChartParameter === 'accumulatedProfit' ? parseFloat(accumulated.toFixed(4)) : cycle.profitPercentage
        });
    });

    return { points };
}

/**
 * resetKPIs
 * Limpia la UI si no hay datos disponibles para el filtro actual
 */
function resetKPIs() {
    renderText('total-cycles-closed', '0');
    renderText('cycle-avg-profit', '0.00%', 'text-sm font-bold text-gray-500');
    renderText('cycle-win-rate', '0%', 'text-sm font-bold text-gray-500');
    renderText('cycle-efficiency', '$0.00/h', 'text-sm font-bold text-gray-500');
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: { points: [] } }));
}

/**
 * renderText
 * Utilidad para actualizar el contenido y clases de un elemento de forma segura
 */
function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}