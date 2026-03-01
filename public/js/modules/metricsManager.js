/**
 * metricsManager.js - Motor de Análisis de Rentabilidad (TradeCycles Only)
 * VERSIÓN COMPLETA RESTAURADA 2026 - ETAPA 2 FINAL
 * Protección contra duplicados, limpieza selectiva y renderizado garantizado.
 */

let globalCyclesMap = new Map(); 
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * setAnalyticsData
 * Sincroniza los datos del servidor con el mapa local.
 */
export function setAnalyticsData(data) {
    const rawData = Array.isArray(data) ? data : (data?.data || []);
    if (rawData.length === 0) return;

    // --- PROTECCIÓN DE INTEGRIDAD ---
    // Si el servidor manda una ráfaga grande (carga inicial o All), 
    // reseteamos para que coincida exactamente con los 15 de la DB.
    if (rawData.length > 5) {
        globalCyclesMap.clear();
    }

    rawData.forEach(c => {
        // Extraemos estrategia y beneficio
        const strategy = (c.strategy || 'unknown').toLowerCase();
        const profit = parseFloat(c.netProfit || 0);
        
        // Identificador único basado en el contenido del ciclo
        // Usamos el ID de Mongo si existe, si no, una huella inmutable.
        const cycleId = c._id?.$oid || c._id || `${strategy}-${profit}-${c.endTime?.$date || c.endTime}`;

        if (!globalCyclesMap.has(cycleId)) {
            let processedDate;
            if (c.endTime?.$date) processedDate = new Date(c.endTime.$date);
            else if (c.endTime) processedDate = new Date(c.endTime);
            else processedDate = new Date();

            // Solo guardamos si la fecha es válida para no romper Chart.js
            if (!isNaN(processedDate.getTime())) {
                globalCyclesMap.set(cycleId, {
                    ...c,
                    netProfit: profit,
                    profitPercentage: parseFloat(c.profitPercentage || 0),
                    processedDate: processedDate,
                    strategy: strategy
                });
            }
        }
    });

    console.log(`📊 Metrics: ${globalCyclesMap.size} ciclos únicos en memoria.`);
    updateMetricsDisplay();
}

/**
 * updateMetricsDisplay
 * Orquestador de KPIs y Eventos de Gráfica
 */
function updateMetricsDisplay() {
    const allData = Array.from(globalCyclesMap.values());
    
    // Filtro por estrategia (short, long, ai)
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

    // Ordenamiento cronológico obligatorio para la línea de tiempo
    filtered.sort((a, b) => a.processedDate - b.processedDate);

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

        // Cálculo de duración del ciclo
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

    // --- RENDERIZADO DE TEXTOS ---
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`);

    // --- ACTUALIZACIÓN DE GRÁFICA ---
    try {
        const chartData = getFilteredDataFromPoints(filtered);
        window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
    } catch (e) {
        console.error("❌ Error al actualizar gráfica:", e);
    }
}

/**
 * getFilteredDataFromPoints
 * Transforma el array filtrado en coordenadas para Chart.js
 */
function getFilteredDataFromPoints(filteredArray) {
    let accumulated = 0;
    const points = [{ time: 'Start', value: 0 }];

    filteredArray.forEach(cycle => {
        accumulated += cycle.netProfit;
        const d = cycle.processedDate;
        const timeLabel = `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;

        points.push({
            time: timeLabel,
            value: currentChartParameter === 'accumulatedProfit' ? parseFloat(accumulated.toFixed(4)) : cycle.profitPercentage
        });
    });

    return { points };
}

/**
 * getFilteredData
 * Exportación para uso externo (Dashboard inicialización)
 */
export function getFilteredData() {
    const allData = Array.from(globalCyclesMap.values());
    const filtered = allData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });
    filtered.sort((a, b) => a.processedDate - b.processedDate);
    return getFilteredDataFromPoints(filtered);
}

// --- Controladores de Parámetros ---

export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

export function setBotFilter(filter) {
    console.log(`🎯 Filtro cambiado a: ${filter}`);
    currentBotFilter = filter.toLowerCase();
    updateMetricsDisplay();
}

// --- Utilidades de Limpieza y Renderizado ---

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