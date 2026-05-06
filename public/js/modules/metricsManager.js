/**
 * metricsManager.js - Motor de Análisis de Rendimiento (TradeCycles Only)
 * UNIFICACIÓN: Sincronización de Historial + Estado en Tiempo Real
 * INTEGRACIÓN: 8-KPI Analytics Grid
 */

const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Recibe los ciclos del bot y los organiza en memoria evitando duplicados.
 * Esta versión corrige el error de conteo (de 49 a 29) al mejorar la validación de IDs.
 */
/**
 * setAnalyticsData - Versión Auditada y Corregida
 * Resuelve el problema de los 49 ciclos asegurando que el mapa se limpie
 * antes de procesar una carga completa del servidor.
 */
export function setAnalyticsData(data) {
    // 1. Extraer los datos brutos
    const rawData = Array.isArray(data) ? data : (data?.cycles || data?.data || []);
    
    // --- SOLUCIÓN AL ERROR DE 49 ---
    // Si recibimos una lista (como la de 29 o la de 20), vaciamos el mapa previo.
    // Esto evita que se sumen listas diferentes (29 + 20).
    globalCyclesMap.clear(); 

    rawData.forEach(c => {
        let strategy = (c.strategy || 'unknown').toUpperCase();
        
        // Extraer fecha con seguridad
        let rawDate = c.endTime?.$date || c.endTime || c.timestamp || new Date();
        const dateObj = new Date(rawDate);
        
        // Extraer beneficio con seguridad
        const profitValue = parseFloat(c.profit || c.netProfit || 0);

        // 2. GENERACIÓN DE ETIQUETA ÚNICA (Fingerprint)
        // Usamos el ID si existe, si no, una combinación de estrategia, profit y tiempo en segundos.
        const timeInSeconds = Math.floor(dateObj.getTime() / 1000);
        
        // Si el ID no existe, creamos uno basado en los datos disponibles
        const fingerPrint = c._id?.$oid || c._id || `${strategy}-${profitValue}-${timeInSeconds}-${Math.random()}`;

        // 3. GUARDADO EN EL MAPA
        // Solo guardamos si el ciclo tiene datos válidos (evitamos los 'undefined' de tu auditoría)
        if (c.endTime || c.timestamp || c._id) {
            globalCyclesMap.set(fingerPrint, {
                ...c,
                netProfit: profitValue, 
                strategy: strategy,
                processedDate: dateObj
            });
        }
    });

    // 4. ACTUALIZAR INTERFAZ
    updateMetricsDisplay();
}

/**
 * updateMetricsDisplay
 * Calcula KPIs usando la base de datos histórica acumulada.
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

        // Auditoría de duración: Soporte para múltiples llaves del backend
        let startRaw = cycle.startTime?.$date || cycle.startTime || cycle.lstartTime || cycle.sstartTime;
        const start = new Date(startRaw);
        if (!isNaN(start.getTime())) {
            const diff = cycle.processedDate.getTime() - start.getTime();
            if (diff > 0) totalTimeMs += diff;
        }
    });

    // Cálculos Finales
    const avgProfit = totalProfitPct / totalCycles;
    const avgNetProfit = totalNetProfitUsdt / totalCycles;
    const avgOrders = totalOrders / totalCycles;
    const avgRecovery = totalRecovery / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const avgDurationMs = totalTimeMs / totalCycles;
    const profitPerHour = totalHours > 0.1 ? (totalNetProfitUsdt / totalHours) : 0;

    // Formateador de duración
    const fmtDuration = (ms) => {
        const h = Math.floor(ms / (1000 * 60 * 60));
        const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${h}h ${m}m`;
    };

    // --- ACTUALIZACIÓN DE INTERFAZ ---
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-net-profit', `+$${avgNetProfit.toFixed(4)}`);
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-orders', avgOrders.toFixed(1));
    renderText('cycle-avg-duration', fmtDuration(avgDurationMs));
    renderText('cycle-avg-recovery', `$${avgRecovery.toFixed(2)}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`);

    const chartData = prepareChartData(filtered);
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
}

/**
 * updateMetricsFromState
 * Sincronización inmediata con el Payload del Backend (Tiempo Real)
 */
export function updateMetricsFromState(state) {
    if (!state) return;

    // 1. Actualización de Profit Total (KPI Principal)
    const totalProfit = parseFloat(state.total_profit || 0);
    const totalEl = document.getElementById('auprofit'); // ID del Dashboard principal
    if (totalEl) {
        totalEl.textContent = `+$${totalProfit.toFixed(4)}`;
        totalEl.className = totalProfit >= 0 ? 'text-emerald-400' : 'text-red-500';
    }

    // 2. Sincronización de Duración del Ciclo Activo
    const now = new Date();
    // Auditado: El payload usa lstartTime para el ciclo Long activo
    const activeStart = new Date(state.lstartTime || state.sstartTime);
    
    if (!isNaN(activeStart.getTime())) {
        const durationHours = (now - activeStart) / 3600000;
        // Solo actualizamos la duración si el historial está vacío o para mostrar tiempo real activo
        const durationEl = document.getElementById('cycle-avg-duration');
        if (durationEl && globalCyclesMap.size === 0) {
            durationEl.textContent = formatDuration(durationHours);
        }
    }

    // 3. Sincronización de Profit Neto en KPI si no hay ciclos históricos aún
    if (globalCyclesMap.size === 0) {
        renderValue('cycle-net-profit', `$${totalProfit.toFixed(4)}`);
    }
}

/**
 * prepareChartData
 * Prepara los puntos para la gráfica de equity.
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