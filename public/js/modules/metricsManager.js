/**
 * metricsManager.js - Motor de Análisis de Rendimiento (TradeCycles Only)
 * CORRECCIÓN: Precisión Decimal y Sincronización de Estrategia AI
 * INTEGRACIÓN: 8-KPI Analytics Grid
 */

const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Fusiona datos sin duplicados y normaliza estrategias con precisión.
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    if (rawData.length === 0) return;

    rawData.forEach(c => {
        // 1. NORMALIZACIÓN DE ESTRATEGIA
        let strategy = (c.strategy || 'unknown').toUpperCase();
        
        // 2. EXTRACCIÓN DE FECHA
        let rawDate = c.endTime?.$date || c.endTime || c.timestamp;
        const dateObj = new Date(rawDate);
        if (isNaN(dateObj.getTime())) return; 

        // 3. NORMALIZACIÓN DE PROFIT Y VALORES (Alta precisión)
        const profitValue = parseFloat(c.profit || c.netProfit || 0);
        
        // --- CORRECCIÓN: Cálculo de Porcentaje si es 0 ---
        let pPct = parseFloat(c.profitPercentage || c.percent || 0);
        if (pPct === 0 && profitValue !== 0 && c.amount) {
            pPct = (profitValue / parseFloat(c.amount)) * 100;
        }
        
        // 4. GENERACIÓN DE ID ÚNICO
        const fingerPrint = c._id?.$oid || c._id || `${strategy}-${profitValue}-${dateObj.getTime()}`;

        if (globalCyclesMap.has(fingerPrint)) return;

        // 5. GUARDADO EN MEMORIA (Incluyendo nuevos parámetros del ciclo)
        globalCyclesMap.set(fingerPrint, {
            ...c,
            netProfit: profitValue, 
            profitPercentage: pPct,
            orderCount: parseInt(c.orderCount || 1),
            // --- CORRECCIÓN: Búsqueda de campo Recovery ---
            finalRecovery: parseFloat(c.finalRecovery || c.recovery || c.rec_amount || 0),
            processedDate: dateObj,
            strategy: strategy
        });
    });

    updateMetricsDisplay();
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
    const avgNetProfit = totalNetProfitUsdt / totalCycles;
    const avgOrders = totalOrders / totalCycles;
    const avgRecovery = totalRecovery / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    
    // --- CORRECCIÓN: Ajuste de sensibilidad para Profit/H ---
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const avgDurationMs = totalTimeMs / totalCycles;
    const profitPerHour = totalHours > 0.001 ? (totalNetProfitUsdt / totalHours) : 0;

    // Formateador de duración
    const fmtDuration = (ms) => {
        const h = Math.floor(ms / (1000 * 60 * 60));
        const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${h}h ${m}m`;
    };

    // --- ACTUALIZACIÓN DE INTERFAZ ---
    
    // Columna 1: Profit
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-net-profit', `+$${avgNetProfit.toFixed(4)}`);

    // Columna 2: Ciclos y Órdenes
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-orders', avgOrders.toFixed(1));

    // Columna 3: Tiempo y Recuperación
    renderText('cycle-avg-duration', fmtDuration(avgDurationMs));
    renderText('cycle-avg-recovery', `$${avgRecovery.toFixed(2)}`);

    // Columna 4: WinRate y Eficiencia
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`);

    const chartData = prepareChartData(filtered);
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
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

/**
 * metricsManager.js - Sincronización final con el Backend Payload
 */

export function updateMetricsFromState(state) {
    if (!state) return;

    // Extraemos datos del payload detectado en consola
    const metrics = {
        totalProfit: parseFloat(state.total_profit || 0),
        longOrders: parseInt(state.lnorder || 0),
        shortOrders: parseInt(state.snorder || 0),
        longProfit: parseFloat(state.lprofit || 0),
        shortProfit: parseFloat(state.sprofit || 0),
    };

    // Cálculo de duración en tiempo real (Basado en lstartTime detectado)
    const now = new Date();
    const lStart = new Date(state.lstartTime);
    let durationHours = 0;

    if (!isNaN(lStart.getTime())) {
        durationHours = (now - lStart) / 3600000; // Diferencia en horas
    }

    // Renderizado en el Dashboard de Analytics
    renderValue('cycle-avg-orders', ((metrics.longOrders + metrics.shortOrders) / 2).toFixed(1));
    renderValue('cycle-net-profit', `$${metrics.totalProfit.toFixed(4)}`);
    renderValue('cycle-avg-duration', formatDuration(durationHours));
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