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
    if (cycleHistoryData.length === 0) return;

    // 1. Filtrar por estrategia
    const filtered = currentBotFilter === 'all' 
        ? cycleHistoryData 
        : cycleHistoryData.filter(c => c.strategy?.toLowerCase() === currentBotFilter.toLowerCase());

    const totalCycles = filtered.length;
    if (totalCycles === 0) return resetKPIs();

    // 2. CÁLCULOS AVANZADOS
    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let winningCycles = 0;
    let totalHours = 0;

    filtered.forEach(cycle => {
        totalProfitPct += (cycle.profitPercentage || 0);
        totalNetProfitUsdt += (cycle.netProfit || 0);
        
        // Win Rate: Si el netProfit es mayor a 0 es una victoria
        if ((cycle.netProfit || 0) > 0) winningCycles++;

        // Eficiencia: Calcular horas de duración
        if (cycle.startTime?.$date && cycle.endTime?.$date) {
            const start = new Date(cycle.startTime.$date);
            const end = new Date(cycle.endTime.$date);
            const diffHours = (end - start) / (1000 * 60 * 60);
            totalHours += diffHours > 0 ? diffHours : 0;
        }
    });

    const avgProfit = totalProfitPct / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const profitPerHour = totalHours > 0 ? (totalNetProfitUsdt / totalHours) : 0;

    // 3. ACTUALIZAR INTERFAZ
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', 
        `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, 
        `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`
    );
    
    // Actualizar Win Rate
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`);
    
    // Actualizar Eficiencia (Profit/Hora)
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`);

    // 4. Renderizar Gráfico
    renderEquityCurve(filtered, currentChartParameter);
}

function resetKPIs() {
    renderText('total-cycles-closed', '0');
    renderText('cycle-avg-profit', '0.00%', 'text-sm font-bold text-gray-500');
    renderText('cycle-win-rate', '0%');
    renderText('cycle-efficiency', '$0.00/h');
}

function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}