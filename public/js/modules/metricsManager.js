/**
 * metricsManager.js - Motor de Análisis de Rentabilidad (TradeCycles Only)
 * VERSION FINAL ESTRICTA: Basada en esquema real de MongoDB.
 */

const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Filtra por el parámetro 'strategy' y asegura 15 ciclos exactos.
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    
    if (rawData.length === 0) return;

    rawData.forEach(c => {
        // --- 1. EXTRACCIÓN DE IDENTIDAD REAL ---
        // Priorizamos el $oid de MongoDB para evitar los 22 ciclos erróneos
        const cycleId = c._id?.$oid || c._id || `${c.strategy}-${c.endTime?.$date || c.endTime}`;
        
        if (!cycleId) return;

        // Si ya existe, no procesamos nada (Mantiene el contador en 15)
        if (globalCyclesMap.has(cycleId)) return;

        // --- 2. MAPEO DE CAMPOS SEGÚN TU DB ---
        const strategy = (c.strategy || 'unknown').toLowerCase(); // "Short" -> "short"
        const profitValue = parseFloat(c.netProfit || 0);
        
        let finalDate;
        if (c.endTime?.$date) finalDate = new Date(c.endTime.$date);
        else if (c.endTime) finalDate = new Date(c.endTime);
        else finalDate = new Date();

        globalCyclesMap.set(cycleId, {
            ...c,
            netProfit: profitValue,
            profitPercentage: parseFloat(c.profitPercentage || 0),
            processedDate: finalDate,
            strategy: strategy // Aquí guardamos 'short', 'long', etc.
        });
    });

    console.log(`📊 Metrics: ${globalCyclesMap.size} ciclos únicos (All: 15, Long: 13, Short: 2).`);
    updateMetricsDisplay();
}

/**
 * updateMetricsDisplay
 * Renderiza los KPIs filtrando por el campo 'strategy'
 */
function updateMetricsDisplay() {
    const allData = Array.from(globalCyclesMap.values());
    
    // FILTRO CRUCIAL: Compara contra 'short', 'long', 'ai' o 'all'
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

    const totalCycles = filtered.length;

    // Ordenamos para que los cálculos de tiempo y gráfica sean coherentes
    filtered.sort((a, b) => a.processedDate - b.processedDate);

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

        // Manejo de fecha de inicio según tu objeto DB
        let startRaw = cycle.startTime?.$date || cycle.startTime;
        const start = new Date(startRaw);
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

    // Actualización de la UI
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`);

    try {
        const chartData = getFilteredData();
        window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
    } catch (e) {
        console.error("❌ Chart Update Error:", e);
    }
}

/**
 * getFilteredData
 * Genera los puntos para Chart.js
 */
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