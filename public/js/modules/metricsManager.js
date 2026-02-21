/**
 * metricsManager.js - Motor de Análisis de Rentabilidad
 * Versión: Corregida para filtrado exacto y compatibilidad con Dashboard
 */

let cycleHistoryData = [];
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * Normaliza y almacena los datos
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || data?.history || []);
    
    cycleHistoryData = rawData.filter(c => c !== null).map(cycle => ({
        ...cycle,
        netProfit: parseFloat(cycle.netProfit || 0),
        profitPercentage: parseFloat(cycle.profitPercentage || 0),
        // Normalización robusta de fechas
        processedDate: cycle.endTime?.$date ? new Date(cycle.endTime.$date) : 
                       (cycle.endTime ? new Date(cycle.endTime) : new Date())
    }));
    
    updateMetricsDisplay();
}

export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

export function setBotFilter(filter) {
    currentBotFilter = filter;
    updateMetricsDisplay();
}

/**
 * Calcula KPIs y emite evento para el Dashboard
 */
function updateMetricsDisplay() {
    if (!cycleHistoryData.length) return resetKPIs();

    // CORRECCIÓN DE FILTRO: Maneja "strategy_long" o "long"
    const filtered = cycleHistoryData.filter(c => {
        if (currentBotFilter === 'all') return true;
        const cleanFilter = currentBotFilter.replace('strategy_', '').toLowerCase();
        return c.strategy?.toLowerCase() === cleanFilter;
    });

    const totalCycles = filtered.length;
    if (totalCycles === 0) return resetKPIs();

    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let winningCycles = 0;
    let totalTimeMs = 0;

    filtered.forEach(cycle => {
        totalProfitPct += cycle.profitPercentage;
        totalNetProfitUsdt += cycle.netProfit;
        if (cycle.netProfit > 0) winningCycles++;

        const start = cycle.startTime?.$date ? new Date(cycle.startTime.$date) : new Date(cycle.startTime);
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

    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`);

    try {
        const chartData = getFilteredData({ bot: currentBotFilter, param: currentChartParameter });
        window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
    } catch (e) {
        console.error("❌ Metrics: Error", e);
    }
}

/**
 * Filtra los datos para el gráfico (Chart.js)
 */
export function getFilteredData(filter) {
    const targetFilter = filter?.bot || currentBotFilter;
    const targetParam = filter?.param || currentChartParameter;

    // 1. Filtrado Insensible a Mayúsculas
    const filtered = cycleHistoryData.filter(c => {
        if (targetFilter === 'all') return true;
        // Comparamos long vs Long de forma segura
        return c.strategy?.toLowerCase() === targetFilter.toLowerCase();
    });

    // 2. ORDENAR por fecha (Crucial para que la línea no esté en 0 o saltando)
    filtered.sort((a, b) => a.processedDate - b.processedDate);

    let accumulated = 0;
    
    // 3. Crear puntos (Empezando desde 0 si hay datos)
    const points = [];
    if (filtered.length > 0) {
        points.push({ time: 'Start', value: 0 }); // Punto inicial
        
        filtered.forEach(cycle => {
            accumulated += cycle.netProfit;
            
            const date = cycle.processedDate;
            const timeLabel = !isNaN(date.getTime()) 
                ? `${date.getDate()}/${date.getMonth()+1} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
                : "---";

            points.push({
                time: timeLabel,
                value: targetParam === 'accumulatedProfit' ? parseFloat(accumulated.toFixed(4)) : cycle.profitPercentage
            });
        });
    }

    return { points };
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