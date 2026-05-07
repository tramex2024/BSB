/**
 * metricsManager.js - Versión Unificada (Auditoría de Ciclos)
 * Corregido para restaurar el conteo de ciclos original basado en precisión de milisegundos.
 */

const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Fusiona datos nuevos con los existentes usando el Fingerprint de precisión absoluta.
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    if (rawData.length === 0) return;

    rawData.forEach(c => {
        // 1. Normalización de Estrategia (Consistente con versión antigua)
        const strategy = (c.strategy || 'unknown').toLowerCase();
        
        // 2. Extracción de Fecha (Sin redondeo para evitar colisiones)
        let rawDate = c.endTime?.$date || c.endTime || c.timestamp;
        const dateObj = new Date(rawDate);
        if (isNaN(dateObj.getTime())) return; 
        
        const timestamp = dateObj.getTime();

        // 3. Normalización de Profit
        const profitValue = parseFloat(c.profit || c.netProfit || 0);
        
        // 4. Generación de Fingerprint (Lógica restaurada de la versión antigua)
        // Usamos el ID de MongoDB si existe, si no, creamos uno con precisión de milisegundos
        const fingerPrint = c._id?.$oid || c._id || `${strategy}-${profitValue}-${timestamp}`;

        if (globalCyclesMap.has(fingerPrint)) return;

        // 5. Almacenamiento
        globalCyclesMap.set(fingerPrint, {
            ...c,
            netProfit: profitValue, 
            profitPercentage: parseFloat(c.profitPercentage || 0),
            orderCount: parseInt(c.orderCount || 1),
            finalRecovery: parseFloat(c.finalRecovery || 0),
            processedDate: dateObj,
            strategy: strategy
        });
    });

    updateMetricsDisplay();
}

/**
 * updateMetricsDisplay - KPIs con lógica de filtrado corregida
 */
function updateMetricsDisplay() {
    const allData = Array.from(globalCyclesMap.values());
    
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        // Comparamos en minúsculas para asegurar coincidencia
        return c.strategy === currentBotFilter.toLowerCase();
    });

    filtered.sort((a, b) => a.processedDate - b.processedDate);

    const totalCycles = filtered.length;
    if (totalCycles === 0) return resetKPIs();

    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let totalOrders = 0;
    let winningCycles = 0;
    let totalTimeMs = 0;

    filtered.forEach(cycle => {
        totalProfitPct += cycle.profitPercentage;
        totalNetProfitUsdt += cycle.netProfit;
        totalOrders += (cycle.orderCount || 1);
        if (cycle.netProfit > 0) winningCycles++;

        let startRaw = cycle.startTime?.$date || cycle.startTime;
        const start = new Date(startRaw);
        if (!isNaN(start.getTime())) {
            const diff = cycle.processedDate.getTime() - start.getTime();
            if (diff > 0) totalTimeMs += diff;
        }
    });

    // Cálculos Finales
    const avgProfit = totalProfitPct / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const profitPerHour = totalHours > 0.1 ? (totalNetProfitUsdt / totalHours) : 0;

    // Renderizado en UI
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, 
               `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, 
               `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`);

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

        let finalValue = (currentChartParameter === 'accumulatedProfit') ? accumulated : cycle.profitPercentage;

        points.push({
            time: label,
            value: parseFloat(parseFloat(finalValue).toFixed(4))
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
    ['total-cycles-closed', 'cycle-avg-profit', 'cycle-win-rate', 'cycle-efficiency'].forEach(id => renderText(id, '--'));
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: { points: [] } }));
}

function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}