/**
 * metricsManager.js - Motor de Análisis de Rendimiento (TradeCycles Only)
 * CORRECCIÓN: Mapeo de variables de servidor y precisión de KPIs
 * INTEGRACIÓN: 8-KPI Analytics Grid
 */

const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Procesa los datos y asegura que los nombres de las variables sean correctos.
 */
export function setAnalyticsData(data, isSnapshot = true) {
    // 1. OBTENCIÓN DE DATOS
    const rawData = Array.isArray(data) ? data : (data?.data || data?.history || data?.cycleHistory || []);
    
    if (rawData.length === 0) {
        console.warn("Metrics: No hay datos para procesar.");
        return;
    }

    // 2. LIMPIEZA DE MEMORIA (Clave para sincronización)
    if (isSnapshot) {
        globalCyclesMap.clear();
    }

    rawData.forEach(c => {
        // 3. NORMALIZACIÓN DE ESTRATEGIA
        let strategy = (c.strategy || 'UNKNOWN').toUpperCase();
        
        // 4. EXTRACCIÓN DE FECHAS (Soporte para múltiples formatos)
        let rawEnd = c.endTime?.$date || c.endTime || c.timestamp || c.date || c.closed_at;
        let endObj = new Date(rawEnd);

        if (isNaN(endObj.getTime()) && c._id) {
            const timestamp = parseInt(c._id.toString().substring(0, 8), 16) * 1000;
            endObj = new Date(timestamp);
        }

        if (isNaN(endObj.getTime())) return; 

        // 5. MAPEO INTELIGENTE DE VALORES (Solución definitiva a los ceros)
        // Agregamos variantes comunes que envían los backends (profit_amount, net_profit, etc)
        const profitValue = parseFloat(c.profit || c.netProfit || c.net_profit || c.profit_amount || 0);
        const profitPct = parseFloat(c.profitPercentage || c.profit_pct || c.percentage || c.gain_percent || 0);
        const orders = parseInt(c.orderCount || c.orders || c.total_orders || c.count || 1);
        const recovery = parseFloat(c.finalRecovery || c.recovery_amount || c.recovery || 0);

        // 6. FINGERPRINT ESTRICTO
        const fingerPrint = c._id?.$oid || c._id || `${strategy}-${profitValue}-${endObj.getTime()}`;

        if (!globalCyclesMap.has(fingerPrint)) {
            globalCyclesMap.set(fingerPrint, {
                ...c,
                id: fingerPrint,
                netProfit: profitValue,
                profitPercentage: profitPct,
                orderCount: orders,
                finalRecovery: recovery,
                processedDate: endObj,
                strategy: strategy
            });
        }
    });

    console.log(`📊 Metrics: ${globalCyclesMap.size} ciclos listos para cálculo.`);

    if (typeof updateMetricsDisplay === 'function') {
        updateMetricsDisplay();
    }
}

/**
 * updateMetricsDisplay
 * Calcula los KPIs finales y los inyecta en el HTML.
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
    let totalTimeMs = 0;

    filtered.forEach(cycle => {
        totalProfitPct += cycle.profitPercentage;
        totalNetProfitUsdt += cycle.netProfit;
        totalOrders += cycle.orderCount;
        totalRecovery += cycle.finalRecovery;
        if (cycle.netProfit > 0) winningCycles++;

        // Cálculo de duración corregido: BuscastartTime, created_at o timestamp inicial
        let startRaw = cycle.startTime?.$date || cycle.startTime || cycle.created_at || cycle.start_time || cycle.timestamp;
        const start = new Date(startRaw);
        if (!isNaN(start.getTime())) {
            const diff = cycle.processedDate.getTime() - start.getTime();
            // Evitamos duraciones negativas o de 0 exacto para que el promedio sea real
            if (diff > 1000) totalTimeMs += diff; 
        }
    });

    // Cálculos Finales
    const avgProfit = totalProfitPct / totalCycles;
    const avgOrders = totalOrders / totalCycles;
    const avgRecovery = totalRecovery / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const avgDurationMs = totalTimeMs / totalCycles;
    const profitPerHour = totalHours > 0.01 ? (totalNetProfitUsdt / totalHours) : 0;

    // --- RENDERIZADO EN INTERFAZ ---
    renderText('total-cycles-closed', totalCycles);
    
    // Profit Promedio
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, 
        `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    
    // Profit Neto Total
    renderText('cycle-net-profit', `+$${totalNetProfitUsdt.toFixed(4)}`);

    // Órdenes Promedio
    renderText('cycle-avg-orders', avgOrders.toFixed(1));

    // Duración Promedio
    renderText('cycle-avg-duration', formatDurationMs(avgDurationMs));

    // Recuperación Promedio
    renderText('cycle-avg-recovery', `$${avgRecovery.toFixed(2)}`);

    // Win Rate
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, 
        `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);

    // Eficiencia ($/h)
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`);

    const chartData = prepareChartData(filtered);
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
}

/**
 * prepareChartData - Estructura para la gráfica
 */
function prepareChartData(filteredArray) {
    let accumulated = 0;
    const points = [];

    filteredArray.forEach(cycle => {
        accumulated += cycle.netProfit;
        const d = cycle.processedDate;
        const label = `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;

        points.push({
            time: label,
            value: (currentChartParameter === 'accumulatedProfit') ? accumulated : cycle.profitPercentage
        });
    });

    return { points };
}

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

export function updateMetricsFromState(state) {
    if (!state) return;
    const totalProfit = parseFloat(state.total_profit || 0);
    const totalEl = document.getElementById('auprofit');
    if (totalEl) {
        totalEl.textContent = `+$${totalProfit.toFixed(4)}`;
        totalEl.className = totalProfit >= 0 ? 'text-emerald-400' : 'text-red-500';
    }
}

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

function formatDurationMs(ms) {
    if (!ms || ms <= 0) return "0h 0m";
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${h}h ${m}m`;
}