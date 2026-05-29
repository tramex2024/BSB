/**
 * dashboard.js - Controlador de Interfaz (Versión Blindada 2026)
 * Estado: Limpio - Delegación de controles a botControls.js
 */

import { fetchEquityCurveData, fetchRawTradeCycles, sendConfigToBackend } from './apiService.js';
import { currentBotState } from '../main.js'; 
import { socket } from './socket.js';
import { updateBotUI } from './uiManager.js';
import * as Metrics from './metricsManager.js';
import { renderEquityCurve, initializeChart } from './chart.js';

// Instancias globales de gráficos
let balanceChart = null; 

/**
 * Inicializa la vista del Dashboard
 */
export function initializeDashboardView(initialState) {
    console.log("📊 Dashboard: Synchronizing system...");
    const stateToUse = initialState || currentBotState;

    // 1. CONFIGURAR ESCUCHADORES DE MÉTRICAS
    window.removeEventListener('metricsUpdated', handleMetricsUpdate);
    window.addEventListener('metricsUpdated', handleMetricsUpdate);

    // 2. INICIALIZAR COMPONENTES VISUALES
    initBalanceChart();
    if (stateToUse?.symbol) {
        initializeChart('tv-chart-container', stateToUse.symbol);
    }

    // 3. ACTUALIZACIÓN DE UI INICIAL
    if (stateToUse) {
        updateBotUI(stateToUse);
        updatePnLBar('long', stateToUse.lprofit || 0);
        updatePnLBar('short', stateToUse.sprofit || 0);
        updatePnLBar('ai', stateToUse.aiprofit || 0);
        setTimeout(() => updateDistributionWidget(stateToUse), 150);
    }

    // 4. CONFIGURAR INTERACTIVIDAD (Solo analítica e inputs)
    setupActionButtons();
    setupAnalyticsFilters();
    
    // 5. CARGA DE DATOS HISTÓRICOS
    refreshAnalytics();
}

/**
 * dashboard.js - refreshAnalytics (Versión Robusta)
 */
async function refreshAnalytics() {
    try {
        addTerminalLog("ANALYTICS: FETCHING DATA...", 'info');

        // Usamos rutas relativas para que funcione tanto en local como en Vercel
        const [curveRes, cyclesRes, kpiRes] = await Promise.all([
            fetchEquityCurveData(Metrics.getCurrentBotFilter?.() || 'all'),
            fetchRawTradeCycles(Metrics.getCurrentBotFilter?.() || 'all'),
            fetch('/api/v1/analytics/kpis', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            }).then(res => {
                if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                return res.json();
            }).catch(err => {
                console.warn("KPIs no disponibles aún:", err.message);
                return null; // Retornamos null para no romper el Promise.all
            })
        ]);

        // 1. Renderizar Gráfico
        if (curveRes?.success) {
            requestAnimationFrame(() => renderEquityCurve(curveRes.data));
        }

        // 2. Sincronizar Ciclos (¡Los 29 detectados!)
        if (cyclesRes && cyclesRes.length > 0) {
            Metrics.setAnalyticsData(cyclesRes);
            addTerminalLog(`ANALYTICS: ${cyclesRes.length} CYCLES LOADED`, 'success');
        }

        // 3. Actualizar Profit/H y KPIs
        if (kpiRes && kpiRes.success) {
            updateQuickStats(kpiRes.data);
        }

    } catch (e) {
        console.error("Dashboard Error:", e);
        addTerminalLog("ERROR SYNCING ANALYTICS", 'error');
    }
}

/**
 * handleMetricsUpdate
 * Escucha el evento del MetricsManager para redibujar el gráfico
 * cuando el usuario cambia filtros (AI/Long/Short).
 */
function handleMetricsUpdate(e) {
    if (e.detail && e.detail.points) {
        // e.detail.points contiene los datos ya procesados por el manager
        requestAnimationFrame(() => renderEquityCurve(e.detail.points));
    }
}

/**
 * Configuración de botones y inputs (Solo lógica que no está en botControls)
 */
function setupActionButtons() {
    // Nota: El 'panic-btn' y los botones 'start/stop' ya tienen sus listeners 
    // registrados globalmente en botControls.js. No añadimos onclick aquí.

    // Manejo de Inputs de Cantidad (Amount USDT)
    const quickInputs = [
        { id: 'auamountl-usdt', strategy: 'long' },
        { id: 'auamounts-usdt', strategy: 'short' },
        { id: 'auamountai-usdt', strategy: 'ai' }
    ];

    quickInputs.forEach(input => {
        const el = document.getElementById(input.id);
        if (el) {
            // Sincronizar valor inicial con el estado
            if (currentBotState.config[input.strategy]) {
                el.value = currentBotState.config[input.strategy].amountUsdt || "";
            }

            el.onchange = async () => {
                const newVal = parseFloat(el.value);
                if (isNaN(newVal) || newVal < 0) return;

                const configPayload = {
                    config: { [input.strategy]: { amountUsdt: newVal } },
                    applyShield: true,
                    strategy: input.strategy
                };

                const res = await sendConfigToBackend(configPayload);
                if (res?.success) {
                    addTerminalLog(`${input.strategy.toUpperCase()}: AMOUNT UPDATED TO $${newVal}`, 'success');
                }
            };
        }
    });
}

function setupAnalyticsFilters() {
    const bSel = document.getElementById('chart-bot-selector');
    const pSel = document.getElementById('chart-param-selector');
    if (bSel) bSel.onchange = () => Metrics.setBotFilter(bSel.value);
    if (pSel) pSel.onchange = () => Metrics.setChartParameter(pSel.value);
}

