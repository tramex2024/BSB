/**
 * metricsManager.js - Motor de Análisis de Rendimiento (TradeCycles Only)
 * VERSIÓN INTEGRAL CORREGIDA 2026
 */

const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Procesa la respuesta optimizada del controlador de analíticas.
 */
export function setAnalyticsData(response) {
    // 1. AUDITORÍA: Validamos si es el objeto de KPIs o el listado de ciclos
    console.log("🔍 [DEBUG] Respuesta del controlador:", response);

    if (!response.success || !response.data) {
        console.warn("⚠️ [DEBUG] Respuesta inválida o sin datos.");
        return;
    }

    const d = response.data;

    // Si la respuesta es el objeto de KPIs único (getCycleKpis)
    if (d.totalCycles !== undefined) {
        renderText('total-cycles-closed', d.totalCycles);
        renderText('cycle-avg-profit', `${d.avgProfitPct >= 0 ? '+' : ''}${d.avgProfitPct.toFixed(2)}%`, 
            `text-sm font-bold ${d.avgProfitPct >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
        renderText('cycle-net-profit', `$${d.totalNetProfit.toFixed(2)}`);
        renderText('cycle-avg-orders', (d.avgOrders || 0).toFixed(1));
        renderText('cycle-win-rate', `${(d.winRate || 0).toFixed(1)}%`);
        renderText('cycle-avg-recovery', `$${(d.avgRecovery || 0).toFixed(2)}`);
        
        // Manejo de duración
        const hours = d.avgDurationHours || 0;
        const h = Math.floor(hours);
        const m = Math.floor((hours % 1) * 60);
        renderText('cycle-avg-duration', `${h}h ${m}m`);

        // Eficiencia (Profit/H)
        const totalDurationHours = hours * d.totalCycles;
        const profitPerHour = totalDurationHours > 0 ? (d.totalNetProfit / totalDurationHours) : 0;
        renderText('cycle-efficiency', `$${profitPerHour.toFixed(4)}/h`);
    } 
    
    // Si la respuesta es una lista (getTradeCycles), la guardamos en el mapa
    if (Array.isArray(d)) {
        d.forEach(cycle => {
            const fingerPrint = cycle._id;
            globalCyclesMap.set(fingerPrint, {
                ...cycle,
                processedDate: new Date(cycle.endTime)
            });
        });
        updateMetricsDisplay(); // Recalcular con la lista
    }
}

/**
 * updateMetricsDisplay
 * Versión corregida: Utiliza durationMs para evitar ceros.
 */
function updateMetricsDisplay() {
    const allData = Array.from(globalCyclesMap.values());
    
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter.toUpperCase();
    });

    filtered.sort((a, b) => a.processedDate - b.processedDate);

    const totalCycles = filtered.length;
    if (totalCycles === 0) return resetKPIs();

    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let totalOrders = 0;
    let totalRecovery = 0;
    let winningCycles = 0;
    let totalDurationMs = 0; // Cambiado para claridad

    filtered.forEach(cycle => {
        totalProfitPct += (cycle.profitPercentage || 0);
        totalNetProfitUsdt += (cycle.netProfit || 0);
        totalOrders += (cycle.orderCount || 0);
        totalRecovery += (cycle.finalRecovery || 0);
        if (cycle.netProfit > 0) winningCycles++;

        // USAR EL DURATION MS YA CALCULADO
        totalDurationMs += (cycle.durationMs || 0);
    });

    // Cálculos Finales
    const avgProfit = totalProfitPct / totalCycles;
    const avgNetProfit = totalNetProfitUsdt / totalCycles;
    const avgOrders = totalOrders / totalCycles;
    const avgRecovery = totalRecovery / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    
    // Cálculo de Eficiencia (Profit/H)
    const totalHours = totalDurationMs / 3600000;
    const avgDurationMs = totalDurationMs / totalCycles;
    const profitPerHour = totalHours > 0.0001 ? (totalNetProfitUsdt / totalHours) : 0;

    const fmtDuration = (ms) => {
        if (ms <= 0) return "0h 0m";
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        return `${h}h ${m}m`;
    };

    // --- RENDERIZADO ---
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-net-profit', `+$${avgNetProfit.toFixed(4)}`);
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-orders', avgOrders.toFixed(1));
    renderText('cycle-avg-duration', fmtDuration(avgDurationMs));
    renderText('cycle-avg-recovery', `$${avgRecovery.toFixed(2)}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(4)}/h`);

    const chartData = prepareChartData(filtered);
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
}

/**
 * prepareChartData
 * Genera los puntos para el gráfico de Equity/Profit.
 */
function prepareChartData(filteredArray) {
    let accumulated = 0;
    const points = [];

    filteredArray.forEach(cycle => {
        const net = parseFloat(cycle.netProfit) || 0;
        accumulated += net;

        const d = cycle.processedDate;
        const label = `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;

        let finalValue = (currentChartParameter === 'accumulatedProfit') 
            ? accumulated 
            : (parseFloat(cycle.profitPercentage) || 0);

        points.push({ time: label, value: finalValue });
    });

    return { points };
}

/**
 * FUNCIONES DE FILTRADO Y CONTROL
 */
export function getFilteredData() {
    const allData = Array.from(globalCyclesMap.values());
    const filtered = allData.filter(c => currentBotFilter === 'all' || c.strategy === currentBotFilter.toUpperCase());
    filtered.sort((a, b) => a.processedDate - b.processedDate);
    return prepareChartData(filtered);
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
 * RENDERIZADO Y UTILIDADES
 */
function resetKPIs() {
    const ids = ['total-cycles-closed', 'cycle-avg-profit', 'cycle-net-profit', 'cycle-avg-orders', 'cycle-avg-duration', 'cycle-avg-recovery', 'cycle-win-rate', 'cycle-efficiency'];
    ids.forEach(id => renderText(id, '--'));
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: { points: [] } }));
}

function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}

/**
 * updateMetricsFromState
 * Sincroniza métricas en tiempo real con el estado actual del bot.
 */
export function updateMetricsFromState(state) {
    if (!state) return;

    const metrics = {
        totalProfit: parseFloat(state.total_profit || 0),
        longOrders: parseInt(state.lnorder || 0),
        shortOrders: parseInt(state.snorder || 0)
    };

    const now = new Date();
    const lStart = new Date(state.lstartTime);
    let durationHours = 0;

    if (!isNaN(lStart.getTime())) {
        durationHours = (now - lStart) / 3600000;
    }

    renderValue('cycle-avg-orders', ((metrics.longOrders + metrics.shortOrders) / 2).toFixed(1));
    renderValue('cycle-net-profit', `$${metrics.totalProfit.toFixed(4)}`);
    renderValue('cycle-avg-duration', formatDuration(durationHours));
}

function renderValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatDuration(hours) {
    if (hours <= 0) return "0h 0m";
    const h = Math.floor(hours);
    const m = Math.floor((hours % 1) * 60);
    return `${h}h ${m}m`;
}