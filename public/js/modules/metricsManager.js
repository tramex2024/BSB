/**
 * metricsManager.js - Motor de Análisis de Rentabilidad (TradeCycles Only)
 * AUDITORÍA 2026: Sincronización Estricta (15 Ciclos Reales)
 */

// Estado persistente en la sesión del navegador
const globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Procesa datos de API (15 ciclos) o Socket (2 ciclos) y los fusiona sin duplicados.
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    if (rawData.length === 0) return;

    rawData.forEach(c => {
        // 1. NORMALIZACIÓN DE ESTRATEGIA (Evita el error Short vs short)
        const strategy = (c.strategy || 'unknown').toLowerCase();
        
        // 2. EXTRACCIÓN DE FECHA (Soporte para formato MongoDB $date)
        let rawDate = c.endTime?.$date || c.endTime || c.timestamp;
        const dateObj = new Date(rawDate);
        if (isNaN(dateObj.getTime())) return; // Ignorar si la fecha es corrupta

        // 3. GENERACIÓN DE ID ÚNICO (Blindaje contra los 22/47 ciclos erróneos)
        // Usamos el ID real de Mongo o una huella dactilar inmutable del trade
        const profit = parseFloat(c.netProfit || 0);
        const fingerPrint = c._id?.$oid || c._id || `${strategy}-${profit}-${dateObj.getTime()}`;

        // Si el ciclo ya existe en memoria, NO lo volvemos a sumar
        if (globalCyclesMap.has(fingerPrint)) return;

        // 4. GUARDADO EN MEMORIA
        globalCyclesMap.set(fingerPrint, {
            ...c,
            netProfit: profit,
            profitPercentage: parseFloat(c.profitPercentage || 0),
            processedDate: dateObj,
            strategy: strategy
        });
    });

    console.log(`📊 Metrics Sync: ${globalCyclesMap.size} ciclos únicos en memoria.`);
    updateMetricsDisplay();
}

/**
 * updateMetricsDisplay
 * Filtra y calcula KPIs basados en los 15 ciclos reales.
 */
function updateMetricsDisplay() {
    const allData = Array.from(globalCyclesMap.values());
    
    // Filtro por estrategia (Viene de los botones del Dashboard)
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

    // Ordenamiento cronológico para que la gráfica no "salte"
    filtered.sort((a, b) => a.processedDate - b.processedDate);

    const totalCycles = filtered.length;
    if (totalCycles === 0) return resetKPIs();

    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let winningCycles = 0;
    let totalTimeMs = 0;

    filtered.forEach(cycle => {
        totalProfitPct += cycle.profitPercentage;
        totalNetProfitUsdt += cycle.netProfit;
        if (cycle.netProfit > 0) winningCycles++;

        // Cálculo de eficiencia temporal
        let startRaw = cycle.startTime?.$date || cycle.startTime;
        const start = new Date(startRaw);
        if (!isNaN(start.getTime())) {
            const diff = cycle.processedDate.getTime() - start.getTime();
            if (diff > 0) totalTimeMs += diff;
        }
    });

    const avgProfit = totalProfitPct / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const profitPerHour = totalHours > 0.1 ? (totalNetProfitUsdt / totalHours) : 0;

    // Actualizar UI (Dashboard)
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`);

    // Disparar evento para Chart.js
    const chartData = prepareChartData(filtered);
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
}

/**
 * Versión optimizada de prepareChartData
 */
function prepareChartData(filteredArray) {
    if (filteredArray.length === 0) return { points: [] };
    
    let accumulated = 0;
    const points = [];

    filteredArray.forEach((cycle, index) => {
        accumulated += cycle.netProfit;
        const d = cycle.processedDate;
        
        // Formato de etiqueta: DD/MM HH:mm
        const label = `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;

        points.push({
            time: label,
            value: currentChartParameter === 'accumulatedProfit' 
                ? parseFloat(accumulated.toFixed(4)) 
                : parseFloat(cycle.profitPercentage.toFixed(2))
        });
    });

    return { points };
}

// --- EXPORTS DE CONTROL ---

export function getFilteredData() {
    const allData = Array.from(globalCyclesMap.values());
    const filtered = allData.filter(c => currentBotFilter === 'all' || c.strategy === currentBotFilter);
    filtered.sort((a, b) => a.processedDate - b.processedDate);
    return prepareChartData(filtered);
}

export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

export function setBotFilter(filter) {
    currentBotFilter = filter.toLowerCase();
    updateMetricsDisplay();
}

// --- UTILIDADES ---

function resetKPIs() {
    renderText('total-cycles-closed', '0');
    renderText('cycle-avg-profit', '0.00%', 'text-sm font-bold text-gray-500');
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: { points: [] } }));
}

function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}