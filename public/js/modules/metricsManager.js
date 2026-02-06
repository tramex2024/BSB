/**
 * //BSB/public/js/modules/metricsManager.js - Especializado en cálculos de eficiencia y rentabilidad
 */
import { renderEquityCurve } from './chart.js';

let cycleHistoryData = [];
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

export function setAnalyticsData(data) {
    if (data && Array.isArray(data)) {
        cycleHistoryData = data;
    } else if (data && data.success && Array.isArray(data.data)) {
        cycleHistoryData = data.data;
    } else {
        console.warn("⚠️ Metrics: Datos recibidos no tienen formato de array válido");
        cycleHistoryData = [];
    }
    
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
    if (!Array.isArray(cycleHistoryData) || cycleHistoryData.length === 0) {
        return resetKPIs();
    }

    const filtered = currentBotFilter === 'all' 
        ? cycleHistoryData 
        : cycleHistoryData.filter(c => c && c.strategy?.toLowerCase() === currentBotFilter.toLowerCase());

    const totalCycles = filtered.length;
    if (totalCycles === 0) return resetKPIs();

    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let winningCycles = 0;
    let totalTimeMs = 0;

    filtered.forEach(cycle => {
        if (!cycle) return;

        totalProfitPct += (parseFloat(cycle.profitPercentage) || 0);
        totalNetProfitUsdt += (parseFloat(cycle.netProfit) || 0);
        
        if ((parseFloat(cycle.netProfit) || 0) > 0) winningCycles++;

        const start = cycle.startTime?.$date ? new Date(cycle.startTime.$date) : 
                     (cycle.startTime ? new Date(cycle.startTime) : null);
        const end = cycle.endTime?.$date ? new Date(cycle.endTime.$date) : 
                   (cycle.endTime ? new Date(cycle.endTime) : null);

        if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diff = end.getTime() - start.getTime();
            if (diff > 0) totalTimeMs += diff;
        }
    });

    const avgProfit = totalProfitPct / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const profitPerHour = totalHours > 0.01 ? (totalNetProfitUsdt / totalHours) : totalNetProfitUsdt;

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

    try {
        renderEquityCurve(filtered, currentChartParameter);
    } catch (chartError) {
        console.error("Error renderizando curva de equidad:", chartError);
    }
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

/**
 * Procesa los datos para que el Dashboard pueda renderizar el gráfico
 */
export function getFilteredData(filter) {
    if (!Array.isArray(cycleHistoryData) || cycleHistoryData.length === 0) {
        return { points: [] };
    }

    const filtered = filter.bot === 'all' 
        ? cycleHistoryData 
        : cycleHistoryData.filter(c => c && c.strategy?.toLowerCase() === filter.bot.toLowerCase());

    let accumulated = 0;
    const points = filtered.map(cycle => {
        const val = parseFloat(cycle.netProfit || 0);
        accumulated += val;

        // --- CORRECCIÓN CRÍTICA: Formateo de fecha manual para evitar error de rango "22" ---
        const rawDate = cycle.endTime?.$date ? new Date(cycle.endTime.$date) : (cycle.endTime ? new Date(cycle.endTime) : new Date());
        
        let timeLabel = "00:00";
        if (!isNaN(rawDate.getTime())) {
            const h = rawDate.getHours().toString().padStart(2, '0');
            const m = rawDate.getMinutes().toString().padStart(2, '0');
            timeLabel = `${h}:${m}`;
        }

        return {
            time: timeLabel,
            value: filter.param === 'accumulatedProfit' ? accumulated : (parseFloat(cycle.profitPercentage) || 0)
        };
    });

    return { points };
}