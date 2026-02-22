/**
 * metricsManager.js - Motor de Análisis (TradeCycles Only)
 */

let cycleHistoryData = [];
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    const uniqueMap = new Map();

    // Re-procesar para asegurar que no haya duplicados (45 -> 15)
    rawData.forEach(c => {
        const profitValue = parseFloat(c.netProfit !== undefined ? c.netProfit : (c.profit || 0));
        const strategy = (c.strategy || 'unknown').toLowerCase();
        
        let rawDate = c.endTime || c.timestamp;
        let finalDate = rawDate?.$date ? new Date(rawDate.$date) : (rawDate ? new Date(rawDate) : new Date());

        // Llave única: Tiempo + Estrategia + Ganancia
        const fingerPrint = finalDate.getTime() + strategy + profitValue;
        
        if (!uniqueMap.has(fingerPrint)) {
            uniqueMap.set(fingerPrint, {
                ...c,
                netProfit: profitValue,
                profitPercentage: parseFloat(c.profitPercentage || 0),
                processedDate: finalDate,
                strategy: strategy
            });
        }
    });

    cycleHistoryData = Array.from(uniqueMap.values());
    cycleHistoryData.sort((a, b) => a.processedDate - b.processedDate);
    
    console.log(`📊 Metrics: ${cycleHistoryData.length} ciclos ÚNICOS en memoria.`);
    updateMetricsDisplay();
}

export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

export function setBotFilter(filter) {
    console.log(`🎯 Filtrando Dashboard por: ${filter}`);
    currentBotFilter = filter.toLowerCase();
    updateMetricsDisplay();
}

function updateMetricsDisplay() {
    const filtered = cycleHistoryData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

    if (filtered.length === 0) return resetKPIs();

    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let winningCycles = 0;

    filtered.forEach(cycle => {
        totalProfitPct += cycle.profitPercentage;
        totalNetProfitUsdt += cycle.netProfit;
        if (cycle.netProfit > 0) winningCycles++;
    });

    const avgProfit = totalProfitPct / filtered.length;
    const winRate = (winningCycles / filtered.length) * 100;

    renderText('total-cycles-closed', filtered.length);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);

    const chartData = getFilteredData(filtered);
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
}

function getFilteredData(filtered) {
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

function resetKPIs() {
    renderText('total-cycles-closed', '0');
    renderText('cycle-avg-profit', '0.00%');
    renderText('cycle-win-rate', '0%');
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: { points: [] } }));
}

function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}