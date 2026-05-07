/**
 * metricsManager.js - Motor de Análisis de Rendimiento (Versión 2.0)
 * OBJETIVO: Unificación de ciclos y corrección de duplicados.
 * LOGICA: Redondeo de precisión temporal para sincronización de 29 ciclos reales.
 */

const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Procesa el array de datos y filtra duplicados usando un ID de negocio robusto.
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    if (rawData.length === 0) return;

    // Si prefieres que el conteo sea estrictamente lo que envía el servidor en cada carga,
    // puedes descomentar la siguiente línea para limpiar el mapa previo:
    // globalCyclesMap.clear();

    rawData.forEach(c => {
        // 1. Normalización de Estrategia
        let strategy = (c.strategy || 'unknown').toUpperCase();
        
        // 2. Extracción y Normalización de Fecha
        // Redondeamos a minutos (60000ms) para ignorar discrepancias de milisegundos
        let rawDate = c.endTime?.$date || c.endTime || c.timestamp;
        const dateObj = new Date(rawDate);
        if (isNaN(dateObj.getTime())) return; 
        
        const normalizedTS = Math.floor(dateObj.getTime() / 60000); 

        // 3. Normalización de Valores Numéricos
        const profitValue = parseFloat(c.profit || c.netProfit || 0);
        
        // 4. Generación de Fingerprint (ID Único)
        // Prioridad: ID de DB -> Identificador Compuesto (Estrategia + Profit + Minuto)
        const fingerPrint = c._id?.$oid || c._id || `${strategy}-${profitValue.toFixed(4)}-${normalizedTS}`;

        // Filtro de Seguridad: Si el ID ya existe, no procesamos el duplicado
        if (globalCyclesMap.has(fingerPrint)) return;

        // 5. Almacenamiento Atómico
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
 * updateMetricsDisplay
 * Calcula los 8 KPIs principales y actualiza la interfaz de usuario.
 */
function updateMetricsDisplay() {
    const allData = Array.from(globalCyclesMap.values());
    
    // Filtrado por bot seleccionado (All, Long, Short, AI)
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter.toUpperCase();
    });

    // Ordenamiento cronológico para la curva de equidad
    filtered.sort((a, b) => a.processedDate - b.processedDate);

    const totalCycles = filtered.length;
    if (totalCycles === 0) return resetKPIs();

    // Acumuladores de métricas
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

    // Cálculos de promedios y eficiencia
    const avgProfit = totalProfitPct / totalCycles;
    const avgNetProfit = totalNetProfitUsdt / totalCycles;
    const avgOrders = totalOrders / totalCycles;
    const avgRecovery = totalRecovery / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const avgDurationMs = totalTimeMs / totalCycles;
    const profitPerHour = totalHours > 0.1 ? (totalNetProfitUsdt / totalHours) : 0;

    // Formateador de tiempo interno
    const fmtDuration = (ms) => {
        const h = Math.floor(ms / (1000 * 60 * 60));
        const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${h}h ${m}m`;
    };

    // --- Inyección en el DOM ---
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, 
               `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    
    renderText('cycle-net-profit', `+$${avgNetProfit.toFixed(4)}`);
    renderText('total-cycles-closed', totalCycles); 
    renderText('cycle-avg-orders', avgOrders.toFixed(1));
    renderText('cycle-avg-duration', fmtDuration(avgDurationMs));
    renderText('cycle-avg-recovery', `$${avgRecovery.toFixed(2)}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, 
               `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`);

    // Notificar al sistema de gráficos
    const chartData = prepareChartData(filtered);
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
}

/**
 * prepareChartData
 * Genera el dataset acumulado para la librería de gráficos.
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
 * Exportaciones de Control
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