/**
 * metricsManager.js - Motor de Análisis de Rentabilidad
 * Versión: Corregida para compatibilidad con MongoDB y Sync en Tiempo Real
 */

let cycleHistoryData = [];
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * Normaliza y almacena los datos, disparando la actualización
 */
export function setAnalyticsData(data) {
    // Soporte para diferentes estructuras de respuesta
    const rawData = Array.isArray(data) ? data : (data?.data || data?.history || []);
    
    // Limpieza de datos: Eliminamos nulos y aseguramos valores numéricos
    cycleHistoryData = rawData.filter(c => c !== null).map(cycle => ({
        ...cycle,
        netProfit: parseFloat(cycle.netProfit || 0),
        profitPercentage: parseFloat(cycle.profitPercentage || 0),
        // Normalización de fechas MongoDB ($date) o String ISO
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

    const filtered = currentBotFilter === 'all' 
        ? cycleHistoryData 
        : cycleHistoryData.filter(c => c.strategy?.toLowerCase() === currentBotFilter.toLowerCase());

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

    // Renderizado de KPIs
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', 
        `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, 
        `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`
    );
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, 
        `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`
    );
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, 
        `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`
    );

    // Notificación al Dashboard
    try {
        const chartData = getFilteredData({ bot: currentBotFilter, param: currentChartParameter });
        window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
    } catch (e) {
        console.error("❌ Metrics: Error en despacho de evento", e);
    }
}

function resetKPIs() {
    renderText('total-cycles-closed', '0');
    renderText('cycle-avg-profit', '0.00%', 'text-sm font-bold text-gray-500');
    renderText('cycle-win-rate', '0%', 'text-sm font-bold text-gray-500');
    renderText('cycle-efficiency', '$0.00/h', 'text-sm font-bold text-gray-500');
}

function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}

export function getFilteredData(filter) {
    const targetFilter = filter?.bot || currentBotFilter;
    const targetParam = filter?.param || currentChartParameter;

    const filtered = targetFilter === 'all' 
        ? cycleHistoryData 
        : cycleHistoryData.filter(c => c.strategy?.toLowerCase() === targetFilter.toLowerCase());

    let accumulated = 0;
    const points = filtered.map(cycle => {
        accumulated += cycle.netProfit;
        
        const date = cycle.processedDate;
        const timeLabel = !isNaN(date.getTime()) 
            ? `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
            : "00:00";

        return {
            time: timeLabel,
            value: targetParam === 'accumulatedProfit' ? accumulated : cycle.profitPercentage
        };
    });

    return { points };
}