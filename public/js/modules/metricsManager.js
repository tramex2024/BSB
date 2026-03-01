/**
 * metricsManager.js - Motor de Análisis de Rentabilidad (TradeCycles Only)
 * VERSION ESTRICTA: Sincronización exacta con Base de Datos (15 ciclos total).
 */

const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Usa el ID único del ciclo para evitar duplicados.
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    
    if (rawData.length === 0) return;

    rawData.forEach(c => {
        // --- 1. IDENTIFICADOR ÚNICO REAL ---
        // Usamos el ID de la base de datos para que sea imposible duplicar
        const cycleId = c._id?.$oid || c._id || c.id || `${c.strategy}-${c.endTime}`;
        
        if (!cycleId) return;

        // Si ya lo tenemos, NO lo agregamos de nuevo.
        if (globalCyclesMap.has(cycleId)) return;

        // --- 2. PROCESAMIENTO DE DATOS ---
        const profitValue = c.netProfit !== undefined ? c.netProfit : (c.profit || 0);
        let rawDate = c.endTime || c.timestamp;
        let finalDate;
        
        if (rawDate?.$date) finalDate = new Date(rawDate.$date);
        else if (rawDate) finalDate = new Date(rawDate);
        else finalDate = new Date();

        const strategy = (c.strategy || 'unknown').toLowerCase();
        
        globalCyclesMap.set(cycleId, {
            ...c,
            netProfit: parseFloat(profitValue),
            profitPercentage: parseFloat(c.profitPercentage || 0),
            processedDate: finalDate,
            strategy: strategy
        });
    });

    console.log(`📊 Metrics: ${globalCyclesMap.size} ciclos únicos en memoria.`);
    updateMetricsDisplay();
}

/**
 * updateMetricsDisplay
 * Filtra los 15 ciclos totales según la vista seleccionada.
 */
function updateMetricsDisplay() {
    const allData = Array.from(globalCyclesMap.values());
    
    // Filtro exacto: 'all' muestra 15, 'long' muestra 13, 'short' muestra 2
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

    const totalCycles = filtered.length;

    // Ordenar cronológicamente para que la gráfica tenga sentido
    filtered.sort((a, b) => a.processedDate - b.processedDate);

    // Si no hay ciclos para este filtro (ej: AI), reseteamos KPIs
    if (totalCycles === 0) {
        return resetKPIs();
    }

    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let winningCycles = 0;
    let totalTimeMs = 0;

    filtered.forEach(cycle => {
        totalProfitPct += (cycle.profitPercentage || 0);
        totalNetProfitUsdt += (cycle.netProfit || 0);
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

    // Renderizado en el HTML
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`);

    // Notificamos al Dashboard
    try {
        const chartData = getFilteredData();
        window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
    } catch (e) {
        console.error("❌ Metrics Dispatch Error:", e);
    }
}

export function getFilteredData() {
    const allData = Array.from(globalCyclesMap.values());
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

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

// ... (Funciones setChartParameter, setBotFilter, resetKPIs, renderText se mantienen igual)

export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

export function setBotFilter(filter) {
    currentBotFilter = filter.toLowerCase();
    updateMetricsDisplay();
}

function resetKPIs() {
    renderText('total-cycles-closed', '0');
    renderText('cycle-avg-profit', '0.00%', 'text-sm font-bold text-gray-500');
    renderText('cycle-win-rate', '0%', 'text-sm font-bold text-gray-500');
    renderText('cycle-efficiency', '$0.00/h', 'text-sm font-bold text-gray-500');
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: { points: [] } }));
}

function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}