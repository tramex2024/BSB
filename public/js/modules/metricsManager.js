/**
 * metricsManager.js - Motor de Análisis de Rentabilidad (TradeCycles Only)
 */

let cycleHistoryData = [];
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * Normaliza y almacena exclusivamente datos de TradeCycles
 */
export function setAnalyticsData(data) {
    // 1. Extraer el array de datos con seguridad
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    
    // 2. Limpiar y normalizar: Aseguramos que solo procesamos ciclos con netProfit
    cycleHistoryData = rawData.filter(c => c && c.netProfit !== undefined).map(cycle => ({
        ...cycle,
        netProfit: parseFloat(cycle.netProfit || 0),
        profitPercentage: parseFloat(cycle.profitPercentage || 0),
        // Normalización de fecha para ordenamiento
        processedDate: cycle.endTime?.$date ? new Date(cycle.endTime.$date) : 
                       (cycle.endTime ? new Date(cycle.endTime) : new Date())
    }));
    
    // Ordenar cronológicamente para que la curva tenga sentido
    cycleHistoryData.sort((a, b) => a.processedDate - b.processedDate);
    
    console.log(`📊 Metrics: ${cycleHistoryData.length} ciclos cargados.`);
    updateMetricsDisplay();
}

export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

export function setBotFilter(filter) {
    console.log(`🎯 Filtrando por bot: ${filter}`);
    currentBotFilter = filter;
    updateMetricsDisplay();
}

/**
 * Calcula KPIs y emite evento para el Dashboard
 */
function updateMetricsDisplay() {
    // FILTRADO DINÁMICO
    const filtered = cycleHistoryData.filter(c => {
        if (currentBotFilter === 'all') return true;
        // Comparación segura (long === Long, etc)
        return c.strategy?.toLowerCase() === currentBotFilter.toLowerCase();
    });

    const totalCycles = filtered.length;

    if (totalCycles === 0) {
        return resetKPIs();
    }

    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let winningCycles = 0;
    let totalTimeMs = 0;

    filtered.forEach(cycle => {
        totalProfitPct += cycle.profitPercentage;
        totalNetProfitUsdt += cycle.netProfit;
        if (cycle.netProfit > 0) winningCycles++;

        // Cálculo de duración para Profit/Hour
        const start = cycle.startTime?.$date ? new Date(cycle.startTime.$date) : new Date(cycle.startTime);
        const end = cycle.processedDate;

        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diff = end.getTime() - start.getTime();
            if (diff > 0) totalTimeMs += diff;
        }
    });

    // Cálculos de KPIs
    const avgProfit = totalProfitPct / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const profitPerHour = totalHours > 0.1 ? (totalNetProfitUsdt / totalHours) : 0;

    // ACTUALIZACIÓN DE UI (IDs del HTML)
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`);

    // ENVÍO DE DATOS AL GRÁFICO
    try {
        const chartData = getFilteredData();
        window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
    } catch (e) {
        console.error("❌ Metrics Error:", e);
    }
}

/**
 * Genera los puntos para el gráfico basándose en el filtro actual
 */
export function getFilteredData() {
    const filtered = cycleHistoryData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy?.toLowerCase() === currentBotFilter.toLowerCase();
    });

    let accumulated = 0;
    const points = [];

    // Punto de partida en 0
    points.push({ time: 'Start', value: 0 });

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