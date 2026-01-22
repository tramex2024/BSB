/**
 * metricsManager.js - Especializado en cálculos de eficiencia y rentabilidad
 */
import { renderEquityCurve } from './chart.js';

let cycleHistoryData = [];
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

export function setAnalyticsData(data) {
    if (data) cycleHistoryData = data;
    updateMetricsDisplay();
}

export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

export function setBotFilter(filter) {
    currentBotFilter = filter;
    updateMetricsDisplay();
}

function updateMetricsDisplay() {
    if (!cycleHistoryData || cycleHistoryData.length === 0) return resetKPIs();

    // 1. Filtrar por estrategia (campo "strategy" de tu MongoDB)
    const filtered = currentBotFilter === 'all' 
        ? cycleHistoryData 
        : cycleHistoryData.filter(c => c.strategy?.toLowerCase() === currentBotFilter.toLowerCase());

    const totalCycles = filtered.length;
    if (totalCycles === 0) return resetKPIs();

    // 2. CÁLCULOS DE ALTA PRECISIÓN
    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let winningCycles = 0;
    let totalTimeMs = 0;

    filtered.forEach(cycle => {
        // Sumamos Profit base
        totalProfitPct += (parseFloat(cycle.profitPercentage) || 0);
        totalNetProfitUsdt += (parseFloat(cycle.netProfit) || 0);
        
        // Win Rate
        if ((parseFloat(cycle.netProfit) || 0) > 0) winningCycles++;

        // Cálculo de Tiempo (Precisión de milisegundos)
        const start = cycle.startTime?.$date ? new Date(cycle.startTime.$date) : null;
        const end = cycle.endTime?.$date ? new Date(cycle.endTime.$date) : null;

        if (start && end && !isNaN(start) && !isNaN(end)) {
            const diff = end - start;
            if (diff > 0) totalTimeMs += diff;
        }
    });

    // Conversiones finales
    const avgProfit = totalProfitPct / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    
    // Profit por Hora (totalNetProfit / totalHours)
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const profitPerHour = totalHours > 0.01 ? (totalNetProfitUsdt / totalHours) : totalNetProfitUsdt;

    // 3. ACTUALIZAR INTERFAZ
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', 
        `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, 
        `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`
    );
    
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, 
        `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`
    );
    
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, 
        `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`
    );

    // 4. Renderizar Gráfico
    renderEquityCurve(filtered, currentChartParameter);
}

function resetKPIs() {
    renderText('total-cycles-closed', '0');
    renderText('cycle-avg-profit', '0.00%', 'text-sm font-bold text-gray-500');
    renderText('cycle-win-rate', '0%', 'text-sm font-bold text-gray-500');
    renderText('cycle-efficiency', '$0.00/h', 'text-sm font-bold text-gray-500');
}

function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}