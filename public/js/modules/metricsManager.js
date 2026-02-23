/**
 * metricsManager.js - Motor de Análisis de Rentabilidad (TradeCycles Only)
 * Versión Restaurada - Solo Lógica de Métricas
 */

let cycleHistoryData = [];
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData - LA FUNCIÓN QUE FALTABA
 * Recibe los datos del servidor, evita duplicados y prepara los cálculos.
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    
    // Usamos un Map para que si los datos se cargan varias veces, no se dupliquen los puntos
    const uniqueMap = new Map();

    rawData.forEach(c => {
        const profitValue = c.netProfit !== undefined ? c.netProfit : (c.profit || 0);
        let rawDate = c.endTime || c.timestamp;
        let finalDate;
        
        if (rawDate?.$date) finalDate = new Date(rawDate.$date);
        else if (rawDate) finalDate = new Date(rawDate);
        else finalDate = new Date();

        const strategy = (c.strategy || 'unknown').toLowerCase();
        
        // Creamos una "huella" única para cada ciclo
        const fingerPrint = finalDate.getTime() + strategy + profitValue;
        
        if (!uniqueMap.has(fingerPrint)) {
            uniqueMap.set(fingerPrint, {
                ...c,
                netProfit: parseFloat(profitValue),
                profitPercentage: parseFloat(c.profitPercentage || 0),
                processedDate: finalDate,
                strategy: strategy
            });
        }
    });

    cycleHistoryData = Array.from(uniqueMap.values());
    
    // Ordenamos por fecha para que la gráfica no salte hacia atrás
    cycleHistoryData.sort((a, b) => a.processedDate - b.processedDate);
    
    console.log(`📊 Metrics: ${cycleHistoryData.length} ciclos cargados.`);
    updateMetricsDisplay();
}

/**
 * Cambia el parámetro de la gráfica (Beneficio acumulado o Porcentaje)
 */
export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

/**
 * Filtra los resultados por Long, Short o AI
 */
export function setBotFilter(filter) {
    console.log(`🎯 Filtrando Dashboard por: ${filter}`);
    currentBotFilter = filter.toLowerCase();
    updateMetricsDisplay();
}

/**
 * Calcula los KPIs (Win Rate, Profit/h, etc) y actualiza la pantalla
 */
function updateMetricsDisplay() {
    const filtered = cycleHistoryData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
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

    // Renderizamos los textos en el HTML
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`);

    // Avisamos al Dashboard para que dibuje la gráfica
    try {
        const chartData = getFilteredData();
        window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
    } catch (e) {
        console.error("❌ Metrics Error:", e);
    }
}

/**
 * Prepara los puntos (X, Y) para la gráfica de Chart.js
 */
export function getFilteredData() {
    const filtered = cycleHistoryData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

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