// --- TERMINAL Y GRÁFICOS (Se mantienen igual) ---

export function addTerminalLog(msg, type = 'info') {
    const logContainer = document.getElementById('dashboard-logs');
    if (!logContainer) return;
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const colors = { info: 'text-gray-400 border-gray-700', success: 'text-emerald-400 border-emerald-500/50', warning: 'text-yellow-400 border-yellow-500/50', error: 'text-red-400 border-red-500/50' };
    const logEntry = document.createElement('div');
    logEntry.className = `flex gap-2 py-1 px-2 border-l-2 bg-white/5 mb-1 text-[10px] font-mono rounded-r animate-fadeIn ${colors[type] || colors.info}`;
    logEntry.innerHTML = `<span class="opacity-30 font-bold">[${timestamp}]</span><span class="flex-grow tracking-tighter uppercase">${msg}</span>`;
    logContainer.prepend(logEntry);
    if (logContainer.childNodes.length > 40) logContainer.lastChild.remove();
}

function initBalanceChart() {
    const canvas = document.getElementById('balanceDonutChart');
    if (!canvas) return;
    if (balanceChart) balanceChart.destroy();
    balanceChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['USDT', 'BTC'], datasets: [{ data: [100, 0], backgroundColor: ['#10b981', '#fb923c'], borderWidth: 0, cutout: '75%' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

export function updatePnLBar(id, pnlValue) {
    const bar = document.getElementById(`pnl-bar-${id}`);
    if (!bar) return;
    const pnl = parseFloat(pnlValue) || 0;
    const visualSize = Math.min(Math.abs(pnl) / 1 * 50, 50);
    if (pnl >= 0) {
        bar.style.left = '50%'; bar.style.width = `${visualSize}%`;
        bar.className = 'absolute h-full transition-all duration-500 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
    } else {
        bar.style.left = `${50 - visualSize}%`; bar.style.width = `${visualSize}%`;
        bar.className = 'absolute h-full transition-all duration-500 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
    }
}

export function updateDistributionWidget(state) {
    if (!balanceChart || !state) return;
    const usdt = parseFloat(state.lastAvailableUSDT || 0);
    const btcAmount = parseFloat(state.lastAvailableBTC || 0);
    const price = parseFloat(state.price || 0);
    if (price > 0) {
        const btcInUsdt = btcAmount * price;
        const total = usdt + btcInUsdt;
        if (total > 0) {
            balanceChart.data.datasets[0].data = [usdt, btcInUsdt];
            balanceChart.update('none');
            const uBar = document.getElementById('usdt-bar');
            const bBar = document.getElementById('btc-bar');
            if (uBar) uBar.style.width = `${(usdt / total) * 100}%`;
            if (bBar) bBar.style.width = `${(btcInUsdt / total) * 100}%`;
        }
    }
}

/**
 * dashboard.js - Auditoría de KPIs (Profit/D)
 * Este script imprimirá los cálculos detallados en la consola.
 */
function updateQuickStats(response) {
    console.group("📊 AUDITORÍA DE CÁLCULOS: PROFIT/D");
    
    // 1. Extraer datos
    const kpis = response.data || response;
    console.log("1. Datos Crudos (KPIs):", kpis);

    const totalProfit = parseFloat(kpis.totalNetProfit) || 0;
    const totalCycles = parseInt(kpis.totalCycles) || 0;
    const avgHours = parseFloat(kpis.avgDurationHours) || 0;

    // 2. Cálculos intermedios
    const totalTimeHours = avgHours * totalCycles;
    
    console.log("2. Desglose de variables:");
    console.log(`   - Profit Total: $${totalProfit}`);
    console.log(`   - Ciclos Totales: ${totalCycles}`);
    console.log(`   - Horas Promedio/Ciclo: ${avgHours.toFixed(4)}h`);
    console.log(`   - TIEMPO TOTAL CALCULADO: ${totalTimeHours.toFixed(4)}h`);

    // 3. Cálculo final
    let profitPerDay = 0;
    if (totalTimeHours > 0) {
        const profitPerHour = totalProfit / totalTimeHours;
        profitPerDay = profitPerHour * 24;
        console.log(`3. Cálculo Exitoso: ($${totalProfit} / ${totalTimeHours.toFixed(2)}h) * 24 = $${profitPerDay.toFixed(4)}/d`);
    } else {
        console.warn("3. ⚠️ ERROR: El tiempo total es 0. No se puede calcular el Profit/D.");
    }

    // 4. Actualización del DOM
    const profitElement = document.getElementById('cycle-efficiency');
    if (profitElement) {
        const finalValue = `$${profitPerDay.toFixed(4)}/d`;
        profitElement.innerText = finalValue;
        profitElement.style.color = profitPerDay >= 0 ? '#34d399' : '#ef4444';
        console.log(`4. ✅ DOM Actualizado con éxito: ${finalValue}`);
    } else {
        console.error("4. ❌ ERROR: No se encontró el elemento 'cycle-efficiency' en el HTML.");
    }

    console.groupEnd();
}

// Añadir al final de la inicialización/montaje de la pestaña del Dashboard
if (currentBotState && currentBotState.aiLastPulse) {
    console.log("🧠 Recuperando Pulso Neural desde la caché global...");
    // Forzamos el pintado inmediato con los datos en memoria para evitar pantallas en blanco
    renderAiPulseUI(currentBotState.aiLastPulse);
}