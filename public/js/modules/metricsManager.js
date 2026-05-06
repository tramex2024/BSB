/**
 * metricsManager.js - Motor de Análisis de Rendimiento (TradeCycles Only)
 * CORRECCIÓN: Precisión Decimal y Sincronización de Estrategia AI
 * INTEGRACIÓN: 8-KPI Analytics Grid
 */

const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData - Versión con Extracción de Fecha Reforzada
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || data?.history || []);
    
    if (rawData.length === 0) return;

    rawData.forEach(c => {
        let strategy = (c.strategy || 'UNKNOWN').toUpperCase();
        
        // --- 3. EXTRACCIÓN DE FECHA MEJORADA ---
        // Intentamos obtener la fecha de múltiples fuentes posibles
        let rawDate = 
            c.endTime?.$date ||   // Formato MongoDB expandido
            c.endTime ||          // Campo estándar de ciclo
            c.timestamp ||        // Campo estándar de socket
            c.transactTime ||     // Campo común en órdenes de Exchange
            c.createdAt ||        // Fecha de creación en DB
            c.date;               // Backup simple

        let dateObj = new Date(rawDate);

        // Si la fecha sigue siendo inválida (NaN), intentamos el último recurso:
        // Si hay un _id de MongoDB, podemos extraer el tiempo de ahí.
        if (isNaN(dateObj.getTime()) && c._id && typeof c._id === 'string' && c._id.length === 24) {
            // Los primeros 8 caracteres de un ObjectId de MongoDB son el timestamp
            dateObj = new Date(parseInt(c._id.substring(0, 8), 16) * 1000);
        }

        // Si después de todo sigue siendo inválida, usamos la fecha actual 
        // para evitar el error de consola y procesar el ciclo.
        if (isNaN(dateObj.getTime())) {
            console.warn("Metrics: Usando Date.now() para objeto sin fecha clara", c);
            dateObj = new Date();
        }
        // ---------------------------------------

        const profitValue = parseFloat(c.profit || c.netProfit || 0);
        const profitPct = parseFloat(c.profitPercentage || 0);
        const orders = parseInt(c.orderCount || c.orders || 1);
        const recovery = parseFloat(c.finalRecovery || c.recovery || 0);

        const fingerPrint = c._id?.$oid || c._id || `${strategy}-${profitValue}-${dateObj.getTime()}`;

        if (globalCyclesMap.has(fingerPrint)) return;

        globalCyclesMap.set(fingerPrint, {
            ...c, 
            id: fingerPrint,
            netProfit: profitValue, 
            profitPercentage: profitPct,
            orderCount: orders,
            finalRecovery: recovery,
            processedDate: dateObj,
            strategy: strategy
        });
    });

    console.log(`📊 Metrics: Procesados ${globalCyclesMap.size} ciclos únicos.`);

    if (typeof updateMetricsDisplay === 'function') {
        updateMetricsDisplay();
    }
}

/**
 * updateMetricsDisplay
 * Calcula KPIs usando precisión total de punto flotante y actualiza la UI.
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

        let startRaw = cycle.startTime?.$date || cycle.startTime;
        const start = new Date(startRaw);
        if (!isNaN(start.getTime())) {
            const diff = cycle.processedDate.getTime() - start.getTime();
            if (diff > 0) totalTimeMs += diff;
        }
    });

    // Cálculos Finales
    const avgProfit = totalProfitPct / totalCycles;
    const avgOrders = totalOrders / totalCycles;
    const avgRecovery = totalRecovery / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const avgDurationMs = totalTimeMs / totalCycles;
    const profitPerHour = totalHours > 0.1 ? (totalNetProfitUsdt / totalHours) : 0;

    // --- ACTUALIZACIÓN DE INTERFAZ ---
    
    // Columna 1: Profit
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-net-profit', `+$${totalNetProfitUsdt.toFixed(4)}`);

    // Columna 2: Ciclos y Órdenes
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-orders', avgOrders.toFixed(1));

    // Columna 3: Tiempo y Recuperación
    renderText('cycle-avg-duration', formatDurationMs(avgDurationMs));
    renderText('cycle-avg-recovery', `$${avgRecovery.toFixed(2)}`);

    // Columna 4: WinRate y Eficiencia
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`);

    const chartData = prepareChartData(filtered);
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
}

/**
 * prepareChartData
 * Prepara los puntos para la gráfica de equity o profit individual.
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

        points.push({
            time: label,
            value: finalValue
        });
    });

    return { points };
}

/**
 * getFilteredData
 * Exporta los datos procesados para componentes externos (como gráficas).
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
 * updateMetricsFromState
 * Sincronización con el estado en vivo de la cuenta (Dashboard General).
 */
export function updateMetricsFromState(state) {
    if (!state) return;

    const totalProfit = parseFloat(state.total_profit || 0);
    const totalEl = document.getElementById('auprofit');
    if (totalEl) {
        totalEl.textContent = `+$${totalProfit.toFixed(4)}`;
        totalEl.className = totalProfit >= 0 ? 'text-emerald-400' : 'text-red-500';
    }
}

/**
 * resetKPIs
 * Limpia la interfaz cuando no hay datos.
 */
function resetKPIs() {
    const ids = ['total-cycles-closed', 'cycle-avg-profit', 'cycle-net-profit', 'cycle-avg-orders', 'cycle-avg-duration', 'cycle-avg-recovery', 'cycle-win-rate', 'cycle-efficiency'];
    ids.forEach(id => renderText(id, '--'));
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: { points: [] } }));
}

/**
 * renderText
 * Helper para manipular el DOM de forma segura.
 */
function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}

/**
 * formatDurationMs
 * Convierte milisegundos a formato legible (Xh Ym).
 */
function formatDurationMs(ms) {
    if (!ms || ms <= 0) return "0h 0m";
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${h}h ${m}m`;
}