/**
 * metricsManager.js - Motor de Análisis de Rendimiento (TradeCycles Only)
 * VERSIÓN INTEGRAL CORREGIDA 2026
 */

const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData - Versión Optimizada 2026
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || data?.cycles || []);
    
    if (rawData.length === 0) {
        console.warn("⚠️ [METRICS] No hay datos para procesar.");
        return;
    }

    rawData.forEach((c) => {
        const fingerPrint = c._id?.$oid || c._id || `fallback-${c.endTime || c.timestamp}-${c.netProfit}`;

        if (globalCyclesMap.has(fingerPrint)) return;

        const profit = parseFloat(c.netProfit || c.profit || 0);
        const recovery = parseFloat(c.finalRecovery || c.recovery || 0);
        const pct = parseFloat(c.profitPercentage || c.percentage || 0);
        
        const dateEnd = new Date(c.endTime || c.timestamp || c.processedDate);
        if (isNaN(dateEnd.getTime())) return; 

        globalCyclesMap.set(fingerPrint, {
            ...c,
            netProfit: profit,
            profitPercentage: pct,
            finalRecovery: recovery,
            processedDate: dateEnd,
            strategy: (c.strategy || 'UNKNOWN').toUpperCase(),
            durationMs: parseInt(c.durationMs || 0) 
        });
    });

    updateMetricsDisplay();
}

/**
 * updateMetricsDisplay
 * Versión optimizada 2026: Cálculo consistente de Profit/D y blindaje de métricas.
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
    let totalDurationMs = 0; 

    filtered.forEach(cycle => {
        totalProfitPct += (cycle.profitPercentage || 0);
        totalNetProfitUsdt += (cycle.netProfit || 0);
        totalOrders += (cycle.orderCount || 0);
        totalRecovery += (cycle.finalRecovery || 0);
        if (cycle.netProfit > 0) winningCycles++;

        // Sumamos solo si existe duración válida
        totalDurationMs += (cycle.durationMs || 0);
    });

    // Cálculos Finales
    const avgProfit = totalCycles > 0 ? (totalProfitPct / totalCycles) : 0;
    const avgNetProfit = totalCycles > 0 ? (totalNetProfitUsdt / totalCycles) : 0;
    const avgOrders = totalCycles > 0 ? (totalOrders / totalCycles) : 0;
    const avgRecovery = totalCycles > 0 ? (totalRecovery / totalCycles) : 0;
    const winRate = totalCycles > 0 ? ((winningCycles / totalCycles) * 100) : 0;
    
    // --- CORRECCIÓN CRÍTICA DE PROFIT/D ---
    // Usamos un umbral de 0.0001 horas para evitar divisiones por cero o valores absurdos
    const totalHours = totalDurationMs / 3600000;
    const profitPerDay = totalHours > 0.0001 ? ((totalNetProfitUsdt / totalHours) * 24) : 0;
    
    const avgDurationMs = totalCycles > 0 ? (totalDurationMs / totalCycles) : 0;

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
    
    renderText('cycle-efficiency', `$${profitPerDay.toFixed(4)}/d`);

    const chartData = prepareChartData(filtered);
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
}

/**
 * prepareChartData
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

export function updateMetricsFromState(state) {
    if (!state) return;

    const metrics = {
        totalProfit: parseFloat(state.total_profit || 0),
        longOrders: parseInt(state.lnorder || 0),
        shortOrders: parseInt(state.snorder || 0)
    };

    const now = new Date();
    let durationHours = 0;
    if (state.lstartTime) {
        const lStart = new Date(state.lstartTime);
        if (!isNaN(lStart.getTime()) && lStart.getFullYear() >= 2025) {
            durationHours = (now - lStart) / 3600000;
        }
    }

    renderValue('cycle-avg-orders', ((metrics.longOrders + metrics.shortOrders) / 2).toFixed(1));
    renderValue('cycle-net-profit', `$${metrics.totalProfit.toFixed(4)}`);
    
    if (durationHours > 0) {
        renderValue('cycle-avg-duration', formatDuration(durationHours));
    }
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

export function calculateSummary(allCycles) {
    const summary = {
        total: allCycles.length,
        long: 0,
        short: 0,
        ai: 0,
        totalProfit: 0,
        winRate: 0
    };

    let wins = 0;

    allCycles.forEach(cycle => {
        const type = (cycle.type || 'ai').toLowerCase();
        const profit = parseFloat(cycle.netProfit || 0);

        if (type === 'long') {
            summary.long++;
        } else if (type === 'short') {
            summary.short++;
        } else {
            summary.ai++;
        }

        summary.totalProfit += profit;
        if (profit > 0) wins++;
    });

    summary.winRate = summary.total > 0 
        ? ((wins / summary.total) * 100).toFixed(2) 
        : 0;

    console.log(`[AUDITORÍA] Total: ${summary.total} | L: ${summary.long} | S: ${summary.short} | AI: ${summary.ai}`);
    
    return summary;
}

export async function processStateUpdate(state) {
    if (state.history || state.cycleHistory) {
        setAnalyticsData(state.history || state.cycleHistory);
    }

    if (state.kpis) {
        const { updateQuickStats } = await import('./dashboard.js');
        
        const hasValidKpis = state.kpis && 
                             typeof state.kpis === 'object' && 
                             Object.keys(state.kpis).length > 0 && 
                             (parseFloat(state.kpis.totalCycles || 0) > 0);

        if (hasValidKpis) {
            updateQuickStats(state.kpis);
        } else {
            console.log("🛡️ MetricsManager: KPI update blocked (Invalid payload).");
        }
    }
}

export function getProcessedStats(kpiData) {
    const totalProfit = parseFloat(kpiData.totalNetProfit ?? 0);
    const totalCycles = parseInt(kpiData.totalCycles ?? 0);
    const avgHours = parseFloat(kpiData.avgDurationHours ?? 0);

    const profitPerDay = kpiData.profitPerDay || (avgHours > 0 ? (totalProfit / (avgHours * totalCycles)) * 24 : 0);
    
    return {
        profitPerDay: profitPerDay.toFixed(4),
        avgHours: Math.min(avgHours, 9999),
        raw: kpiData
    };
}