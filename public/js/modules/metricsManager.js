/**
 * metricsManager.js - Motor de Análisis de Rendimiento (TradeCycles Only)
 * CORRECCIÓN: Precisión Decimal y Sincronización de Estrategia AI
 * INTEGRACIÓN: 8-KPI Analytics Grid
 */

// Memoria volátil para almacenar ciclos únicos y evitar duplicados
const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Procesa los datos entrantes y los normaliza.
 * @param {Array|Object} data - Datos de ciclos provenientes del servidor.
 * @param {Boolean} isSnapshot - Si es TRUE, reinicia la memoria (útil en cargas iniciales).
 */
export function setAnalyticsData(data, isSnapshot = true) {
    // 1. OBTENCIÓN DE DATOS: Maneja diferentes formatos de respuesta
    const rawData = Array.isArray(data) ? data : (data?.data || data?.history || []);
    
    if (rawData.length === 0) {
        console.warn("Metrics: No hay datos para procesar.");
        return;
    }

    // 2. LIMPIEZA DE MEMORIA: Evita que datos viejos se mezclen con nuevos snapshots
    if (isSnapshot) {
        globalCyclesMap.clear();
    }

    rawData.forEach(c => {
        // 3. NORMALIZACIÓN DE ESTRATEGIA
        let strategy = (c.strategy || 'UNKNOWN').toUpperCase();
        
        // 4. EXTRACCIÓN DE FECHA: Maneja formatos Date, ISOString y MongoDB $date
        let rawDate = c.endTime?.$date || c.endTime || c.timestamp || c.date;
        let dateObj = new Date(rawDate);

        if (isNaN(dateObj.getTime()) && c._id) {
            // Intento de recuperación vía MongoDB ID (los primeros 8 caracteres son el timestamp)
            const timestamp = parseInt(c._id.toString().substring(0, 8), 16) * 1000;
            dateObj = new Date(timestamp);
        }

        if (isNaN(dateObj.getTime())) return; // Salta el registro si la fecha es inválida

        // 5. NORMALIZACIÓN DE VALORES NUMÉRICOS
        const profitValue = parseFloat(c.profit || c.netProfit || 0);
        
        // 6. FINGERPRINT ESTRICTO: Evita duplicar ciclos en la UI
        const fingerPrint = c._id?.$oid || c._id || `${strategy}-${profitValue}-${dateObj.getTime()}`;

        if (globalCyclesMap.has(fingerPrint)) return;

        globalCyclesMap.set(fingerPrint, {
            ...c,
            id: fingerPrint,
            netProfit: profitValue,
            profitPercentage: parseFloat(c.profitPercentage || 0),
            orderCount: parseInt(c.orderCount || c.orders || 1),
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
    
    // Filtrado por estrategia
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter.toUpperCase();
    });

    // Ordenar cronológicamente para cálculos de tiempo y gráficas
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
        totalRecovery += parseFloat(cycle.finalRecovery || 0);
        
        if (cycle.netProfit > 0) winningCycles++;

        // Cálculo de duración del ciclo
        let startRaw = cycle.startTime?.$date || cycle.startTime;
        const start = new Date(startRaw);
        if (!isNaN(start.getTime())) {
            const diff = cycle.processedDate.getTime() - start.getTime();
            if (diff > 0) totalTimeMs += diff;
        }
    });

    // --- CÁLCULOS FINALES ---
    const avgProfit = totalProfitPct / totalCycles;
    const avgOrders = totalOrders / totalCycles;
    const avgRecovery = totalRecovery / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const avgDurationMs = totalTimeMs / totalCycles;
    const profitPerHour = totalHours > 0.1 ? (totalNetProfitUsdt / totalHours) : 0;

    // --- ACTUALIZACIÓN DE INTERFAZ (DOM) ---
    
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

    // Notificar a otros componentes (ej. gráficas) que los datos han cambiado
    const chartData = prepareChartData(filtered);
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
}

/**
 * prepareChartData
 * Prepara los puntos para la gráfica (Equity Curve o Profit Individual).
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
 * getFilteredData - Exportación para componentes externos
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
 * Sincronización con el balance general de la cuenta.
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
 * resetKPIs - Limpia la interfaz
 */
function resetKPIs() {
    const ids = ['total-cycles-closed', 'cycle-avg-profit', 'cycle-net-profit', 'cycle-avg-orders', 'cycle-avg-duration', 'cycle-avg-recovery', 'cycle-win-rate', 'cycle-efficiency'];
    ids.forEach(id => renderText(id, '--'));
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: { points: [] } }));
}

/**
 * renderText - Helper de manipulación segura del DOM
 */
function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}

/**
 * formatDurationMs - Formateo de tiempo legible
 */
function formatDurationMs(ms) {
    if (!ms || ms <= 0) return "0h 0m";
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${h}h ${m}m`;
}