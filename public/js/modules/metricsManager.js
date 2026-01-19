/**
 * metricsManager.js - Lógica de analítica y filtrado
 */
import { renderEquityCurve } from './chart.js';

let cycleHistoryData = [];
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * Recibe los datos crudos de la API y refresca la visualización
 */
export function setAnalyticsData(data) {
    if (data) cycleHistoryData = data;
    updateMetricsDisplay();
}

/**
 * Cambia el parámetro (Profit/Duración)
 */
export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

/**
 * Cambia el filtro de Bot (Long/Short/AI)
 */
export function setBotFilter(filter) {
    currentBotFilter = filter;
    updateMetricsDisplay();
}

/**
 * Procesa los datos y actualiza el gráfico y los contadores
 */
function updateMetricsDisplay() {
    if (cycleHistoryData.length === 0) return;

    // 1. Filtrar por estrategia (campo "strategy" del JSON)
    const filtered = currentBotFilter === 'all' 
        ? cycleHistoryData 
        : cycleHistoryData.filter(c => c.strategy?.toLowerCase() === currentBotFilter.toLowerCase());

    // 2. Calcular KPIs sobre los datos filtrados
    const totalCycles = filtered.length;
    const totalProfit = filtered.reduce((acc, c) => acc + (c.profitPercentage || 0), 0);
    const avgProfit = totalCycles > 0 ? (totalProfit / totalCycles) : 0;

    // 3. Renderizar textos
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', 
        `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, 
        `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`
    );

    // 4. Actualizar gráfico
    renderEquityCurve(filtered, currentChartParameter);
    console.log(`📊 Metrics: ${totalCycles} ciclos mostrados (${currentBotFilter})`);
}

// Auxiliar para actualizar el DOM
function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}